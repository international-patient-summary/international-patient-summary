import Foundation
import IPSKit
import SwiftUI
import Testing
import UIKit

@testable import IPSApp

/// About (M-ABOUT-1) and Clear all (M-PRIV-3): the content as data, the model's two steps, and the screen in a window.
@MainActor
@Suite struct AboutViewControllerTests {
    @Test func itListsSafetyPrivacyAndVersions() {
        let content = AboutContent(appVersion: "9.9")
        #expect(content.sections.map(\.heading) == [
            L10n.text("about.safety.heading"), L10n.text("about.privacy.heading"), L10n.text("about.versions.heading"),
        ])
        #expect(content.sections[0].rows == [.init(text: L10n.text("about.safety.body"), secondary: nil)])
        #expect(content.sections[2].rows == [
            .init(text: "9.9", secondary: L10n.text("about.version")),
            .init(text: "2.0.1", secondary: L10n.text("about.ips")),
        ])
    }

    @Test func clearAllAsksFirstAndClearsOnlyWhenConfirmed() {
        let store = SummaryStore(saving: nil)
        Examples.data().forEach { store.open($0) }
        var left = 0
        let model = AboutModel(store: store) { left += 1 }
        #expect(!model.confirming)
        model.askToClearAll()
        #expect(model.confirming)
        #expect(!store.documents.isEmpty, "nothing is cleared until confirmed")
        #expect(left == 0)
        model.confirmClearAll()
        #expect(store.documents.isEmpty)
        #expect(left == 1)
    }

    @Test func theScreenIsTitledAndDrawsInAWindow() {
        let about = AboutViewController(store: SummaryStore(saving: nil))
        let navigation = UINavigationController(rootViewController: UIViewController())
        navigation.pushViewController(about, animated: false)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        about.loadViewIfNeeded()
        window.layoutIfNeeded()
        #expect(about.title == L10n.text("about.title"))
        #expect(about.navigationItem.largeTitleDisplayMode == .never)
        about.model.askToClearAll()
        window.layoutIfNeeded()
        #expect(about.model.confirming)
    }

    @Test func confirmingClearAllReturnsToTheList() async throws {
        let store = SummaryStore(saving: nil)
        let root = UIViewController()
        let navigation = UINavigationController(rootViewController: root)
        let about = AboutViewController(store: store)
        navigation.pushViewController(about, animated: false)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        about.model.confirmClearAll()
        try await Task.sleep(for: .seconds(1))
        #expect(navigation.viewControllers == [root])
    }
}
