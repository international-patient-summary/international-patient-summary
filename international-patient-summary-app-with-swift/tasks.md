# Tasks

The checklist for [plans.md](plans.md). IDs are stable; spec §9 maps
requirements to tests.

## Phase 1 — Viewer

- [x] P1-T1 `IPSKit` package: JSON, check (M-CHECK-1/2), Refusal codes and pointers
- [x] P1-T2 Document reader: references (M-READ-1/2), sections (M-READ-3), entries (M-VIEW-4)
- [x] P1-T3 Absent states (M-VIEW-5) and formatting (M-VIEW-7, dates, ages, quantities, narrative)
- [x] P1-T4 Swift Testing suites over the five fixtures (32 tests)
- [x] P1-T5 UIKit app: scene in code, list, summary, About (§4)
- [x] P1-T6 Import, paste, examples, share (M-LOAD-*, M-SHARE-1)
- [x] P1-T7 Privacy: in memory, privacy cover, share-file cleanup, privacy manifest (M-PRIV-*)
- [x] P1-T8 XCUITests: examples → summary → Clear all; largest text size; paste, refusal and share (3 tests)
- [x] P1-T9 CI workflow (macOS runner: `swift test`, `xcodebuild test`)
- [ ] P1-T10 Manual checks in spec §9 on a device, with VoiceOver
  - Simulator run (iPhone 17 Pro, iOS 27.2, 2026-11-16): launch, examples, summary,
    paste (with iOS's Allow Paste prompt), `not_json` refusal, share sheet. Still to
    do: import from Files, an 11 MB file, VoiceOver, the app switcher cover.
- [ ] P1-T11 App icon and accent colour (asset catalog)
- [ ] P1-T12 Signing team and App Store privacy answers ("Data Not Collected")

## Phase 2 — Translations

- [ ] P2-T1 en-GB, cy-001, zh-CN in `Localizable.xcstrings`, matching the web viewer's words
- [ ] P2-T2 Clinical review of each translation (as the web viewer's `locales/*/REVIEW.md`)

## Phase 3 — Open from other apps

- [ ] P3-T1 Document types and an exported UTI for FHIR JSON; `scene(_:openURLContexts:)`

## Phase 4 — PDF

- [ ] P4-T1 One-page PDF with the web viewer's trimming rules

## Phase 5 — SMART Health Links

- [ ] P5-T1 Spec change: network use for a link the person gives
- [ ] P5-T2 QR scanning and link paste; passcode; JWE decryption

## Phase 6 — Keep summaries

- [ ] P6-T1 Spec change to M-PRIV-1; encrypted opt-in store

## Phase 7 — Write your own summary

- [ ] P7-T1 Spec: MyIPS-style sections, offline terminology, safety review

## Phase 8 — The service

- [ ] P8-T1 After the service's P3 (authentication): open and save by API
