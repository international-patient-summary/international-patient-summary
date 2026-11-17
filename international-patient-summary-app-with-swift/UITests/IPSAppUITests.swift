import XCTest

/// The app end to end on a simulator: load the examples, read one, clear all.
/// M-LOAD-3, M-LIST-1, M-VIEW-1, M-VIEW-3, M-VIEW-5, M-PRIV-3, M-I18N-1.
@MainActor
final class IPSAppUITests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    /// The app, starting with an empty store; `testSummariesOutlastARelaunch` keeps it.
    static func app(empty: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        if empty { app.launchArguments.append("-startEmpty") }
        return app
    }

    /// No interface string is missing from the catalog (L10n shows a missing key as ⟦key⟧).
    private func assertNoMissingStrings(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let missing = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "⟦"))
        XCTAssertEqual(missing.count, 0, "a string is missing from Localizable.xcstrings", file: file, line: line)
    }

    /// Whether the list sits beside the summary (M-TAB-1): an iPad, an unfolded
    /// iPhone Duo, a wide window. Decided by what the app shows, not by the device.
    private func isSideBySide(_ app: XCUIApplication) -> Bool {
        app.staticTexts["Open a summary"].waitForExistence(timeout: 5)
    }

    /// Any element whose label contains `text` (a person's heading reads as one element).
    private func labelled(_ app: XCUIApplication, containing text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    /// Tap the one of these that is on screen (a table can keep an off-screen copy of a header).
    private func tapVisible(_ app: XCUIApplication, _ label: String, file: StaticString = #filePath, line: UInt = #line) {
        let matches = app.buttons.matching(NSPredicate(format: "label == %@", label))
        XCTAssertTrue(matches.firstMatch.waitForExistence(timeout: 5), label, file: file, line: line)
        let visible = matches.allElementsBoundByIndex.first { $0.isHittable } ?? matches.firstMatch
        visible.tap()
    }

    /// A screenshot kept with the test results, for review (`xcresulttool export attachments`).
    private func screenshot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// The phone flow, a stack with Back; the side-by-side flow is tested below.
    func testTheExamplesOpenAndClear() throws {
        let app = Self.app()
        app.launch()
        if isSideBySide(app) { throw XCTSkip("one screen at a time only") }

        // Empty state: the three ways to open a summary.
        XCTAssertTrue(app.staticTexts["No summaries open"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["list.import"].exists)
        XCTAssertTrue(app.buttons["list.paste"].exists)
        assertNoMissingStrings(app)
        screenshot(app, "1-empty")
        app.buttons["list.examples"].tap()

        // M-LIST-1: five summaries, each named by its patient.
        let table = app.tables.firstMatch
        XCTAssertTrue(table.cells.element(boundBy: 4).waitForExistence(timeout: 5))
        XCTAssertEqual(table.cells.count, 5)
        XCTAssertTrue(table.staticTexts["James Judge"].exists)
        assertNoMissingStrings(app)
        screenshot(app, "2-list")

        // M-VIEW-1: the high-criticality allergy comes first, in words.
        table.cells.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Martha DeLarosa"].waitForExistence(timeout: 5))
        let alert = app.staticTexts.containing(
            NSPredicate(format: "label BEGINSWITH %@", "Allergy, high criticality:")
        ).firstMatch
        XCTAssertTrue(alert.exists)
        XCTAssertTrue(app.buttons["share"].exists)
        assertNoMissingStrings(app)
        screenshot(app, "3-summary")
        app.swipeUp()
        screenshot(app, "4-sections")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // M-VIEW-5: "Information unavailable" for withheld required sections.
        table.staticTexts["James Judge"].tap()
        XCTAssertTrue(
            app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Information unavailable"))
                .firstMatch.waitForExistence(timeout: 5))
        screenshot(app, "5-unavailable")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // M-PRIV-3: Clear all, after confirming.
        app.buttons["about"].tap()
        XCTAssertTrue(
            app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "This app is not a medical device."))
                .firstMatch.waitForExistence(timeout: 5))
        let clear = app.cells["clearAll"]
        while !clear.isHittable { app.swipeUp() }
        clear.tap()
        app.alerts.buttons["Clear all"].tap()
        XCTAssertTrue(app.staticTexts["No summaries open"].waitForExistence(timeout: 5))
    }

    /// M-TAB-1/2: on iPad the list stays beside the open summary, the keyboard works, and Clear all empties both.
    func testTheListSitsBesideTheSummaryOnIPad() throws {
        if UIDevice.current.userInterfaceIdiom == .pad { XCUIDevice.shared.orientation = .landscapeLeft }
        let app = Self.app()
        app.launch()
        guard isSideBySide(app) else { throw XCTSkip("side by side only") }
        // M-TAB-2: ⌘E loads the examples, as the button does.
        app.typeKey("e", modifierFlags: .command)
        let table = app.tables["summaries"]
        XCTAssertTrue(table.cells.element(boundBy: 4).waitForExistence(timeout: 5))

        // Two examples are Martha's; the newest, the IG's Bundle-01, is first.
        table.cells.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Martha DeLarosa"].waitForExistence(timeout: 5))
        XCTAssertTrue(table.staticTexts["James Judge"].exists, "the list is still beside the summary")
        XCTAssertTrue(table.cells.element(boundBy: 0).isSelected, "the open summary's row is selected")
        assertNoMissingStrings(app)
        screenshot(app, "ipad-1-beside")

        // Another row replaces the summary; the list does not move.
        table.staticTexts["James Judge"].tap()
        XCTAssertTrue(app.navigationBars["James Judge"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars["Martha DeLarosa"].exists)

        // M-TAB-1: deleting the open summary empties its side. (⌘⌫ does the same on a
        // hardware keyboard, but the simulator does not deliver it to the app: tasks P9-T2.)
        table.cells.containing(.staticText, identifier: "James Judge").firstMatch.swipeLeft()
        table.buttons["Delete"].tap()
        XCTAssertTrue(table.staticTexts["James Judge"].waitForNonExistence(timeout: 5))
        XCTAssertEqual(table.cells.count, 4)
        XCTAssertTrue(app.staticTexts["Open a summary"].waitForExistence(timeout: 5))
        table.cells.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Martha DeLarosa"].waitForExistence(timeout: 5))

        // M-PRIV-3: Clear all leaves no summary in either column.
        app.buttons["about"].tap()
        let clear = app.cells["clearAll"]
        XCTAssertTrue(clear.waitForExistence(timeout: 5))
        while !clear.isHittable { app.swipeUp() }
        clear.tap()
        app.alerts.buttons["Clear all"].tap()
        XCTAssertTrue(app.staticTexts["No summaries open"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Martha DeLarosa"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Open a summary"].exists)
        screenshot(app, "ipad-2-cleared")
    }

    /// M-TAB-1, M-I18N-2: the iPad layout in Arabic, right to left, in both orientations.
    /// Screenshots are kept for review; no string is missing.
    func testRightToLeftOnIPad() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else { throw XCTSkip("iPad only") }
        let app = Self.app()
        app.launchArguments += ["-AppleLanguages", "(ar)", "-AppleLocale", "ar"]
        for orientation in [UIDeviceOrientation.landscapeLeft, .portrait] {
            XCUIDevice.shared.orientation = orientation
            app.launch()
            let table = app.tables["summaries"]
            XCTAssertTrue(app.buttons["list.examples"].waitForExistence(timeout: 10))
            app.buttons["list.examples"].tap()
            XCTAssertTrue(table.cells.element(boundBy: 4).waitForExistence(timeout: 5))
            table.cells.element(boundBy: 0).tap()
            XCTAssertTrue(app.buttons["share"].waitForExistence(timeout: 5))
            // Right to left: the list is on the right, the summary on the left.
            XCTAssertGreaterThan(table.frame.midX, app.buttons["share"].frame.midX)
            assertNoMissingStrings(app)
            screenshot(app, "ipad-ar-\(orientation == .portrait ? "portrait" : "landscape")")
            app.terminate()
        }
    }

    /// M-A11Y-2: at the largest accessibility text size, the alert and banner still read in full.
    func testTheLargestTextSize() {
        let app = Self.app()
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.buttons["list.examples"].waitForExistence(timeout: 10))
        // At this size the empty state's buttons can be below the fold, so use the + menu,
        // which is always on screen.
        app.buttons["open"].tap()
        tapVisible(app, "Load examples")
        let first = app.tables["summaries"].cells.element(boundBy: 0)
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        first.tap()
        let alert = app.staticTexts["Allergy, high criticality: Substance with penicillin structure (substance)"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.isHittable, "the alert is on screen first, not clipped")
        screenshot(app, "6-largest-text")
    }

    /// Allows iOS's "paste from another app" prompt, which belongs to SpringBoard.
    private func allowPaste() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.alerts.buttons["Allow Paste"]
        if allow.waitForExistence(timeout: 3) { allow.tap() }
    }

    /// M-LOAD-2, M-LIST-3, M-SHARE-1: paste text that is not JSON (refused, list unchanged),
    /// then an IPS (opened), and share it as a file named for no one. Slow (about three
    /// minutes): each write to the simulator's pasteboard from the test runner takes ~80 s.
    func testPasteRefusalAndShare() throws {
        // On the iOS 27.2 simulator the paste never reaches the app from a UI test (no
        // prompt, no alert; tasks P11-T4), so this runs on iOS 26: `name=iPhone 17,OS=26.1`.
        if #available(iOS 27, *) { throw XCTSkip("runs on iOS 26; see tasks P11-T4") }
        let app = Self.app()
        app.launch()
        XCTAssertTrue(app.buttons["list.paste"].waitForExistence(timeout: 10))

        UIPasteboard.general.string = "resourceType: Bundle"
        app.buttons["list.paste"].tap()
        allowPaste()
        let refusal = app.alerts.firstMatch
        XCTAssertTrue(refusal.waitForExistence(timeout: 5))
        XCTAssertTrue(
            refusal.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Code: not_json")).firstMatch.exists)
        screenshot(app, "7-refusal")
        refusal.buttons["OK"].tap()
        XCTAssertTrue(app.buttons["list.paste"].exists, "the list is unchanged")

        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "bundle-minimal", withExtension: "json"))
        UIPasteboard.general.string = try String(contentsOf: url, encoding: .utf8)
        app.buttons["list.paste"].tap()
        allowPaste()
        XCTAssertTrue(app.navigationBars["Martha DeLarosa"].waitForExistence(timeout: 5))

        app.buttons["share"].tap()
        tapVisible(app, "Share the file (FHIR JSON)")
        let sheet = app.otherElements["ActivityListView"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 5) || app.sheets.firstMatch.waitForExistence(timeout: 2))
        // The sheet's caption names the file, never the patient, and types it JSON.
        let caption = app.otherElements["LP.CaptionBar.TopCaption"]
        XCTAssertTrue(caption.waitForExistence(timeout: 5))
        XCTAssertEqual(caption.label, "international-patient-summary")
        XCTAssertTrue(app.otherElements["LP.CaptionBar.BottomCaption"].label.hasPrefix("JSON"))
        screenshot(app, "8-share")
    }

    /// M-PEOPLE-1..4, M-SHARE-2: summaries grouped by person, a relationship in the
    /// heading and the banner, a carer confirming whose summary to share, and Forget.
    func testFamiliesAndCarers() throws {
        let app = Self.app()
        app.launch()
        let sideBySide = isSideBySide(app)
        app.buttons["list.examples"].tap()
        let table = app.tables["summaries"]
        XCTAssertTrue(table.cells.element(boundBy: 4).waitForExistence(timeout: 5))

        // M-PEOPLE-3: Martha is My parent, in her heading.
        tapVisible(app, "Options for Martha DeLarosa")
        tapVisible(app, "Relationship")
        tapVisible(app, "My parent")
        XCTAssertTrue(labelled(app, containing: "My parent").waitForExistence(timeout: 5))
        assertNoMissingStrings(app)
        screenshot(app, "people-1-list")

        // ...and in her summary's banner.
        table.cells.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Relationship: My parent"))
            .firstMatch.waitForExistence(timeout: 5))

        // M-SHARE-2: three people are open, so Share asks whose summary this is.
        app.buttons["share"].tap()
        tapVisible(app, "Share the file (FHIR JSON)")
        let confirm = app.alerts["Share the summary of Martha DeLarosa?"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        screenshot(app, "people-2-share")
        confirm.buttons["Cancel"].tap()
        if !sideBySide { app.navigationBars.buttons.element(boundBy: 0).tap() }

        // M-PEOPLE-4: Forget James Judge: his summary goes, the others stay.
        tapVisible(app, "Options for James Judge")
        tapVisible(app, "Forget this person")
        app.alerts["Forget James Judge?"].buttons["Forget"].tap()
        XCTAssertTrue(table.staticTexts["James Judge"].waitForNonExistence(timeout: 5))
        XCTAssertEqual(table.cells.count, 4)
        XCTAssertTrue(labelled(app, containing: "My parent").exists, "Martha keeps her relationship")
    }

    /// M-STORE-1, M-STORE-4: the summaries and a relationship are there after the app
    /// is ended and launched again; after Clear all, nothing is.
    func testSummariesOutlastARelaunch() throws {
        let app = Self.app()
        app.launch()
        app.buttons["list.examples"].tap()
        let table = app.tables["summaries"]
        XCTAssertTrue(table.cells.element(boundBy: 4).waitForExistence(timeout: 5))
        tapVisible(app, "Options for James Judge")
        tapVisible(app, "Relationship")
        tapVisible(app, "My child")
        XCTAssertTrue(labelled(app, containing: "My child").waitForExistence(timeout: 5))
        app.terminate()

        let again = Self.app(empty: false)
        again.launch()
        let list = again.tables["summaries"]
        XCTAssertTrue(list.cells.element(boundBy: 4).waitForExistence(timeout: 10), "all five are back")
        let sideBySide = isSideBySide(again)
        XCTAssertEqual(list.cells.count, 5)
        XCTAssertTrue(labelled(again, containing: "My child").exists, "and James's relationship")
        list.staticTexts["Patricia JORDANA"].firstMatch.tap()
        XCTAssertTrue(again.navigationBars["Patricia JORDANA"].waitForExistence(timeout: 5))
        screenshot(again, "store-1-relaunched")
        if !sideBySide { again.navigationBars.buttons.element(boundBy: 0).tap() }

        again.buttons["about"].tap()
        let clear = again.cells["clearAll"]
        XCTAssertTrue(clear.waitForExistence(timeout: 5))
        while !clear.isHittable { again.swipeUp() }
        clear.tap()
        again.alerts.buttons["Clear all"].tap()
        again.terminate()

        let cleared = Self.app(empty: false)
        cleared.launch()
        XCTAssertTrue(cleared.staticTexts["No summaries open"].waitForExistence(timeout: 10), "Clear all deleted the store")
    }

    /// M-I18N-2, M-A11Y-2: right-to-left (ar, he) and long (de, fi) languages at the
    /// largest text size: the examples load through the + menu, a summary opens, no
    /// string is missing, and a screenshot is kept for review (tasks P2-T3).
    func testLanguagesAtTheLargestTextSize() throws {
        for language in ["ar", "he", "de", "fi"] {
            let app = Self.app()
            app.launchArguments += [
                "-AppleLanguages", "(\(language))", "-AppleLocale", language,
                "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
            ]
            app.launch()
            XCTAssertTrue(app.buttons["open"].waitForExistence(timeout: 10), language)
            app.buttons["open"].tap()
            // The menu's third item is Load examples, in any language.
            let item = app.collectionViews.buttons.element(boundBy: 2)
            XCTAssertTrue(item.waitForExistence(timeout: 5), language)
            item.tap()
            let first = app.tables["summaries"].cells.element(boundBy: 0)
            XCTAssertTrue(first.waitForExistence(timeout: 10), language)
            assertNoMissingStrings(app)
            screenshot(app, "lang-\(language)-1-list")
            first.tap()
            XCTAssertTrue(app.buttons["share"].waitForExistence(timeout: 5), language)
            assertNoMissingStrings(app)
            screenshot(app, "lang-\(language)-2-summary")
            app.terminate()
        }
    }

    /// M-PDF-1, M-PDF-3, M-SHARE-2: Share as PDF, after confirming whose summary it is,
    /// hands the share sheet a PDF named by the document's date, never the patient's.
    /// The PDF stays in the app's tmp/share until the next launch, for inspection.
    func testShareAsPDF() throws {
        let app = Self.app()
        app.launch()
        app.buttons["list.examples"].tap()
        let table = app.tables["summaries"]
        XCTAssertTrue(table.cells.element(boundBy: 4).waitForExistence(timeout: 10))
        table.staticTexts["Patricia JORDANA"].firstMatch.tap()
        XCTAssertTrue(app.buttons["share"].waitForExistence(timeout: 5))
        app.buttons["share"].tap()
        tapVisible(app, "Share as PDF")
        let confirm = app.alerts["Share the summary of Patricia JORDANA?"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.buttons["Share"].tap()
        let caption = app.otherElements["LP.CaptionBar.TopCaption"]
        XCTAssertTrue(caption.waitForExistence(timeout: 10))
        XCTAssertEqual(caption.label, "international-patient-summary-2024-09-13")
        XCTAssertTrue(app.otherElements["LP.CaptionBar.BottomCaption"].label.hasPrefix("PDF"))
        screenshot(app, "pdf-1-share")
    }
}

