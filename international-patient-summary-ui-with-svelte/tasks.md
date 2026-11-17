# International Patient Summary UI with Svelte — Tasks

Checklist companion to [plans.md](plans.md), revision 2026-11-15 (Phase 9 added the same day).
Ticked tasks were implemented and verified on 2026-11-15; open boxes still need
a person (translation review), a pushed repository (CI), or a release decision.
Requirements live in [spec/index.md](spec/index.md); section references
below (`§6.3`) point there.

Rules for the executing agent:

- Do a task's **Verify** step before checking its box. `pnpm test` and
  `pnpm run check` must pass at the end of every session.
- Svelte 5 runes only; TypeScript everywhere; pnpm, not npm.
- Tests use vitest built-in matchers only — never `@testing-library/jest-dom`.
- Every `{#each}` has a key. No `{@html}` except sanitised narrative.
- No hard-coded UI text: every string goes through `_()` from
  `@sveltia/i18n`, with the key added to all four
  `./locales/*/messages.yaml` files in the same commit.
- Never persist or transmit patient data (§5, §6.5, §6.7 F-EXP-6).
- YAML is parsed and emitted with the YAML 1.2 core schema only (§6.1 F-LOAD-7).
- One task per commit, task ID in the message. Update the spec in the
  same commit when a task changes something it claims.

## Phase 1 — Scaffold and foundations

- [x] **P1-T1 Create the SvelteKit project.**
      `pnpm dlx sv create` with TypeScript, vitest, Playwright, ESLint,
      Prettier. Set `engines.node` to match the Lily packages. Add
      `.gitignore`, `LICENSE`, and a stub `README.md`.
      Verify: `pnpm install && pnpm run check && pnpm run build`.

- [x] **P1-T2 Static adapter.**
      Switch to `@sveltejs/adapter-static`; `export const prerender = true`
      and `ssr = false`-safe layout (client-side i18n, §4.3).
      Verify: `pnpm run build` emits `build/index.html`; `pnpm run preview` serves it.

- [x] **P1-T3 Install Lily packages.**
      `pnpm add @lilydesignsystem/svelte-headless @lilydesignsystem/svelte-picker-bar`
      (exact versions pinned). Copy Lily theme stylesheets to
      `static/assets/themes/`.
      Verify: a scratch route imports `SkipLink` and `PickerBar` and `pnpm run check` passes.

- [x] **P1-T4 Sveltia I18n and locale files.**
      `pnpm add @sveltia/i18n yaml`. Create
      `locales/cy-001/messages.yaml`, `locales/en-us/messages.yaml`,
      `locales/en-gb/messages.yaml`, `locales/zh-cn/messages.yaml` with the
      shell's keys (app title, skip link, picker labels, footer notice).
      `src/lib/i18n.ts` registers `cy-001`, `en-US`, `en-GB`, `zh-CN` with
      lazy YAML loaders and `init({ fallbackLocale: 'en-US' })`. Root
      `+layout.ts` detects locale in the browser (`?lang=`, then stored
      preference, then navigator) and awaits `waitLocale()`.
      Verify: `pnpm run dev`; `/?lang=cy-001`, `/?lang=zh-CN`, `/?lang=en-GB`
      each show translated shell text and correct `<html lang>`.

- [x] **P1-T5 Locale parity and MF2 check.**
      `src/lib/i18n.test.ts`: every locale has exactly the `en-us` key set;
      every message compiles as MF2; Welsh plural messages cover
      `zero one two few many *`.
      Verify: `pnpm test` passes; deleting one `cy-001` key makes it fail.

- [x] **P1-T6 Layout shell.**
      `+layout.svelte`: `SkipLink` → `Header` (app title + `PickerBar`) →
      `<main id="main">` → `Footer` ("not a medical device" notice). All
      `PickerBar` `labels` from `_()`; `locales={["cy-001","en-US","en-GB","zh-CN"]}`
      with endonym `localeLabels`; `localeProps={{ applyDir: false, onChange: (c) => locale.set(c) }}`
      (Sveltia owns `<html lang dir>`); theme and text-size `storageKey`s set;
      share targets share the app URL only. Base CSS on Lily class hooks.
      Verify: keyboard-only walk-through; switching locale in the picker
      re-renders text; `svelte-autofixer` clean on the layout.

- [x] **P1-T7 Security headers and CSP.**
      Strict CSP via `kit.csp` (no inline scripts, `connect-src` limited to
      `self` plus `https:` for the URL loader).
      Verify: built site loads with no CSP violations in the console.

- [ ] **P1-T8 CI.**
      GitHub Actions: install, `pnpm run check`, `pnpm test`, `pnpm run build`,
      `pnpm run test:e2e`.
      Verify: workflow green on a pushed branch.

## Phase 2 — FHIR core (`src/lib/fhir`)

- [x] **P2-T1 Fixtures.**
      Download the IG 2.0.1 examples `bundle-minimal`,
      `bundle-no-info-required-sections`, `bundle-ips-all-sections`,
      `IPS-examples-Bundle-01`, `IPS-examples-Bundle-with-immunization`
      (JSON) into `static/examples/`; record source URLs and IG version in
      `static/examples/README.md`. Add hand-made edge fixtures under
      `src/lib/fhir/fixtures/` (non-document Bundle, broken reference,
      unknown section, hostile narrative, IPS 1.1.0 document).
      Generate a YAML twin of each IG fixture (`*.yaml`) with a one-off
      script `bin/make-yaml-twins` (`yaml` stringify, core schema; P6-T3
      later switches it to the real exporter), and a `yaml-edge/` set (`no`/`on` values,
      `0123`, `1.10`, unquoted dates, `.inf`, duplicate keys, alias bomb,
      multi-document stream).
      Verify: every JSON file parses as JSON.

- [x] **P2-T2 Types.**
      `pnpm add -D @types/fhir`; `src/lib/fhir/types.ts` re-exports R4 types
      and defines `IpsDocument`, `IpsSection`, `Check` (error/warning/info).
      Verify: `pnpm run check`.

- [x] **P2-T3 Parser (`parse.ts`).** Uses `yaml` (installed in
      from P1-T4). Detect JSON vs YAML (extension/MIME, then try JSON, then
      YAML); YAML 1.2 core schema, `uniqueKeys: true`, low `maxAliasCount`,
      single document, no custom tags; errors carry line/column (§6.1
      F-LOAD-5…7). Returns `{ data, format }`.
      Verify: JSON and YAML twins deep-equal for every IG fixture; each
      `yaml-edge/` case accepted or rejected as the spec says.

- [x] **P2-T3b Loader (`load.ts`).** File, text, and `https:` URL →
      `parse.ts`; size limit (default 10 MB); typed errors (§6.1).
      Verify: unit tests for each path and each error.

- [x] **P2-T4 Bundle index and reference resolver (`bundle.ts`).**
      Index entries by `fullUrl` and `Type/id`; resolve `urn:uuid:` and
      relative references.
      Verify: every Composition section entry in all five IG fixtures resolves.

- [x] **P2-T5 Composition and section registry (`composition.ts`, `sections.ts`).**
      Locate the Composition; map sections by LOINC code to the 16 keys,
      titles (i18n keys), and levels of spec §2.1; unknown codes → `generic`.
      Verify: `bundle-ips-all-sections` yields all 16; unknown-section fixture yields `generic`.

- [x] **P2-T6 Absent/unknown detection (`absent.ts`).**
      Classify each section as has-entries / none-known / unknown /
      omitted (§6.4).
      Verify: `bundle-no-info-required-sections` classifies all three
      required sections correctly.

- [x] **P2-T7 Formatters (`format.ts`).**
      CodeableConcept (display → text → system|code), Quantity, Range,
      Ratio, Period, Dosage, HumanName, Identifier, age from birthDate.
      Dates/numbers formatted through Sveltia `date()`/`number()`.
      Verify: unit tests, including `en-US` vs `en-GB` date order.

- [x] **P2-T8 Narrative sanitiser (`narrative.ts`).**
      DOMPurify with a FHIR-narrative allowlist.
      Verify: hostile fixture's `<script>`, `on*` attributes, and
      `javascript:` URLs are stripped.

- [x] **P2-T9 Structural checks (`checks.ts`).**
      All checks of §6.2 with severity.
      Verify: one test per check.

## Phase 3 — Loader UI

- [x] **P3-T1 `Loader.svelte`.** `TabBar`/`TabPanel` for File / Paste /
      URL / Examples; `FileUpload` with drag-and-drop accepting `.json`,
      `.yaml`, `.yml`; paste box accepts JSON or YAML; show "Loaded as
      JSON/YAML"; `Loading` state.
      Verify: component tests for each tab with both a JSON and a YAML fixture.

- [x] **P3-T2 Error handling.** `ErrorSummary` for load and
      structural errors; focus moves to it; messages localized.
      Verify: component test asserts focus and text in `en-US` and `cy-001`.

- [x] **P3-T3 Examples route.** `/examples` lists the five fixtures with
      descriptions; selecting one loads it into the viewer.
      Verify: e2e clicks each example and sees the patient name.

## Phase 4 — Banner, metadata, required sections

- [x] **P4-T1 `PatientBanner.svelte`.** `MedicalBanner` +
      `AddressographBox`: name, DOB + age, gender, identifiers. High-
      criticality allergies and active alerts in
      `MedicalBannerBoxForDanger` — never collapsed (§8).
      Verify: component tests on `IPS-examples-Bundle-01`.

- [x] **P4-T2 `DocumentMeta.svelte`.** `SummaryList`: title, date,
      authors, custodian, attesters, confidentiality, language, IPS version.
      Verify: component test.

- [x] **P4-T3 `SectionView.svelte` + `ContentsNav`.** Heading (`h2`),
      entries slot, narrative `Details` (open when no entries), raw-JSON
      `Details`, the three absent states in words; contents nav in
      Composition order. Clinical text gets the document `lang`.
      Verify: component tests for each absent state.

- [x] **P4-T4 Medications renderer.** (§6.3 F-VIEW-4) `DataTable`.
      Verify: fixture test.

- [x] **P4-T5 Allergies renderer.** Criticality and status via
      `StatusTag` with text, not colour alone.
      Verify: fixture test.

- [x] **P4-T6 Problems renderer.**
      Verify: fixture test; `bundle-minimal` renders fully.

## Phase 5 — Remaining sections

- [x] **P5-T1 Immunizations.**
- [x] **P5-T2 Results** — Observations grouped under DiagnosticReports;
      reference range and interpretation; evaluate
      `@lilydesignsystem/svelte-data-grid` for sorting (record decision in spec §4.1).
- [x] **P5-T3 History of Procedures** (table and `TimelineList` view).
      Done: a Lily `ProcedureRecordList`, and a "Show as timeline" toggle
      (`TimelineList`) on procedures and immunizations.
- [x] **P5-T4 Medical Devices.**
- [x] **P5-T5 Vital Signs.**
- [x] **P5-T6 History of Past Illness** (reuse Problems renderer).
- [x] **P5-T7 Functional Status.**
- [x] **P5-T8 Plan of Care** (`MedicalBannerBoxForAdvice` for key items).
- [x] **P5-T9 Social History.**
- [x] **P5-T10 History of Pregnancy.**
- [x] **P5-T11 Advance Directives.**
- [x] **P5-T12 Alerts** (also surfaced in the banner).
- [x] **P5-T13 Patient Story** (narrative).
- [x] **P5-T14 Generic fallback renderer.**
- [x] **P5-T15 Code-display toggle** (F-VIEW-7).
- [x] **P5-T16 Responsive tables → `Card` list below a breakpoint.**

  Verify (P5-T1…T16): a component test per renderer against
  `bundle-ips-all-sections`; e2e shows every section with no
  unexpected generic fallbacks.

## Phase 6 — Export (§6.7)

- [x] **P6-T1 Download helper and filenames (`filename.ts`).**
      `international-patient-summary-{composition-date}.{ext}`; Blob +
      object URL, revoked after click; never patient name or identifiers.
      Verify: unit tests; filename for every fixture contains no name/identifier text.

- [x] **P6-T2 JSON exporter (`json.ts`).** Loaded Bundle, unchanged,
      2-space indent, `application/fhir+json`.
      Verify: `JSON.parse(export)` deep-equals the source for every fixture.

- [x] **P6-T3 YAML exporter (`yaml.ts`).** YAML 1.2 core schema; quote
      any string that would re-parse as another type; leading comment with
      source and "YAML is not an official FHIR format"; key order kept.
      Verify: `parse(yamlExport)` deep-equals the source for every fixture
      and every `yaml-edge/` value; switch `bin/make-yaml-twins` to use it
      and confirm the regenerated twins are unchanged or still deep-equal.

- [x] **P6-T4 Markdown exporter (`markdown.ts`).** Title, patient block,
      document metadata, `##` per section in Composition order, tables,
      absent states in words, required sections always present; options:
      narrative (plain text) and codes; escaping of `|` `*` `_` `#` `<` and
      backticks; footer with generated-at, source, IPS version, safety notice.
      Labels via `_()`.
      Verify: snapshot per fixture × four locales; injection fixture renders
      inert; output passes `markdownlint`.
      Status: implemented; snapshots, the injection test, and a structural
      test (one h1, blank lines around headings and tables, consistent table
      columns, no trailing spaces) pass. markdownlint 0.42.1 (dev only) now runs
      in `export.test.ts` on every fixture × four locales, default rules but line
      length (2026-11-17); it found bare URLs (MD034, now escaped so clinical text
      never becomes a link), emphasis-only absent states (MD036, now plain words)
      and empty-cell spacing (MD060, now `| |`), all fixed.

- [x] **P6-T5 PDF fonts.** Self-host Noto Sans (regular, bold) and
      Noto Sans SC in `static/fonts/` with OFL licence files; CJK detector
      over rendered strings.
      Verify: unit test: CJK detector true for 中文 content, false for Welsh `ŵ ŷ`.

- [x] **P6-T6 PDF layout (`pdf.ts`).** `pnpm add pdfmake`; dynamic
      `import()` only on first PDF export. Header band (identity), danger box
      (alerts, allergies), sections in clinical priority order, footer
      (generated-at, source date, IPS version, safety notice, "page 1 of 1").
      Letter for `en-US`, A4 otherwise, overridable. PDF metadata title =
      filename.
      Verify: PDF for `IPS-examples-Bundle-01` opens; text extracted with
      `pdfjs-dist` contains patient name and every allergy.

- [x] **P6-T7 One-page fitting loop.** Measure page count via `footer`
      callback; shrink to 8 pt floor → trim low-priority sections with
      "+N more not shown" → omit sections with notice; "Not shown on this
      page" line. Must-show (identity, alerts, allergies, active meds) never
      trimmed; overflow → 2 pages with "CONTINUED" on both and a UI warning.
      Verify: every IG fixture → exactly 1 page; synthetic 80-allergy fixture
      → 2 pages with all 80 allergies and the warning; "Not shown" line
      matches the trimmed set exactly.

- [x] **P6-T8 `ExportMenu.svelte`.** Lily radio group for JSON / YAML /
      Markdown / PDF, per-format options in `Details`, download button,
      `Loading` during PDF generation, `Alert` for errors, live-region
      announcement of the downloaded filename. All strings via `_()` in all
      four locales.
      Verify: component tests (keyboard-only selection and download for
      each format); axe clean.

- [x] **P6-T9 Export e2e.** For each IG fixture (JSON and YAML input) ×
      each format: download succeeds, file type correct, JSON/YAML round
      trip equal, PDF one page.
      Verify: `pnpm run test:e2e` passes.

## Phase 7 — Quality and hardening

- [x] **P7-T1 Accessibility sweep.** `@axe-core/playwright` over every
      route × every fixture × light/dark theme × four locales.
      Verify: zero violations.

- [x] **P7-T2 Keyboard-only e2e.** Load, navigate contents, open
      disclosures, change theme/locale/text size — no mouse.
      Verify: e2e passes.

- [x] **P7-T3 Locale e2e.** Each of `cy-001`, `en-US`, `en-GB`, `zh-CN`:
      `<html lang>` correct, no raw keys visible, no horizontal overflow at
      320 px; Welsh plural counts render correctly.
      Verify: e2e passes.

- [ ] **P7-T4 Translation review.** Fluent clinical review of `cy-001`
      and `zh-cn` (and `en-gb` spelling: anaesthetic, haemoglobin,
      paediatric). Track in `locales/<dir>/REVIEW.md`; delete when signed off.
      Verify: no open `REVIEW.md` items.

- [x] **P7-T5 Print stylesheet** (§6.6).
      Verify: Playwright print-media screenshot shows expanded narrative and no controls.

- [x] **P7-T6 Privacy test.** After loading a local file and exporting
      all four formats, assert zero network requests (other than same-origin
      font files on first PDF) and nothing written to `localStorage` except picker
      preferences.
      Verify: e2e passes.

- [x] **P7-T7 Performance and size budgets** (§7).
      Verify: `bundle-ips-all-sections` render < 200 ms; initial JS ≤ 250 KB
      gzipped (PDF chunk and fonts excluded, loaded lazily); PDF generation < 3 s.

## Phase 8 — Documentation and release

- [x] **P8-T1 README.** Purpose, safety notice, quick start
      (`pnpm install && pnpm run dev`), input formats (JSON, YAML), export
      formats (JSON, YAML, Markdown, one-page PDF) and the PDF trimming rules,
      locales, fixtures, architecture.
- [x] **P8-T2 AGENTS.md** with the rules at the top of this file.
- [x] **P8-T3 CHANGELOG and licence.**
- [x] **P8-T4 GitHub Pages deploy workflow.**
- [ ] **P8-T5 Tag `v0.1.0`** after spec §10 acceptance criteria all pass.

  Verify: deployed site loads each example in each locale.

## Phase 9 — Public tour (§6.8)

- [x] **P9-T1 Service contract.** `src/lib/service/service.ts`: `IpsService`,
      `checkIps` mirroring the backend's `src/ips.rs`, its refusal codes and
      pointers, `isServiceId`. Verify: `pnpm test src/lib/service`.
- [x] **P9-T2 In-memory service.** `TourService`: ids into `Bundle.id`, 422
      refusals, 404s, newest-first listing with subject name, deep copies.
- [x] **P9-T3 Tour session.** `src/lib/tour.svelte.ts`: tour account only,
      seeding from the bundled examples, open/delete/reset, sign-out forgets
      everything. Verify: `pnpm test src/lib/tour`.
- [x] **P9-T4 Tour page and header link.** `src/routes/tour/+page.svelte`
      with Lily `StepList`, `Tour`, `Form`, `DocumentList`; `tour.*` and
      `header.tour` in all four locales; nav `aria-current` fixed for
      trailing slashes. Verify: `pnpm run check`, svelte-autofixer.
- [x] **P9-T5 End-to-end.** `e2e/tour.spec.ts`: walk-through, no request
      off-origin or to `/fhir/`, nothing stored, axe in cy-001 and zh-CN;
      `/tour/` added to the axe route sweep. Verify: `pnpm run test:e2e`.
- [ ] **P9-T6 Translation review** of the new `tour.*` strings in cy-001 and
      zh-cn (part of P7-T4).
- [ ] **P9-T7 `HttpService`** against the backend, after its P3
      (authentication).
