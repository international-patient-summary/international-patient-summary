# International Patient Summary UI with Svelte — Specification

Living specification for `international-patient-summary-ui-with-svelte`.
Companion files: [../plans.md](../plans.md) (the phased plan) and
[../tasks.md](../tasks.md) (the checklist). When work lands that changes
anything claimed here, update this file in the same commit.

Status: version 1 implemented, 2026-11-15, with the public tour (§6.8) added
the same day (see [../CHANGELOG.md](../CHANGELOG.md)). The backend is
[`international-patient-summary-service-with-axum`](../../international-patient-summary-service-with-axum/);
this viewer works without it.
Open before release: clinical review of the cy-001 and zh-cn wording
(P7-T4), CI green on the published repository (P1-T8), and the v0.1.0 tag.

## 1. Purpose

A read-only, browser-based viewer that takes an HL7 FHIR International
Patient Summary (IPS) document and renders it as an accessible,
clinician-friendly page. Its audience is a clinician seeing an unfamiliar
patient — typically across a border or care setting — who needs the
essentials fast: what the patient takes, what they react to, and what
they have.

The viewer is a reference application: it shows how to build a real
clinical view on the Lily Design System Svelte packages, and it doubles
as a practical tool for inspecting IPS bundles during implementation and
testing.

## 2. Background: what the International Patient Summary is

The IPS is "a minimal and non-exhaustive patient summary dataset,
specialty-agnostic, condition-independent, but readily usable by
clinicians for the cross-border unscheduled care of a patient."

- **Standards family.** The abstract dataset is ISO 27269 (International
  Patient Summary); edition 2, ISO 27269:2025 (September 2025), replaced
  the 2021 edition and added the Alerts and Patient story data blocks.
  It is maintained with CEN under the Vienna Agreement and adopted in
  Europe as EN ISO 27269. HL7 publishes two
  implementations: the FHIR IPS Implementation Guide (this viewer's
  target) and a CDA R2 IPS guide (out of scope).
- **FHIR IPS IG.** Canonical `http://hl7.org/fhir/uv/ips`, package
  `hl7.fhir.uv.ips`. Current release **2.0.1 (STU 2, trial use)**, built
  on **FHIR R4 (4.0.1)**. Earlier releases: 1.0.0 (2020), 1.1.0 (2022),
  2.0.0 (2025). The viewer targets 2.0.1 and tolerates 1.x documents.
- **Document shape.** An IPS is a FHIR `Bundle` with `type = document`.
  The first entry is a `Composition` (IPS Composition profile, type LOINC
  `60591-5` "Patient summary Document"). The Composition references the
  subject `Patient`, authors, optional custodian and attesters, and a
  list of `section`s. Each section has a LOINC code, a human-readable
  `text` narrative, and `entry` references to resources in the same
  Bundle.
- **Absent and unknown data.** A required section may carry no entries.
  It then carries `emptyReason`, or an entry that states the absence
  explicitly (for example an AllergyIntolerance coded "no known
  allergies", or the IPS absent/unknown codes). The viewer must show the
  difference between "none known", "not asked/unknown", and "section
  omitted" — these mean clinically different things.
- **Generation.** The IG defines the `Patient/$summary` operation
  (`OperationDefinition/summary`) for a FHIR server to generate an IPS on
  demand.
- **Related ecosystems** (informative, not requirements): the EU
  Patient Summary exchanged through MyHealth@EU; SMART Health Links,
  which can carry an IPS behind a QR code or link.

### 2.1 Composition sections (IPS 2.0.1)

Verified against `StructureDefinition-Composition-uv-ips.json` v2.0.1.
"Required" = cardinality 1..1; all others are 0..1. The IG's narrative
further names Immunizations, Results, Procedures, and Medical Devices as
recommended.

| Section (slice)            | LOINC      | Level       | Entry profiles                                                                       |
| -------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------ |
| Medication Summary         | `10160-0`  | Required    | MedicationStatement (IPS), MedicationRequest (IPS)                                   |
| Allergies and Intolerances | `48765-2`  | Required    | AllergyIntolerance (IPS)                                                             |
| Problem List               | `11450-4`  | Required    | Condition (IPS)                                                                      |
| Immunizations              | `11369-6`  | Recommended | Immunization (IPS)                                                                   |
| Results                    | `30954-2`  | Recommended | Observation lab/pathology (IPS), Observation radiology (IPS), DiagnosticReport (IPS) |
| History of Procedures      | `47519-4`  | Recommended | Procedure (IPS)                                                                      |
| Medical Devices            | `46264-8`  | Recommended | DeviceUseStatement (IPS)                                                             |
| Vital Signs                | `8716-3`   | Optional    | Observation (FHIR vitalsigns)                                                        |
| History of Past Illness    | `11348-0`  | Optional    | Condition (IPS)                                                                      |
| Functional Status          | `47420-5`  | Optional    | Condition (IPS), ClinicalImpression                                                  |
| Plan of Care               | `18776-5`  | Optional    | CarePlan, ImmunizationRecommendation                                                 |
| Social History             | `29762-2`  | Optional    | Observation tobacco use (IPS), Observation alcohol use (IPS)                         |
| History of Pregnancy       | `10162-6`  | Optional    | Observation pregnancy status (IPS), Observation pregnancy outcome (IPS)              |
| Advance Directives         | `42348-3`  | Optional    | Consent                                                                              |
| Alerts                     | `104605-1` | Optional    | Flag alert (IPS) — new in 2.0                                                        |
| Patient Story              | `81338-6`  | Optional    | narrative only — new in 2.0                                                          |

### 2.2 Published examples used as fixtures

From the IG's example set: `bundle-minimal`, `bundle-no-info-required-sections`,
`bundle-ips-all-sections`, `IPS-examples-Bundle-01`,
`IPS-examples-Bundle-with-immunization`. These are the canonical test
fixtures (§9).

## 3. Scope

### In scope (version 1)

- Load an IPS Bundle from: a local JSON or YAML file (upload or
  drag-and-drop), pasted JSON or YAML text, a URL, or one of the bundled
  example fixtures (§6.1).
- Parse and index the Bundle; resolve Composition section entry
  references (`urn:uuid:` full URLs and relative `Type/id` references).
- Render the patient header, document metadata, and every present
  section in the Composition's own order, with the three required
  sections always shown, even when empty.
- Show both the structured entries and the author's section narrative
  (`section.text`), with the narrative sanitised before display.
- Clearly render absent/unknown/empty states (§6.4).
- Theme, locale, text-size, and share controls via the Lily picker bar.
- UI in four locales — Welsh (`cy-001`), English US (`en-US`), English
  UK (`en-GB`), Simplified Chinese (`zh-CN`) — via Sveltia I18n (§4.3).
- Print-friendly output.
- Export the loaded summary as JSON, YAML, Markdown, or a one-page PDF,
  generated and downloaded entirely in the browser (§6.7).
- Fully client-side: no document leaves the browser.
- A public, backendless tour (§6.8): a demonstration sign-in as
  `example@example.com` and an in-memory stand-in for the backend service.

### Out of scope (version 1)

- Editing or authoring an IPS.
- FHIR XML input (JSON and YAML only), CDA IPS input.
- Multi-page PDF layouts (only the one-page summary PDF; the full
  summary prints via the print stylesheet, §6.6).
- Full FHIR profile validation (the viewer reports structural problems;
  it is not a validator — use the HL7 FHIR Validator for that).
- Calling `$summary` on a live FHIR server (planned later, §11).
- Decoding SMART Health Links / QR codes (planned later, §11).
- Terminology server lookups; the viewer displays `coding.display` /
  `text` as supplied.
- Any storage of patient data server-side or in browser storage.

## 4. Technology

- **Svelte 5** with runes (`$state`, `$derived`, `$props`, `$bindable`,
  `$effect`); no legacy Svelte 4 syntax.
- **SvelteKit 3** (3.2), TypeScript everywhere, Vite 8. Configuration is
  passed to the `sveltekit()` plugin in `vite.config.ts` (SvelteKit 3 has
  no `svelte.config.js`); `#lib/*` subpath imports replace `$lib`, and
  `browser` comes from `$app/env`. Built with `@sveltejs/adapter-static`
  as a fully prerendered static site (`prerender = true`, `ssr = false`,
  so the Sveltia singleton only runs in the browser); deployable to
  GitHub Pages, with `BASE_PATH` for a subpath.
- **pnpm** as package manager, following the Lily convention
  (`AGENTS/sveltekit.md`). Packages are installed from the npmjs.com
  registry.
- **Node** version matching the Lily packages' `engines` field
  (currently `"node": ">=26"`).
- **Testing**: vitest + `@testing-library/svelte` +
  `@testing-library/user-event` + jsdom, vitest built-in matchers only
  (no `@testing-library/jest-dom`); Playwright + `@axe-core/playwright`
  for end-to-end and accessibility.
- **FHIR types**: `@types/fhir` (R4 types) for TypeScript models. No
  heavy FHIR client library is needed for v1.
- **Internationalisation**: `@sveltia/i18n` (Sveltia I18n, 1.5.0) with Unicode MessageFormat 2 messages (§4.3).
- **YAML**: `yaml` (eemeli/yaml, 2.x) for YAML input, YAML output, and
  the locale files. YAML 1.2 core schema only.
- **PDF**: `pdfmake` (0.3.x), lazy-loaded only when a PDF is requested.
  Chosen over `pdf-lib` (unmaintained since 2022) and `jsPDF` for its
  declarative tables and text flow. Fonts: Noto Sans (Latin, incl. Welsh
  ŵ ŷ) and, loaded only when the content contains CJK characters, Noto
  Sans SC; both self-hosted in `static/fonts/` (SIL OFL).
- **Sanitising narrative**: DOMPurify (or equivalent) with an allowlist
  matching FHIR's narrative XHTML rules.

### 4.1 Lily Design System packages (npm, `@lilydesignsystem/*`)

| Package                                     | Version (pinned) | Use                                                      |
| ------------------------------------------- | ---------------- | -------------------------------------------------------- |
| `@lilydesignsystem/svelte-headless`         | 0.12.0           | All page components, incl. the medical components (§4.2) |
| `@lilydesignsystem/svelte-picker-bar`       | 0.8.0            | Header row: pages, theme, locale, text size, share       |
| `@lilydesignsystem/themes`                  | 0.7.0 (dev)      | Theme stylesheets, vendored into `static/assets/themes/` |
| `@lilydesignsystem/svelte-data-grid`        | —                | Not used: see below                                      |
| `@lilydesignsystem/svelte-date-time-picker` | —                | Not needed in v1 (viewer is read-only)                   |

Decision (P5-T2): Results use `DataTable` + `ObservationView`, not
`svelte-data-grid`. Results arrive in clinical order (and grouped under
their DiagnosticReport), a sort control would separate a report's results,
and `DataTable` keeps the initial JS budget well under §7's limit.

`svelte-picker-bar` pulls in `svelte-theme-picker`, `svelte-locale-picker`,
`svelte-text-size-picker`, and `svelte-share-picker` as dependencies.
Its `labels` prop has **no English default** — the app must pass every
accessible name. Theme stylesheets are served from a `themesUrl`
(copied from the `@lilydesignsystem/themes` package into
`static/assets/themes/` by `bin/vendor-lily.mjs`, before `dev` and `build`).

Lily components are headless: they ship semantic HTML, ARIA, and
keyboard behaviour but **no CSS**. This app owns all styling, targeting
Lily's kebab-case class hooks (e.g. `.medical-banner`, `.summary-list`),
following the pattern of `lily-design-system-svelte-sveltekit-examples`.

### 4.2 Lily component mapping

All names below are verified exports of `@lilydesignsystem/svelte-headless`
0.9.0. Version 0.9.0 adds medical components built for the IPS (its
healthcare pattern maps every IPS section and absent code to them); the
viewer uses them for every section. `src/lib/fhir/models.ts` maps FHIR to
their props, and every status code they receive comes with words.

| Viewer need                                     | Lily component(s)                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skip to content                                 | `SkipLink`                                                                                                                                                                                                                                                                      |
| Page header / footer                            | `Header`, `Footer`, `PickerBar`                                                                                                                                                                                                                                                 |
| Patient identity banner                         | `MedicalBanner`, `AddressographBox`, `AgeView`                                                                                                                                                                                                                                  |
| Allergy / alert danger callouts                 | `MedicalBannerBoxForDanger` with `AllergyRecordList`, `RecordList`                                                                                                                                                                                                              |
| Advance directives callout                      | `MedicalBannerBoxForAdvice`                                                                                                                                                                                                                                                     |
| Allergies and intolerances                      | `AllergyRecordList`, `AllergyRecordListItem`                                                                                                                                                                                                                                    |
| Medication summary                              | `MedicationRecordList`, `MedicationRecordListItem`, `MedicationView`                                                                                                                                                                                                            |
| Problems, past illness, functional status       | `ProblemRecordList`, `ProblemRecordListItem`                                                                                                                                                                                                                                    |
| Immunizations                                   | `ImmunizationRecordList`, `ImmunizationRecordListItem`                                                                                                                                                                                                                          |
| History of procedures                           | `ProcedureRecordList`, `ProcedureRecordListItem`                                                                                                                                                                                                                                |
| Medical devices                                 | `DeviceRecordList`, `DeviceRecordListItem`                                                                                                                                                                                                                                      |
| Results, vital signs, social history, pregnancy | `DataTable` (+ parts) of `ObservationView`; a DiagnosticReport is a row group. A number with a numeric reference range in the same unit also gets `ObservationView`'s `meter*` picture (0.12): `aria-hidden`, never the only signal, since the value, range and flag stay words |
| Alerts, plan of care, any other section         | `RecordList`, `RecordListItem` (generic fallback)                                                                                                                                                                                                                               |
| Quantities and ages                             | `formatQuantity()`, `ageParts()` (Lily `clinical-format`)                                                                                                                                                                                                                       |
| Section table of contents                       | `ContentsNav`, `ContentsList`, `ContentsListItem`, `ContentsLink`                                                                                                                                                                                                               |
| Key–value data (document meta)                  | `SummaryList`, `SummaryListItem`                                                                                                                                                                                                                                                |
| Show codes                                      | `ToggleButton`                                                                                                                                                                                                                                                                  |
| Section narrative / raw JSON disclosure         | `Details`                                                                                                                                                                                                                                                                       |
| Unresolved entries inline                       | `WarningText`                                                                                                                                                                                                                                                                   |
| Loader input                                    | `FileUpload`, `TabBar` + `TabBarButton` + `TabPanel`, `Button`                                                                                                                                                                                                                  |
| Load errors, structural problems                | `ErrorSummary`, `Alert`                                                                                                                                                                                                                                                         |
| Busy state                                      | `Loading`                                                                                                                                                                                                                                                                       |
| Export format and paper choice                  | `RadioGroup`, `RadioInput`                                                                                                                                                                                                                                                      |

Procedures and immunizations also offer a "Show as timeline" view through
`TimelineList` and `TimelineListItem` (newest first; undated entries last, in
words).

Not used in v1: `Person`, `StatusTag`, `Tag`, `DateTimeView`,
`Card`, `TextInputWithSearch` — the medical components carry status words
and dates themselves, and tables become cards with CSS on narrow screens.

### 4.3 Internationalisation with Sveltia I18n

Lily bundles no i18n library ("internationalisation is the consumer's
concern"), so the app brings its own: **`@sveltia/i18n`** — Svelte 5
runes, a svelte-i18n-style API (`_`, `locale`, `register`, `init`,
`waitLocale`), and **Unicode MessageFormat 2 (MF2)** messages, so
plurals and selection live in the message files, not in components.

Locale files live at the **project root**, one directory per locale.
Directory names are lowercase; the registered code is the canonical
BCP 47 tag:

| Directory           | BCP 47 tag | Language                      | Notes                                                            |
| ------------------- | ---------- | ----------------------------- | ---------------------------------------------------------------- |
| `./locales/cy-001/` | `cy-001`   | Welsh (Cymraeg), world region | CLDR plurals: zero, one, two, few, many, other                   |
| `./locales/en-us/`  | `en-US`    | English, United States        | **Fallback locale**; source of truth for keys                    |
| `./locales/en-gb/`  | `en-GB`    | English, United Kingdom       | British spelling (colour, anaesthetic, paediatric, haemoglobin)  |
| `./locales/zh-cn/`  | `zh-CN`    | Chinese, Simplified, China    | CLDR plurals: other only — use literal `1` where wording differs |

Each directory holds `messages.yaml` (MF2 strings, nested keys; YAML so
multi-line `.match` messages stay readable), loaded lazily with
`register(tag, () => import('/locales/<dir>/messages.yaml?raw').then(parse))`
from `src/lib/i18n.ts`. The `yaml` package parses them.

Rules:

- Use **client-side locale detection only** (the Sveltia README warns
  its singleton is unsafe under SSR). With `adapter-static`, set the
  locale in the root `+layout.ts` `load`, guarded by `browser`, in
  priority order: `?lang=` query, stored preference, navigator.
- `init({ fallbackLocale: 'en-US' })`. Sveltia's negotiation maps e.g.
  `en-CA` → `en-US`, bare `cy` → `cy-001`, and never substitutes
  Traditional for Simplified Chinese (so `zh-TW` falls back to `en-US`).
- The `PickerBar` `locales` prop is `["cy-001", "en-US", "en-GB", "zh-CN"]`
  with endonym `localeLabels` (`Cymraeg`, `English (US)`,
  `English (UK)`, `简体中文`); its locale picker's `onChange` calls
  `locale.set(code)`. Only one party manages `<html lang dir>`:
  Sveltia does, so pass `applyDir={false}` via `localeProps`.
- `PickerBar` `labels` and every other accessible name come from `_()`.
- Dates, numbers, and quantities use Sveltia's `date()`, `time()`,
  `number()` (Intl-backed) in the active UI locale.
- **Clinical content is never translated.** Codes, displays, and
  narrative render as supplied, marked with the document's `language`
  (`lang` attribute) so screen readers pronounce them correctly.
- A key-parity check (in `pnpm test`) fails if any locale lacks a key
  present in `en-us`, or has a key `en-us` lacks, or a message fails to
  compile as MF2.
- Clinical UI wording in `cy-001` and `zh-cn` needs review by a fluent
  clinician before release; machine-drafted strings are marked as such
  in a `locales/<dir>/REVIEW.md` until reviewed.

## 5. Architecture

```
src/
  lib/
    fhir/            # pure TypeScript, no Svelte
      load.ts        # file/text/url → unknown JSON, with size limits
      bundle.ts      # validate Bundle(type=document), index entries by fullUrl + Type/id
      composition.ts # locate Composition, map sections by LOINC code, §6.2 checks
      sections.ts    # section registry: LOINC → key, title, level, renderer
      format.ts      # CodeableConcept, Quantity, Period, dosage, HumanName, dates
      absent.ts      # emptyReason + absent/unknown detection
      narrative.ts   # sanitise section.text.div; narrative → plain text
      parse.ts       # JSON or YAML text → plain object (format detection, limits)
      models.ts      # view models: FHIR → Lily medical component props, export fields
    service/         # pure TypeScript, no Svelte (§6.8)
      service.ts     # the backend's API as an interface; its IPS check and refusal codes
      tour-service.ts# in-memory implementation for the tour
      http-service.ts# the backend over HTTP, with a bearer token (§6.9)
      oidc.ts        # OIDC authorization code flow with PKCE (§6.10)
      config.ts      # the build's service and identity provider (§6.10)
    tour.svelte.ts   # tour session: demo sign-in, seeding, open/delete/reset, sign-out
    remote.svelte.ts # service session: sign-in, store, list, open, delete, sign-out (§6.10)
      summary.ts     # patient identity and document metadata in words
    export/          # pure TypeScript, no Svelte; each returns a Blob
      json.ts        # canonical pretty JSON of the loaded Bundle
      yaml.ts        # YAML of the loaded Bundle, lossless round trip
      markdown.ts    # human-readable clinical summary
      pdf.ts         # one-page summary via pdfmake (dynamic import)
      filename.ts    # safe, non-identifying download names
    components/      # app components built on Lily headless
      PatientBanner.svelte
      DocumentMeta.svelte
      SectionView.svelte          # generic wrapper: heading, narrative, empty state
      sections/                   # EntryList (Lily record lists), ResultsTable, ObservationValue
      Loader.svelte
      ExportMenu.svelte           # format choice + options + download
    i18n.ts          # Sveltia I18n: register the four locales, init fallback
  routes/
    +layout.svelte   # SkipLink, Header with PickerBar, Footer
    +page.svelte     # loader + viewer
    examples/        # list of bundled example fixtures
locales/             # UI messages, one directory per locale (§4.3)
  cy-001/messages.yaml
  en-us/messages.yaml
  en-gb/messages.yaml
  zh-cn/messages.yaml
static/
  examples/          # IG example Bundles (JSON)
  assets/themes/     # Lily theme stylesheets
  fonts/             # Noto Sans, Noto Sans SC for PDF export (OFL)
```

Principles:

- `lib/fhir` is framework-free and fully unit-tested; components only
  format and lay out what it returns.
- A section registry keyed by LOINC code drives rendering; unknown
  sections fall back to a generic renderer (narrative + entry list), so
  documents from newer IG versions still display.
- Loaded documents live only in component state (`$state`). Nothing is
  written to `localStorage`, IndexedDB, or cookies, and nothing is sent
  to any server except an explicit user-requested URL fetch.

## 6. Functional requirements

### 6.1 Loading

- **F-LOAD-1** Accept a `.json`, `.yaml`, or `.yml` file by picker or
  drag-and-drop (`accept=".json,.yaml,.yml,application/json,application/fhir+json,application/yaml"`).
- **F-LOAD-2** Accept pasted JSON or YAML text.
- **F-LOAD-3** Accept an `https://` URL and fetch it client-side; report
  CORS or network failures in plain language. While the development server
  is running, also accept `http://` only for the literal loopback hosts
  `localhost` and `127.0.0.1`, so a local service needs no local
  certificate. Production still accepts HTTPS only.
- **F-LOAD-4** Offer the bundled IG example fixtures (§2.2).
- **F-LOAD-5** Reject input over a configurable size (default 10 MB),
  and input that is neither valid JSON nor valid YAML, with an
  `ErrorSummary` naming the problem and, where available, the line and
  column.
- **F-LOAD-6 Format detection.** By file extension or MIME type first;
  for pasted text or ambiguous files, try JSON, then YAML. The detected
  format is shown ("Loaded as YAML") so a mis-detection is visible.
- **F-LOAD-7 YAML rules.** FHIR defines no official YAML format; the
  viewer treats YAML as an alternative spelling of FHIR JSON, so a YAML
  document must parse to exactly the object its JSON equivalent would.
  Parse with the YAML 1.2 **core** schema (no YAML 1.1 coercions such as
  `no` → `false` or sexagesimal numbers), `uniqueKeys: true`, a low
  `maxAliasCount` (defend against alias-expansion bombs), no custom
  tags, and a single document only (reject multi-document streams).
  Values YAML would type differently from FHIR JSON (e.g. an unquoted
  `2024-01-01` stays a string in the core schema; `.inf`, `.nan` are
  rejected) are covered by tests.

### 6.2 Structural checks

The viewer reports, but tolerates where it can:

- resource is not a `Bundle`, or `Bundle.type` is not `document` (error);
- first entry is not a `Composition` (error);
- missing `Composition.subject` or unresolvable Patient (error);
- a required section (§2.1) is missing (warning);
- an entry reference that does not resolve within the Bundle (warning,
  shown inline at the section);
- `meta.profile` or LOINC codes from an unknown IPS version (info).

Errors block rendering; warnings and info render in a collapsible
"Document checks" `Details` panel.

### 6.3 Rendering

- **F-VIEW-1 Patient banner.** Name, birth date and age, administrative
  gender, identifiers (with system shown), and any contact; rendered
  with `MedicalBanner`. Allergies with high criticality and active
  Alerts (Flag) surface in a danger box in the banner.
- **F-VIEW-2 Document metadata.** Composition title, date, author(s),
  custodian, attester(s), confidentiality, language, IPS version inferred
  from `meta.profile`.
- **F-VIEW-3 Section order.** Sections render in Composition order; the
  table of contents mirrors it. Required sections render even if absent,
  labelled "Section missing from document".
- **F-VIEW-4 Per-section renderers.** At minimum:
  - Medications: medication (code/text or referenced Medication), status,
    dosage text/timing/route, effective period.
  - Allergies: substance, type, category, criticality, clinical and
    verification status, reactions (manifestation, severity), onset.
  - Problems / Past illness: condition, clinical and verification status,
    severity, onset, abatement.
  - Immunizations: vaccine, date, dose number, status, lot, performer.
  - Results: observation name, value + unit, reference range,
    interpretation, effective date; DiagnosticReports group their results.
  - Procedures, Devices, Vital signs, Social history, Pregnancy, Plan of
    care, Functional status, Advance directives, Alerts, Patient story.
  - Unknown section: generic renderer.
- **F-VIEW-5 Narrative.** Each section offers the author's narrative in a
  `Details` disclosure, sanitised; when a section has narrative but no
  structured entries, the narrative is shown open.
- **F-VIEW-6 Raw data.** Each entry can reveal its source JSON in a
  `Details` disclosure (a debugging aid for implementers).
- **F-VIEW-7 Codes.** Display prefers `coding.display`, then
  `CodeableConcept.text`, then `system|code`. A toggle reveals code
  systems and codes (SNOMED CT, LOINC, ATC, etc.).

### 6.4 Absent, unknown, and empty data

Three states must be visually and textually distinct:

1. **None known** — explicit negation (e.g. "no known allergies" code).
2. **Unknown / not recorded** — `emptyReason`, or IPS absent/unknown codes.
3. **Section omitted** — the Composition has no such section.

Each state uses words, not colour alone, and shows the `emptyReason`
display text when present.

Implementation: the viewer uses the five statuses of the Lily record lists,
which split state 2 in two, as the Lily healthcare pattern recommends
(`src/lib/fhir/absent.ts`):

| Lily status    | From                                                                       | Words (en-US)                    |
| -------------- | -------------------------------------------------------------------------- | -------------------------------- |
| `known`        | resolved clinical entries                                                  | (the entries)                    |
| `none-known`   | `emptyReason` `nilknown`; IPS `no-known-…`; SNOMED CT "no known …" codes   | None known                       |
| `not-recorded` | `emptyReason` `notasked`, `notstarted`; IPS `no-…-info`; no entries at all | Not recorded                     |
| `unavailable`  | `emptyReason` `unavailable`, `withheld`, `closed`; unresolvable entries    | Information unavailable — reason |
| `omitted`      | a required section missing from the Composition                            | Section missing from document    |

A section that takes entries but has only a narrative reads "No
structured entries. See the narrative from the document.", with the
narrative open. Omitted required sections are listed after the
Composition's own sections, in registry order, and the banner's danger box
says the allergies section is missing.

### 6.5 Header controls (PickerBar)

- Theme, language, text size, and share, via
  `@lilydesignsystem/svelte-picker-bar` with app-supplied `labels`.
- Share must **not** share patient data. It shares the app URL only; a
  loaded document is never encoded into the URL.
- Preference persistence (theme, locale, text size) via each picker's
  `storageKey` is allowed; these are not patient data.

### 6.6 Print

A print stylesheet renders the full summary, expands narrative, hides
controls, and prints the patient name and date of birth on every page
header.

### 6.7 Export

An **Export** control (`ExportMenu.svelte`) appears once a document is
loaded. The person chooses a format, adjusts that format's options, and
downloads. Everything is generated in the browser; nothing is uploaded.

| Format   | Content                                                       | MIME type               | Extension |
| -------- | ------------------------------------------------------------- | ----------------------- | --------- |
| JSON     | The loaded Bundle, unchanged, pretty-printed (2-space indent) | `application/fhir+json` | `.json`   |
| YAML     | The same Bundle as YAML                                       | `application/yaml`      | `.yaml`   |
| Markdown | Human-readable clinical summary                               | `text/markdown`         | `.md`     |
| PDF      | One-page clinical summary                                     | `application/pdf`       | `.pdf`    |

**F-EXP-1 Data exports (JSON, YAML).** Export the Bundle exactly as
loaded — same resources, same field values; key order preserved. They
are data conversions, not summaries, so a JSON→YAML→JSON round trip must
equal the original. YAML output quotes any string that YAML would
otherwise read as another type. A YAML file starts with a comment
naming the source and noting that YAML is not an official FHIR format.

**F-EXP-2 Markdown.** GitHub-flavoured Markdown:

- `#` title, then patient identity block, then document metadata;
- an `##` heading per section in Composition order, entries as tables
  (or lists for single-column data), absent states in words (§6.4);
- the three required sections always present;
- options: include section narrative (default off; narrative XHTML is
  converted to plain text, never embedded as HTML); include codes
  (default off; `system|code` after each display);
- clinical text escaped so `|`, `*`, `_`, `#`, `<`, and backticks cannot
  break the table or inject HTML, and no URL in it becomes a link;
- passes markdownlint's default rules except line length (checked in
  `export.test.ts`);
- footer: generated-at timestamp, source Composition identifier and
  date, IPS version, and the "not a medical device" notice.

UI labels (headings, column names, absent-state wording) use the active
UI locale; clinical content is as supplied.

**F-EXP-3 One-page PDF.** A single-page clinical summary for handing
over or printing:

- Paper size: US Letter for `en-US`, A4 otherwise; person can override.
- Layout: header band with patient name, birth date and age, gender,
  and primary identifier; a danger box with **alerts and allergies**
  (substance, criticality, reaction); then sections in clinical
  priority order: active medications, active problems, immunizations,
  recent results, procedures, devices, advance directives, then the
  rest. Footer: generated-at, source document date, IPS version,
  "not a medical device", and "page 1 of 1".
- **Fitting to one page.** Lay out, measure page count (via pdfmake's
  `footer(currentPage, pageCount)` callback), and repeat, in order:
  reduce font size down to a floor of 8 pt; then trim the lowest-
  priority sections to their most recent items with an explicit
  "+N more not shown" line; then replace whole low-priority sections with
  "Section present — not shown on this one-page summary". Every trimmed
  or omitted section is listed in a "Not shown on this page" line.
- **Must-show content is never trimmed**: patient identity, alerts,
  allergies and intolerances, and active medications. If must-show
  content alone cannot fit on one page at 8 pt, the export still
  includes all of it on a second page, with "CONTINUED — this summary
  exceeds one page" on both pages, and the export UI warns before
  download.
- Fonts: embed Noto Sans; embed Noto Sans SC only if any rendered text
  contains CJK characters (checked on content, not on UI locale). Text
  gets the PDF document language (`lang`) of the UI locale; PDF metadata
  title is the non-identifying filename (see F-EXP-5), not the patient name.
- Accessibility: the PDF is a convenience copy, not the accessible
  primary format; the Markdown and HTML views remain the accessible
  routes. Tagged PDF is a later goal (§11).

**F-EXP-4 Export UI.** Built from Lily components: a radio group of the
four formats, per-format options in a `Details` panel, and a download
button. Generating a PDF shows `Loading`; errors show in an `Alert`.
Keyboard operable; the result is announced ("Downloaded
international-patient-summary-2026-09-30.pdf").

**F-EXP-5 Filenames.** `international-patient-summary-{composition-date}.{ext}`
by default. Filenames never contain the patient's name or identifiers,
because download folders and browser history are often visible on
shared clinical workstations.

**F-EXP-6 Privacy.** Downloads use `Blob` + `URL.createObjectURL`,
revoked immediately after the click. No export makes a network
request, except fetching the app's own self-hosted font files on first
PDF use.

### 6.8 Public tour (backendless)

A guided walkthrough at `/tour/`, linked from the header, that shows how the
viewer will work with the backend service, without needing it.

- **F-TOUR-1 Sign-in.** A sign-in form with Lily `Form`, `Field`,
  `EmailInput` and `PasswordInput`, filled in with the public tour account
  `example@example.com` and password `example`. Only that account is
  accepted (email compared trimmed and case-insensitively); anything else
  shows an inline error. The check is a demonstration, not security, and
  the page says so.
- **F-TOUR-2 Backendless.** `TourService` implements `IpsService`, the
  backend's API (`create`, `read`, `remove`, and `list`, the backend's
  `GET /fhir/Bundle`, its S-API-7), entirely in memory. It mirrors the backend's contract:
  server-issued v4 UUIDs written into `Bundle.id`; the backend's structural
  IPS check with its five refusal codes and JSON pointers (`not_a_bundle`,
  `not_a_document`, `no_composition`, `not_a_patient_summary`,
  `no_subject`); `404` for an unknown or malformed id; deep copies in and
  out. The backend's `401` and `403` (its S-AUTH-1) have no counterpart:
  the tour's only account may do everything. Signing in seeds it with the five bundled examples (§2.2), fetched
  from the app's own origin. No other request is made.
- **F-TOUR-3 Steps.** A Lily `StepList` shows three steps (Sign in, Your
  summaries, View a summary) with words for each status; a Lily `Tour`
  (non-modal, closed with Escape or "Hide the guide", reopened with "Show
  the guide") explains the current step as "Name (step n of 3)".
- **F-TOUR-4 Summaries.** A Lily `DocumentList` of stored documents, newest
  first, each with the subject's name, the Composition title and date, and
  Open and Delete buttons whose accessible names include the document.
  "Reset the tour" restores the five examples.
- **F-TOUR-5 Viewing.** Open shows the ordinary viewer (§6.3–§6.7) with
  source "service"; "Back to your summaries" and the viewer's own close
  button return to the list.
- **F-TOUR-6 Privacy.** The session (account, store, open document) lives
  only in memory, like the viewer's (§5). Sign-out or reload ends it.
  Nothing is written to localStorage, sessionStorage, IndexedDB or cookies,
  apart from the picker preferences.

### 6.9 Backend service client

`HttpService` (`src/lib/service/http-service.ts`) implements `IpsService`
against the backend (its spec §4). It is the client half of "Save to service"
and "Open from service"; the sign-in that supplies its token, and the pages
that use it, are still to come (§11).

- **F-HTTP-1 Requests.** Each call goes to the configured service root
  (`https://`, or loopback `http://` in development only, as F-LOAD-3),
  with `Authorization: Bearer` when there is a token, `cache: no-store`,
  `credentials: omit` and `redirect: error`. A body is
  `application/fhir+json`. An id that is not a v4 UUID is a `404` without
  any request.
- **F-HTTP-2 Problems.** A failed answer becomes a `ServiceError` with the
  status and the problem's `code` and `errors[0].pointer` (the backend's
  RFC 9457 problems), `http_error` when the body is not a problem, and status
  `0` with `unreachable` when the request itself fails.
- **F-HTTP-3 Listing.** `list()` asks for pages of 100 and follows each
  `next` link, at most 100 pages, and never one that leaves the service
  root. Each entry, the backend's SUBSETTED document (its S-API-7), is read
  by the same `listingOf` as the tour's, so both list the same title, date
  and patient name.
- **F-HTTP-4 Privacy.** Documents and tokens are held in memory only (§5);
  nothing is sent anywhere but the service root.

### 6.10 Signing in to the service

A page at `/service/` signs in to the backend's identity provider and uses
`HttpService` (§6.9) with the token. The header links to it only in a build
that has a service.

- **F-SIGN-1 Sign-in.** OpenID Connect's authorization code flow with PKCE
  (RFC 7636, `S256`) for the public client: the provider's endpoints come
  from its discovery document, which must name the configured issuer; a
  fresh 16-byte `state` and 32-byte verifier per sign-in; scope `openid`;
  the redirect URI is the page itself. No library: these are standard
  requests.
- **F-SIGN-2 Return.** On return, the `state` must equal the pending one,
  which is removed whatever happens, so a code is exchanged once; the code
  and state are taken out of the address. A forged or stale return says so
  (`signInStale`); an `error` return or a refused exchange says the
  sign-in did not succeed.
- **F-SIGN-3 Token.** The access token is kept in memory only and is not
  used within 30 seconds of its `expires_in`. A `401` from the service ends
  the session and asks the person to sign in again; a `403` says the
  account may not do that. The token's `preferred_username` is shown, read
  without verification, for display only. Signing out forgets the token,
  the list and the open document.
- **F-SIGN-4 Configuration.** `VITE_IPS_SERVICE_URL`,
  `VITE_IPS_OIDC_ISSUER` and `VITE_IPS_OIDC_CLIENT_ID` (default
  `ips-viewer`), fixed at build time. The development server falls back to
  the backend's local defaults (`http://localhost:1241`, Keycloak's `ips`
  realm on `http://localhost:8080`); a production build without them says
  it is not connected to a service.
- **F-SIGN-5 Pages.** Signed in: "Store a summary" (a JSON or YAML file,
  read as F-LOAD-1, checked by the service), the stored summaries newest
  first (as F-TOUR-4) with Open and Delete, and Refresh. Open shows the
  ordinary viewer with source "service", and "Back to the stored summaries".
- **F-SIGN-7 Save to service.** While the tab is signed in, the viewer
  offers "Save to service" for a document it did not open from the service;
  it stores the document as loaded and confirms "Saved to the service." The
  confirmation, or the reason it failed, shows only beside that document,
  never beside another, and never an error from the service page. The
  service page shows the viewer only for a document it opened itself. The
  session is the same one, kept in memory across navigation within the app.
- **F-SIGN-8 Renewal.** A token within 30 seconds of its end is renewed
  with the refresh token (`grant_type=refresh_token`), kept like it in
  memory only; a rotated refresh token replaces the old one. Calls that need
  a token while one renewal is running share it. When renewal fails, the
  service's `401` ends the session as F-SIGN-3 says.
- **F-SIGN-9 Sign-out.** Sign out ends the session here at once, then, when
  the provider's discovery names an `end_session_endpoint`, sends the
  browser there (OpenID Connect RP-Initiated Logout) with `client_id`,
  `id_token_hint` (the ID token, kept in memory only like the others) and
  `post_logout_redirect_uri` (this page), so the provider's session ends
  too. A provider without one, or out of reach, ends only the session here.
  The backend's development realm registers `http://localhost:5173/*` as
  the client's post-logout redirect.
- **F-SIGN-6 Privacy.** The only thing that outlives a page load is the
  pending sign-in's `state` and verifier, in `sessionStorage` for this tab,
  across the provider's redirect, removed on return. No token, document or
  name is stored. Requests go only to the issuer and the service root.

## 7. Non-functional requirements

- **Accessibility**: WCAG 2.2 AA required, AAA targeted (matching Lily).
  Skip link first; landmarks (`header`, `nav`, `main`, `footer`); one
  `h1`, sections as `h2`; full keyboard operation; colour never the only
  signal (criticality, status, absent states); zero axe-core violations
  on every route and every fixture.
- **Internationalisation**: every UI string in `./locales/*/messages.yaml`
  via Sveltia I18n (§4.3), in `cy-001`, `en-US`, `en-GB`, `zh-CN`; no
  hard-coded UI text in components. Clinical content is shown in the
  document's language as supplied. Layout must not break with longer
  Welsh strings or CJK text.
- **Privacy and security**: client-side only; no analytics; strict
  Content-Security-Policy; narrative XHTML sanitised; no `{@html}` of
  unsanitised input; URL loader fetches `https:` except for explicit literal
  loopback HTTP while the development server is running.
- **Performance**: renders `bundle-ips-all-sections` in under 200 ms on
  a mid-range laptop (the browser check uses the median of three runs to
  exclude one-off scheduler noise); initial JS budget 250 KB gzipped for v1, excluding
  the lazy-loaded PDF chunk and fonts. PDF generation for
  `bundle-ips-all-sections` completes in under 3 s.
- **Responsive**: usable from 320 px width; tables collapse to cards on
  narrow viewports.
- **Robustness**: never crash on unexpected shapes; unknown fields are
  ignored, unknown sections use the generic renderer.

## 8. Safety notes

This is a viewing tool, not a medical device, and must say so in the
footer and README. It must never silently drop data: anything it cannot
render structurally is still reachable via narrative or raw JSON.
Allergy criticality and alerts must never be hidden behind a collapsed
control. Exports follow the same rule: the Markdown export includes
every section, and the one-page PDF never trims must-show content and
always states what it left out (F-EXP-3). JSON and YAML exports are
lossless.

## 9. Testing

- **Unit (vitest)**: every function in `lib/fhir` against the five IG
  fixtures plus hand-made edge cases (unresolvable reference,
  non-document Bundle, empty required sections, unknown section code,
  1.x document, hostile narrative XHTML).
- **Component (vitest + Testing Library)**: each section renderer, the
  banner, the three absent states, the loader error paths.
- **Coverage**: `pnpm run test:coverage` measures every TypeScript and Svelte
  source under `src/lib` (excluding tests, declarations and test helpers) and
  fails below 95% line coverage.
- **Parsing**: YAML and JSON forms of every fixture parse to deep-equal
  objects; YAML edge cases (`no`, `on`, `0123`, `1.10`, dates, `.inf`,
  duplicate keys, aliases bomb, multi-document stream).
- **Export**: JSON and YAML round trips deep-equal the source for every
  fixture; Markdown snapshot per fixture per locale, plus an injection
  fixture (pipes, backticks, `<script>` in clinical text); PDF: page
  count is 1 for every IG fixture, must-show text present (checked by
  extracting text with `pdfjs-dist` in tests), "Not shown on this page"
  line lists exactly the trimmed sections, CJK font embedded only when
  needed.
- **i18n**: key parity and MF2 compile check across the four locales;
  plural rendering for Welsh counts 0, 1, 2, 3, 6, 7.
- **Sign-in**: `src/lib/service/oidc.test.ts` (F-SIGN-1…3, the PKCE
  challenge checked against Node's own SHA-256), `src/lib/remote.test.ts`
  and `src/lib/service/config.test.ts` (F-SIGN-4…6), and `e2e/service.spec.ts`
  (the whole flow against a stand-in provider and service, nothing stored,
  no request elsewhere, axe).
- **Service client**: `src/lib/service/http-service.test.ts` holds
  `HttpService` to F-HTTP-1…4 against a fake of the backend's HTTP API.
- **Tour**: `src/lib/service/service.test.ts` holds the service to the
  backend's contract (check order, codes, pointers, ids, 404s, copies);
  `src/lib/tour.test.ts` covers sign-in, seeding, open, delete and sign-out;
  `e2e/tour.spec.ts` walks the tour, asserts no request leaves the origin
  and nothing is stored, and runs axe in Welsh and Chinese.
- **End-to-end (Playwright)**: load each fixture by each loader path;
  switch through all four locales and assert `<html lang>` updates;
  keyboard-only navigation; print media emulation; axe-core sweep of
  every route × every fixture × light and dark themes.

## 10. Acceptance criteria for version 1

1. All five IG example Bundles load and render every section they
   contain, with no console errors.
2. The three required sections are always visible, with correct
   absent/unknown/omitted wording on `bundle-no-info-required-sections`.
3. `pnpm test` and `pnpm run test:e2e` pass; axe reports zero violations.
4. `pnpm run build` produces a static site that works offline once loaded.
5. No patient data leaves the browser (verified by an e2e test that
   asserts no network requests after loading a local file and exporting
   in all four formats, other than same-origin font files).
6. The YAML form of every IG fixture loads and renders identically to
   its JSON form.
7. Every IG fixture exports to JSON, YAML, Markdown, and a PDF of
   exactly one page, with must-show content complete.

## 11. Later (not version 1)

- `Patient/$summary` against a user-supplied FHIR server.
- SMART Health Links: decode `shlink:/` links and QR codes carrying IPS.
- FHIR XML input.
- Side-by-side comparison of two summaries.
- Validation hand-off to the HL7 FHIR Validator.
- Tagged (accessible) PDF / PDF/UA for the one-page summary.
- Multi-page full-summary PDF export.

## 12. References

- HL7 FHIR IPS Implementation Guide 2.0.1: <https://hl7.org/fhir/uv/ips/>
- IPS Composition profile: <https://hl7.org/fhir/uv/ips/StructureDefinition-Composition-uv-ips.html>
- IPS package history: <https://hl7.org/fhir/uv/ips/history.html>
- International Patient Summary project: <https://international-patient-summary.net/>
- ISO 27269:2025 Health informatics — International patient summary: <https://www.iso.org/standard/84639.html>
- Lily Design System: <https://lilydesignsystem.com/> and
  npm scope <https://www.npmjs.com/org/lilydesignsystem>
- `yaml` (eemeli/yaml): <https://eemeli.org/yaml/>
- pdfmake: <https://pdfmake.github.io/docs/>
- Sveltia I18n: <https://github.com/sveltia/sveltia-i18n> (npm `@sveltia/i18n`)
- Unicode MessageFormat 2: <https://messageformat.unicode.org/>
- Svelte: <https://svelte.dev/docs/svelte> and SvelteKit: <https://svelte.dev/docs/kit>
