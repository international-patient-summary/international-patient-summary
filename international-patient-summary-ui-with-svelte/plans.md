# International Patient Summary UI with Svelte — Plan

Plan for building `international-patient-summary-ui-with-svelte`: a
client-side SvelteKit app that loads an HL7 FHIR International Patient
Summary (IPS) Bundle (JSON or YAML) and renders it accessibly using the
Lily Design System Svelte packages from npm, and exports it as JSON,
YAML, Markdown, or a one-page PDF.

- Specification: [spec/index.md](spec/index.md) — the source of truth
  for requirements. This plan says _how and in what order_; the spec
  says _what_.
- Checklist: [tasks.md](tasks.md) — task IDs (`P1-T1`), acceptance
  criteria, and verify commands.

Revision: 2026-11-15 (implemented on SvelteKit 3 and Lily 0.9.0 with its new medical components; initial plan 2026-09-30).

## Goal

A clinician opens the app, loads an IPS, and within seconds sees who the
patient is, what they take, what they react to, and what they have —
with nothing hidden, nothing guessed, and no data leaving the browser.

## Key decisions

| Decision        | Choice                                                                   | Why                                                                                                        |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Framework       | Svelte 5 (runes) + SvelteKit 3, TypeScript                               | Requested; matches Lily's canonical framework                                                              |
| Package manager | pnpm (packages from npmjs.com)                                           | Lily convention (`AGENTS/sveltekit.md`)                                                                    |
| Adapter         | `@sveltejs/adapter-static`, fully prerendered                            | No server; patient data stays client-side; GitHub Pages deploy                                             |
| UI components   | `@lilydesignsystem/svelte-headless` 0.9.0                                | Headless catalog incl. the medical record lists, `MedicationView`, `ObservationView`, `MedicalBanner`      |
| Header controls | `@lilydesignsystem/svelte-picker-bar` 0.6.0                              | One component for theme, locale, text size, share                                                          |
| UI i18n         | `@sveltia/i18n` (MF2 messages), client-side detection only               | Lily bundles no i18n; MF2 handles Welsh's six plural forms in the message files; Sveltia warns against SSR |
| Locales         | `./locales/{cy-001,en-us,en-gb,zh-cn}/messages.yaml`; fallback `en-US`   | Requested; lowercase dirs, canonical BCP 47 tags when registered                                           |
| FHIR target     | IPS IG 2.0.1 on FHIR R4                                                  | Current STU release; tolerate 1.x                                                                          |
| Input formats   | JSON and YAML (YAML 1.2 core schema, as a spelling of FHIR JSON)         | Requested; FHIR has no official YAML, so YAML must map 1:1 to JSON                                         |
| Output formats  | JSON, YAML, Markdown, one-page PDF — all generated client-side           | Requested; keeps patient data in the browser                                                               |
| YAML library    | `yaml` (eemeli/yaml 2.x)                                                 | Maintained, YAML 1.2, alias limits, duplicate-key errors; already used for locale files                    |
| PDF library     | `pdfmake` 0.3.x, dynamically imported                                    | Maintained, declarative tables; `pdf-lib` unmaintained since 2022                                          |
| PDF fit         | Iterative layout with priority trimming; must-show content never trimmed | One page is a goal; losing an allergy is not an acceptable way to reach it                                 |
| FHIR library    | `@types/fhir` only; own small parsing layer                              | IPS rendering needs reference resolution and formatting, not a client                                      |
| Rendering model | Section registry keyed by LOINC code, generic fallback                   | New/unknown sections still display                                                                         |
| Narrative       | Show sanitised `section.text` alongside structured data                  | Never silently drop author content                                                                         |
| Tests           | vitest + Testing Library (vitest matchers only), Playwright + axe        | Lily testing rules                                                                                         |

## Phases

### Phase 1 — Scaffold and foundations

Create the SvelteKit project (`pnpm dlx sv create`, TypeScript, vitest,
Playwright, Prettier, ESLint), switch to `adapter-static`, install the
Lily packages, copy Lily theme stylesheets to `static/assets/themes/`,
and build the layout shell: `SkipLink`, `Header` with `PickerBar`,
`main`, `Footer` with the "not a medical device" notice. Install
`@sveltia/i18n` and `yaml`; create `./locales/{cy-001,en-us,en-gb,zh-cn}/messages.yaml`;
register them in `src/lib/i18n.ts`; detect locale client-side in the
root `+layout.ts`; wire the PickerBar locale picker to `locale.set()`
and all PickerBar labels to `_()`; add the key-parity/MF2 check. Add a
strict CSP and CI
(`pnpm run test:coverage` with a 95% line-coverage floor, `pnpm run check`,
`pnpm run build`, e2e).

Exit: `pnpm run dev` shows an empty, themed, keyboard-navigable shell
that switches between all four locales, with zero axe violations.

### Phase 2 — FHIR core (`src/lib/fhir`, no UI)

Download the five IG example Bundles into `static/examples/` (and a
test copy), and generate a YAML twin of each. Build and unit-test:
parser (JSON/YAML detection, YAML 1.2 core schema, alias and size
limits), loader (file/text/URL with size limits), Bundle indexer and reference resolver (`urn:uuid:` and
`Type/id`), Composition locator, section registry (all 16 sections of
§2.1 of the spec), absent/unknown detection, formatters
(CodeableConcept, Quantity, Range, Period, Dosage, HumanName, dates),
narrative sanitiser, and structural checks.

Exit: every fixture parses from JSON and from YAML to deep-equal objects;
all spec §6.2 checks covered by tests.

### Phase 3 — Loader UI

`Loader.svelte` with `TabBar`/`TabPanel` for File / Paste / URL /
Examples; file picker and drag-and-drop accept `.json`, `.yaml`,
`.yml`; paste accepts either; "Loaded as JSON/YAML" shown; `Loading` state; `ErrorSummary` for failures.
Document held in `$state` only.
URLs require HTTPS, except that the development server permits HTTP for the
three literal loopback hosts so it can use the local IPS service without a
development certificate.

Exit: each loader path loads each fixture; errors are announced and
focus moves to the error summary.

### Phase 4 — Patient banner, metadata, required sections

`PatientBanner` (`MedicalBanner`, `AddressographBox`,
`MedicalBannerBoxForDanger` for high-criticality allergies and alerts),
`DocumentMeta` (`SummaryList`), `ContentsNav`, generic `SectionView`
with narrative `Details`, raw-JSON `Details`, and the three absent
states. Renderers for the three required sections: Medications,
Allergies, Problems.

Exit: `bundle-minimal` and `bundle-no-info-required-sections` render
correctly and distinctly.

### Phase 5 — Remaining sections

Renderers for Immunizations, Results (Observations grouped under
DiagnosticReports; evaluate `svelte-data-grid` for sort), Procedures,
Devices, Vital signs, Past illness, Functional status, Plan of care,
Social history, Pregnancy, Advance directives, Alerts, Patient story,
and the generic fallback. Code-display toggle (F-VIEW-7). Responsive
table-to-card collapse.

Exit: `bundle-ips-all-sections` renders every section with no
"unrendered" fallbacks except where intended.

### Phase 6 — Export (JSON, YAML, Markdown, one-page PDF)

`src/lib/export/` (framework-free) plus `ExportMenu.svelte` (spec §6.7):

1. JSON and YAML exporters with lossless round-trip tests.
2. Non-identifying filenames and Blob download helper.
3. Markdown exporter: section tables, absent states, escaping, optional
   narrative (as plain text) and codes, localized labels, footer.
4. PDF exporter: self-host Noto Sans and Noto Sans SC in `static/fonts/`;
   dynamic-import `pdfmake`; build the one-page layout; fitting loop
   (font floor 8 pt → trim low-priority sections → omit with notice);
   must-show overflow path with "CONTINUED" warning; Letter/A4 by locale.
5. Export UI: format radio group, options, download, announcements.

Exit: spec §10 criteria 6–7 pass; PDF tests confirm one page for every
IG fixture and complete must-show text.

### Phase 7 — Accessibility, i18n, print, privacy hardening

Full axe sweep (routes × fixtures × light/dark), keyboard-only e2e,
all-locale e2e (`<html lang>`, no untranslated keys, no overflow with
Welsh or CJK strings), native-speaker clinical review of `cy-001` and
`zh-cn` wording, print stylesheet, network
assertion test (no requests after local load and all four exports),
CSP review (PDF worker/fonts), performance and bundle-size budgets
(PDF chunk excluded from the initial budget).

Exit: spec §10 acceptance criteria 1–7 all pass.

### Phase 8 — Documentation and release

README (purpose, safety notice, quick start, fixtures, architecture),
`AGENTS.md` for AI agents working on the repo, CHANGELOG, licence,
GitHub Pages deploy workflow, tag `v0.1.0`.

### Phase 9 — Public tour (backendless)

A `/tour/` page (spec §6.8) that signs in as `example@example.com` and
browses an in-memory stand-in for the backend service, seeded with the five
examples, then opens a summary in the ordinary viewer. `IpsService`
(`src/lib/service/service.ts`) states the backend's API and contract once, so
a later `HttpService` against `international-patient-summary-service-with-axum`
is a second implementation of the same interface, not a new design. Built
from Lily `Tour`, `StepList`, `Form`, `EmailInput`, `PasswordInput` and
`DocumentList`.

## Later (post-v1, see spec §11)

`$summary` against a FHIR server; SMART Health Links / QR decoding;
FHIR XML; summary comparison; validator hand-off; tagged PDF/UA;
multi-page full-summary PDF; `HttpService` against the backend once it has
authentication (backend plan P3).

## Risks and mitigations

| Risk                                                                  | Mitigation                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Real-world IPS documents deviate from the IG                          | Tolerant parsing, generic renderer, raw JSON always reachable, warnings not crashes                                         |
| Unsafe narrative XHTML (XSS)                                          | Sanitise with an allowlist; test with hostile fixtures; CSP                                                                 |
| Lily packages are early (0.x) and may change                          | Pin exact versions; wrap Lily usage in app components so changes are local                                                  |
| Lily headless ships no CSS                                            | Budget styling time; borrow patterns from `lily-design-system-svelte-sveltekit-examples`                                    |
| Clinical misreading (e.g. "unknown" read as "none")                   | Three distinct worded absent states; clinician review of wording                                                            |
| Clinical UI wording mistranslated (Welsh, Chinese)                    | `en-us` is key source of truth; machine drafts tracked in `locales/<dir>/REVIEW.md`; fluent clinician review before release |
| Share control leaking patient data                                    | Share only the app URL; never serialise documents into URLs; e2e test                                                       |
| YAML type coercion silently changes FHIR values (`no`, `1.10`, dates) | YAML 1.2 core schema; quote ambiguous strings on output; round-trip tests on every fixture                                  |
| Malicious YAML (alias-expansion bomb, huge input)                     | `maxAliasCount`, size limit, single-document only                                                                           |
| One-page PDF drops safety-critical data                               | Must-show list never trimmed; explicit "Not shown on this page" line; overflow warning instead of silent loss               |
| CJK font size (several MB)                                            | Load Noto Sans SC only when content contains CJK; font subset embedded by pdfmake; excluded from initial budget             |
| Markdown injection from clinical text                                 | Escape Markdown metacharacters; narrative converted to plain text; injection fixture test                                   |
| Filenames exposing patient identity on shared workstations            | Non-identifying default filenames                                                                                           |
| CORS blocks URL loading                                               | Clear error text suggesting download-then-upload                                                                            |

## How to execute

- Work phase by phase; tasks in [tasks.md](tasks.md) are ordered by
  dependency.
- Do a task's **Verify** step before ticking it. `pnpm test` and
  `pnpm run check` must pass at the end of every session.
- Keep commits small, one task per commit, task ID in the message.
- When a task changes a spec claim, update [spec/index.md](spec/index.md)
  in the same commit.
