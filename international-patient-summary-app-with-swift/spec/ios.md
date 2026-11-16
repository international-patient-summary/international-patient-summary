[Specification](index.md) › §8

# 8. iOS

## 8.1 Stack

| Concern       | Choice                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Language      | Swift 6 language mode, strict concurrency; Xcode 27.2 (Swift 6.4)        |
| Interface     | UIKit, built in code: no storyboards, no SwiftUI                         |
| Deployment    | iOS 18.0 and later (current iOS 27 minus two majors), iPhone and iPad    |
| Core          | `IPSKit`, a local Swift package: Foundation only, no UIKit               |
| Tests         | Swift Testing for `IPSKit` (`swift test`); XCUITest for the app          |
| Dependencies  | None outside Apple's SDKs                                                |
| Strings       | `App/Localizable.xcstrings` (English)                                    |

The app target uses `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`; `IPSKit`
types are `Sendable` values. Warnings are errors.

## 8.2 Architecture

```text
IPSKit/                    Swift package, no UIKit (spec §3, §4.2 readers)
  Sources/IPSKit/
    JSON.swift             JSON value type
    Check.swift            M-CHECK-1/2: Refusal codes and pointers, check(_:)
    Document.swift         M-READ-1/2, M-VIEW-1..6: Document, Section, Entry
    Sections.swift         M-READ-3: SectionKey registry
    Absent.swift           M-VIEW-5: SectionState rules
    Format.swift           M-VIEW-7: displayOf, names, dates, ages, quantities, narrative
  Tests/IPSKitTests/       Swift Testing suites + the five fixtures
App/                       the UIKit app (file-system-synchronized group)
  AppDelegate.swift        @main; scene configuration in code; removes share files
  SceneDelegate.swift      window, navigation, M-PRIV-2 privacy cover
  SummaryStore.swift       in-memory store (M-PRIV-1), Examples, ShareFile
  SummaryListViewController.swift   §4.1
  SummaryViewController.swift       §4.2, M-SHARE-1
  AboutViewController.swift         §4.3, M-PRIV-3
  L10n.swift               string lookup; a missing key shows as ⟦key⟧
  Localizable.xcstrings    every interface string
  PrivacyInfo.xcprivacy    no tracking, no collected data, no required-reason APIs
  Examples/                the five IG examples (M-LOAD-3)
UITests/                   XCUITest end-to-end tests
IPSApp.xcodeproj           project (objectVersion 77, synchronized folders)
```

## 8.3 Platform notes

- **Import** (M-LOAD-1): `UIDocumentPickerViewController` for `UTType.json`,
  as a copy; the size is checked from the file's metadata before reading,
  and the copy is deleted once read.
- **Paste** (M-LOAD-2): `UIPasteboard.general.string`, on tap only; iOS asks
  the person to allow it.
- **Share** (M-SHARE-1): a file in `tmp/share/`, written with complete file
  protection, handed to `UIActivityViewController`, and removed when the
  sheet closes and at every launch. iOS types files by UTI, so the file is
  `public.json` by its extension; its contents are FHIR JSON.
- **Privacy cover** (M-PRIV-2): a plain view with the app's name covers the
  window from `sceneWillResignActive` to `sceneDidBecomeActive`.
- **Network** (M-PRIV-1): the app links no networking code and declares no
  network use; `PrivacyInfo.xcprivacy` declares no tracking and no data
  collection.
- **Accessibility** (M-A11Y-1/2): section headings carry the header trait;
  rows are `UIListContentConfiguration` cells, which follow Dynamic Type; a
  list row has a VoiceOver "Delete" custom action as well as the swipe.
