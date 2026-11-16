# International Patient Summary app with Swift

An Apple iOS app (iPhone and iPad) that opens an HL7 FHIR
[International Patient Summary](https://hl7.org/fhir/uv/ips/) (IPS) and
shows it: alerts first, then the patient, the document, and each section
in the document's order. Swift and UIKit, built in code (no SwiftUI, no
storyboards). Its Android twin is
[`international-patient-summary-app-with-kotlin`](../international-patient-summary-app-with-kotlin/).

> **Not a medical device.** The app shows what a document says and never
> changes it.

## Privacy

- Summaries live in the app's memory only, and are forgotten when the app
  closes or you tap **Clear all**.
- No account, no network requests, no analytics. The privacy manifest
  declares no tracking and no data collected.
- A summary leaves the device only when you tap **Share**, as the exact bytes
  it was opened from, in a file named `international-patient-summary.json`.
- The app switcher shows a cover, not the record.

## Use it

1. Tap **Load examples** to open the five published IG examples, or **Import
   file** (a FHIR JSON Bundle from Files), or **Paste** (FHIR JSON text).
2. Tap a summary. High-criticality allergies are at the top, in words.
3. **Share** sends the document; **About → Clear all** forgets everything.

A document is checked exactly as the backend
([`international-patient-summary-service-with-axum`](../international-patient-summary-service-with-axum/),
spec S-API-2) checks it, with the same codes, such as `not_a_document`.

## Build and test

Requires Xcode 27.2 or later (Swift 6.4); runs on iOS 18 and later.

```sh
# the core, on the Mac, no simulator (32 tests)
cd IPSKit && swift test && cd ..

# the app, end to end, on a simulator (3 UI tests; the paste test takes ~3 minutes)
xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp \
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO

# or open in Xcode and run the IPSApp scheme
open IPSApp.xcodeproj
```

## Layout

```text
IPSKit/        Swift package with no UIKit: check, document reader, formatting, tests
App/           the UIKit app (Xcode synchronized folder: add files, no project edits)
UITests/       XCUITest end-to-end tests
spec/          the specification, one file per section; index.md is the contents
plans.md       phases; tasks.md the checklist
```

## Ideas from MyIPS

The [MyIPS user guide](https://myips.health/user-guide/) shaped this app's
privacy model and its roadmap (writing your own summary, SMART Health Links,
PDF, an encrypted store). Spec §1.1 lists what was taken now and what waits.

## License

See [LICENSE.md](LICENSE.md).
