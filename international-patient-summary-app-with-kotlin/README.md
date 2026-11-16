# International Patient Summary app with Kotlin

A Google Android app that opens and shows HL7 FHIR International Patient
Summary (IPS) documents: the patient first, then allergies, medications,
problems and every other section, in the document's own order. Written in
Kotlin (no Java source files) with Jetpack Compose and Material 3.

It checks a document exactly as the backend
([`international-patient-summary-service-with-axum`](../international-patient-summary-service-with-axum/))
and the web viewer
([`international-patient-summary-ui-with-svelte`](../international-patient-summary-ui-with-svelte/))
do, so a summary one accepts, the others accept too. Its iOS twin is
[`international-patient-summary-app-with-swift`](../international-patient-summary-app-with-swift/).

> **Safety.** This app is not a medical device. It shows what a document says
> and never changes its clinical content.

The specification is [spec/index.md](spec/index.md) (its contents table
lists one file per section); [plans.md](plans.md) and [tasks.md](tasks.md)
say what is built and what comes next.

## Privacy

- Summaries are kept in memory only: no file, database, preference or
  backup holds them, and they are gone when the app ends.
- No network: the manifest asks for no network permission (a unit test
  checks the merged manifest), and the app makes no request.
- A summary leaves the phone only when you tap Share; the temporary file is
  deleted when the share sheet returns and on the next launch.
- The app switcher shows no patient data. Screenshots are still allowed, so
  you can show a clinician.
- Backup and device transfer are off (`allowBackup="false"`, every domain
  excluded).

## Use it

- **Import file**: the system file picker; files over 10 MB are refused.
- **Paste**: reads the clipboard only when you tap it.
- **Load examples**: the five IPS Implementation Guide examples.
- **About**: safety, privacy, versions, and **Clear all**.

A refused document shows an alert naming the problem and its code
(`not_json`, `too_large`, `not_a_bundle`, `not_a_document`,
`no_composition`, `not_a_patient_summary`, `no_subject`).

## Build and test

Needs JDK 21 or later and the Android SDK (platform 37; Gradle installs it
if missing). Point Gradle at the SDK with a `local.properties` (gitignored):

```properties
sdk.dir=/path/to/Android/sdk
```

```sh
# the core, on the JVM, no emulator (43 tests)
./gradlew :app:testDebugUnitTest

# build, and lint with warnings as errors
./gradlew :app:assembleDebug :app:lintDebug

# install on a running emulator or a phone
./gradlew :app:installDebug
```

All three must pass before a change is finished. The manual checks are in
[spec/verification.md](spec/verification.md).

## Layout

```text
app/src/main/kotlin/io/github/internationalpatientsummary/app/
  ips/        the core: check, references, sections, absent data, formatting (no android.*)
  ui/         Compose screens: Summaries, Summary, About
  MainActivity.kt, AppViewModel.kt, SummaryStore.kt, ShareFiles.kt
app/src/main/assets/examples/   the five IG examples
app/src/main/res/values/strings.xml   every interface string (English)
app/src/main/res/values-*/            the same strings in 65 languages
app/src/test/                  JVM unit tests and fixtures
gradle/libs.versions.toml      every version, each at least two days old when adopted
spec/                          the specification, one file per section
```

## License

See [LICENSE.md](LICENSE.md).
