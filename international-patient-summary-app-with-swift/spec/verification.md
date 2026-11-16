[Specification](index.md) › §9

# 9. Verification

```sh
cd IPSKit && swift test
xcodebuild test -project IPSApp.xcodeproj -scheme IPSApp \
  -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO
```

| Requirement           | Test                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| M-CHECK-1             | `CheckTests` (each code and pointer, the order, the minimal document)    |
| M-CHECK-2             | `CheckTests.aDocumentOver10MiBIsRefusedBeforeParsing`                    |
| M-READ-1              | `DocumentTests.patientBanner` (Type/id), `anUnresolvedReferenceIsKeptAndMarked` |
| M-READ-2              | `DocumentTests.aSubjectNotInTheBundleStillOpens`                         |
| M-READ-3              | `DocumentTests.sectionsKeepCompositionOrder` (all 16 sections known)     |
| M-LOAD-3, M-LIST-1    | `DocumentTests.everyExampleOpens`; UI `testTheExamplesOpenAndClear`      |
| M-VIEW-1              | `DocumentTests.patientBanner`; UI `testTheExamplesOpenAndClear`          |
| M-VIEW-2              | `DocumentTests.documentDetails`                                          |
| M-VIEW-3              | `DocumentTests.sectionsKeepCompositionOrder`, `aMissingRequiredSectionIsListedLast` |
| M-VIEW-4              | `DocumentTests.medicationsResolveTheirMedication`, `observationsHaveAValue` |
| M-VIEW-5              | `DocumentTests.absentStatesFromEmptyReason`, `aMixedAllergyListIsKnown`, `sectionStatesFollowTheViewersOrder`; `FormatTests.absentStates`; UI |
| M-VIEW-6              | `FormatTests.narrativeBecomesPlainText`                                  |
| M-VIEW-7              | `FormatTests.displayPrefersDisplayThenTextThenSystemAndCode`, `statusesAreCodes` |
| M-SHARE-1             | `DocumentTests.sharingGivesBackTheExactBytes`; manual: Share, then Save to Files |
| M-PRIV-3, M-ABOUT-1   | UI `testTheExamplesOpenAndClear`                                         |
| M-A11Y-2              | UI `testTheLargestTextSize`                                              |
| M-I18N-1              | UI: no ⟦key⟧ on any screen visited                                       |

Manual, before a release: M-LOAD-1 (import a fixture from Files, and an
11 MB file); M-LOAD-2 (paste a fixture's text, and plain text); M-LIST-2
(swipe, and VoiceOver's Delete action); M-PRIV-2 (the app switcher shows the
cover); M-A11Y-1 (VoiceOver reads headings and rows); dark appearance.
