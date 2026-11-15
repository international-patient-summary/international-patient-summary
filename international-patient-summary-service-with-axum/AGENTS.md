# AGENTS.md

Guidance for AI agents (and people) working on this repository.

Read first: [spec/index.md](spec/index.md) (what), [plans.md](plans.md)
(how), [tasks.md](tasks.md) (the checklist). The spec is the source of truth;
a change in behaviour carries a spec edit, a code edit, and a test edit in the
same commit.

This is the backend; [`../international-patient-summary-ui-with-svelte`](../international-patient-summary-ui-with-svelte/)
is the frontend. A change that affects what the viewer fetches is checked
against that project's spec.

## Rules

- Axa is a library: `main.rs` stays ordinary Axum. No route macros, no DI
  container, no database abstraction. Read the Axa skill
  (`skill/axa-skill/SKILL.md` in the `axa` crate) before using a new Axa API.
- Handlers return `axa::Result`. Use `not_found()` and `Error::CustomError`
  with an `ErrorDetail` code; never build error text from a database error.
- SQL lives in `src/store.rs` and binds every value. The IPS check lives in
  `src/ips.rs` and stays free of HTTP and database code.
- Never log or echo document content, patient names, or identifiers. Ids only.
- Every Bundle answer has `Cache-Control: no-store`.
- Do not remove the production refusal (spec S-SAFE-1) except in the change
  that adds authentication.
- Raise any new dependency or Axa feature with the user first.
- `Cargo.lock` is committed. This machine's Cargo enforces a minimum publish
  age; do not override it for anything the user has not named.

## Verify before you finish

```sh
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test
AXA_TEST_DB_URL=postgres://… cargo test -- --include-ignored
```

All must pass.
