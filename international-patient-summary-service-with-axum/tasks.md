# International Patient Summary service with Axum — Tasks

Checklist for [plans.md](plans.md). Spec: [spec/index.md](spec/index.md).

## P1 — Scaffold and the document API

- [x] **P1-T1** Crate with Axa 0.16, now 0.19 (`postgres-sqlx`), sqlx 0.9, strict lints
      (`missing_docs`, pedantic clippy, no `unsafe`).
      Verify: `cargo clippy --all-targets -- -D warnings`.
- [x] **P1-T2** Migration `ips_documents` with the document check constraint (spec §3).
      Verify: `cargo run -- db migrate && cargo run -- db status`.
- [x] **P1-T3** IPS gate `src/ips.rs` (S-API-2) with unit tests, including
      the five IG examples. Verify: `cargo test ips::`.
- [x] **P1-T4** Routes `POST`, `GET`, `DELETE /fhir/Bundle` (S-API-1..6).
      Verify: `cargo test -- --include-ignored` with `AXA_TEST_DB_URL`.
- [x] **P1-T5** Health with a migrations check; production refusal (S-SAFE-1).
- [x] **P1-T6** Manual check against a running service: CORS for
      `http://localhost:5173`, `403` for a cross-site write, `no-store` on
      Bundles, refusal under `APP_ENV=production`. (Done 2026-11-15.)
- [x] **P1-T7** `compose.yml`, `.env.example`, CI workflow, README, AGENTS.
- [x] **P1-T8** CI run green on GitHub: the repository's
      `.github/workflows/service-check.yml` (Postgres 18, fmt, clippy, every
      test, MSRV build) on a push to `main` that changes this folder. (Green
      2026-11-17, run 44069937130.)

## P2 — Viewer integration

- [x] **P2-T1** The viewer accepts HTTP only for literal loopback hosts while
      its development server is running; production remains HTTPS-only
      (viewer F-LOAD-3 and `load.test.ts`).
- [x] **P2-T2** End-to-end check: stored `bundle-minimal` in a development
      service, opened its loopback URL in the viewer's development build, and
      saw Martha DeLarosa render (headless Chromium, 2026-11-19).

## P3 — Authentication and authorisation

- [x] **P3-T1** The user chose both (2026-11-17), with Axa 0.19.0 (a cooldown
      exception the user approved, with `axa-test` 0.10.0 and the Keycloak and
      PASETO crates Axa 0.19 requires).
- [x] **P3-T2** Guard every `/fhir` route (S-AUTH-1/2), one role policy
      (S-AUTH-3, `src/policy.json`), and the access log of every create, read,
      and delete (S-AUDIT-1). Verify: `tests/auth.rs`; by hand against Keycloak
      26.8.2 with `keycloak/ips-realm.json`, in production mode (2026-11-17).
- [x] **P3-T3** S-SAFE-1 now refuses production without an authenticator.
- [ ] **P3-T4** Decide access by record with the user: a patient's own
      summaries, a clinician's patients, break-glass. The policy supports
      `resource.*` attributes (`resource.owner: ["$sub"]`) once a document
      records whose it is.
- [ ] **P3-T5** A way to mint PASETO tokens for development (the service
      checks them and issues none), or a pointer to the issuing service.
- [ ] **P3-T6** Retention of `ips_access_log` (with P5-T2).

## P4 — Listing

- [ ] **P4-T1** `GET /fhir/Bundle` with cursor pagination, filtered by policy.
- [ ] **P4-T2** Decide `Bundle.identifier` uniqueness.

## P5 — Operations

- [x] **P5-T1** Container image (`Containerfile`, `compose.yml` profile `image`)
      and the development notes (README). Production notes follow P3.
- [ ] **P5-T2** Retention, erasure, backup and restore.
