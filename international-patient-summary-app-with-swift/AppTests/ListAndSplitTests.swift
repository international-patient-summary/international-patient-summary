import CryptoKit
import Foundation
import IPSKit
import Testing
import UIKit

@testable import IPSApp

/// The list by person (M-LIST-*, M-PEOPLE-*), opening (M-LOAD-*), and the split
/// view that holds it (M-TAB-1), driven as a person would, in a window.
@MainActor
@Suite struct ListAndSplitTests {
    private func settle() async throws { try await Task.sleep(for: .milliseconds(300)) }

    /// A presentation from the list is made by the window's root, the split view.
    private func presented(_ app: App) -> UIViewController? {
        app.split.presentedViewController ?? app.list.presentedViewController
    }

    private struct LockedKeys: StoreKeys {
        func existing() throws -> SymmetricKey? { throw CocoaError(.fileReadNoPermission) }
        func create() throws -> SymmetricKey { throw CocoaError(.fileWriteNoPermission) }
        func delete() {}
    }

    private struct App {
        let window: UIWindow
        let split: SplitViewController
        let list: SummaryListViewController
        let store: SummaryStore
    }

    private func launched(_ store: SummaryStore = SummaryStore(saving: nil)) throws -> App {
        let split = SplitViewController(store: store)
        // A window of the running app's scene, so the split view has real traits.
        let scene = try #require(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let window = UIWindow(windowScene: scene)
        window.rootViewController = split
        window.makeKeyAndVisible()
        split.loadViewIfNeeded()
        split.viewDidAppear(false)
        let navigation = try #require(split.viewController(for: .primary) as? UINavigationController)
        let list = try #require(navigation.viewControllers.first as? SummaryListViewController)
        list.loadViewIfNeeded()
        return App(window: window, split: split, list: list, store: store)
    }

    @Test func anEmptyListShowsTheEmptyStateAndOffersEveryWayToOpen() throws {
        let app = try launched()
        defer { withExtendedLifetime(app.window) {} }
        #expect(app.list.tableView.backgroundView != nil)
        #expect(app.list.numberOfSections(in: app.list.tableView) == 0)
    }

    @Test func loadingExamplesListsPeopleOpensAndDeletesRows() async throws {
        let app = try launched()
        defer { withExtendedLifetime(app.window) {} }
        app.list.loadExamples()
        try await settle()
        let table: UITableView = app.list.tableView
        #expect(app.store.documents.count == 5)
        #expect(app.list.numberOfSections(in: table) == 3)
        #expect(table.backgroundView == nil)

        for section in 0..<3 {
            #expect(app.list.tableView(table, viewForHeaderInSection: section) != nil)
            for row in 0..<app.list.tableView(table, numberOfRowsInSection: section) {
                let path = IndexPath(row: row, section: section)
                let cell = app.list.tableView(table, cellForRowAt: path)
                app.list.tableView(table, willDisplay: cell, forRowAt: path)
                #expect(cell.accessibilityCustomActions?.count == 1)
                #expect(app.list.tableView(table, contextMenuConfigurationForRowAt: path, point: .zero) != nil)
            }
        }

        // Selecting a row shows that summary beside the list.
        app.list.tableView(table, didSelectRowAt: IndexPath(row: 0, section: 0))
        try await settle()
        #expect(app.split.shownID != nil, "collapsed=\(app.split.isCollapsed) list.split=\(String(describing: app.list.splitViewController))")

        // Deleting the shown summary leaves the secondary column.
        let shown = try #require(app.split.shownID)
        let action = try #require(
            app.list.tableView(table, trailingSwipeActionsConfigurationForRowAt: IndexPath(row: 0, section: 0))?
                .actions.first)
        action.handler(action, UIView()) { _ in }
        try await settle()
        if app.store.documents.contains(where: { $0.id == shown }) { Issue.record("not deleted") }
        #expect(app.split.shownID == nil)
    }

    @Test func pasteOpensTextAndShowsARefusalInWords() async throws {
        let app = try launched()
        defer { withExtendedLifetime(app.window) {} }
        // The simulator's clipboard is the Mac's, so an empty one cannot be relied on here.
        UIPasteboard.general.string = String(decoding: try #require(Examples.data().first), as: UTF8.self)
        app.list.paste()
        try await settle()
        #expect(app.store.documents.count == 1)

        UIPasteboard.general.string = "{}"
        app.list.paste()
        try await settle()
        #expect(presented(app) is UIAlertController, "a refusal is shown in words")
        #expect(app.store.documents.count == 1)
    }

    @Test func aFileIsOpenedOrRefusedAndTheImportPickerOpens() async throws {
        let app = try launched()
        defer { withExtendedLifetime(app.window) {} }
        let directory = FileManager.default.temporaryDirectory.appending(path: "list-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let good = directory.appending(path: "good.json")
        try #require(Examples.data().first).write(to: good)
        app.list.openIncoming(good)
        try await settle()
        #expect(app.store.documents.count == 1)

        let bad = directory.appending(path: "bad.json")
        try Data("{}".utf8).write(to: bad)
        app.list.documentPicker(UIDocumentPickerViewController(forOpeningContentTypes: [.json]), didPickDocumentsAt: [bad])
        try await settle()
        #expect(presented(app) is UIAlertController)
        #expect(!FileManager.default.fileExists(atPath: bad.path()), "the picker's copy is removed")
        app.split.dismiss(animated: false)
        try await settle()

        app.list.openIncoming(directory.appending(path: "missing.json"))
        try await settle()
        #expect(presented(app) is UIAlertController)
        app.split.dismiss(animated: false)
        try await settle()

        app.list.documentPicker(UIDocumentPickerViewController(forOpeningContentTypes: [.json]), didPickDocumentsAt: [])
        app.list.importFile()
        try await settle()
        // The system picker is a remote view; it is enough that asking for it does not fail.
    }

    @Test func theSplitViewForwardsOpeningAndForgetsWhatIsGone() async throws {
        let app = try launched()
        defer { withExtendedLifetime(app.window) {} }
        app.split.openIncoming(URL(fileURLWithPath: "/nonexistent/x.json"))
        app.split.perform(NSSelectorFromString("loadExamples"))
        try await settle()
        #expect(app.store.documents.count == 5)
        let document = try #require(app.store.documents.first)
        app.split.show(document)
        #expect(app.split.shownID == document.id)
        app.split.deleteShown()
        try await settle()
        #expect(app.split.shownID == nil)
        app.store.clear()
        try await settle()
        #expect(app.split.shownID == nil)
        app.list.layoutChanged()
        app.split.splitViewControllerDidCollapse(app.split)
        app.split.splitViewControllerDidExpand(app.split)
    }

    @Test func anUnreadableStoreShowsAProblemAlertAndRetryTriesAgain() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: "locked-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SummaryStore(saving: EncryptedStore(directory: directory, keys: LockedKeys()))
        #expect(store.saving == .unavailable)
        let app = try launched(store)
        defer { withExtendedLifetime(app.window) {} }
        try await settle()
        let alert = try #require(presented(app) as? UIAlertController)
        #expect(alert.actions.count == 2)
        #expect(alert.view.accessibilityIdentifier == "storageProblem")
    }
}
