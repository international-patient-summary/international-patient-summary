[Specification](index.md) › §8

# 8. iOS

## 8.1 Stack

| Concern       | Choice                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Language      | Swift 6 language mode, strict concurrency; Xcode 27.2 (Swift 6.4)        |
| Interface     | UIKit, built in code: no storyboards, no SwiftUI                         |
| Deployment    | iOS 18.0 and later (current iOS 27 minus two majors), iPhone (including the folding iPhone Duo) and iPad |
| Core          | `IPSKit`, a local Swift package: Foundation, and CryptoKit for the store; no UIKit |
| Tests         | Swift Testing for `IPSKit` (`swift test`); XCUITest for the app          |
| Dependencies  | None outside Apple's SDKs                                                |
| Strings       | `App/Localizable.xcstrings`: English and 65 localizations (M-I18N-2), state `needs_review`; `App/InfoPlist.xcstrings` names the app on the home screen in each; `knownRegions` lists them |

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
    DocumentFile.swift     readDocumentFile: size first, then bytes (Import and drop)
    People.swift           M-PEOPLE-1, M-PEOPLE-3: people(_:), Person, Relationship, Relationships
    EncryptedStore.swift   M-STORE-1..4: sealed summary files and index, StoreKeys
    PDFPlan.swift          M-PDF-1/2: sections in priority order, the plans tried, fit(_:pageCount:)
  Tests/IPSKitTests/       Swift Testing suites + the five fixtures
App/                       the UIKit app (file-system-synchronized group)
  AppDelegate.swift        @main; scene configuration in code; removes share files
  SceneDelegate.swift      window, navigation, M-PRIV-2 privacy cover
  SummaryStore.swift       the open summaries, saved to the encrypted store (M-STORE-1), Examples, ShareFile
  KeychainKeys.swift       M-STORE-2: the store's key in the Keychain, this device only
  SplitViewController.swift         M-TAB-1, M-TAB-4: the list beside the open summary; ⌘O ⌘V ⌘E (M-TAB-2)
  SummaryListViewController.swift   §4.1, grouped by person (M-PEOPLE-2..4); ⌘⌫ and the drop delegate (M-TAB-2, M-TAB-3)
  SummaryViewController.swift       §4.2, M-SHARE-1 (Share: the file or a PDF)
  SummaryPDF.swift         M-PDF-1..3: measures and draws the PDF (UIGraphicsPDFRenderer, system fonts)
  AboutViewController.swift         §4.3, M-PRIV-3
  L10n.swift               string lookup; a missing key shows as ⟦key⟧
  Localizable.xcstrings    every interface string
  InfoPlist.xcstrings      the home-screen name in every language (generated)
  PrivacyInfo.xcprivacy    no tracking, no collected data, no required-reason APIs
  Assets.xcassets          AppIcon (1024 px, drawn by bin/draw-app-icon.swift), AccentColor #0B5CAD
  Examples/                the five IG examples (M-LOAD-3)
UITests/                   XCUITest end-to-end tests
IPSApp-Info.plist          merged into the generated Info.plist: document types (M-LOAD-4)
IPSApp.xcodeproj           project (objectVersion 77, synchronized folders)
```

## 8.3 Platform notes

- **Import** (M-LOAD-1): `UIDocumentPickerViewController` for `UTType.json`,
  as a copy; the size is checked from the file's metadata before reading,
  and the copy is deleted once read.
- **Open in** (M-LOAD-4): `IPSApp-Info.plist` (outside the synchronized
  `App/` folder, so it is not copied as a resource) declares a viewer
  document type, rank Alternate, for `public.json` and an imported UTI
  `org.hl7.fhir.json` (`application/fhir+json`, conforming to
  `public.json`), with `LSSupportsOpeningDocumentsInPlace` false. The scene
  delegate takes the URL from `connectionOptions.urlContexts` at launch and
  from `scene(_:openURLContexts:)` while running, dismisses anything
  presented, and hands it to the list's `openIncoming`, which reads it with
  `readDocumentFile` (size first) and then deletes the copy iOS placed in
  `Documents/Inbox`.
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
- **iPhone Duo** (M-TAB-1, M-TAB-4): the folding iPhone (`iPhone19,4`, iOS
  27.1 and later) has an outer screen of 466 × 678 points and an inner one
  of 669 × 951 points. The app chooses its layout by the window, never by
  the device: `UISplitViewController` collapses to one stack on the outer
  screen and stands beside the list on the inner one, as on an iPhone and
  an iPad. Nothing of a summary lives in the window: the store, the
  relationships and `SplitViewController.shownID` stay while the scene
  changes screen or size, and `topColumnForCollapsingToProposedTopColumn`
  keeps the open summary on top when the split view collapses. How iOS
  moves a scene between the Duo's screens is not yet checked (§9). The UI tests choose the phone or side-by-side flow by what
  the app shows, so each runs on whichever layout the Duo is in. Its
  screens are switched with `xcrun simctl io <device> screenConfig
  --display=<primary|primary-1> power <on|off>`.
- **People** (M-PEOPLE-2..4): each person is a table section; the heading
  (`PersonHeaderView`) reads as one header element, and its
  `ellipsis.circle` button opens a menu with the relationship, as a
  single-selection submenu, and Forget this person. The summary screen
  rebuilds its banner when the store changes, so a new relationship shows
  at once.

- **PDF** (M-PDF-1..3): `PDFLayout` (IPSKit) prepares the sections and
  lists the plans; `SummaryPDF` turns a plan into unbreakable blocks
  (`NSAttributedString`, system fonts, which fall back for every script),
  counts the pages they fill by measuring each with `boundingRect`, lets
  `PDFLayout.fit` pick the first plan that fits, then draws it with
  `UIGraphicsPDFRenderer`: Letter (612 × 792 pt) when the app's language is
  English and the region is the US, A4 otherwise; 28 pt sides; the alerts
  box in #b42318 as the web viewer; the footer at 7 pt; right to left for
  Arabic, Hebrew, Persian and Urdu. The document info's title is the file
  name. The file goes in `tmp/share/` like the JSON, written with complete
  protection, and is removed when the sheet closes and at launch.
- **Encrypted store** (M-STORE-1..4): `EncryptedStore` (IPSKit) keeps
  `Application Support/Store/` with one `<UUID>.sealed` file per summary and
  `index.sealed` (JSON: the summaries newest first, with their
  relationships). Each is a CryptoKit `AES.GCM` combined box (nonce,
  ciphertext, tag) with a fresh nonce, and its role (`summary:<UUID>` or
  `index`) as associated data, so a file cannot stand in for another. The
  key is 256 random bits in a generic-password Keychain item
  (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, data-protection
  keychain). Files are written atomically with `.completeFileProtection`,
  and the store applies `isExcludedFromBackup` when loading an existing
  store and before writing to a new or existing directory. `SummaryStore` loads at
  launch and saves after every change, on the main actor; a summary's file
  is written once, the index each time. If the key exists but cannot be
  read (the device is locked), the store is not touched and nothing is
  written. Keychain items outlast deleting the app; a reinstall finds no
  index and deletes the store. The UI tests pass `-startEmpty`, which
  clears the store at launch, and sign the app ad hoc
  (`CODE_SIGN_IDENTITY=-`), because an unsigned app cannot keep a Keychain
  item.

## 8.4 Screenshots

The README's screenshots, and any taken for review, use the newest iOS
simulator runtime Xcode offers and the newest iPhone that runtime runs:
today iOS 27.2 and the iPhone 18 Pro Max (`iPhone19,3`). Tablet
screenshots use the newest iPad Air on the same runtime (today the iPad
Air 13-inch (M4)). When Xcode offers a newer runtime or iPhone, the
screenshots are taken again on it. They are the UI tests' attachments
(`xcresulttool export attachments`), except a landscape iPad, which comes
from `xcrun simctl io <device> screenshot` while the test runs, because
XCUITest's landscape capture is clipped. They show only the five published,
fictional examples.

The iPhone Duo is the newest iPhone by model number, but no simulator
runtime that runs it can be downloaded yet (Xcode 27.2's device profile
needs runtime 24B8118; 24B8117 is offered, and refuses it). Until one can,
the Duo is checked by hand (§9), and its screenshots wait.

