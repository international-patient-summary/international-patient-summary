[Specification](index.md) › §9

# 9. Verification

The [mobile parity workflow](../../.github/workflows/mobile-parity.yml) compares
§1–§7 byte for byte and regenerates both apps' language resources from the shared
source. The generated files must match the checkout.

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug

# on a running emulator or a phone (for example the Pixel_10_API_37 AVD)
./gradlew :app:connectedDebugAndroidTest
```

Wait for the emulator to finish booting before running the instrumented
suite. Verify the new XML report under
`app/build/outputs/androidTest-results/connected/debug/` lists the smoke
test and all three PDF tests with zero failures, errors or skips. Gradle
can report a successful build after the APK installer reports that the
device is still booting.

JVM tests are in `app/src/test/kotlin/io/github/internationalpatientsummary/app/`.
The instrumented test, `SmokeTest` in `app/src/androidTest/kotlin/io/github/internationalpatientsummary/app/`,
drives the real app with Compose UI Test: from an empty store (it deletes
the store's files before the activity starts), Load examples, three person
headings and five summaries, open Martha DeLarosa's newest, the banner and the
high-criticality alert, Share → Share as PDF through the "Share the summary
of" question (the PDF is written to `cacheDir/share/`, the share sheet
opens, and when Back closes it the file is gone), then About, Clear all and
the empty state. It is manual check 1 and part of 7, 10 and 14, without a
person. `OnePagePdfTest`, beside it, makes the PDF of every example in US
English, British English and Arabic with the platform's tools, and two
crafted summaries (one trimmed to a page, one whose current medicines run
on to three pages, each marked CONTINUED); with
`-Pandroid.testInstrumentationRunnerArguments.pdfOut=1` (or `am instrument
-e pdfOut 1`) it also writes them to `cacheDir/share/` to look at.

| Requirement           | Test                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| M-CHECK-1             | `ips.CheckTest` (each code with a minimal failing document, `not_json`, the order, `codesAndPointersMatchTheService`) |
| M-CHECK-2             | `ips.CheckTest.refusesTooLargeBeforeParsing`                             |
| M-READ-1              | `ips.BundleIndexTest`; `ips.SummaryReaderTest.resolvesByFullUrlAndByTypeAndId`, `anUnresolvedReferenceIsShownNotDropped` |
| M-READ-2              | `ips.SummaryReaderTest.anUnresolvedSubjectStillOpens`                    |
| M-READ-3              | `ips.SummaryReaderTest.sectionsFollowCompositionOrder` (all 16 sections known), `aSectionWithAnotherCodeIsGeneric` |
| M-LOAD-4              | `IncomingTest` (VIEW, SEND stream before text, `content:` only, not from Recents); `DocumentFilesTest` (refused by stated size without opening, and while read); `ManifestTest.theAppOpensJsonFilesFromOtherAppsOnly` (exactly the two JSON types, source and merged), `oneActivityHoldsTheStore`; manual 13 |
| M-LOAD-1, M-TAB-3     | `DocumentFilesTest` (reported size, exact limit and bounded stream read) |
| M-LOAD-3              | `ips.SummaryReaderTest.everyExampleIsAcceptedWithItsPatient`; `ManifestTest.theExamplesShipInTheApp`; `SmokeTest.loadOpenAndClearAll` (the button loads all five) |
| M-LIST-1              | `SummaryStoreTest.newestFirstAndClearAll`; `SmokeTest.loadOpenAndClearAll` (five rows) |
| M-VIEW-1              | `ips.FormatTest.firstReadableNameInThePreferredCategory`; `ips.SummaryReaderTest.readsPatientAndDocumentDetails`, `theBannerAlertListsHighCriticalityAllergies`; `ips.FormatTest.agesAreWholeYearsAndNeverGuessed`; `SmokeTest.loadOpenAndClearAll` (banner name and alert on screen) |
| M-VIEW-2              | `ips.SummaryReaderTest.readsPatientAndDocumentDetails`                   |
| M-VIEW-3              | `ips.SummaryReaderTest.sectionsFollowCompositionOrder`, `missingRequiredSectionsComeLast` |
| M-VIEW-4              | `ips.SummaryReaderTest.entriesCarryTheirDetails`; `ips.FormatTest.quantitiesAreWrittenAsGiven` |
| M-VIEW-5              | `ips.SummaryReaderTest.noInfoSectionsAreUnavailable`, `emptyReasonsAndAbsentCodesMapToTheirStates` |
| M-VIEW-6              | `ips.FormatTest.narrativeBecomesPlainText`; `ips.SummaryReaderTest.narrativeWithoutEntriesIsKept` |
| M-VIEW-7              | `ips.FormatTest.displayPrefersCodingDisplayThenTextThenSystemAndCode`, `statusIsAWordNotAUri`, `systemLabels` |
| M-TAB-4               | `AppViewModelTest.theOpenSummaryOutlivesARecreatedActivity` (summaries, relationships and the open summary are `AppViewModel` state); manual (fold) |
| M-PEOPLE-1            | `ips.PeopleTest` (`theThreeMarthaDeLarosaExamplesAreOnePerson`, `nameAndBirthDateMatchIgnoringCaseAccentsAndSpacing`, `theLinkIsTransitive`, `anIdentifierNeedsTheSameSystemAndValue`, `withoutAnIdentifierANameAndABirthDateAreBothNeeded`, `aSummaryWithoutAPatientIsAPersonOfItsOwn`, `groupsKeepTheOrderGiven`) |
| M-PEOPLE-2            | `SummaryStoreTest.peopleAreInTheOrderOfTheirNewestSummary`; `SmokeTest.loadOpenAndClearAll` (three headings, Martha's three rows); manual (TalkBack) |
| M-PEOPLE-3            | `SummaryStoreTest.aRelationshipIsKeptWhenASummaryJoinsAndGoesWithTheLast`, `onlyOnePersonIsMe`; manual (menu, banner) |
| M-PEOPLE-4            | `SummaryStoreTest.forgetAPersonForgetsTheirSummariesAndRelationshipOnly`; manual |
| M-SHARE-1             | `ips.SummaryReaderTest.keepsTheExactBytes`; `SmokeTest.loadOpenAndClearAll` (the menu offers the file and the PDF); manual |
| M-SHARE-2             | `SmokeTest.loadOpenAndClearAll` (asked first with three people); manual (`AppViewModel.shareAsksFirst` is more than one person) |
| M-PDF-1               | `ips.OnePageTest` (`sectionsAreInPdfPriorityOrderOutsideTheBox`, `priorityIsTheWebViewers`, `theBoxHasTheAlertsSectionThenAllergiesThenTheMissingNotice`, `everyFixtureHasAPage`, `paperIsLetterOnlyForUsEnglish`, `fileNameHasTheDocumentDateOnly`, `titleIsAddedAsAnIncrementalUpdate`); `OnePagePdfTest.everyExampleIsOnePageWithItsTitle`; manual 14 |
| M-PDF-2               | `ips.OnePageTest` (`plansAreTriedInTheWebViewersOrder`, `currentMedicationsAreMustShowAndTheRestMostRecentFirst`, `currentMedicationsAreNeverTrimmedAndTheSectionNeverReplaced`, `trimmedAndReplacedSectionsAreNamedOnTheNotShownLine`, `fitTakesTheFirstPlanOnOnePage`, `whatNeverTrimsRunsToASecondPageMarkedContinued`, `absentSectionsAreNotTrimmable`); `OnePagePdfTest.aLongSummaryIsTrimmedToOnePage`, `tooManyCurrentMedicinesRunToASecondPage` |
| M-PDF-3               | `SmokeTest.loadOpenAndClearAll` (written to `cacheDir/share/`, gone when the sheet closes); manual 14 |
| M-PRIV-1              | `ManifestTest` (source and merged manifest: no network permission, no backup; `theBackupRulesExcludeEveryDomain`; `theTestApkAsksForNoNetworkEither`); summaries and relationships are written only by `EncryptedStore`; Share sends `Summary.bytes` only |
| M-PRIV-3              | `SummaryStoreTest.newestFirstAndClearAll`, `clearAllForgetsEveryRelationship`; `SmokeTest.loadOpenAndClearAll` (About, confirm, empty state); manual |
| M-STORE-1             | `EncryptedStoreTest.aRoundTripKeepsOrderIdsRelationshipsAndBytes`, `nothingSavedLoadsEmpty`; manual 12 |
| M-STORE-2             | `EncryptedStoreTest.theFilesHoldNoPlaintext`, `eachWriteHasAFreshNonce`, `aSwappedSummaryFileIsDropped`; `ManifestTest.theBackupRulesExcludeEveryDomain`; manual 12 (`run-as` shows no plaintext) |
| M-STORE-3             | `EncryptedStoreTest.aTamperedSummaryIsDroppedAndDeleted`, `aSummaryThatNoLongerPassesTheCheckIsDropped`, `aCorruptIndexStartsEmptyWithoutACrash`, `anIndexThatIsNotAnIndexStartsEmpty`, `aWrongKeyDeletesTheStore`, `aMissingKeyDeletesTheStore`, `leftoversFromAStoppedWriteAreRemoved` |
| M-STORE-4             | `EncryptedStoreTest.deleteForgetAndClearRemoveFiles` (and the key on Clear all); manual 12 |
| M-I18N-1              | `lintDebug` (`HardcodedText`, `SetTextI18n`; warnings are errors)        |
| Robustness            | `ips.SummaryReaderTest.wrongJsonTypesReadAsAbsent`                       |

Manual, before a release, on an emulator or phone (`./gradlew
:app:installDebug`, for example on the `Pixel_6_Pro_API_33` AVD):

1. **M-LOAD-3, M-LIST-1, M-VIEW-1..6**: Load examples; five rows appear
   under three people, newest first, each with a name, a title and a date with the month as
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
10. **M-PEOPLE-1..4, M-SHARE-2**: Load examples; three headings appear,
   Martha DeLarosa with three summaries, then Patricia JORDANA and James
   Judge (by newest summary). With TalkBack each heading is a heading and
   its button reads "Options for" and the name. Choose My parent for
   Martha: it shows in the heading and in each of her summaries' banners.
   Choose Me for Martha, then Me for James: Martha is Not set again. Share
   one of her summaries: the app asks "Share the summary of Martha
   DeLarosa?" first; Cancel sends nothing. Forget this person on Martha,
   confirm: her three summaries go, and an open one of hers empties the
   detail pane. With one person's summaries open, Share opens the sheet at
   once.
11. **M-TAB-4**: on a foldable emulator (or `adb shell wm size` to switch
   between a narrow and an 840 dp+ width), open a summary, give its person
   a relationship, and fold and unfold: every summary, the relationship and
   the open summary stay; the layout follows the width (M-TAB-1).
12. **M-STORE-1..4**: Load examples and give Martha a relationship. Force
   stop the app (`adb shell am force-stop
   io.github.internationalpatientsummary.app`) and open it again: the same
   summaries in the same order, with the relationship, and the list (not a
   summary) shows. Restart the phone (`adb reboot`): the same again.
   `adb shell run-as io.github.internationalpatientsummary.app ls -R
   no_backup` lists `store/index.bin` and `store/summaries/<id>.bin`, and
   `run-as ... cat no_backup/store/summaries/1.bin | grep -c DeLarosa`
   finds nothing. Delete a summary: its file goes. Clear all, open the app
   again: the list is empty and `no_backup/store` is gone. Settings > Apps >
   the app > Storage > Clear storage: the list is empty at the next launch.
13. **M-LOAD-4, M-CHECK-2, M-LIST-3**: push a fixture and a non-IPS JSON file
   to `/sdcard/Download`, then open each through the Downloads provider with
   the app closed and again while it runs: `adb shell am start -a
   android.intent.action.VIEW -t application/json -d
   content://media/external/downloads/<id>` (the id from `adb shell content
   query --uri content://media/external/downloads --projection _id:_display_name`).
   For SEND, use the Files app's share sheet, not `am start --eu
   android.intent.extra.STREAM`: `am` does not put the stream in ClipData, so
   no read permission is granted and the app says the file could not be
   read. The fixture opens and is in the list
   after a force stop; the other shows the refusal alert with its code and
   the list is unchanged. Rotate: nothing opens twice. In Files, long-press
   a `.json` and Share, or Open with: the app is offered; for a photo it is
   not. In the app, Share a summary: the app is not in its own sheet.
14. **M-PDF-1..3**: open Patricia JORDANA's summary and Share → Share as
   PDF; save it to Files (or Drive) from the sheet. The file is named
   `international-patient-summary-2024-09-13.pdf`; on a Mac, `pdfinfo` shows
   one page, A4 (Letter with the app in English (United States)), and that
   name as the Title; `pdftotext` shows the header, the box headed "Alerts
   and allergies", the sections in the M-PDF-1 order and the footer with
   "Page 1 of 1". After returning, `cacheDir/share/` is empty. Set the app
   to Arabic (Settings > Apps > the app > Language, or `adb shell cmd locale
   set-app-locales io.github.internationalpatientsummary.app --locales ar`)
   and share again: every line starts on the right, and the English
   clinical text and dates read in order.
