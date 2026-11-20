# International Patient Summary service with Axum — Plan

Plan for `international-patient-summary-service-with-axum`, the backend for
the [`international-patient-summary-ui-with-svelte`](../international-patient-summary-ui-with-svelte/)
frontend.

- Specification: [spec/index.md](spec/index.md), the source of truth for
  *what*. This plan says *how and in what order*.
- Checklist: [tasks.md](tasks.md).

Revision: 2026-11-15 (initial).

## Goal

A summary stored once can be opened in the viewer by URL, and comes back
exactly as it went in, with no one able to reach it who should not.

## Key decisions

| Decision      | Choice                                                    | Why                                                                                     |
| ------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Framework     | Axum 0.8 with Axa 0.19                                    | Requested; Axa gives health, config, errors, middleware, shutdown, CLI without a framework |
| Database      | Postgres through sqlx 0.9, `axa` feature `postgres-sqlx`  | Requested; sqlx is Axa's preferred database path                                        |
| SQL           | Runtime-checked `sqlx::query`, not `query!` macros        | Builds with no database at compile time; three queries do not need the macros          |
| Storage       | Whole Bundle as `jsonb`, one row per document             | The viewer needs the document, not a relational model of it                            |
| Ids           | Server-issued v4 UUIDs, written into `Bundle.id`          | Unguessable; FHIR servers own resource ids                                              |
| API shape     | `/fhir/Bundle` paths, `application/fhir+json`             | Familiar to FHIR tools; the viewer's URL loader opens it as-is                         |
| Local TLS     | No certificate; viewer permits literal loopback HTTP in development only | Keeps production HTTPS-only without local certificate setup                            |
| Validation    | Structural IPS gate (spec §4.1), not profile validation   | Matches what the viewer can display; profile validation is a separate, heavy concern   |
| Errors        | RFC 9457 problems from Axa, not FHIR `OperationOutcome`   | One error format across the service; revisit if a FHIR client needs `OperationOutcome` |
| Auth          | Keycloak and PASETO through Axa, one ABAC policy by role  | The user chose both; every read is logged; production refuses to start without either  |
| Layout        | `lib.rs` builds everything; `main.rs` only wires it       | Tests use the same router and context as production                                    |

## Phases

### Phase 1 — Scaffold and the document API (done)

Crate, migration, `POST`/`GET`/`DELETE /fhir/Bundle`, the IPS gate, health
with a migrations check, production refusal, unit and request tests (the
five IG examples as fixtures), compose file for local Postgres, CI.

### Phase 2 — Viewer integration

The viewer now accepts `http:` only for literal loopback hosts in development
builds (viewer F-LOAD-3); deployed builds remain HTTPS-only. Add a "Save to
service" export and an "Open from service" loader option to the viewer once
P3 gives it a way to authenticate.

### Phase 3 — Authentication and authorisation

Done 2026-11-17: Axa's `keycloak` and `paseto` guards on every `/fhir` route,
one policy by role (`src/policy.json`), and an access-log row for every
create, read, and delete (spec §6.1). Left: who may read whose summary
(patient, clinician, break-glass; P3-T4), which needs a document to record
whose it is, and a development PASETO issuer (P3-T5).

### Phase 4 — Listing

`GET /fhir/Bundle` with Axa's `cursor-pagination` (no totals), returning only
what the caller may see. Possibly `Bundle.identifier` uniqueness, so a
re-sent document is a `409` rather than a duplicate.

### Phase 5 — Operations

Container image, `DB_STATEMENT_TIMEOUT_MS` under `REQUEST_TIMEOUT_SECONDS`,
retention and erasure policy for stored records, backup and restore notes.
