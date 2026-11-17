//! Request tests through the full router and Axa's standard middleware, with no port opened.
//!
//! Tests marked `#[ignore]` need Postgres: set `AXA_TEST_DB_URL` to a role that may create
//! databases and run `cargo test -- --include-ignored`. Each gets a database of its own.

use std::{net::SocketAddr, time::Duration};

use axa::{Environment, config::Config, context::Db};
use axa_test::{TestServer, postgres::TestDatabase};
use ips_service::{MIGRATOR, app, app_routes, auth::Auth, context, defaults};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;

fn server(pool: Db) -> TestServer {
    let environment = Environment::Test;
    let config = Config::from_lookup(&environment, &defaults(), |_| None).expect("config");
    // Authentication is off, as it may be only in development and test; tests/auth.rs
    // covers it on.
    let router = app(context(environment, pool, config, &Auth::Off), &Auth::Off).expect("router");
    TestServer::new(router.into_make_service_with_connect_info::<SocketAddr>())
}

/// A pool that never connects, for routes that answer before asking the database.
fn no_database() -> Db {
    PgPoolOptions::new()
        .acquire_timeout(Duration::from_millis(50))
        .connect_lazy("postgres://none:none@127.0.0.1:1/none")
        .expect("a well-formed address")
}

fn fixture(name: &str) -> Value {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("JSON")
}

const FIXTURES: &[&str] = &[
    "bundle-minimal.json",
    "bundle-ips-all-sections.json",
    "bundle-no-info-required-sections.json",
    "IPS-examples-Bundle-01.json",
    "IPS-examples-Bundle-with-immunization.json",
];

#[test]
fn route_census_matches_the_spec() {
    let mounted = app_routes().mounted();
    for expected in [
        ("POST", "/fhir/Bundle"),
        ("GET", "/fhir/Bundle/{id}"),
        ("DELETE", "/fhir/Bundle/{id}"),
        ("GET", "/_health/live"),
        ("GET", "/_health/ready"),
        ("GET", "/_health/startup"),
    ] {
        assert!(
            mounted
                .iter()
                .any(|(m, p)| m == expected.0 && p == expected.1),
            "{expected:?} is not mounted: {mounted:?}"
        );
    }
}

#[tokio::test]
async fn liveness_answers_without_a_database() {
    let server = server(no_database());
    assert_eq!(server.get("/_health/live").await.status_code(), 200);
}

#[tokio::test]
async fn a_non_ips_body_is_refused_with_a_pointer() {
    let server = server(no_database());
    let response = server
        .post("/fhir/Bundle")
        .json(&json!({ "resourceType": "Bundle", "type": "collection" }))
        .expect_failure()
        .await;
    assert_eq!(response.status_code(), 422);
    assert_eq!(response.header("content-type"), "application/problem+json");
    let problem: Value = response.json();
    assert_eq!(problem["code"], "not_a_document");
    assert_eq!(problem["errors"][0]["pointer"], "#/type");
}

#[tokio::test]
async fn a_body_that_is_not_json_is_refused() {
    let server = server(no_database());
    let response = server
        .post("/fhir/Bundle")
        .text("resourceType: Bundle")
        .expect_failure()
        .await;
    assert_eq!(response.status_code(), 415);
}

#[tokio::test]
async fn an_id_this_service_never_issues_is_not_found() {
    let server = server(no_database());
    for id in ["not-a-uuid", "00000000-0000-0000-0000-000000000000"] {
        let path = format!("/fhir/Bundle/{id}");
        assert_eq!(server.get(&path).expect_failure().await.status_code(), 404);
        assert_eq!(
            server.delete(&path).expect_failure().await.status_code(),
            404
        );
    }
}

#[tokio::test]
#[ignore = "needs AXA_TEST_DB_URL"]
async fn every_example_round_trips() {
    let db = TestDatabase::new(&MIGRATOR).await.expect("test database");
    let server = server(db.pool.clone());
    for name in FIXTURES {
        let sent = fixture(name);
        let created = server
            .post("/fhir/Bundle")
            .bytes(serde_json::to_vec(&sent).expect("bytes").into())
            .content_type("application/fhir+json")
            .await;
        assert_eq!(created.status_code(), 201, "{name}");
        assert_eq!(created.header("content-type"), "application/fhir+json");
        assert_eq!(created.header("cache-control"), "no-store");
        let location = created
            .header("location")
            .to_str()
            .expect("ascii")
            .to_owned();
        let stored: Value = created.json();
        let id = stored["id"].as_str().expect("an id").to_owned();
        assert_eq!(location, format!("/fhir/Bundle/{id}"));

        // Apart from `id`, the document comes back exactly as it was sent.
        let mut expected = sent.clone();
        expected["id"] = json!(id);
        let read = server.get(&location).await;
        assert_eq!(read.status_code(), 200);
        assert_eq!(read.header("cache-control"), "no-store");
        assert_eq!(read.json::<Value>(), expected, "{name}");

        assert_eq!(server.delete(&location).await.status_code(), 204);
        assert_eq!(
            server.get(&location).expect_failure().await.status_code(),
            404
        );
        assert_eq!(
            server
                .delete(&location)
                .expect_failure()
                .await
                .status_code(),
            404
        );
    }
    db.close().await;
}

#[tokio::test]
#[ignore = "needs AXA_TEST_DB_URL"]
async fn readiness_answers_once_migrated() {
    let db = TestDatabase::new(&MIGRATOR).await.expect("test database");
    let server = server(db.pool.clone());
    assert_eq!(server.get("/_health/ready").await.status_code(), 200);
    db.close().await;
}
