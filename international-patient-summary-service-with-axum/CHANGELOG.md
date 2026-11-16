# Changelog

## 0.1.0 — unreleased

First implementation of the specification (spec/index.md).

- Axum 0.8 service on Axa 0.13 with sqlx 0.9 and Postgres.
- `POST /fhir/Bundle` stores an IPS document Bundle after a structural check;
  `GET` and `DELETE /fhir/Bundle/{id}` read and remove it.
- Health probes with a pending-migrations check; refuses to serve in
  production until authentication exists.
- Unit and request tests, including the five IPS IG example Bundles.
- `rust-version` 1.98 (stable minus two), with an MSRV CI job.
- The viewer's public tour mirrors this API in memory (spec S-WEB-3).
