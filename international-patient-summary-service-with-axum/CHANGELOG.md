# Changelog

## 0.1.0 — unreleased

First implementation of the specification (spec/index.md).

- Axum 0.8 service on Axa 0.16 with sqlx 0.9 and Postgres.
- `health [--ready]` probes the local server, for an image with no `curl` (Axa 0.16).
- `POST /fhir/Bundle` stores an IPS document Bundle after a structural check;
  `GET` and `DELETE /fhir/Bundle/{id}` read and remove it.
- Health probes with a pending-migrations check; refuses to serve in
  production until authentication exists.
- Unit and request tests, including the five IPS IG example Bundles.
- `Containerfile`: a distroless image with `health --ready` as its check;
  `compose.yml --profile image` runs it with Postgres.
- `rust-version` 1.98 (stable minus two), with an MSRV CI job.
- The viewer's public tour mirrors this API in memory (spec S-WEB-3).
