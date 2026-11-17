# International Patient Summary service — Specification

The backend for [`international-patient-summary-ui-with-svelte`](../../international-patient-summary-ui-with-svelte/),
the frontend viewer. It stores HL7 FHIR International Patient Summary (IPS)
document Bundles in Postgres and serves them back as FHIR JSON, so the viewer
can open a stored summary by URL.

This file is the source of truth. A change in behaviour carries a spec edit, a
code edit, and a test edit together. Requirement IDs (`S-API-1`) name the test
that proves them in [§8](#8-verification).

Revision: 2026-11-17 (container image, §7). Initial 2026-11-15.

## 1. Scope

In scope:

- Accept an IPS document Bundle (FHIR JSON), check that it is one, and store it.
- Serve a stored Bundle by id, exactly as it was sent apart from `Bundle.id`.
- Delete a stored Bundle.
- Health probes, configuration, logging, and graceful shutdown, from Axa.

Not in scope yet (see [plans.md](../plans.md)):

- Authentication and authorisation (tasks P3). Until it lands, the service
  refuses to serve in production (**S-SAFE-1**).
- Listing or searching stored documents (P4). A list shows which patients
  have records, so it waits for authorisation.
- Full FHIR profile validation, FHIR search, `_history`, or a FHIR
  `CapabilityStatement`. This is not a FHIR server; it borrows FHIR's paths
  and media type so the viewer and other tools recognise what they get.
- YAML. The viewer converts YAML to JSON in the browser; this service speaks
  FHIR JSON only.

> **Safety.** The service is a store, not a medical device. It never changes
> a document's clinical content: what comes back is what was sent.

## 2. Stack

| Concern        | Choice                                                         |
| -------------- | -------------------------------------------------------------- |
| Language       | Rust, edition 2024, `rust-version` 1.98 (stable minus two)     |
| HTTP           | Axum 0.8, through Axa 0.16 (`postgres-sqlx` feature)           |
| Database       | Postgres (16 or newer; developed on 18) through sqlx 0.9       |
| Migrations     | sqlx reversible migrations in `migrations/`, compiled in       |
| Errors         | RFC 9457 problem details (`application/problem+json`), by Axa  |
| Tests          | `cargo test`; `axa-test` 0.4 with a database of its own per test |

Axa is a library, not a framework: `src/main.rs` reads as ordinary Axum from
the top down.

## 3. Data

One table, `ips_documents`:

| Column       | Type          | Notes                                                   |
| ------------ | ------------- | ------------------------------------------------------- |
| `id`         | `uuid`        | Primary key, a random (v4) UUID the service issues      |
| `bundle`     | `jsonb`       | The Bundle, with `id` set to the row's `id`             |
| `created_at` | `timestamptz` | When it was stored                                      |

A check constraint holds `bundle.resourceType = 'Bundle'`, `bundle.type =
'document'`, and `bundle.id = id`, so no path can store anything else.

`jsonb` keeps the document's JSON values but not its key order or
whitespace. The round trip promise (**S-API-3**) is JSON equality, not byte
equality.

## 4. API

All paths are relative to the service root. Bodies are FHIR JSON
(`application/fhir+json`; `application/json` is also accepted on input).
Every answer carrying a Bundle has `Cache-Control: no-store`, because it is a
patient's record.

### 4.1 `POST /fhir/Bundle` — store a document

- **S-API-1** Accepts a JSON body of at most 10 MB, the viewer's own input
  limit. Larger is `413`. A body that is not JSON is `415` (wrong media type)
  or `400`/`422` (malformed), as Axa answers them.
- **S-API-2** The body must be an IPS document. The checks run in this order,
  and the first that fails answers `422` with a problem whose `code` names
  it and whose `errors[0].pointer` says where:

  | `code`                  | Requirement                                                   | `pointer`                               |
  | ----------------------- | ------------------------------------------------------------- | --------------------------------------- |
  | `not_a_bundle`          | An object with `resourceType` `Bundle`                        | `#/resourceType`                        |
  | `not_a_document`        | `type` is `document`                                          | `#/type`                                |
  | `no_composition`        | `entry[0].resource.resourceType` is `Composition`             | `#/entry/0/resource/resourceType`       |
  | `not_a_patient_summary` | The Composition's `type.coding` has `http://loinc.org` `60591-5` | `#/entry/0/resource/type`           |
  | `no_subject`            | The Composition has a non-blank `subject.reference`           | `#/entry/0/resource/subject/reference`  |

  These mirror what the viewer needs to display a document (its spec §6.2).
  A problem never quotes the document.
- **S-API-3** On success: `201 Created`, `Location: /fhir/Bundle/{id}`, and
  the stored Bundle as the body. The service sets `Bundle.id` to `{id}`,
  replacing any `id` the client sent, and changes nothing else.

### 4.2 `GET /fhir/Bundle/{id}` — read a document

- **S-API-4** `200` with the stored Bundle, `Content-Type:
  application/fhir+json`. The viewer's URL loader (its F-LOAD-3) can open
  this URL directly.
- **S-API-5** `404` for an id that is not stored, and for any text that is
  not a v4 UUID: the service does not say whether an id is malformed or
  merely unknown.

### 4.3 `DELETE /fhir/Bundle/{id}` — delete a document

- **S-API-6** `204` once deleted; `404` as in **S-API-5**, including for a
  second delete of the same id.

### 4.4 Health

- **S-HEALTH-1** `/_health/live`, `/_health/ready`, and `/_health/startup`,
  from Axa. Readiness and startup fail, naming `migrations`, while a
  migration is pending.

## 5. Browser access and the viewer

- **S-WEB-1** CORS sends nothing until `CORS_ALLOWED_ORIGINS` lists the
  viewer's origin (for example `http://localhost:5173` in development). `*`
  is refused at boot.
- **S-WEB-2** Axa's standard stack refuses a cross-site write (`403`) and
  sets security headers on every answer. The service adds no exception.
- **S-WEB-3** The viewer's public tour runs without this service, through
  `TourService` (viewer spec §6.8), which mirrors §4: ids, the S-API-2 check
  order, codes and pointers, and `404`s. A change to §4 changes the viewer's
  `src/lib/service/` and its spec in the same commit.

## 6. Safety and privacy

- **S-SAFE-1** With no authentication, `start` refuses to run in any
  production-like environment (anything but `development` or `test`), and
  exits non-zero naming the reason. Removing this guard is part of P3, not a
  configuration switch.
- **S-SAFE-2** Logs carry document ids, never document content, patient
  names, or identifiers. Database errors reach the log only; a client gets a
  generic `500`.
- **S-SAFE-3** `db down`, `db reset`, and `db truncate` run only in
  development or test with `AXA_DESTROY_DATA=true`, as Axa's command line
  enforces.

## 7. Configuration

There are no config files. Axa reads the environment; `check` prints the
effective settings with secrets redacted, and `health [--ready]` asks the
server on this machine for its probe and exits non-zero unless it answers,
for a container image with no `curl`. The image (`Containerfile`) sets
`BINDING=0.0.0.0` and no `APP_ENV`, so it assumes production unless told
otherwise. The ones this service relies on:

| Variable               | Default (development)                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `APP_ENV`              | `development`                                                            |
| `DB_URL` / `DB_URL_FILE` | Postgres on localhost, database `international_patient_summary_service_development` |
| `DB_AUTO_MIGRATE`      | `true` outside production                                                |
| `PORT`                 | `1241`                                                                   |
| `CORS_ALLOWED_ORIGINS` | none                                                                     |

## 8. Verification

```sh
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test                                   # no database needed
AXA_TEST_DB_URL=postgres://… cargo test -- --include-ignored
```

| Requirement | Test                                                                      |
| ----------- | ------------------------------------------------------------------------- |
| S-API-1     | `tests/api.rs` `a_body_that_is_not_json_is_refused`                       |
| S-API-2     | `src/ips.rs` tests; `tests/api.rs` `a_non_ips_body_is_refused_with_a_pointer` |
| S-API-3/4/6 | `tests/api.rs` `every_example_round_trips` (all five IG examples)         |
| S-API-5     | `tests/api.rs` `an_id_this_service_never_issues_is_not_found`             |
| S-HEALTH-1  | `tests/api.rs` `liveness_answers_without_a_database`, `readiness_answers_once_migrated` |
| S-SAFE-1    | `tests/api.rs` `production_refuses_to_serve_without_authentication`       |
| Routes      | `tests/api.rs` `route_census_matches_the_spec`                            |

S-WEB-1, S-WEB-2, S-SAFE-2, and S-SAFE-3 are Axa's behaviour, proven by Axa's
own tests; the service checks them by hand (see tasks P1-T6).
