[Specification](index.md) › §8

# 8. Android

## 8.1 Stack

Every version was published at least two days before it was adopted
(checked by the `.pom` `Last-Modified`, 2026-11-16).

| Concern        | Choice                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| Language       | Kotlin 2.4.21 only: no Java source files                                 |
| Build          | Gradle 9.9.1 (wrapper), Kotlin DSL, version catalog `gradle/libs.versions.toml` |
| Android plugin | AGP 9.5.1 with built-in Kotlin (no `org.jetbrains.kotlin.android`)       |
| Compose        | Compose BOM 2026.09.00 (UI 1.12.1, Material 3 1.4.0), compiler plugin 2.4.21 |
| AndroidX       | activity-compose 1.13.0, core-ktx 1.19.1, lifecycle-viewmodel-compose 2.11.0 |
| JSON           | kotlinx-serialization-json 1.13.0, `Json.parseToJsonElement` only (no plugin) |
| SDK            | compileSdk 37 (Compose UI 1.12 and core-ktx 1.19 require it), targetSdk 36, minSdk 29 |
| JVM            | Java and Kotlin bytecode 21; builds on JDK 21 or later                   |
| Tests          | JUnit 4.13.2 on the JVM (`testDebugUnitTest`); on an emulator (`connectedDebugAndroidTest`), Compose UI Test `ui-test-junit4` from the BOM, androidx.test runner 1.7.0, ext-junit 1.3.0 and espresso-core 3.7.0 (3.5.0, which ui-test-junit4 brings, fails on API 36+); test dependencies are `androidTestImplementation` only, in the test APK, never the app |
| Lint           | `lintDebug`, warnings are errors; version-freshness checks off (age rule) |
| Strings        | `res/values/strings.xml` (English) and 65 `values-*/` folders (M-I18N-2), plurals for counts; `generateLocaleConfig` for Android 13's per-app language |

## 8.2 Architecture

One module, `:app`, package `io.github.internationalpatientsummary.app`
(also the application id).

```text
app/src/main/kotlin/io/github/internationalpatientsummary/app/
  ips/                   the core: Kotlin and kotlinx-serialization only, no android.* imports
    JsonAccess.kt        null-safe reading of untyped FHIR JSON
    Check.kt             M-CHECK-1/2: Refusal codes and pointers, IpsCheck.parse, readCapped
    BundleIndex.kt       M-READ-1: by fullUrl, then Type/id
    Sections.kt          M-READ-3: SectionKey registry
    Absent.kt            M-VIEW-5: SectionState rules
    Summary.kt           the model: Summary, PatientInfo, Section, Entry, Detail
    SummaryReader.kt     M-READ-2, M-VIEW-1..3, M-VIEW-5: Bundle -> Summary
    EntryReader.kt       M-VIEW-4: one entry as a row
    Format.kt            M-VIEW-7: displayOf, statusOf, names, dates, ages, quantities
    Narrative.kt         M-VIEW-6: narrative as plain text
    People.kt            M-PEOPLE-1: which summaries are the same person
    OnePage.kt           M-PDF-1/2: the PDF's blocks, plans and fitting; Paper, PdfFile (name), PdfInfo (title metadata)
  ui/                    Jetpack Compose screens; lay out what the core read
    App.kt               state-driven navigation, two panes at 840 dp (M-TAB-1), BackHandler, refusal alert, share confirmation (M-SHARE-2), privacy cover
    SummariesScreen.kt   §4.1, §4.5: list grouped by person, relationship menu, forget a person, import, paste, examples
    SummaryScreen.kt     §4.2: alert, banner, document, sections
    AboutScreen.kt       §4.3: safety, privacy, versions, Clear all
    Words.kt             model values -> string resources; CODE_WORDS (M-VIEW-7)
    Theme.kt             Material 3, light/dark from the system, dynamic colour
  MainActivity.kt        M-PRIV-2, share sheet, removes leftover share files, keyboard shortcuts (M-TAB-2), opens a sent document (M-LOAD-4)
  Incoming.kt            M-LOAD-4: which part of a VIEW or SEND intent holds the document, no android.* imports
  DocumentFiles.kt       M-CHECK-2: the size-first, capped read of a picked, dropped or sent file
  Shortcuts.kt           M-TAB-2: Ctrl+key to action, no android.* imports
  AppViewModel.kt        Screen state (survives a fold, M-TAB-4), people, open/examples/delete/clear, relationship, forget a person
  SummaryStore.kt        the summaries and relationships in memory (M-PEOPLE-3); index() and restore() for the store
  EncryptedStore.kt      M-STORE-1..4: AES-256-GCM files in noBackupFilesDir/store/; java.* and javax.crypto only
  KeystoreKeys.kt        M-STORE-2: the store's key in the Android Keystore
  ShareFiles.kt          M-SHARE-1, M-PDF-3: cacheDir/share/ via FileProvider, the JSON or the PDF
  OnePagePdf.kt          M-PDF-1/2: words, StaticLayout, page count and PdfDocument drawing
app/src/main/assets/examples/   the five IG examples (M-LOAD-3)
app/src/main/res/               strings, theme, launcher icon, backup and share rules
app/src/test/                   JVM unit tests; resources/fixtures/ holds the five examples
app/src/androidTest/            SmokeTest: Compose UI Test on an emulator (P1-T13)
```

Navigation is a `Screen` value in `AppViewModel` (Summaries, Open(id),
About); there is no navigation library. The view model survives rotation;
the summaries and relationships are saved in the encrypted store
(M-STORE-1) and come back at the next launch; which summary was open does
not.

## 8.3 Platform notes

- **Import** (M-LOAD-1): `ActivityResultContracts.OpenDocument` with
  `application/json` and `*/*`. The size from `OpenableColumns.SIZE` is
  checked first, and the stream is read with a 10 MiB + 1 byte cap, so an
  oversized file is refused without being held.
- **Open from another app** (M-LOAD-4): two intent filters on
  `MainActivity`, `ACTION_VIEW` and `ACTION_SEND`, each with category
  `DEFAULT` and the MIME types `application/json` and
  `application/fhir+json` only (`Incoming.TYPES`; `ManifestTest` checks the
  source and merged manifests). Not `text/plain`, `application/octet-stream`
  or `*/*`: those would offer the app for every shared link, note or unknown
  file; a JSON file typed otherwise still opens with Import file. No
  `ACTION_SEND_MULTIPLE` (one document at a time, as with drops).
  `Incoming.source` picks the document: VIEW's data URI; SEND's
  `EXTRA_STREAM`, else its `EXTRA_TEXT` (an app that shares the JSON itself
  as text with a JSON type); only `content:` URIs (a `file:` URI, or nothing
  to read, shows the "could not be read" alert). A `content:` URI is read by
  `DocumentFiles.read`, the reader Import file and drops use (size first,
  then the capped stream), and goes through `AppViewModel.open`, which waits
  for the store to load, checks it, shows it or the refusal alert, and saves
  it only once it opens; nothing is copied. The read runs under the
  intent's URI grant, which lasts while the activity does (rotation
  included). `launchMode="singleTask"`: one activity, so one view model and
  one store writer, even when another app sends the file (otherwise a second
  activity in that app's task would load and write the same store). A cold
  start handles the intent in `onCreate` only when `savedInstanceState` is
  null, so a recreated activity does not open it again; a running app gets
  it in `onNewIntent`; an intent marked `FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`
  (reopened from Recents) is ignored. The privacy cover is unchanged: the
  activity is resumed and focused when the summary shows. The app's own
  Share chooser leaves the app out (`EXTRA_EXCLUDE_COMPONENTS`), since it
  now accepts `application/fhir+json` itself.
- **Paste** (M-LOAD-2): `ClipboardManager.primaryClip`, read only in the
  Paste tap's handler; Android shows its own "pasted" notice.
- **Examples** (M-LOAD-3): read from `assets/examples/` through the same
  check as any other document.
- **Share** (M-SHARE-1): the exact bytes written to
  `cacheDir/share/international-patient-summary.json`, offered through
  `FileProvider` (authority `<applicationId>.share`) with `ACTION_SEND`, type
  `application/fhir+json`, in a chooser. The directory is deleted when the
  chooser returns and on every fresh launch. The Share button opens a menu
  of two items, "Share the file (FHIR JSON)" and "Share as PDF"; either goes
  through M-SHARE-2's question first, with the chosen format kept while it
  is open.
- **PDF** (M-PDF-1..3): `OnePage` (the core) turns a `Summary` into blocks:
  the box (the Alerts section's entries, then every allergy and intolerance,
  whole, each with its own criticality, so the banner's high-criticality
  lines are not repeated; then M-VIEW-1's missing-allergies notice only when
  the document has no allergies section) and the other sections by
  `SectionKey.pdfPriority` (the web viewer's `pdfPriority`; another code is
  99). Entries are sorted by their FHIR date, most recent first (none last);
  in Medications, entries with status active, intended, on-hold or draft
  (the web viewer's `MedicationModel.current`) are never trimmed. A section
  whose content is its narrative (Patient story, another code) has one row,
  the narrative as plain text. `OnePage.plans()` is the web viewer's
  `plans()`, and `fit` takes a page counter, so the JVM tests use a fake
  one. `OnePagePdf` (the app) says each block with the string resources in
  the activity's language, lays each line out once as a `StaticLayout`
  (`TextPaint` on `Typeface.DEFAULT`, so the system fonts cover every
  script; bold and italic as spans), places them on pages of 595×842 pt
  (A4) or 612×792 pt (Letter for en-US) with 28 pt sides, 26 pt top (34 pt
  when continued) and 40 pt bottom, and moves a line that does not fit,
  whole, to the next page (a section heading goes with its first line).
  Counting pages needs no drawing; the chosen plan is then drawn with
  `PdfDocument`: a tinted header band, the box with a 1.5 pt red border,
  the footer (7 pt) on every page with "Page X of Y", and on a continued PDF
  the red "CONTINUED" line at the top of every page (as many pages as the
  never-trimmed content needs, with the footer counting them). Every line runs in the
  language's direction (`TextDirectionHeuristics.RTL` for Arabic, Hebrew,
  Persian, Urdu), and the document's text and each value put into a
  sentence is a first-strong isolate (U+2068 … U+2069), so English clinical
  text keeps its order in an Arabic line. `PdfDocument` writes no title, so
  `PdfInfo.withTitle` appends an incremental update (an Info dictionary with
  `/Title` the file name, its xref section and a trailer with `/Prev`).
  Made on `Dispatchers.Default` from `MainActivity` (one at a time), written
  to `cacheDir/share/international-patient-summary-<date>.pdf` (`<date>` the
  Composition date as far as it goes: YYYY-MM-DD, YYYY-MM or YYYY, as the
  web viewer's `exportFilename`; none without one), shared as
  `application/pdf` in the same chooser, and deleted with the folder.
- **Network and backup** (M-PRIV-1, M-STORE-2): the manifest asks for no
  permission that reaches a network; `android:allowBackup="false"`, and
  both `dataExtractionRules` (cloud backup and device transfer) and
  `fullBackupContent` exclude every domain (`ManifestTest`). The store is in
  `noBackupFilesDir`, which Android never backs up either.
- **Encrypted store** (M-STORE-1..4): `EncryptedStore`, under
  `noBackupFilesDir/store/` (`/data/data/<applicationId>/no_backup/store/`):
  `index.bin` (the summary ids newest first, each person's relationship and
  the next id, as JSON before encryption) and `summaries/<id>.bin` (a
  summary's exact bytes). Each file is one format byte (1), the 12-byte
  nonce, then the AES-256-GCM ciphertext and 128-bit tag. The additional
  authenticated data names the file (`ips-store/1/index`,
  `ips-store/1/summary/<id>`), so one file cannot stand in for another. A
  write goes to a `.tmp` file, is `fsync`ed and then renamed over the old
  (`ATOMIC_MOVE`). The ids come from the index, so they stay the same across
  launches.
- **The key** (M-STORE-2): `KeystoreKeys`, alias `ips-store` in the
  `AndroidKeyStore`: `KeyGenParameterSpec` AES, 256 bits, purpose encrypt
  and decrypt, block mode GCM, padding none,
  `setRandomizedEncryptionRequired(true)`, so the Keystore picks every
  nonce (`Cipher.init` without parameters; the nonce is read from
  `cipher.iv` and stored with the ciphertext). Keystore keys cannot be
  exported. No user authentication or unlocked-device requirement: the app
  only reads the store while it is in use, and a lock screen is not
  required to use it. Only the platform: no `androidx.security`, no other
  library.
- **Load and recovery** (M-STORE-3): at launch, on the store's thread, the
  index is decrypted, then each summary, which goes through
  `SummaryReader.open` (M-CHECK-1, M-CHECK-2) again. A summary that fails to
  decrypt or is refused is left out and its file deleted, and the index is
  rewritten. When the key cannot be had (for example
  `KeyPermanentlyInvalidatedException`) or the index cannot be decrypted or
  read (a replaced key, or a damaged index), the whole store and the key are
  deleted and the app starts empty; it never crashes on a bad file. Summary
  files that the index does not list, and `.tmp` files, are deleted (a write
  that stopped half way).
- **Writes and threading**: `AppViewModel` owns one single-thread executor.
  The load runs on it first; every change (open, examples, delete, forget a
  person, relationship) then queues a snapshot of `SummaryStore.index()`
  with the summaries added and removed: new files first, removed files
  deleted, then the index. Clear all queues `EncryptedStore.clear()`, which
  deletes the directory and the key; the next save makes a new key. One
  thread, in order, so a later change never overtakes an earlier one.
  Opening waits for the load; the list shows the busy indicator meanwhile.
  A write that fails leaves what was saved before (the next change rewrites
  the index).
- **Privacy cover** (M-PRIV-2): a plain surface with the app's name covers
  the window while the activity is paused **or has lost window focus**, on
  every API level; on Android 13 (API 33) and later
  `setRecentsScreenshotEnabled(false)` also stops the saved thumbnail. Seen
  on an API 33 emulator (2026-11-16): the Pixel launcher keeps the app live
  and resumed in the switcher, so neither the thumbnail flag nor `onPause`
  hid the record; losing focus does. The app's own menus and dialogs take
  window focus too, so each reports its own window's focus
  (`TrackPopupFocus`): while one of them has focus there is no cover, and in
  the switcher it loses focus as well and the cover returns. A dialog that
  names the patient (M-SHARE-2, M-PEOPLE-4) leaves the name out while
  covered, since a dialog is a window above the cover. Seen on an API 37
  emulator (2026-11-17).
  `FLAG_SECURE` is not used, so people can still take screenshots.
- **Logs** (M-PRIV-4): the app writes no logs of its own; the store logs
  nothing either.
- **Accessibility** (M-A11Y-1/2): screen and section titles use
  `semantics { heading() }`; entry and list rows merge their text into one
  announcement; a list row has a TalkBack "Delete <name>" custom
  action as well as the swipe and a Delete button with the same name; icon buttons carry
  content descriptions; touch targets are at least 48 dp; text uses `sp`
  through Material typography, so it follows the font scale.
- **Language folders** (M-I18N-2): Hebrew and Indonesian use the old codes
  `values-iw` and `values-in`, as `java.util.Locale` still does (lint
  `LocaleFolder`); three-letter and script codes use the `b+` form
  (`values-b+bho`, `values-b+zh+Hans`). `res/resources.properties` names
  `values/` as en-US.
- **Dates**: a FHIR dateTime is written at the document's own offset, not
  converted to the phone's time zone, so it reads as the document wrote it.
