# International Patient Summary service with Axum — Tasks

Checklist for [plans.md](plans.md). Spec: [spec/index.md](spec/index.md).

## P1 — Scaffold and the document API

- [x] **P1-T1** Crate with Axa 0.13 (`postgres-sqlx`), sqlx 0.9, strict lints
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
- [ ] **P1-T8** CI run green on GitHub (needs this folder published as its
      own repository, as the viewer is).

## P2 — Viewer integration

- [ ] **P2-T1** Decide local TLS vs. viewer accepting `http://localhost` in
      development (change in the viewer's spec F-LOAD-3).
- [ ] **P2-T2** End-to-end check: store an example here, open its URL in the
      viewer, see it render.

## P3 — Authentication and authorisation

- [ ] **P3-T1** Choose `paseto` or `keycloak` with the user.
- [ ] **P3-T2** Guard every `/fhir` route; access policy; audit log of reads.
- [ ] **P3-T3** Remove the S-SAFE-1 guard in the same change; update the spec.

## P4 — Listing

- [ ] **P4-T1** `GET /fhir/Bundle` with cursor pagination, filtered by policy.
- [ ] **P4-T2** Decide `Bundle.identifier` uniqueness.

## P5 — Operations

- [ ] **P5-T1** Container image and deployment notes.
- [ ] **P5-T2** Retention, erasure, backup and restore.
