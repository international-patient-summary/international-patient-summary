# International Patient Summary service

The backend for the [International Patient Summary viewer](../international-patient-summary-ui-with-svelte/),
the frontend. It stores HL7 FHIR **International Patient Summary** (IPS)
document Bundles in Postgres and serves them back as FHIR JSON, so the viewer
can open a stored summary by URL.

> **Not for production yet.** It has no authentication, so `start` refuses to
> run outside `development` and `test`. See [plans.md](plans.md), phase 3.

Built with **Rust**, **Axum** 0.8, [**Axa**](https://crates.io/crates/axa)
0.13, **sqlx** 0.9, and **Postgres**.

- Specification: [spec/index.md](spec/index.md)
- Plan: [plans.md](plans.md) · Checklist: [tasks.md](tasks.md)

## Quick start

Requires Rust 1.98 or newer and Postgres 16 or newer.

```sh
podman compose up -d          # or: docker compose up -d
cp .env.example .env && set -a && . ./.env && set +a
cargo run -- start            # http://localhost:1241, migrates on boot in development
```

| Command                               | What it does                                             |
| ------------------------------------- | -------------------------------------------------------- |
| `cargo run -- start`                  | Serve                                                    |
| `cargo run -- check`                  | Print effective settings, secrets redacted               |
| `cargo run -- health [--ready]`       | Probe the running server; non-zero unless it answers     |
| `cargo run -- db migrate` / `status`  | Apply migrations / show which have run                   |
| `cargo test`                          | Unit and request tests that need no database             |
| `cargo test -- --include-ignored`     | Everything, with `AXA_TEST_DB_URL` set                   |

## API

| Method   | Path                  | Answer                                                       |
| -------- | --------------------- | ------------------------------------------------------------ |
| `POST`   | `/fhir/Bundle`        | `201` with `Location` and the stored Bundle; `422` if not an IPS |
| `GET`    | `/fhir/Bundle/{id}`   | `200` with the Bundle (`application/fhir+json`), or `404`    |
| `DELETE` | `/fhir/Bundle/{id}`   | `204`, or `404`                                              |
| `GET`    | `/_health/live`, `/_health/ready`, `/_health/startup` | Probes                       |

```sh
curl -i -X POST http://localhost:1241/fhir/Bundle \
  -H 'content-type: application/fhir+json' \
  --data-binary @tests/fixtures/IPS-examples-Bundle-01.json
```

Errors are RFC 9457 problems (`application/problem+json`) with a stable
`code`, for example:

```json
{ "status": 422, "code": "not_a_patient_summary",
  "detail": "The Composition's type is not LOINC 60591-5 (Patient summary Document).",
  "errors": [{ "pointer": "#/entry/0/resource/type" }] }
```

## With the viewer

Set `CORS_ALLOWED_ORIGINS=http://localhost:5173` (in `.env.example`) so the
viewer's dev server can read answers. The viewer's URL loader accepts only
`https:` URLs today; see [plans.md](plans.md), phase 2.

## Layout

- `src/main.rs`: the command line, `start` and `db`.
- `src/lib.rs`: defaults, routes, context, and the production guard.
- `src/routes.rs`: handlers. `src/ips.rs`: the IPS check. `src/store.rs`: SQL.
- `migrations/`: sqlx reversible migrations.
- `tests/api.rs`: request tests; `tests/fixtures/`: the IPS IG examples.

## License

See [LICENSE.md](LICENSE.md).
