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
| Framework     | Axum 0.8 with Axa 0.15                                    | Requested; Axa gives health, config, errors, middleware, shutdown, CLI without a framework |
| Database      | Postgres through sqlx 0.9, `axa` feature `postgres-sqlx`  | Requested; sqlx is Axa's preferred database path                                        |
| SQL           | Runtime-checked `sqlx::query`, not `query!` macros        | Builds with no database at compile time; three queries do not need the macros          |
| Storage       | Whole Bundle as `jsonb`, one row per document             | The viewer needs the document, not a relational model of it                            |
| Ids           | Server-issued v4 UUIDs, written into `Bundle.id`          | Unguessable; FHIR servers own resource ids                                              |
| API shape     | `/fhir/Bundle` paths, `application/fhir+json`             | Familiar to FHIR tools; the viewer's URL loader opens it as-is                         |
| Validation    | Structural IPS gate (spec §4.1), not profile validation   | Matches what the viewer can display; profile validation is a separate, heavy concern   |
| Errors        | RFC 9457 problems from Axa, not FHIR `OperationOutcome`   | One error format across the service; revisit if a FHIR client needs `OperationOutcome` |
| Auth          | None yet; refuse production (S-SAFE-1)                    | Patient data must not be served unauthenticated; P3 adds it                            |
| Layout        | `lib.rs` builds everything; `main.rs` only wires it       | Tests use the same router and context as production                                    |

## Phases

### Phase 1 — Scaffold and the document API (done)

Crate, migration, `POST`/`GET`/`DELETE /fhir/Bundle`, the IPS gate, health
with a migrations check, production refusal, unit and request tests (the
five IG examples as fixtures), compose file for local Postgres, CI.

### Phase 2 — Viewer integration

The viewer's URL loader accepts only `https:`. For local development, either
put TLS in front of this service, or let the viewer also accept
`http://localhost` in development builds (a change to the viewer's spec
F-LOAD-3, made there). Add a "Save to service" export and an "Open from
service" loader option to the viewer once P3 gives it a way to authenticate.

### Phase 3 — Authentication and authorisation

Axa's `paseto` or `keycloak` feature (raise the choice with the user first),
guarding every `/fhir` route. Decide who may read whose summary (patient,
clinician, break-glass), and log access as an audit record. Remove the
S-SAFE-1 guard only in the same change.

### Phase 4 — Listing

`GET /fhir/Bundle` with Axa's `cursor-pagination` (no totals), returning only
what the caller may see. Possibly `Bundle.identifier` uniqueness, so a
re-sent document is a `409` rather than a duplicate.

### Phase 5 — Operations

Container image, `DB_STATEMENT_TIMEOUT_MS` under `REQUEST_TIMEOUT_SECONDS`,
retention and erasure policy for stored records, backup and restore notes.
