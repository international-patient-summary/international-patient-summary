# International Patient Summary service — Specification

The backend for [`international-patient-summary-ui-with-svelte`](../../international-patient-summary-ui-with-svelte/),
the frontend viewer. It stores HL7 FHIR International Patient Summary (IPS)
document Bundles in Postgres and serves them back as FHIR JSON, so the viewer
can open a stored summary by URL.

This file is the source of truth. A change in behaviour carries a spec edit, a
code edit, and a test edit together. Requirement IDs (`S-API-1`) name the test
that proves them in [§8](#8-verification).

Revision: 2026-11-20 (development PASETO issuer, §6.2). Local viewer transport 2026-11-19. Authentication, access log, Axa 0.19 and container image 2026-11-17. Initial 2026-11-15.

## 1. Scope

In scope:

- Accept an IPS document Bundle (FHIR JSON), check that it is one, and store it.
- Serve a stored Bundle by id, exactly as it was sent apart from `Bundle.id`.
- Delete a stored Bundle.
- Bearer-token authentication (Keycloak, PASETO, or both), an access policy by
  role, and an access log of every create, read, and delete (§6.1).
- Health probes, configuration, logging, and graceful shutdown, from Axa.

Not in scope yet (see [plans.md](../plans.md)):

- Access by record: a patient seeing only their own summaries, a clinician
  only their patients', break-glass (tasks P3-T4). Access is by role today.
- Signing people in. The service checks tokens; Keycloak, or the service that
  issues PASETO tokens, signs people in.
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
| HTTP           | Axum 0.8, through Axa 0.19 (`postgres-sqlx`, `keycloak`, `paseto`) |
| Auth           | `axa::keycloak` and `axa::paseto` guards, one ABAC policy (`src/policy.json`) |
| Database       | Postgres (16 or newer; developed on 18) through sqlx 0.9       |
| Migrations     | sqlx reversible migrations in `migrations/`, compiled in       |
| Errors         | RFC 9457 problem details (`application/problem+json`), by Axa  |
| Tests          | `cargo test`; `axa-test` 0.10 with a database of its own per test, PASETO test keys, a local OIDC provider |

Axa is a library, not a framework: `src/main.rs` reads as ordinary Axum from
the top down.

## 3. Data

Two tables. `ips_documents`:

| Column       | Type          | Notes                                                   |
| ------------ | ------------- | ------------------------------------------------------- |
| `id`         | `uuid`        | Primary key, a random (v4) UUID the service issues      |
| `bundle`     | `jsonb`       | The Bundle, with `id` set to the row's `id`             |
| `created_at` | `timestamptz` | When it was stored                                      |

A check constraint holds `bundle.resourceType = 'Bundle'`, `bundle.type =
'document'`, and `bundle.id = id`, so no path can store anything else.

`ips_access_log`, one row per request that reached a document's id
(**S-AUDIT-1**):

| Column      | Type          | Notes                                                       |
| ----------- | ------------- | ----------------------------------------------------------- |
| `id`        | `bigint`      | Identity                                                    |
| `at`        | `timestamptz` | When                                                        |
| `subject`   | `text`        | The token's `sub`; null only with authentication off        |
| `issuer`    | `text`        | The token's `iss`                                           |
| `action`    | `text`        | `create`, `read`, or `delete`                               |
| `bundle_id` | `uuid`        | The document; no foreign key, so a deletion keeps its log   |
| `status`    | `smallint`    | The answer's status                                         |

It holds no document content, name, email, or token.

`jsonb` keeps the document's JSON values but not its key order or
whitespace. The round trip promise (**S-API-3**) is JSON equality, not byte
equality.

## 4. API

All paths are relative to the service root. Bodies are FHIR JSON
(`application/fhir+json`; `application/json` is also accepted on input).
Every answer carrying a Bundle has `Cache-Control: no-store`, because it is a
patient's record. Every `/fhir` request needs a bearer token (§6.1): without
one, or with a bad one, `401`; with one the policy refuses, `403`. Those
come before anything below.

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
- **S-WEB-4** Local development uses this service's ordinary loopback HTTP
  endpoint. Viewer F-LOAD-3 permits HTTP only for literal loopback hosts while
  its development server is running; deployed viewers and non-loopback hosts
  remain HTTPS-only.

## 6. Safety and privacy

- **S-SAFE-1** With no authenticator configured (neither `IPS_KEYCLOAK_URL`
  nor `IPS_PASETO_KEYS_FILE`), `start` refuses to run in any production-like
  environment (anything but `development` or `test`), and exits non-zero
  naming the reason. In development and test it serves with every `/fhir`
  route open, and warns.
- **S-SAFE-2** Logs carry document ids, never document content, patient
  names, or identifiers. Database errors reach the log only; a client gets a
  generic `500`.
- **S-SAFE-3** `db down`, `db reset`, and `db truncate` run only in
  development or test with `AXA_DESTROY_DATA=true`, as Axa's command line
  enforces.

### 6.1 Authentication, policy, and the access log

- **S-AUTH-1** Every path but `/_health/*` needs `Authorization: Bearer
  <token>`. Missing or not verified: `401`, `WWW-Authenticate: Bearer`, a
  problem with `code` `unauthorized` and `detail` `invalid token`, whatever
  the cause; the cause goes to the log. Refused by the policy: `403`, `code`
  `forbidden`, and an `auth_refused` warning in the log with the subject and
  reason, never the token.
- **S-AUTH-2** Two kinds of token, configured by the environment (§7):
  Keycloak access tokens (signature from the realm's keys, issuer
  `{url}/realms/{realm}`, one of the configured audiences, a verified email
  when it has one), and PASETO `v4.public` tokens (an Ed25519 key from the key
  set, the configured issuer and audience). With both, a token beginning
  `v4.` is PASETO and anything else Keycloak. Readiness (**S-HEALTH-1**) also
  waits for the realm's keys.
- **S-AUTH-3** One policy for both (`src/policy.json`), first match wins, on
  the caller's `access` attribute: `read` reads; `write` reads and stores;
  `admin` reads, stores, and deletes. Anything else is refused, reads
  included. A PASETO token carries `access` itself; a Keycloak realm role
  maps to it: `ips-reader`, `ips-writer`, `ips-admin`, unless
  `IPS_KEYCLOAK_ROLE_MAP` says otherwise. An unmapped role grants nothing.
- **S-AUDIT-1** Each allowed rule obliges an audit. Every create, read, and
  delete of a document id writes an `ips_access_log` row (§3), the `404`s
  included: a create and a delete in the same transaction as the change, a
  read before the document is sent. If the row cannot be written the answer
  is `500` and carries no document. An id that is not a v4 UUID is a `404`
  with no row, since no document can have it.

### 6.2 Development PASETO tokens

- **S-DEV-1** `cargo run --example development_paseto -- keys` prints the
  public key set for Axa's published throwaway test key. The same example's
  `token <subject> [read|write|admin ...]` command prints a `v4.public` token
  for this service. It refuses blank subjects, unknown access values and
  malformed commands. This predictable key protects nothing and is for local
  development only; a deployed service uses a real issuer's public key set.

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
| `IPS_KEYCLOAK_URL`     | none: Keycloak off. Its base URL; `https` unless loopback                |
| `IPS_KEYCLOAK_REALM`, `IPS_KEYCLOAK_AUDIENCES` | required with the URL; audiences comma-separated |
| `IPS_KEYCLOAK_ROLE_MAP` / `_FILE` | `ips-reader`, `ips-writer`, `ips-admin` (S-AUTH-3)            |
| `IPS_KEYCLOAK_REQUIRE_VERIFIED_EMAIL` | `true`                                                    |
| `IPS_PASETO_KEYS_FILE` | none: PASETO off. A JSON key set of Ed25519 public keys                  |
| `IPS_PASETO_ISSUER`, `IPS_PASETO_AUDIENCE` | required with the key file                           |

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
| S-SAFE-1    | `src/auth.rs` `production_refuses_to_run_without_an_authenticator`, `a_half_configured_authenticator_is_refused` |
| S-AUTH-1    | `tests/auth.rs` `every_fhir_route_needs_a_token_and_health_does_not`, `a_token_from_another_key_is_refused` |
| S-AUTH-2    | `tests/auth.rs` `with_both_configured_keycloak_and_paseto_tokens_are_each_accepted`, `keycloak_roles_map_to_access_and_unmapped_roles_grant_nothing` |
| S-AUTH-3    | `src/auth.rs` `the_policy_grants_by_access_and_refuses_the_rest_reads_included`, `the_default_role_map_applies_only_when_none_is_given`; `tests/auth.rs` `the_policy_refuses_by_access_before_any_handler_runs` |
| S-AUDIT-1   | `tests/auth.rs` `each_role_does_what_it_may_and_every_access_is_logged`, `a_read_that_cannot_be_logged_sends_nothing`, `a_keycloak_read_is_logged_under_the_tokens_subject` |
| S-DEV-1     | `examples/development_paseto.rs` unit tests                              |
| S-WEB-4     | Viewer `load.test.ts` loopback rules; browser check from a stored `bundle-minimal` service URL (tasks P2-T2) |
| Routes      | `tests/api.rs` `route_census_matches_the_spec`                            |

S-WEB-1, S-WEB-2, S-SAFE-2, and S-SAFE-3 are Axa's behaviour, proven by Axa's
own tests; the service checks them by hand (see tasks P1-T6).
