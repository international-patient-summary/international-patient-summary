# Changelog

## 0.1.0 — unreleased

- About and the summary are SwiftUI (`AboutView`, `SummaryView`, hosted in the UIKit navigation stack, with Share's menu and sheet in UIKit); the list screen stays UIKit until it moves.
- App icon and accent colour, the same design as the Android app's.
- Share as PDF: a one-page summary for people by the web viewer's rules (identity, alerts and
  allergies first, sections by clinical priority, trimmed to fit and saying what is not shown),
  Letter or A4 (M-PDF-1..3).
- Open in: a JSON file from Files, Mail, Safari or another app opens like an import, with the same
  size-first check and refusal alert; iOS's copy is deleted once read (M-LOAD-4).
- Works offline and after a restart: every summary and relationship is saved
  on the device in an encrypted store (AES-256-GCM, a Keychain key for this
  device only, out of backups); Delete, Forget and Clear all delete the files,
  and Clear all the key (M-STORE-1..4). The app's privacy words say so in
  every language.
- Families and carers: the list is grouped by person (M-PEOPLE-1, M-PEOPLE-2);
  each person can be given their relationship to the reader, shown in the
  heading and the banner (M-PEOPLE-3), and forgotten at once (M-PEOPLE-4).
- With more than one person open, Share first names whose summary it is (M-SHARE-2).
- iPhone Duo: the layout follows the window, folded or unfolded (M-TAB-1, M-TAB-4).
- Screenshots and UI tests on the newest runtime and iPhone (spec §8.4).
- Tablets and wide windows: the list beside the open summary (M-TAB-1).
- Hardware keyboard shortcuts to import, paste, load the examples and delete (M-TAB-2).
- Drop a JSON file or text onto the list to open it, through the same check (M-TAB-3).
- A known section is headed with the app's name in the reader's language, the document's own title beneath (M-VIEW-3).

- Every interface string in 65 localizations, the languages of the
  repository's `locales/` folder (spec M-I18N-2). Machine-translated and
  marked `needs_review`; `CatalogTests` checks every key and placeholder.
- The home-screen name in every language (`App/InfoPlist.xcstrings`).

First implementation of the specification (spec/index.md).

- UIKit app in Swift 6, built in code (no storyboards; SwiftUI was ruled out then, UIKit is now the fallback), for
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
