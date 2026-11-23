# AGENTS.md

Guidance for AI agents (and people) working on the iOS app. Read first:
[spec/index.md](spec/index.md) (what; one file per section), [plans.md](plans.md) (how),
[tasks.md](tasks.md) (the checklist). The spec is the source of truth; a
change in behaviour carries a spec edit, a code edit and a test edit together.

## Rules

- Swift 6 language mode. SwiftUI first: new screens are SwiftUI, with Lily's
  `LilyUI` components. UIKit, built in code, is the fallback where SwiftUI
  cannot do the job (and for the screens not yet moved). No storyboards or
  XIBs, no third-party dependencies beyond Lily.
- `IPSKit` imports Foundation and Lily's pure-Swift `LilyCore` only, never UIKit or SwiftUI, and every rule in it is
  tested with Swift Testing (`swift test`). View controllers only lay out
  what `IPSKit` returns.
- Spec §1–§7 are shared word for word with the Android app
  (`../international-patient-summary-app-with-kotlin/spec/`, same file names). Change
  both specs and both apps together.
- The check (`Check.swift`) mirrors the service's S-API-2
  (`../international-patient-summary-service-with-axum/src/ips.rs`) and the web
  viewer's `src/lib/service/service.ts`: same order, codes and pointers.
- Patient data is kept only in the encrypted store (spec §5.2, M-STORE):
  `IPSKit/EncryptedStore.swift`, AES-256-GCM, its key in the Keychain
  (`App/KeychainKeys.swift`, this device only, when unlocked), files in
  Application Support/Store with complete file protection, excluded from
  backup. Nothing else holds it: no UserDefaults, Core Data, SwiftData,
  other files (except the share file, deleted after sharing and at launch).
  No network code. No logging of document content.
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
- `App/`, `AppTests/` and `UITests/` are synchronized folders: new files join
  their target with no project edit. `AppTests/` (target `IPSAppTests`, Swift
  Testing, hosted in the app) holds the app's unit tests; run them alone with
  `-only-testing:IPSAppTests`. Keep `IPSApp.xcodeproj` hand-readable.
- Deployment target: current iOS minus two majors (iOS 18 while iOS 27 is
  current). Warnings are errors.

## Verify

```sh
cd IPSKit && swift test && cd ..
xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO
```
