import XCTest

/// The app end to end on a simulator: load the examples, read one, clear all.
/// M-LOAD-3, M-LIST-1, M-VIEW-1, M-VIEW-3, M-VIEW-5, M-PRIV-3, M-I18N-1.
@MainActor
final class IPSAppUITests: XCTestCase {
    override func setUp() async throws {
        continueAfterFailure = false
    }

    /// No interface string is missing from the catalog (L10n shows a missing key as ⟦key⟧).
    private func assertNoMissingStrings(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let missing = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "⟦"))
        XCTAssertEqual(missing.count, 0, "a string is missing from Localizable.xcstrings", file: file, line: line)
    }

    /// A screenshot kept with the test results, for review (`xcresulttool export attachments`).
    private func screenshot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testTheExamplesOpenAndClear() {
        let app = XCUIApplication()
        app.launch()

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

    /// M-A11Y-2: at the largest accessibility text size, the alert and banner still read in full.
    func testTheLargestTextSize() {
        let app = XCUIApplication()
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.buttons["list.examples"].waitForExistence(timeout: 10))
        app.buttons["list.examples"].tap()
        app.tables.firstMatch.cells.element(boundBy: 0).tap()
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
        let app = XCUIApplication()
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
        let sheet = app.otherElements["ActivityListView"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 5) || app.sheets.firstMatch.waitForExistence(timeout: 2))
        // The sheet's caption names the file, never the patient, and types it JSON.
        let caption = app.otherElements["LP.CaptionBar.TopCaption"]
        XCTAssertTrue(caption.waitForExistence(timeout: 5))
        XCTAssertEqual(caption.label, "international-patient-summary")
        XCTAssertTrue(app.otherElements["LP.CaptionBar.BottomCaption"].label.hasPrefix("JSON"))
        screenshot(app, "8-share")
    }
}
