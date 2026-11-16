[Specification](index.md) › §9

# 9. Verification

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

Tests are in `app/src/test/kotlin/io/github/internationalpatientsummary/app/`.

| Requirement           | Test                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| M-CHECK-1             | `ips.CheckTest` (each code with a minimal failing document, `not_json`, the order, `codesAndPointersMatchTheService`) |
| M-CHECK-2             | `ips.CheckTest.refusesTooLargeBeforeParsing`                             |
| M-READ-1              | `ips.BundleIndexTest`; `ips.SummaryReaderTest.resolvesByFullUrlAndByTypeAndId`, `anUnresolvedReferenceIsShownNotDropped` |
| M-READ-2              | `ips.SummaryReaderTest.anUnresolvedSubjectStillOpens`                    |
| M-READ-3              | `ips.SummaryReaderTest.sectionsFollowCompositionOrder` (all 16 sections known), `aSectionWithAnotherCodeIsGeneric` |
| M-LOAD-3              | `ips.SummaryReaderTest.everyExampleIsAcceptedWithItsPatient`; `ManifestTest.theExamplesShipInTheApp` |
| M-LIST-1              | `SummaryStoreTest.newestFirstAndClearAll`                                |
| M-VIEW-1              | `ips.SummaryReaderTest.readsPatientAndDocumentDetails`, `theBannerAlertListsHighCriticalityAllergies`; `ips.FormatTest.agesAreWholeYearsAndNeverGuessed` |
| M-VIEW-2              | `ips.SummaryReaderTest.readsPatientAndDocumentDetails`                   |
| M-VIEW-3              | `ips.SummaryReaderTest.sectionsFollowCompositionOrder`, `missingRequiredSectionsComeLast` |
| M-VIEW-4              | `ips.SummaryReaderTest.entriesCarryTheirDetails`; `ips.FormatTest.quantitiesAreWrittenAsGiven` |
| M-VIEW-5              | `ips.SummaryReaderTest.noInfoSectionsAreUnavailable`, `emptyReasonsAndAbsentCodesMapToTheirStates` |
| M-VIEW-6              | `ips.FormatTest.narrativeBecomesPlainText`; `ips.SummaryReaderTest.narrativeWithoutEntriesIsKept` |
| M-VIEW-7              | `ips.FormatTest.displayPrefersCodingDisplayThenTextThenSystemAndCode`, `statusIsAWordNotAUri`, `systemLabels` |
| M-SHARE-1             | `ips.SummaryReaderTest.keepsTheExactBytes`; manual                       |
| M-PRIV-1              | `ManifestTest` (source and merged manifest: no network permission, no backup); `SummaryStore` is in memory by construction |
| M-PRIV-3              | `SummaryStoreTest.newestFirstAndClearAll`; manual                        |
| M-I18N-1              | `lintDebug` (`HardcodedText`, `SetTextI18n`; warnings are errors)        |
| Robustness            | `ips.SummaryReaderTest.wrongJsonTypesReadAsAbsent`                       |

Manual, before a release, on an emulator or phone (`./gradlew
:app:installDebug`, for example on the `Pixel_6_Pro_API_33` AVD):

1. **M-LOAD-3, M-LIST-1, M-VIEW-1..6**: Load examples; five rows appear,
   newest first, each with a name, a title and a date with the month as
   text. Open "Martha DeLarosa"; the alert box lists the penicillin allergy
   above the banner; the banner shows birth date, age, gender and
   identifier; sections follow the document's order.
2. **M-LOAD-1, M-CHECK-2**: Import file; pick a fixture (it opens), then a
   file over 10 MB (refused, code `too_large`).
3. **M-LOAD-2, M-LIST-3**: copy a fixture's text, tap Paste (it opens); copy
   plain text, tap Paste (refused, code `not_json`; the list is unchanged).
4. **M-LIST-2**: swipe a row away; delete another with its Delete button and
   with TalkBack's "Delete this summary" action.
5. **M-SHARE-1**: Share, then save to Files or Drive; the file is named
   `international-patient-summary.json` and is byte-identical to the
   fixture. After returning, `cacheDir/share/` is empty
   (`adb shell run-as io.github.internationalpatientsummary.app ls cache`).
6. **M-PRIV-2**: open a summary, go to the app switcher; no patient data is
   visible (API 33+: system blank snapshot; API 29–32: the cover).
7. **M-PRIV-3, M-ABOUT-1**: About shows the safety note, privacy, IPS 2.0.1
   and the app version; Clear all asks, then empties the list.
8. **M-A11Y-1/2**: with TalkBack, headings are navigable by heading and rows
   read as one announcement; at the largest font size and display size, no
   text is clipped; switch to dark theme.
9. **M-PRIV-4**: `adb logcat --pid=$(adb shell pidof
   io.github.internationalpatientsummary.app)` while opening a summary
   shows no document content.
