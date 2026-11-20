[Specification](index.md) › §9

# 9. Verification

The [mobile parity workflow](../../.github/workflows/mobile-parity.yml) compares
§1–§7 byte for byte and regenerates both apps' language resources from the shared
source. The generated files must match the checkout.

```sh
cd IPSKit && swift test
xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO
xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp \
  -destination 'platform=iOS Simulator,name=iPad Air 13-inch (M4)' CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO
```

The UI tests run on the newest runtime and iPhone (§8.4), and on an iPad.
`testPasteRefusalAndShare` skips itself on iOS 27, where the simulator does
not deliver a UI test's paste to the app; it runs on iOS 26:

```sh
xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.1' CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO \
  -only-testing:IPSAppUITests/IPSAppUITests/testPasteRefusalAndShare
```

| Requirement           | Test                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| M-CHECK-1             | `CheckTests` (each code and pointer, the order, the minimal document)    |
| M-CHECK-2             | `CheckTests.aDocumentOver10MiBIsRefusedBeforeParsing`                    |
| M-READ-1              | `DocumentTests.patientBanner` (Type/id), `anUnresolvedReferenceIsKeptAndMarked` |
| M-READ-2              | `DocumentTests.aSubjectNotInTheBundleStillOpens`                         |
| M-READ-3              | `DocumentTests.sectionsKeepCompositionOrder` (all 16 sections known)     |
| M-LOAD-1              | `DocumentFileTests` (file size, stream boundary, missing file) |
| M-LOAD-3, M-LIST-1    | `DocumentTests.everyExampleOpens`; UI `testTheExamplesOpenAndClear`      |
| M-VIEW-1              | `FormatTests.firstReadableNameInThePreferredCategory`, `datesWriteTheMonthAsText`, `ages`; `DocumentTests.patientBanner`, `bannerScreenAndPDFKeepSourceDatesAndClinicalDecimals`; UI `testTheExamplesOpenAndClear`          |
| M-VIEW-2              | `DocumentTests.documentDetails`                                          |
| M-VIEW-3              | `DocumentTests.sectionsKeepCompositionOrder`, `aMissingRequiredSectionIsListedLast` |
| M-VIEW-4              | `FormatTests.quantities`; `DocumentTests.medicationsResolveTheirMedication`, `observationsHaveAValue`, `bannerScreenAndPDFKeepSourceDatesAndClinicalDecimals` |
| M-VIEW-5              | `DocumentTests.absentStatesFromEmptyReason`, `aMixedAllergyListIsKnown`, `sectionStatesFollowTheViewersOrder`; `FormatTests.absentStates`; UI |
| M-VIEW-6              | `FormatTests.narrativeBecomesPlainText`                                  |
| M-VIEW-7              | `FormatTests.displayPrefersDisplayThenTextThenSystemAndCode`, `statusesAreCodes` |
| M-LOAD-4              | By hand on a simulator: `xcrun simctl openurl <device> file:///path/bundle-minimal.json` opens Martha DeLarosa (cold and warm); a JSON that is not a Bundle shows the `not_a_bundle` alert; nothing is left in `Documents/Inbox` |
| M-LOAD-2, M-LIST-3    | UI `testPasteRefusalAndShare` (plain text refused as `not_json`, list unchanged; an IPS opens) |
| M-SHARE-1             | `DocumentTests.sharingGivesBackTheExactBytes`; UI `testPasteRefusalAndShare` (the sheet names `international-patient-summary`, JSON) |
| M-PRIV-1              | `TemporaryShareTests` (same name for two patients, cancellation, delayed recipient, relaunch cleanup); no networking code or entitlement; UI share tests |
| M-PRIV-3, M-ABOUT-1   | UI `testTheExamplesOpenAndClear`                                         |
| M-A11Y-2              | UI `testTheLargestTextSize`; `testLanguagesAtTheLargestTextSize` (ar, he, de, fi)                                              |
| M-I18N-1              | UI: no ⟦key⟧ on any screen visited                                       |
| M-TAB-1, M-TAB-2      | UI `testTheListSitsBesideTheSummaryOnIPad` (side by side, ⌘E, selection, delete, Clear all); `testRightToLeftOnIPad` |
| M-TAB-3               | `DocumentFileTests` (size before bytes); the drop itself by hand          |
| M-PEOPLE-1            | `PeopleTests.theExamplesAreThreePeople`, `aSharedIdentifierIsTheSamePerson`, `theSameValueInAnotherSystemIsNot`, `theSameNameAndBirthDateIgnoringCaseAccentsAndSpacing`, `aNameWithoutABirthDateIsAPersonOfTheirOwn`, `linksAreTransitive` |
| M-PEOPLE-2            | UI `testFamiliesAndCarers` (headings; Martha's three summaries together)  |
| M-PEOPLE-3            | `PeopleTests.aPersonKeepsTheirRelationshipWhenAnotherSummaryOpens`, `onlyOnePersonIsMe`, `deletingTheSummaryThatHeldTheRelationshipKeepsIt`, `everyRelationshipHasAString`; UI `testFamiliesAndCarers` (heading and banner) |
| M-PEOPLE-4            | `PeopleTests.forgettingSummariesForgetsTheirRelationship`; UI `testFamiliesAndCarers` |
| M-SHARE-2             | UI `testFamiliesAndCarers` (three people: Share asks first); `testPasteRefusalAndShare` (one person: no question) |
| M-PDF-1               | `PDFPlanTests.sectionsFollowThePriorityOrderAfterTheBox`, `paperAndFileName`; `DocumentTests.bannerScreenAndPDFKeepSourceDatesAndClinicalDecimals`; UI `testShareAsPDF` (the sheet names `international-patient-summary-2024-09-13`, PDF) |
| M-PDF-2               | `PDFPlanTests.thePlansShrinkThenCapThenOmitLowestPriorityFirst`, `mustShowEntriesAreNeverTrimmed`, `currentMedicinesAreMustShowAndOthersAreNewestFirst`, `fittingStopsAtTheFirstPlanThatFitsOrRunsOn` |
| M-PDF-3               | `TemporaryShareTests` (isolated PDF/JSON lifetimes and cleanup); UI `testShareAsPDF` (M-SHARE-2's question first, then the sheet) |
| M-STORE-1             | `EncryptedStoreTests.whatIsSavedComesBackAfterARestart`; UI `testSummariesOutlastARelaunch` (the five summaries and a relationship after the app is ended) |
| M-STORE-2             | `EncryptedStoreTests.backupExclusionSurvivesClearingAndReimporting`, `nothingIsReadableOnDisk`, `theSameBytesSealTwiceDiffer`, `oneSummaryCannotStandInForAnother` |
| M-STORE-3             | `EncryptedStoreTests.aDamagedSummaryIsLeftOutAndDeleted`, `aDamagedIndexOrAnotherKeyStartsEmpty`, `withoutTheKeyTheStoreIsDeleted`, `aKeyThatCannotBeReadNowLeavesTheStoreAlone`, `aFileThatCannotBeReadNowLeavesTheStoreAlone` |
| M-STORE-4             | `EncryptedStoreTests.deletingASummaryDeletesItsFile`, `clearAllDeletesEveryFileAndTheKey`; UI `testSummariesOutlastARelaunch` (empty after Clear all) |
| M-STORE-5             | `EncryptedStoreTests.aFailedSummaryWriteRetriesTheExactDocumentsAfterRestart`, `aFailedIndexWriteRetriesTheExactRelationshipAfterRestart`, `aFileThatCannotBeReadNowLeavesTheStoreAlone`; `PeopleTests.reopeningPutsSummariesOpenedWhileUnavailableAboveSavedOnes`; `CatalogTests` (localized message and Try again) |

Manual, before a release: the PDF of every example opened and read
(`pdfinfo`, `pdftotext`; Patricia JORDANA's fits one page with four sections
trimmed), and one in Arabic; M-STORE-1 after restarting a device (Settings ›
General › Shut Down, or `xcrun simctl shutdown` and `boot`), and with the
device locked while the app launches in the background (the store is left
alone); M-LOAD-1 (import a fixture from Files, and an
11 MB file); M-LIST-2
(swipe, and VoiceOver's Delete action); M-PRIV-2 (the app switcher shows the
cover); M-A11Y-1 (VoiceOver reads headings and rows, and a person's
heading and its Options button); dark appearance; M-TAB-2 ⌘⌫ on a hardware
keyboard; M-TAB-3 a drop from Files; M-TAB-1 and M-TAB-4 on an iPhone Duo
(folded: one screen at a time; unfolded: side by side; fold and unfold
with a summary open and a relationship set, and both stay), on a device
or, once one can be downloaded, a simulator runtime that runs it (§8.4).
