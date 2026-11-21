//! The built binary, run as a person or an image would run it (`src/main.rs`): the
//! commands that touch no database, the refusals before any connection, and, with
//! Postgres, `db` and `start` with `health`.
//!
//! Tests marked `#[ignore]` need Postgres, as in `tests/main/api.rs`.

use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Output, Stdio},
    time::{Duration, Instant},
};

use axa_test::postgres::TestDatabase;
use ips_service::MIGRATOR;

const BIN: &str = env!("CARGO_BIN_EXE_international-patient-summary-service-with-axum");

fn run(args: &[&str], env: &[(&str, &str)]) -> Output {
    Command::new(BIN)
        .args(args)
        .envs(env.iter().copied())
        // Nothing from the developer's shell decides what these tests see.
        .env_remove("IPS_KEYCLOAK_URL")
        .env_remove("IPS_PASETO_KEYS_FILE")
        .output()
        .expect("the binary runs")
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn stderr(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).into_owned()
}

#[test]
fn check_prints_the_settings_without_secrets_and_touches_nothing() {
    let output = run(
        &["check"],
        &[("DB_URL", "postgres://role:hunter2@localhost:1/none")],
    );
    assert!(output.status.success());
    let text = stdout(&output);
    assert!(text.contains("PORT="));
    assert!(!text.contains("hunter2"), "secrets are redacted");
}

#[test]
fn the_service_has_no_tasks_and_no_worker() {
    let task = run(&["task"], &[]);
    assert!(!task.status.success());
    assert!(stderr(&task).contains("no tasks"));

    let worker = run(&["start", "--worker"], &[]);
    assert!(!worker.status.success());
    assert!(stderr(&worker).contains("no job worker"));
}

#[test]
fn production_refuses_to_start_without_authentication() {
    // Production wants a database address; the refusal comes before any connection.
    let output = run(
        &["--environment", "production", "start"],
        &[("DB_URL", "postgres://role:secret@localhost:1/none")],
    );
    assert!(!output.status.success());
    assert!(stderr(&output).contains("authentication"));
}

#[test]
fn health_fails_when_no_server_is_listening() {
    let output = run(&["health", "--port", "1"], &[]);
    assert!(!output.status.success());
}

/// The test database's address: `AXA_TEST_DB_URL` with this database's name.
fn url_of(db: &TestDatabase) -> String {
    let base = std::env::var("AXA_TEST_DB_URL").expect("AXA_TEST_DB_URL");
    let (head, _) = base.rsplit_once('/').expect("a database name");
    format!("{head}/{}", db.name())
}

#[tokio::test]
#[ignore = "needs AXA_TEST_DB_URL"]
async fn db_commands_migrate_report_and_truncate() {
    let db = TestDatabase::new(&MIGRATOR).await.expect("test database");
    let url = url_of(&db);
    let env = [
        ("DB_URL", url.as_str()),
        ("APP_ENV", "test"),
        ("AXA_DESTROY_DATA", "true"),
    ];
    for command in [
        &["migrate"][..],
        &["status"],
        &["truncate"],
        &["down", "1"],
        &["reset"],
    ] {
        let args = [&["db"][..], command].concat();
        let output = run(&args, &env);
        assert!(
            output.status.success(),
            "db {command:?}: {}",
            stderr(&output)
        );
    }
    assert!(stdout(&run(&["db", "status"], &env)).contains("applied"));
}

struct Server(Child);

impl Drop for Server {
    fn drop(&mut self) {
        self.0.kill().ok();
        self.0.wait().ok();
    }
}

#[tokio::test]
#[ignore = "needs AXA_TEST_DB_URL"]
async fn start_serves_and_health_answers_live_and_ready() {
    let db = TestDatabase::new(&MIGRATOR).await.expect("test database");
    let url = url_of(&db);
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .expect("a free port")
        .port()
        .to_string();
    let env = [
        ("DB_URL", url.as_str()),
        ("APP_ENV", "test"),
        ("PORT", port.as_str()),
        ("BINDING", "127.0.0.1"),
    ];
    let child = Command::new(BIN)
        .arg("start")
        .envs(env)
        .env_remove("IPS_KEYCLOAK_URL")
        .env_remove("IPS_PASETO_KEYS_FILE")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("the server starts");
    let mut server = Server(child);
    // Wait for the first log line: the server is up when it has said so.
    let lines = BufReader::new(server.0.stdout.take().expect("piped stdout"));
    std::thread::spawn(move || lines.lines().for_each(drop));
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        let live = run(&["health", "--port", &port], &env);
        if live.status.success() {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "never became live: {}",
            stderr(&live)
        );
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    let ready = run(&["health", "--ready", "--port", &port], &env);
    assert!(ready.status.success(), "{}", stderr(&ready));
}
