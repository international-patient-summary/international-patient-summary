# Changelog

## 0.1.0 — unreleased

First implementation of the specification (spec/index.md).

- Axum 0.8 service on Axa 0.19 with sqlx 0.9 and Postgres (`axa-test` 0.10).
- Authentication (spec §6.1): Keycloak access tokens, PASETO `v4.public`
  tokens, or both, on every `/fhir` route; one access policy by role
  (`ips-reader`, `ips-writer`, `ips-admin`), reads included; an
  `ips_access_log` row for every create, read, and delete, written with the
  change or before the document is sent. A development Keycloak realm in
  `keycloak/ips-realm.json` (`compose.yml --profile keycloak`).
- `health [--ready]` probes the local server, for an image with no `curl` (Axa 0.16).
- `POST /fhir/Bundle` stores an IPS document Bundle after a structural check;
  `GET` and `DELETE /fhir/Bundle/{id}` read and remove it.
- `GET /fhir/Bundle` lists documents newest first with `_count` and `_cursor` paging
  (S-API-7/8/9): each is subsetted to the Composition's title, date and subject and
  the subject's name, as the viewer's `SummaryListing` needs, and logged as a read.
- Health probes with a pending-migrations check (and Keycloak's keys); refuses
  to start in production without an authenticator.
- Unit and request tests, including the five IPS IG example Bundles.
- `Containerfile`: a distroless image with `health --ready` as its check;
  `compose.yml --profile image` runs it with Postgres.
- `rust-version` 1.98 (stable minus two), with an MSRV CI job.
- The viewer's public tour mirrors this API in memory (spec S-WEB-3).
