# Changelog

## 0.1.0 — unreleased

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
