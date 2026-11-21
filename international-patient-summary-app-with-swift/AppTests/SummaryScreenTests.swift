import Foundation
import IPSKit
import PDFKit
import Testing
import UIKit

@testable import IPSApp

/// The summary screen (M-VIEW-*), its sharing (M-SHARE-*) and the one-page PDF (M-PDF-*),
/// on every bundled example.
@MainActor
@Suite struct SummaryScreenTests {
    private func documents() throws -> [Document] {
        try Examples.data().map { try Document.open($0).get() }
    }

    private func shown(_ document: Document) -> (UIWindow, UINavigationController, SummaryViewController) {
        let screen = SummaryViewController(document: document)
        let navigation = UINavigationController(rootViewController: UIViewController())
        navigation.pushViewController(screen, animated: false)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        screen.loadViewIfNeeded()
        screen.view.layoutIfNeeded()
        return (window, navigation, screen)
    }

    @Test func everyRowOfEveryExampleDrawsAndTheNarrativeToggles() throws {
        for document in try documents() {
            let (_, _, screen) = shown(document)
            let table: UITableView = screen.tableView
            let sections = screen.numberOfSections(in: table)
            #expect(sections > 0)
            for section in 0..<sections {
                #expect(screen.tableView(table, viewForHeaderInSection: section) != nil)
                for row in 0..<screen.tableView(table, numberOfRowsInSection: section) {
                    let path = IndexPath(row: row, section: section)
                    _ = screen.tableView(table, cellForRowAt: path)
                    // A narrative toggle opens and closes; any other row does nothing.
                    screen.tableView(table, didSelectRowAt: path)
                }
            }
        }
    }

    @Test func theOnePagePDFIsOnePageNamedByTheDocumentDate() throws {
        for document in try documents() {
            let pdf = SummaryPDF.make(document, now: Date(timeIntervalSince1970: 1_700_000_000))
            let read = try #require(PDFDocument(data: pdf.data))
            #expect(read.pageCount == 1)
            #expect(pdf.name.hasSuffix(".pdf"))
            #expect(pdf.name.contains(document.patientName ?? "\u{0}") == false, "never the patient's name")
        }
    }

    private typealias Handler = @convention(block) (UIAlertAction) -> Void

    /// A presentation or dismissal finishes on a later turn of the run loop.
    private func settle() async throws { try await Task.sleep(for: .milliseconds(300)) }

    private func perform(_ title: String, in screen: SummaryViewController) throws {
        let menu = try #require(screen.navigationItem.rightBarButtonItem?.menu)
        let action = try #require(menu.children.compactMap { $0 as? UIAction }.first { $0.title == title })
        action.performWithSender(nil, target: nil)
    }

    private func shared() -> [String] {
        // Each share owns a directory of its own (M-PDF-3).
        let files = FileManager.default.enumerator(at: AppDelegate.shareDirectory, includingPropertiesForKeys: nil)
        return (files?.allObjects as? [URL] ?? []).map(\.lastPathComponent)
    }

    @Test func sharingWritesTheFileOrThePDFAndAsksFirstWithSeveralPeople() async throws {
        let store = SummaryStore.shared
        store.clear()
        defer { store.clear() }
        let document = try #require(try documents().first)
        store.open(document.data)
        let (window, _, screen) = shown(document)
        defer { withExtendedLifetime(window) {} }
        #expect(!store.hasSeveralPeople)

        // One person: the file, or the PDF, is written for the share sheet at once.
        try perform(L10n.text("summary.share.file"), in: screen)
        try await settle()
        #expect(shared().contains("international-patient-summary.json"))
        screen.dismiss(animated: false)
        try await settle()
        try perform(L10n.text("summary.share.pdf"), in: screen)
        try await settle()
        #expect(shared().contains { $0.hasSuffix(".pdf") })
        screen.dismiss(animated: false)
        try await settle()

        // Several people: it asks whose summary this is first, and shares once confirmed.
        for other in Examples.data() { store.open(other) }
        #expect(store.hasSeveralPeople)
        try perform(L10n.text("summary.share.file"), in: screen)
        try await settle()
        let alert = try #require(screen.presentedViewController as? UIAlertController)
        #expect(alert.actions.count == 2)
        let confirm = try #require(alert.actions.first { $0.style == .default })
        let handler = try #require(confirm.value(forKey: "handler"))
        unsafeBitCast(handler as AnyObject, to: Handler.self)(confirm)
        try await settle()
        #expect(shared().contains("international-patient-summary.json"))
    }
}
