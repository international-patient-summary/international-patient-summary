# AGENTS.md

Guidance for AI agents (and people) working on the iOS app. Read first:
[spec/index.md](spec/index.md) (what; one file per section), [plans.md](plans.md) (how),
[tasks.md](tasks.md) (the checklist). The spec is the source of truth; a
change in behaviour carries a spec edit, a code edit and a test edit together.

## Rules

- Swift 6 language mode, UIKit built in code. No SwiftUI, no storyboards or
  XIBs, no third-party dependencies.
- `IPSKit` imports Foundation only, never UIKit, and every rule in it is
  tested with Swift Testing (`swift test`). View controllers only lay out
  what `IPSKit` returns.
- Spec §1–§7 are shared word for word with the Android app
  (`../international-patient-summary-app-with-kotlin/spec/`, same file names). Change
  both specs and both apps together.
- The check (`Check.swift`) mirrors the service's S-API-2
  (`../international-patient-summary-service-with-axum/src/ips.rs`) and the web
  viewer's `src/lib/service/service.ts`: same order, codes and pointers.
- Patient data stays in memory: no files (except the share file, deleted
  after sharing and at launch), no UserDefaults, Keychain, Core Data,
  SwiftData, or backup. No network code. No logging of document content.
- Every interface string is in `App/Localizable.xcstrings`, looked up with
  `L10n.text`; a missing key shows as ⟦key⟧ and fails the UI tests.
  Clinical text from a document is never translated. A new key needs a
  value in every language in the catalog (`CatalogTests` checks). Translations are edited in
  `../international-patient-summary-app-translations/languages/`, then
  `python3 translations.py generate`; never by hand in the catalog.
- Words first: alerts and absent states are written out; colour and symbols
  only reinforce. Allergies are never collapsed.
- File names never contain a patient's name or identifiers.
- Accessibility: headings get the header trait; cells use
  `UIListContentConfiguration` so they follow Dynamic Type; controls are at
  least 44 pt; every icon button has an accessibility label.
- `App/` and `UITests/` are synchronized folders: new files join their
  target with no project edit. Keep `IPSApp.xcodeproj` hand-readable.
- Deployment target: current iOS minus two majors (iOS 18 while iOS 27 is
  current). Warnings are errors.

## Verify

```sh
cd IPSKit && swift test && cd ..
xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp \
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```
