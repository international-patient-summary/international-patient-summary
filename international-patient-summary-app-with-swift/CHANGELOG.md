# Changelog

## 0.1.0 — unreleased

First implementation of the specification (spec/index.md).

- UIKit app in Swift 6, built in code (no storyboards, no SwiftUI), for
  iPhone and iPad on iOS 18 and later.
- `IPSKit`, a Foundation-only Swift package: the service's S-API-2 check
  (same codes and pointers), reference resolution, the IPS 2.0.1 section
  registry, absent-data states, and formatting, with 32 Swift Testing tests
  over the five IG examples.
- Summaries list, summary screen (alerts, patient, document, sections in
  Composition order, missing required sections), About with Clear all.
- Import a JSON file, paste, or load the five bundled examples; share the
  exact bytes through the share sheet.
- In memory only; no network; privacy cover in the app switcher; privacy
  manifest declaring no tracking and no data collected.
- XCUITest end-to-end tests, including the largest accessibility text size.
- Ideas taken from the MyIPS user guide are listed in spec §1.1.
