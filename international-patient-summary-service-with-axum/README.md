# International Patient Summary service

The backend for the [International Patient Summary viewer](../international-patient-summary-ui-with-svelte/),
the frontend. It stores HL7 FHIR **International Patient Summary** (IPS)
document Bundles in Postgres and serves them back as FHIR JSON, so the viewer
can open a stored summary by URL.

Every `/fhir` request needs a bearer token from **Keycloak** or a **PASETO**
issuer, or either, under one access policy, and every create, read, and
delete is written to an access log. With no authenticator configured, `start`
refuses to run outside `development` and `test`.

Built with **Rust**, **Axum** 0.8, [**Axa**](https://crates.io/crates/axa)
0.19, **sqlx** 0.9, and **Postgres**.

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

## Container image

`Containerfile` builds a small image (about 55 MB): the release binary on
distroless `cc-debian13`, as user 65532, listening on every interface on port
1241, with `health --ready` as its health check.

```sh
podman compose --profile image up -d --build   # Postgres and the service; or docker compose
curl http://localhost:1241/_health/ready
```

Or on its own, against a Postgres you run:

```sh
podman build -t ips-service .                  # docker build -f Containerfile -t ips-service .
podman run --rm -p 127.0.0.1:1241:1241 \
  -e APP_ENV=development -e DB_URL=postgres://ips:ips@host.containers.internal:5432/international_patient_summary_service_development \
  ips-service
```

The image sets no `APP_ENV`, so it assumes production, and then refuses to
start without an authenticator (spec S-SAFE-1). In production it also needs
TLS to Postgres (`sslmode=require` or stronger, which Axa demands), `DB_URL_FILE`
for the secret, an `https` Keycloak or a PASETO key set, and the
`CORS_ALLOWED_ORIGINS` of the deployed viewer.

## Authentication

Every `/fhir` request needs `Authorization: Bearer <token>`; `/_health/*` needs
none (spec §6.1). One policy, [`src/policy.json`](src/policy.json), decides by the
caller's `access` attribute:

| `access` | Keycloak realm role | May                      |
| -------- | ------------------- | ------------------------ |
| `read`   | `ips-reader`        | read                     |
| `write`  | `ips-writer`        | read, store              |
| `admin`  | `ips-admin`         | read, store, delete      |
| anything else | any other role | nothing: `403`, reads included |

Every create, read, and delete is written to `ips_access_log` with the
token's subject and issuer, never a name, an email, or the document.

**Keycloak.** Set `IPS_KEYCLOAK_URL`, `IPS_KEYCLOAK_REALM`, and
`IPS_KEYCLOAK_AUDIENCES` (spec §7). For development, compose runs Keycloak 26.8
with the `ips` realm of [`keycloak/ips-realm.json`](keycloak/ips-realm.json): a
public `ips-viewer` client (PKCE, with an audience mapper for `ips-service`)
and three users whose password is their name: `reader`, `writer`, `admin`.

```sh
podman compose --profile keycloak up -d        # Postgres and Keycloak on http://localhost:8080
export IPS_KEYCLOAK_URL=http://localhost:8080 IPS_KEYCLOAK_REALM=ips IPS_KEYCLOAK_AUDIENCES=ips-service
cargo run -- start
TOKEN=$(curl -s -d grant_type=password -d client_id=ips-viewer -d username=writer -d password=writer \
  http://localhost:8080/realms/ips/protocol/openid-connect/token | jq -r .access_token)
curl -i -X POST http://localhost:1241/fhir/Bundle -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/fhir+json' --data-binary @tests/fixtures/IPS-examples-Bundle-01.json
```

Run the service on the host, as above: Keycloak names its issuer by the
address the token was asked for (`localhost:8080`), and an `http` Keycloak is
accepted only on loopback.

**PASETO.** Set `IPS_PASETO_KEYS_FILE` to the issuer's published key set
(`{"keys":[{"kty":"OKP","crv":"Ed25519","kid":"…","x":"…"}]}`),
`IPS_PASETO_ISSUER`, and `IPS_PASETO_AUDIENCE`. A token carries `access` in
its `attrs`. This service checks tokens and issues none.

**Both.** Set both: a token beginning `v4.` is checked as PASETO, any other
as Keycloak, under the same policy.

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
- `src/lib.rs`: defaults, routes, context, and the app behind its guard.
- `src/auth.rs`: Keycloak and PASETO, the production refusal; `src/policy.json`: the access policy.
- `src/routes.rs`: handlers. `src/ips.rs`: the IPS check. `src/store.rs`: SQL.
- `migrations/`: sqlx reversible migrations.
- `Containerfile`, `compose.yml`: the image, and Postgres with it for development.
- `tests/api.rs`: request tests; `tests/auth.rs`: tokens, policy, and the access log;
  `tests/fixtures/`: the IPS IG examples.
- `keycloak/ips-realm.json`: the development realm.

## License

See [LICENSE.md](LICENSE.md).
