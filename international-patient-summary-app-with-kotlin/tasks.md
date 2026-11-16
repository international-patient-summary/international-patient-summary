# Tasks

The checklist for [plans.md](plans.md). `[x]` done, `[ ]` open.

## Phase 1 — Viewer

- [x] P1-T1 Gradle 9.9.1 wrapper, Kotlin DSL, version catalog; AGP 9.5.1 with built-in Kotlin 2.4.21; every version checked against the two-day age rule
- [x] P1-T2 Core `ips` package with no Android imports: JSON access, check (M-CHECK-1/2), references (M-READ-1), registry (M-READ-3), absent states (M-VIEW-5), formatting (M-VIEW-7), narrative as text (M-VIEW-6)
- [x] P1-T3 `SummaryReader`: subject (M-READ-2), sections in order plus missing required ones (M-VIEW-3), entries (M-VIEW-4), the allergy alert (M-VIEW-1)
- [x] P1-T4 JVM unit tests: every refusal code and pointer, the five fixtures, crafted cases (43 tests)
- [x] P1-T5 Compose screens: Summaries (M-LIST-1..3), Summary (M-VIEW-1..7), About (M-ABOUT-1); state-driven navigation and Back
- [x] P1-T6 Import (M-LOAD-1), Paste (M-LOAD-2), examples from assets (M-LOAD-3)
- [x] P1-T7 Share via FileProvider (M-SHARE-1); share files removed on return and launch
- [x] P1-T8 Privacy: no network permission, no backup, in-memory store, recents cover (M-PRIV-1..4); `ManifestTest`
- [x] P1-T9 Accessibility: headings, merged rows, TalkBack Delete action, 48 dp targets, font scale (M-A11Y-1/2)
- [x] P1-T10 Lint with warnings as errors, clean
- [x] P1-T11 CI workflow (`.github/workflows/ci.yml`)
- [x] P1-T12 README, AGENTS, spec (one file per section, §1–§7 shared with iOS), llms.txt/llms.json
- [ ] P1-T13 Compose instrumented smoke test (load examples, open one, banner shows the name); until then, spec §9 step 1 by hand
- [ ] P1-T14 Run the manual checks of spec §9 on an API 29 and an API 33+ emulator before the first release
  - Done on an API 33 emulator (2026-11-16): launch, Load examples, open,
    alert first, Share (chooser names `international-patient-summary.json`;
    file deleted when it closes), Import file from Downloads, an 11 MB file
    refused as `too_large`, delete from the list, About → Clear all, font
    scale 2.0 in dark mode. Fixed from it: P1-T15, P1-T16.
  - Still to do: Paste (API 33 has no `adb` clipboard command), TalkBack, API 29.
- [x] P1-T15 The app switcher showed the record on API 33: cover on focus loss too (spec §8.3)
- [x] P1-T16 Each list row's delete button names its summary ("Delete James Judge") for TalkBack

## Phase 2 — Translations

- [ ] P2-T1 `values-en-rGB`, `values-cy`, `values-zh-rCN` strings, reviewed by a clinician who reads each language
- [ ] P2-T2 `locales_config.xml` and `android:localeConfig`
- [ ] P2-T3 A unit test that every locale has every key and matching placeholders

## Phase 3 — Open from other apps

- [ ] P3-T1 Intent filters for `ACTION_VIEW`/`ACTION_SEND` with JSON types
- [ ] P3-T2 The same size check and refusal alert for an incoming document

## Phase 4 — PDF

- [ ] P4-T1 Port the web viewer's one-page fitting rules to the core, with tests
- [ ] P4-T2 Draw with `PdfDocument`; share as `application/pdf`

## Phase 5 — SMART Health Links

- [ ] P5-T1 Spec change to M-PRIV-1 (in both mobile specs); network review
- [ ] P5-T2 Parse `shlink:/` links and decrypt JWE in the core, with tests
- [ ] P5-T3 QR scanning, on-device only; passcode prompt

## Phase 6 — Keep summaries

- [ ] P6-T1 Spec change to M-PRIV-1 and the root persistence rule
- [ ] P6-T2 Keystore-backed encrypted store, opt-in; Clear all deletes the key

## Phase 7 — Write your own summary

- [ ] P7-T1 Offline terminology source and clinical-safety review
- [ ] P7-T2 Editors for the MyIPS sections; output passes M-CHECK-1

## Phase 8 — The service

- [ ] P8-T1 Once the service has authentication: open from and save to it (its spec §4)
