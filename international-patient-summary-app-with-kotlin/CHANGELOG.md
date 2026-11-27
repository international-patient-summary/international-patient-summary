# Changelog

## 0.1.0 — unreleased

- Contents (M-VIEW-8): Lily's list of the summary's sections after the banner,
  "Contents" in every language; choosing one scrolls to it. A section outside the
  registry gets its own key (`other-N`), as on iOS.
- Theme: Lily's `LilyTheme` (`lily-compose-themes`, from the same local checkout)
  inside Material 3, with Lily's light or dark tokens by the system's appearance, so
  the allergy alert and the sections use Lily's gated colour pairs (spec §8.1).

- Tests: `OnePagePdf` draws through a `PdfSink` (the platform's `PdfDocument` by
  default), so `OnePagePdfJvmTest` covers its layout and drawing on the JVM;
  unit-test line coverage is 97.5% (P13-T3).

- Share as PDF (M-PDF-1..3): Share now offers "Share the file (FHIR JSON)"
  or "Share as PDF", a one-page summary for handing over or printing, by
  the web viewer's rules: the patient, a box with the alerts and every
  allergy, then the sections by priority; the font shrinks from 10 to 8 pt,
  then the least important sections are cut to their most recent entries,
  then left out, each named on a "Not shown on this page" line. Alerts,
  allergies and current medicines are never cut; if they alone overrun, the
  PDF runs on and says "CONTINUED". Letter in US English, A4 otherwise;
  right to left for Arabic, Hebrew, Persian and Urdu. Drawn with Android's
  own PdfDocument and system fonts (no new dependency), made off the main
  thread, named by the document's date, and deleted when sharing ends.
- A Compose smoke test on an emulator (`./gradlew :app:connectedDebugAndroidTest`):
  Load examples, three people and five summaries, open Martha DeLarosa's
  newest with her name in the banner and the allergy alert, then Clear all.
  Test-only dependencies (Compose UI Test, androidx.test); none reach the app.
- Summaries and relationships are saved on the phone, encrypted, so the
  app works offline and after a restart (M-STORE-1..4). Each summary and
  the index is its own AES-256-GCM file in `noBackupFilesDir`, under a key
  in the Android Keystore that cannot be exported. Each summary is checked
  again at launch; one that fails is deleted. Not in backups or device
  transfer, so a new phone starts empty. Delete, Forget this person and
  Clear all delete the files at once; Clear all also deletes the key.
- Families and carers: the list is grouped by person, by a shared
  identifier or the same name and birth date (M-PEOPLE-1, M-PEOPLE-2).
  Each person can be given a relationship (Me, My child, Someone I care
  for, ...), shown in their heading and banner, kept on the phone only and never
  shared (M-PEOPLE-3), and forgotten with all their summaries (M-PEOPLE-4).
- Share asks "Share the summary of" the patient first when more than one
  person's summaries are open (M-SHARE-2).
- Folding or unfolding keeps every summary, relationship and the open
  summary (M-TAB-4).
- The privacy cover no longer shows behind the app's own menus and dialogs;
  it still covers the window, menu or dialog included, in the switcher, and
  a dialog that names the patient leaves the name out there (M-PRIV-2).
- Tablets and wide windows: the list beside the open summary (M-TAB-1).
- Hardware keyboard shortcuts to import, paste, load the examples and delete (M-TAB-2).
- Drop a JSON file or text onto the list to open it, through the same check (M-TAB-3).
- Open from another app (M-LOAD-4): "Open with" or Share a JSON file from
  Files, Gmail, Chrome or a messaging app. It opens exactly as Import file
  does: refused over 10 MB before it is read, the same check and alert, and
  saved like any other summary; no copy of the file is kept. The app is
  offered only for `application/json` and `application/fhir+json`, and
  leaves itself out of its own Share sheet.
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
- Saved on the phone only, encrypted (see above); no network permission,
  no backup; the app switcher shows no patient data.
- 43 JVM unit tests; lint clean with warnings as errors.
