# International Patient Summary viewer

A browser-based, read-only viewer for HL7 FHIR **International Patient
Summary** (IPS) documents. Open an IPS Bundle — JSON or YAML — and see who the
patient is, what they take, what they react to, and what they have; then export
it as JSON, YAML, Markdown, or a one-page PDF.

> **Safety.** This is a viewing tool, **not a medical device**. Check clinical
> decisions against the source record. It never silently drops data: anything
> it cannot show structurally is still reachable through the section narrative
> or the entry's source JSON.

> **Privacy.** Everything happens in your browser. A document is never
> uploaded, stored (no localStorage, IndexedDB or cookies), or put in a URL.
> The only network request it makes for you is a URL you ask it to fetch.

Built with **Svelte 5** (runes), **SvelteKit 3**, and the **Lily Design
System**, including its medical components (`AllergyRecordList`,
`MedicationRecordList`, `MedicationView`, `ProblemRecordList`,
`ImmunizationRecordList`, `ProcedureRecordList`, `DeviceRecordList`,
`ObservationView`, `RecordList`, `MedicalBanner`, `AddressographBox`, `AgeView`,
and `formatQuantity` / `ageParts`).

- Specification: [spec/index.md](spec/index.md)
- Plan: [plans.md](plans.md) · Checklist: [tasks.md](tasks.md)

## Quick start

Requires Node.js 26 and pnpm 11.

```sh
pnpm install
pnpm run dev        # http://localhost:5173
```

| Command                    | What it does                                                           |
| -------------------------- | ---------------------------------------------------------------------- |
| `pnpm run dev`             | Development server (vendors the Lily themes first)                     |
| `pnpm run build`           | Static, fully prerendered site in `build/`                             |
| `pnpm run preview`         | Serve the built site                                                   |
| `pnpm test`                | Unit, component, locale and export tests (vitest)                      |
| `pnpm run test:coverage`   | The same tests with a 95% line-coverage gate over `src/lib`            |
| `pnpm run test:e2e`        | End-to-end, accessibility, privacy and budget tests (Playwright + axe) |
| `pnpm run check`           | Type-check (svelte-check)                                              |
| `pnpm run lint` / `format` | Prettier and ESLint                                                    |

## What it does

**Input.** A FHIR `Bundle` of type `document` whose first entry is a
`Composition`, by file picker or drag-and-drop (`.json`, `.yaml`, `.yml`),
pasted text, an `https://` URL, or one of the five bundled IG examples. The
development server also permits `http://localhost` and `http://127.0.0.1`
for a local backend; production remains HTTPS-only. YAML is
treated as another spelling of FHIR JSON: YAML 1.2 core schema only, unique
keys, a low alias limit, no tags, one document. The viewer targets IPS IG 2.0.1
(FHIR R4) and tolerates 1.x.

**View.**

- A patient banner with two identifiers (name with date of birth and age;
  identifiers with their systems), and a danger box listing active allergies
  and alerts that is never collapsed.
- Every section in the Composition's order. The three required sections
  (Medication summary, Allergies and intolerances, Problem list) always show,
  even when the document leaves them out.
- Absent data in words, never as a blank: **none known**, **not recorded**,
  **information unavailable** (with the document's reason), and **section
  missing from document** are different facts and read differently.
- Each section's narrative, sanitised; each entry's source JSON; a **Show
  codes** toggle for SNOMED CT, LOINC, ATC and other codes.
- "Document checks" for structural problems (unresolved references, missing
  required sections, unknown section codes). It is not a validator.

**Export.**

| Format   | Content                                                           |
| -------- | ----------------------------------------------------------------- |
| JSON     | The Bundle exactly as loaded (lossless)                           |
| YAML     | The same Bundle as YAML (lossless; round-trips to the same JSON)  |
| Markdown | A readable summary of every section; optional narrative and codes |
| PDF      | A one-page clinical summary                                       |

The one-page PDF shrinks the font (to an 8 pt floor), then trims the
lowest-priority sections to their most recent items ("+N more not shown"),
then replaces whole low-priority sections with a notice, naming every one on a
"Not shown on this page" line. Patient identity, alerts, allergies and active
medications are **never** trimmed: if they alone cannot fit, the PDF runs
longer, says "CONTINUED" on every page, and the app warns before download.

Filenames never contain the patient's name or identifiers:
`international-patient-summary-<composition-date>.<ext>`.

**Tour.** A public, backendless walkthrough at `/tour/`: sign in with the
demonstration account `example@example.com` (password `example`, filled in for
you), browse the summaries an in-memory stand-in for the
[backend service](../international-patient-summary-service-with-axum/) holds,
open one in the viewer, delete or reset, and sign out. It needs no server and
stores nothing; a reload ends it.

**Languages.** Welsh (`cy-001`), English US (`en-US`, fallback), English UK
(`en-GB`), Simplified Chinese (`zh-CN`), through Sveltia I18n with Unicode
MessageFormat 2 messages in `locales/<dir>/messages.yaml`. Clinical content is
never translated; it carries the document's own `lang`. The Welsh and Chinese
strings are machine-drafted and await clinical review (see each
`locales/<dir>/REVIEW.md`).

## Architecture

```text
src/lib/fhir/        framework-free FHIR layer
  parse.ts           JSON/YAML text → data (format detection, limits, YAML rules)
  load.ts            file / text / safe web URL / example → parse
  bundle.ts          entry index; urn:uuid:, Type/id and absolute references
  composition.ts     Bundle → IpsDocument: sections, states, structural checks
  sections.ts        LOINC section registry (16 IPS 2.0.1 sections)
  absent.ts          emptyReason and IPS absent/unknown codes → states
  format.ts          CodeableConcept, Quantity, dates, names, dosage, age
  models.ts          view models: exactly what the Lily medical components take
  summary.ts         patient identity and document metadata in words
  narrative.ts       DOMPurify allowlist; narrative → plain text
src/lib/export/      framework-free exporters (json, yaml, markdown, pdf, filename)
src/lib/service/     the backend's API as an interface; TourService, in memory
src/lib/tour.svelte.ts  the tour's session (demo sign-in, open, delete, sign-out)
src/lib/components/  Svelte components on Lily headless
src/routes/          / (loader + viewer), /examples/, /tour/
locales/             UI messages, one directory per locale
static/examples/     IG 2.0.1 example Bundles and their YAML twins
static/fonts/        Noto Sans and Noto Sans SC for the PDF (OFL)
static/assets/       app stylesheet; Lily themes (vendored at build time)
```

Lily components are headless; `static/assets/style.css` styles their class
hooks against the active theme's tokens, so all Lily themes work.

## Deploy

`pnpm run build` writes a static site to `build/`. For a subpath (such as a
GitHub Pages project site), set `BASE_PATH`, e.g. `BASE_PATH=/viewer pnpm run
build`. In this repository, `.github/workflows/viewer-check.yml` (at the root)
runs the checks; this folder's own `.github/workflows/ci.yml` tests and deploys
when it is published as its own repository.

## Licence

Code: any of MIT, Apache-2.0, GPL-2.0-only, GPL-3.0-only, BSD-3-Clause, OGL-UK-3.0 or
CC-BY-NC-SA-4.0, at your option ([LICENSE.md](LICENSE.md)). Fonts: SIL OFL 1.1. Example fixtures:
from the HL7 FHIR IPS Implementation Guide; see the guide for its licence.
