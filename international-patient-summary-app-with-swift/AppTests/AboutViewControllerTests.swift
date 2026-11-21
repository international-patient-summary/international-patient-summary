import Foundation
import IPSKit
import Testing
import UIKit

@testable import IPSApp

/// About (M-ABOUT-1) and Clear all (M-PRIV-3), in a window.
@MainActor
@Suite struct AboutViewControllerTests {
    private typealias Handler = @convention(block) (UIAlertAction) -> Void

    private func shown(_ store: SummaryStore) -> (UIWindow, UINavigationController, AboutViewController) {
        let about = AboutViewController(store: store)
        let navigation = UINavigationController(rootViewController: UIViewController())
        navigation.pushViewController(about, animated: false)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        about.loadViewIfNeeded()
        return (window, navigation, about)
    }

    @Test func itListsSafetyPrivacyVersionsAndClearAll() throws {
        let (_, _, about) = shown(SummaryStore(saving: nil))
        #expect(about.title == L10n.text("about.title"))
        #expect(about.numberOfSections(in: about.tableView) == 4)
        #expect(about.tableView(about.tableView, numberOfRowsInSection: 2) == 2)
        #expect(about.tableView(about.tableView, numberOfRowsInSection: 3) == 1)
        #expect(about.tableView(about.tableView, viewForHeaderInSection: 3) == nil)
        #expect(about.tableView(about.tableView, viewForHeaderInSection: 0) != nil)
        let clear = about.tableView(about.tableView, cellForRowAt: IndexPath(row: 0, section: 3))
        #expect(clear.accessibilityIdentifier == "clearAll")
        let safety = about.tableView(about.tableView, cellForRowAt: IndexPath(row: 0, section: 0))
        #expect(safety.accessibilityTraits == .staticText)
    }

    @Test func selectingAnInfoRowDoesNothingAndClearAllAsksFirst() throws {
        let store = SummaryStore(saving: nil)
        Examples.data().forEach { store.open($0) }
        let (_, _, about) = shown(store)
        about.tableView(about.tableView, didSelectRowAt: IndexPath(row: 0, section: 0))
        #expect(about.presentedViewController == nil)

        about.tableView(about.tableView, didSelectRowAt: IndexPath(row: 0, section: 3))
        let alert = try #require(about.presentedViewController as? UIAlertController)
        #expect(alert.actions.count == 2)
        #expect(!store.documents.isEmpty, "nothing is cleared until confirmed")

        let confirm = try #require(alert.actions.first { $0.style == .destructive })
        let handler = try #require(confirm.value(forKey: "handler"))
        unsafeBitCast(handler as AnyObject, to: Handler.self)(confirm)
        #expect(store.documents.isEmpty)
    }
}
