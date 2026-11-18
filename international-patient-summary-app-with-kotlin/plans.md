# Plan

How the specification ([spec/index.md](spec/index.md)) gets built.
[tasks.md](tasks.md) is the checklist. Each phase ships on its own; later
phases come from [spec §1.1](spec/purpose.md), the MyIPS ideas this version
leaves for later. Each is a spec change first, made in the iOS app's spec
too where it touches §1–§7.

## Release readiness

Prioritize storage failure recovery, clinical display parity and language review
before the network and authoring phases. The [mobile release plan](../plan.md)
sets the acceptance criteria and the [shared checklist](../tasks.md) tracks them.

## Phase 1 — Viewer (version 0.1, done)

Open, check, show, share, forget. The `ips` package holds every rule that
is not Android, so it is tested on the JVM without an emulator. Proven by
[spec §9](spec/verification.md).

## Phase 2 — Translations

Every language of the repository's `locales/` folder (spec M-I18N-2) as
`values-*/strings.xml`, machine-translated first, with the same review rule
(a clinician who reads the language checks every string before release),
and a generated locale config so Android 13's per-app language setting
offers them. Welsh and Arabic plurals need all six quantities.

## Phase 3 — Open from other apps

An `ACTION_VIEW` and `ACTION_SEND` intent filter for `application/json` and
`application/fhir+json`, so "Open with" from Files, Gmail and Chrome reaches
the app; the same check and 10 MB limit. Done: the same reader as Import
file (`DocumentFiles`), one activity (`singleTask`) so one store, and no
`text/plain` or catch-all type (spec §8.3).

## Phase 4 — A PDF for people

The web viewer's one-page PDF rules (its spec §6.7, `src/lib/export/pdf.ts`):
identity, alerts, allergies and current medications are never trimmed.
Done: the rules (content, priority, plans, fitting with a page counter) in
the core (`ips/OnePage.kt`) with JVM tests; measured and drawn with
`StaticLayout` and `android.graphics.pdf.PdfDocument` and the system fonts
(`OnePagePdf.kt`), no new dependency; Share offers the file or the PDF,
shared like the JSON (spec M-PDF-1..3, §8.3).

## Phase 5 — SMART Health Links and QR codes

Scan a QR code (CameraX with ML Kit barcode scanning, on-device) or paste a
link, ask for the passcode, fetch and decrypt the IPS (JWE, `A256GCM`). This
is the app's first network use: it needs a spec change to M-PRIV-1, the
`INTERNET` permission with a review, and fetches only the link the person
gave. Showing one's own summary as a QR code follows.

## Phase 6 — Keep summaries (opt-in)

Superseded by Phase 11: the store is always on, so the app works offline and
after a restart.

## Phase 7 — Write your own summary

MyIPS's sections (My Details, Medications, Allergies, Health Concerns, and so
on), with "none known" toggles, building a valid IPS 2.0.1 Bundle that passes
M-CHECK-1. Needs a terminology source (SNOMED CT, LOINC) that works offline,
and a clinical-safety review.

## Phase 8 — The service

Open from and save to `international-patient-summary-service-with-axum` once
it has authentication (its P3); the same API contract (its spec §4).

## Phase 9 — Tablets

The list beside the open summary in a wide window (spec M-TAB-1), then a
hardware keyboard's shortcuts and dropping a file onto the list, each
through the same check as every other way in. Phone behaviour is unchanged.

## Phase 10 — Families and carers

One person often reads summaries for several: their children, their
parents, someone they care for. The list is grouped by person (spec
M-PEOPLE-1, M-PEOPLE-2), matched in the `ips` core (`People`) by a shared
identifier or by name and birth date, so it is tested on the JVM. Each
person can be given a relationship and forgotten at once (M-PEOPLE-3,
M-PEOPLE-4); the relationship is the app's note, kept (encrypted on the phone since Phase 11) in
`SummaryStore` beside the summaries and never shared. Share asks first when
more than one person's summaries are open (M-SHARE-2), and folding keeps
everything (M-TAB-4).

## Phase 11 — Encrypted on-device store

The app must work offline and after the phone restarts, so every open
summary and every relationship is saved on the phone, encrypted (spec
M-STORE-1..4, M-PRIV-1, M-PRIV-3). `EncryptedStore` keeps each summary's
exact bytes and an index (order, ids, relationships) in their own
AES-256-GCM files in `noBackupFilesDir/store/`, with a fresh nonce for each
write and the file's role as additional data, under one non-exportable key
in the Android Keystore (`KeystoreKeys`). It uses only `java.*` and
`javax.crypto`, so it is tested on the JVM with a plain AES key. At launch
each summary is checked again; a bad one is deleted, and a missing key or a
bad index deletes the store. Delete, Forget this person and Clear all delete
the files at once; Clear all deletes the key. `AppViewModel` loads and
saves on one background thread, in order. Backup and device transfer stay
off.
