//! Authentication, the access policy, and the access log (spec §6.1), through the full
//! router: PASETO tokens from `axa_test::paseto::TestKeys`, and Keycloak tokens from a
//! local OIDC provider (`authentication_verifier::test_idp`), never a real key.
//!
//! Tests marked `#[ignore]` need Postgres, as in `tests/api.rs`.

use std::{net::SocketAddr, time::Duration};

use authentication_verifier::test_idp::{AUDIENCE, REALM, TestIdp};
use axa::{Environment, config::Config, context::Db};
use axa_test::{TestServer, paseto::TestKeys, postgres::TestDatabase};
use ips_service::{
    MIGRATOR, app,
    auth::{self, Auth},
    context, defaults,
};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;

const ISSUER: &str = "authentication-service";
const SERVICE: &str = "ips-service";

fn no_database() -> Db {
    PgPoolOptions::new()
        .acquire_timeout(Duration::from_millis(50))
        .connect_lazy("postgres://none:none@127.0.0.1:1/none")
        .expect("a well-formed address")
}

fn server(pool: Db, auth: &Auth) -> TestServer {
    let environment = Environment::Test;
    let config = Config::from_lookup(&environment, &defaults(), |_| None).expect("config");
    let router = app(context(environment, pool, config, auth), auth).expect("router");
    TestServer::new(router.into_make_service_with_connect_info::<SocketAddr>())
}

/// The PASETO key set in a file of its own, as `IPS_PASETO_KEYS_FILE` names one.
fn key_file(keys: &TestKeys, name: &str) -> String {
    let path = std::env::temp_dir().join(format!("ips-service-{name}-{}.json", std::process::id()));
    std::fs::write(&path, keys.key_set().to_string()).expect("key file");
    path.to_string_lossy().into_owned()
}

fn paseto_lookup(path: String) -> impl Fn(&str) -> Option<String> {
    move |name| match name {
        "IPS_PASETO_KEYS_FILE" => Some(path.clone()),
        "IPS_PASETO_ISSUER" => Some(ISSUER.to_string()),
        "IPS_PASETO_AUDIENCE" => Some(SERVICE.to_string()),
        _ => None,
    }
}

fn paseto_auth(keys: &TestKeys, name: &str) -> Auth {
    auth::from_lookup(
        &Environment::Production,
        &paseto_lookup(key_file(keys, name)),
    )
    .expect("PASETO auth")
}

fn token(keys: &TestKeys, subject: &str, access: &[&str]) -> String {
    let mut token = keys.token(ISSUER, SERVICE).subject(subject);
    if !access.is_empty() {
        token = token.attr("access", access.iter().copied());
    }
    token.bearer()
}

fn example() -> Value {
    let path = format!(
        "{}/tests/fixtures/bundle-minimal.json",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("JSON")
}

#[tokio::test]
async fn every_fhir_route_needs_a_token_and_health_does_not() {
    let keys = TestKeys::new();
    let server = server(no_database(), &paseto_auth(&keys, "no-token"));
    assert_eq!(server.get("/_health/live").await.status_code(), 200);
    let id = "/fhir/Bundle/2b39610e-a2d8-4548-9e5f-eaa9ecd0fc08";
    for response in [
        server.get(id).expect_failure().await,
        server.get("/fhir/Bundle").expect_failure().await,
        server.delete(id).expect_failure().await,
        server
            .post("/fhir/Bundle")
            .json(&example())
            .expect_failure()
            .await,
    ] {
        assert_eq!(response.status_code(), 401);
        assert_eq!(response.header("www-authenticate"), "Bearer");
        assert_eq!(response.json::<Value>()["code"], "unauthorized");
    }
}

#[tokio::test]
async fn a_token_from_another_key_is_refused() {
    let server = server(no_database(), &paseto_auth(&TestKeys::new(), "other-key"));
    let stranger = TestKeys::from_seed([7; 32]);
    let response = server
        .get("/fhir/Bundle/2b39610e-a2d8-4548-9e5f-eaa9ecd0fc08")
        .authorization(token(&stranger, "someone", &["admin"]))
        .expect_failure()
        .await;
    assert_eq!(response.status_code(), 401);
}

#[tokio::test]
async fn the_policy_refuses_by_access_before_any_handler_runs() {
    let keys = TestKeys::new();
    let server = server(no_database(), &paseto_auth(&keys, "policy"));
    let id = "/fhir/Bundle/2b39610e-a2d8-4548-9e5f-eaa9ecd0fc08";
    // No access attribute: not even a read, or a list.
    let nobody = token(&keys, "nobody", &[]);
    for path in [id, "/fhir/Bundle"] {
        assert_eq!(
            server
                .get(path)
                .authorization(&nobody)
                .expect_failure()
                .await
                .status_code(),
            403,
            "{path}"
        );
    }
    // A reader may not store or delete; a writer may not delete.
    let reader = token(&keys, "reader", &["read"]);
    let response = server
        .post("/fhir/Bundle")
        .authorization(&reader)
        .json(&example())
        .expect_failure()
        .await;
    assert_eq!(response.status_code(), 403);
    assert_eq!(response.json::<Value>()["code"], "forbidden");
    assert_eq!(
        server
            .delete(id)
            .authorization(&reader)
            .expect_failure()
            .await
            .status_code(),
        403
    );
    let writer = token(&keys, "writer", &["write"]);
    assert_eq!(
        server
            .delete(id)
            .authorization(&writer)
            .expect_failure()
            .await
            .status_code(),
        403
    );
}

/// The access log's rows for `id`: subject, issuer, action, status.
async fn log(pool: &Db, id: &str) -> Vec<(Option<String>, Option<String>, String, i16)> {
    sqlx::query_as(
        "SELECT subject, issuer, action, status FROM ips_access_log WHERE bundle_id = $1::uuid ORDER BY id",
    )
    .bind(id)
    .fetch_all(pool)
    .await
    .expect("access log")
}

#[tokio::test]
#[ignore = "needs AXA_TEST_DB_URL"]
async fn each_role_does_what_it_may_and_every_access_is_logged() {
    let db = TestDatabase::new(&MIGRATOR).await.expect("test database");
    let keys = TestKeys::new();
    let server = server(db.pool.clone(), &paseto_auth(&keys, "roles"));
    let (reader, writer, admin) = (
        token(&keys, "reader-1", &["read"]),
        token(&keys, "writer-1", &["write"]),
        token(&keys, "admin-1", &["admin"]),
    );

    let created = server
        .post("/fhir/Bundle")
        .authorization(&writer)
        .json(&example())
        .await;
    assert_eq!(created.status_code(), 201);
    let id = created.json::<Value>()["id"]
        .as_str()
        .expect("id")
        .to_owned();
    let path = format!("/fhir/Bundle/{id}");
    assert_eq!(
        server.get(&path).authorization(&reader).await.status_code(),
        200
    );
    assert_eq!(
        server
            .delete(&path)
            .authorization(&admin)
            .await
            .status_code(),
        204
    );
    assert_eq!(
        server
            .get(&path)
            .authorization(&reader)
            .expect_failure()
            .await
            .status_code(),
        404
    );

    let issuer = Some(ISSUER.to_string());
    let who = |subject: &str| Some(subject.to_string());
    assert_eq!(
        log(&db.pool, &id).await,
        vec![
            (who("writer-1"), issuer.clone(), "create".to_string(), 201),
            (who("reader-1"), issuer.clone(), "read".to_string(), 200),
            (who("admin-1"), issuer.clone(), "delete".to_string(), 204),
            (who("reader-1"), issuer, "read".to_string(), 404),
        ]
    );
    // The log holds no content and no email: only these columns exist besides id and time.
    let columns: Vec<String> = sqlx::query_scalar(
        "SELECT column_name::text FROM information_schema.columns WHERE table_name = 'ips_access_log' ORDER BY ordinal_position",
    )
    .fetch_all(&db.pool)
    .await
    .expect("columns");
    assert_eq!(
        columns,
        [
            "id",
            "at",
            "subject",
            "issuer",
            "action",
            "bundle_id",
            "status"
        ]
    );
    db.close().await;
}

#[tokio::test]
#[ignore = "needs AXA_TEST_DB_URL"]
async fn a_read_that_cannot_be_logged_sends_nothing() {
    let db = TestDatabase::new(&MIGRATOR).await.expect("test database");
    let keys = TestKeys::new();
    let server = server(db.pool.clone(), &paseto_auth(&keys, "unlogged"));
    let writer = token(&keys, "writer-1", &["write"]);
    let created = server
        .post("/fhir/Bundle")
        .authorization(&writer)
        .json(&example())
        .await;
    let id = created.json::<Value>()["id"]
        .as_str()
        .expect("id")
        .to_owned();
    sqlx::query("DROP TABLE ips_access_log")
        .execute(&db.pool)
        .await
        .expect("drop");
    let response = server
        .get(&format!("/fhir/Bundle/{id}"))
        .authorization(&writer)
        .expect_failure()
        .await;
    assert_eq!(response.status_code(), 500);
    assert!(
        !response.text().contains("\"resourceType\""),
        "no document in the answer"
    );
    // A list that cannot log its reads sends no list either (S-API-9).
    let listed = server
        .get("/fhir/Bundle")
        .authorization(&writer)
        .expect_failure()
        .await;
    assert_eq!(listed.status_code(), 500);
    assert!(!listed.text().contains(&id), "no id in the answer");
    db.close().await;
}

/// A Keycloak verifier against the local provider, waiting until it has the realm's keys.
async fn keycloak_auth(idp: &TestIdp, with_paseto: Option<String>) -> Auth {
    let base = idp.base_url.clone();
    let lookup = move |name: &str| match name {
        "IPS_KEYCLOAK_URL" => Some(base.clone()),
        "IPS_KEYCLOAK_REALM" => Some(REALM.to_string()),
        "IPS_KEYCLOAK_AUDIENCES" => Some(AUDIENCE.to_string()),
        other => with_paseto
            .clone()
            .and_then(|path| paseto_lookup(path)(other)),
    };
    let auth = auth::from_lookup(&Environment::Production, &lookup).expect("Keycloak auth");
    let verifier = auth.keycloak().expect("a Keycloak verifier");
    for _ in 0_u32..100_u32 {
        if verifier.ready().is_ok() {
            return auth;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("the local provider's keys never arrived");
}

fn realm_roles(roles: &[&str]) -> impl FnOnce(&mut Value) {
    let roles: Vec<String> = roles.iter().map(ToString::to_string).collect();
    move |claims| claims["realm_access"] = json!({ "roles": roles })
}

#[tokio::test]
async fn keycloak_roles_map_to_access_and_unmapped_roles_grant_nothing() {
    let idp = TestIdp::start().await;
    let auth = keycloak_auth(&idp, None).await;
    let server = server(no_database(), &auth);
    let id = "/fhir/Bundle/2b39610e-a2d8-4548-9e5f-eaa9ecd0fc08";
    let bearer = |roles: &[&str]| format!("Bearer {}", idp.token(realm_roles(roles)));

    // The provider's own default roles (editor) map to nothing here.
    let response = server
        .get(id)
        .authorization(bearer(&["editor"]))
        .expect_failure()
        .await;
    assert_eq!(response.status_code(), 403);
    // ips-reader reads (the handler then needs the database), but may not write.
    let reader = bearer(&["ips-reader"]);
    assert_ne!(
        server
            .get(id)
            .authorization(&reader)
            .expect_failure()
            .await
            .status_code(),
        403
    );
    let response = server
        .post("/fhir/Bundle")
        .authorization(&reader)
        .json(&example())
        .expect_failure()
        .await;
    assert_eq!(response.status_code(), 403);
    // ips-admin passes the guard for a delete.
    let admin = bearer(&["ips-admin"]);
    assert_ne!(
        server
            .delete(id)
            .authorization(&admin)
            .expect_failure()
            .await
            .status_code(),
        403
    );
    // A token for another audience is refused outright.
    let elsewhere = format!(
        "Bearer {}",
        idp.token(|claims| {
            claims["aud"] = json!("another-service");
            claims["realm_access"] = json!({ "roles": ["ips-admin"] });
        })
    );
    assert_eq!(
        server
            .get(id)
            .authorization(elsewhere)
            .expect_failure()
            .await
            .status_code(),
        401
    );
}

#[tokio::test]
async fn with_both_configured_keycloak_and_paseto_tokens_are_each_accepted() {
    let idp = TestIdp::start().await;
    let keys = TestKeys::new();
    let auth = keycloak_auth(&idp, Some(key_file(&keys, "both"))).await;
    // Nothing about keys is in what a log would show.
    assert_eq!(format!("{auth:?}"), "Auth::Keycloak");
    assert_eq!(format!("{:?}", paseto_auth(&keys, "debug")), "Auth::Paseto");
    let server = server(no_database(), &auth);
    let id = "/fhir/Bundle/2b39610e-a2d8-4548-9e5f-eaa9ecd0fc08";
    let keycloak_reader = format!("Bearer {}", idp.token(realm_roles(&["ips-reader"])));
    let paseto_reader = token(&keys, "reader-2", &["read"]);
    for bearer in [keycloak_reader, paseto_reader] {
        // Past the guard: the handler then needs the database.
        assert_ne!(
            server
                .get(id)
                .authorization(&bearer)
                .expect_failure()
                .await
                .status_code(),
            401
        );
        assert_ne!(
            server
                .get(id)
                .authorization(&bearer)
                .expect_failure()
                .await
                .status_code(),
            403
        );
    }
    let stranger = token(&TestKeys::from_seed([9; 32]), "x", &["admin"]);
    assert_eq!(
        server
            .get(id)
            .authorization(stranger)
            .expect_failure()
            .await
            .status_code(),
        401
    );
}

#[tokio::test]
#[ignore = "needs AXA_TEST_DB_URL"]
async fn a_keycloak_read_is_logged_under_the_tokens_subject() {
    let db = TestDatabase::new(&MIGRATOR).await.expect("test database");
    let idp = TestIdp::start().await;
    let auth = keycloak_auth(&idp, None).await;
    let server = server(db.pool.clone(), &auth);
    let writer = format!(
        "Bearer {}",
        idp.token(|claims| {
            claims["sub"] = json!("kc-writer");
            claims["realm_access"] = json!({ "roles": ["ips-writer"] });
        })
    );
    let created = server
        .post("/fhir/Bundle")
        .authorization(&writer)
        .json(&example())
        .await;
    assert_eq!(created.status_code(), 201);
    let id = created.json::<Value>()["id"]
        .as_str()
        .expect("id")
        .to_owned();
    let rows = log(&db.pool, &id).await;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].0.as_deref(), Some("kc-writer"));
    assert_eq!(rows[0].1, Some(idp.issuer()));
    // Readiness waits for the realm's keys, which keycloak_auth has already fetched (S-AUTH-2).
    assert_eq!(server.get("/_health/ready").await.status_code(), 200);
    db.close().await;
}
