# Changelog

## 0.1.0 — unreleased

- Tablets and wide windows: the list beside the open summary (M-TAB-1).
- Hardware keyboard shortcuts to import, paste, load the examples and delete (M-TAB-2).
- Drop a JSON file or text onto the list to open it, through the same check (M-TAB-3).
- A known section is headed with the app's name in the reader's language, the document's own title beneath (M-VIEW-3).
- The empty list scrolls, so its buttons stay reachable in a short window.

- Every interface string in 65 `values-*/` folders, the languages of the
  repository's `locales/` folder (spec M-I18N-2), with Android 13's
  per-app language setting. Machine-translated, pending review;
  `TranslationsTest` checks every name and placeholder.
- Status, verification and criticality codes in words, in the reader's
  language, as on iOS (M-VIEW-7); dates use the language's digits, as the
  age beside them does (Arabic-Indic in Arabic).

Fixed after a first run on an API 33 emulator:

- The app switcher showed the open record: the cover now also appears when
  the window loses focus (the Pixel launcher keeps the app live there).
- Each list row's delete button now names its summary for TalkBack.

First implementation of the specification (spec/index.md).

- Android app in Kotlin (no Java), Jetpack Compose and Material 3; minSdk 29,
  targetSdk 36, compileSdk 37.
- Opens an IPS document Bundle from a file, the clipboard, or the five
  bundled IG examples, after the same structural check as the service
  (S-API-2) and a 10 MiB limit.
- Shows the allergy alert, patient banner, document details, and every
  section in order, with missing required sections, absent and unknown
  data in words, and narrative as plain text.
- Shares the exact bytes as `application/fhir+json`.
- In memory only, no network permission, no backup; the app switcher shows
  no patient data.
- 43 JVM unit tests; lint clean with warnings as errors.
