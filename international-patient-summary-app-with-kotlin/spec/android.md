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
| Tests          | JUnit 4.13.2 on the JVM (`testDebugUnitTest`)                            |
| Lint           | `lintDebug`, warnings are errors; version-freshness checks off (age rule) |
| Strings        | `app/src/main/res/values/strings.xml` (English), plurals for counts     |

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
  ui/                    Jetpack Compose screens; lay out what the core read
    App.kt               state-driven navigation, BackHandler, refusal alert, privacy cover
    SummariesScreen.kt   §4.1: list, import, paste, examples
    SummaryScreen.kt     §4.2: alert, banner, document, sections
    AboutScreen.kt       §4.3: safety, privacy, versions, Clear all
    Words.kt             model values -> string resources
    Theme.kt             Material 3, light/dark from the system, dynamic colour
  MainActivity.kt        M-PRIV-2, share sheet, removes leftover share files
  AppViewModel.kt        Screen state, open/examples/delete/clear
  SummaryStore.kt        in-memory store (M-PRIV-1)
  ShareFiles.kt          M-SHARE-1: cacheDir/share/ via FileProvider
app/src/main/assets/examples/   the five IG examples (M-LOAD-3)
app/src/main/res/               strings, theme, launcher icon, backup and share rules
app/src/test/                   JVM unit tests; resources/fixtures/ holds the five examples
```

Navigation is a `Screen` value in `AppViewModel` (Summaries, Open(id),
About); there is no navigation library. The view model survives rotation;
the summaries are gone when the process ends.

## 8.3 Platform notes

- **Import** (M-LOAD-1): `ActivityResultContracts.OpenDocument` with
  `application/json` and `*/*`. The size from `OpenableColumns.SIZE` is
  checked first, and the stream is read with a 10 MiB + 1 byte cap, so an
  oversized file is refused without being held.
- **Paste** (M-LOAD-2): `ClipboardManager.primaryClip`, read only in the
  Paste tap's handler; Android shows its own "pasted" notice.
- **Examples** (M-LOAD-3): read from `assets/examples/` through the same
  check as any other document.
- **Share** (M-SHARE-1): the exact bytes written to
  `cacheDir/share/international-patient-summary.json`, offered through
  `FileProvider` (authority `<applicationId>.share`) with `ACTION_SEND`, type
  `application/fhir+json`, in a chooser. The directory is deleted when the
  chooser returns and on every fresh launch.
- **Network and backup** (M-PRIV-1): the manifest asks for no permission
  that reaches a network; `android:allowBackup="false"`, and both
  `dataExtractionRules` and `fullBackupContent` exclude every domain.
- **Privacy cover** (M-PRIV-2): a plain surface with the app's name covers
  the window while the activity is paused **or has lost window focus**, on
  every API level; on Android 13 (API 33) and later
  `setRecentsScreenshotEnabled(false)` also stops the saved thumbnail. Seen
  on an API 33 emulator (2026-11-16): the Pixel launcher keeps the app live
  and resumed in the switcher, so neither the thumbnail flag nor `onPause`
  hid the record; losing focus does. The cost: the cover also shows behind
  the app's own dialogs (a refusal, Clear all), which take window focus.
  `FLAG_SECURE` is not used, so people can still take screenshots.
- **Logs** (M-PRIV-4): the app writes no logs of its own.
- **Accessibility** (M-A11Y-1/2): screen and section titles use
  `semantics { heading() }`; entry and list rows merge their text into one
  announcement; a list row has a TalkBack "Delete <name>" custom
  action as well as the swipe and a Delete button with the same name; icon buttons carry
  content descriptions; touch targets are at least 48 dp; text uses `sp`
  through Material typography, so it follows the font scale.
- **Dates**: a FHIR dateTime is written at the document's own offset, not
  converted to the phone's time zone, so it reads as the document wrote it.
