# AGENTS.md

Guidance for AI agents (and people) working on this repository.

Read first: [spec/index.md](spec/index.md) (what), [plans.md](plans.md)
(how), [tasks.md](tasks.md) (the checklist). The spec is the source of truth;
when a change alters something the spec claims, update the spec in the same
commit.

## Rules

- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$bindable`,
  `$effect`); no Svelte 4 syntax. SvelteKit 3: import `browser` from
  `$app/env`, use `#lib/…` subpath imports with file extensions, `asset()` and
  `resolve()` from `$app/paths`. Configuration lives in `vite.config.ts`.
- TypeScript everywhere; pnpm, not npm.
- Tests use vitest built-in matchers only — never `@testing-library/jest-dom`.
- Every `{#each}` has a key. No `{@html}` except sanitised narrative
  (`Narrative.svelte` via `sanitizeNarrative`).
- No hard-coded UI text: every string goes through `t()` (Sveltia I18n), with
  the key added to all four `locales/*/messages.yaml` files in the same
  change. `en-us` is the source of truth for keys. `pnpm test` fails on a
  missing key, an extra key, a placeholder mismatch, an MF2 compile error, or
  a Welsh plural message without all six forms.
- Clinical content is never translated, and carries the document's `lang`.
- Never persist or transmit patient data: no localStorage/IndexedDB/cookies,
  no document in a URL, no network request except a URL the person asks to
  fetch, or the service and identity provider the person signs in to
  (spec §6.10). Picker preferences (theme, locale, text size) may be stored,
  and the pending sign-in's state and PKCE verifier in sessionStorage across
  the provider's redirect only. Never store a token.
- YAML is parsed and emitted with the YAML 1.2 core schema only.
- Statuses are words first: every Lily medical component gets a `*Label` for
  every status code it receives. Colour only reinforces.
- Allergies and alerts are never behind a collapsed control. The one-page PDF
  never trims identity, alerts, allergies or active medications.
- Filenames never contain the patient's name or identifiers.
- `src/lib/fhir` and `src/lib/export` stay framework-free and unit-tested;
  components only lay out what `models.ts` and `summary.ts` return.
- The tour (spec §6.8) stays backendless: `TourService` keeps the backend's
  contract (`../international-patient-summary-service-with-axum/spec/index.md`
  §4). Change both specs together when the API changes.
- Use the Svelte MCP `svelte-autofixer` on changed components.

## Verify before you finish

```sh
pnpm run lint && pnpm run check && pnpm test && pnpm run test:e2e
```

All must pass. The e2e suite includes axe (zero violations, light and dark
themes), a no-network privacy check across all four exports, and the
performance budgets of spec §7.

## Where things are

- Section registry (LOINC → key, level, PDF priority): `src/lib/fhir/sections.ts`
- Absent/unknown mapping: `src/lib/fhir/absent.ts`
- FHIR → Lily props: `src/lib/fhir/models.ts`
- Section → Lily list/item components: `src/lib/components/sections/EntryList.svelte`
- PDF fitting loop: `src/lib/export/pdf.ts` (`plans()` and `exportPdf()`)
- Fixtures: `static/examples/` (IG) and `src/lib/fhir/fixtures/` (edge cases)
- Tour: `src/routes/tour/+page.svelte`, `src/lib/tour.svelte.ts`, `src/lib/service/`
