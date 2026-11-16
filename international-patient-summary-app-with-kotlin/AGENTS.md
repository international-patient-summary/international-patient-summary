# AGENTS.md

Guidance for AI agents (and people) working on this project.

Read first: [spec/index.md](spec/index.md) (what; one file per section),
[plans.md](plans.md) (how), [tasks.md](tasks.md) (the checklist). The spec
is the source of truth: a change in behaviour carries a spec edit, a code
edit and a test edit in the same commit, and updates `tasks.md`.

## Rules

- Kotlin only: no `.java` files anywhere. Gradle Kotlin DSL; every version in
  `gradle/libs.versions.toml`.
- AGP 9 built-in Kotlin: do not apply `org.jetbrains.kotlin.android`. Keep
  the Compose compiler plugin at the Kotlin version.
- The core, `app/src/main/kotlin/.../app/ips/`, imports no `android.*` or
  `androidx.*`: Kotlin, `java.*` and kotlinx-serialization only. Every rule
  that decides what a document says lives there and has a JVM unit test.
  Screens in `ui/` only lay out what `SummaryReader` returns.
- The check (`ips/Check.kt`) mirrors the service's S-API-2
  (`../international-patient-summary-service-with-axum/src/ips.rs`), the web
  viewer's `checkIps` (`src/lib/service/service.ts`) and the iOS app's
  `Check.swift`: same order, codes, pointers and 10 MiB limit. Change all of
  them, and their specs, together.
- §1–§7 of the spec are word for word the same as the iOS app's
  (`../international-patient-summary-app-with-swift/spec/`). Change both, or
  neither; Android-only matters go in `spec/android.md`.
- No network: never add `INTERNET` or any network permission, and no
  library that brings one (`ManifestTest` checks the merged manifest).
- No persistence of patient data: no files (except the share file in
  `cacheDir/share/`, on a Share tap), no database, no DataStore or
  SharedPreferences, no backup. `SummaryStore` stays in memory.
- Never log document content, names or identifiers; the app writes no logs.
- File names never contain the patient's name or identifiers.
- Narrative is shown as plain text (`Narrative.plainText`); never a WebView.
- Every interface string is in `res/values/strings.xml`, with plurals for
  counts; clinical text is never translated. Every icon button has a
  content description; titles use `semantics { heading() }`; touch targets
  are at least 48 dp; text sizes in `sp` (Material typography).
- Allergies are never behind a collapsed control. Statuses are words; colour
  only reinforces.
- Supply chain: use only versions published at least two days ago (check the
  `.pom` `Last-Modified` on Google Maven or Maven Central, or the
  distribution's for Gradle and SDK platforms). Never bump to "latest"
  without checking. Lint's version-freshness checks are off for this reason.
- Lint runs with warnings as errors; fix the cause, and only switch a check
  off in `app/lint.xml` with a comment saying why.
- Keep this file under 40 kB, and `llms.txt`/`llms.json` current when files,
  commands or features change.
- Commit or push only when asked.

## Verify before you finish

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

All must pass. The JDK must be 21 or later; `local.properties` names the
SDK. Then stop the daemon (`./gradlew --stop`).

## Where things are

- Check, refusal codes and pointers: `ips/Check.kt`
- Reference resolution: `ips/BundleIndex.kt`
- Section registry: `ips/Sections.kt`
- Absent/unknown mapping: `ips/Absent.kt`
- Bundle to Summary: `ips/SummaryReader.kt`, `ips/EntryReader.kt`
- Words for codes, names, dates, quantities: `ips/Format.kt`
- Navigation and state: `AppViewModel.kt`; screens in `ui/`
- Share: `ShareFiles.kt`, `res/xml/share_paths.xml`
- Privacy cover and share sheet: `MainActivity.kt`
- Fixtures: `app/src/main/assets/examples/` and `app/src/test/resources/fixtures/`
  (the same five files as the service's `tests/fixtures/`)
