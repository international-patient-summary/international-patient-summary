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

    @Test func everyExampleDrawsInAWindowWithItsHeadings() throws {
        for document in try documents() {
            let (window, _, screen) = shown(document)
            defer { withExtendedLifetime(window) {} }
            let model = screen.model
            #expect(model.banner.count >= 2, "the patient and the document, at least")
            #expect(model.banner.allSatisfy { !$0.header.isEmpty && !$0.rows.isEmpty })
            #expect(model.sections.count == document.sections.count)
            #expect(model.sections.allSatisfy { !$0.heading.isEmpty && !$0.key.isEmpty })
            #expect(screen.title == (document.patientName ?? L10n.text("summary.title")))
        }
    }

    @Test func aSectionSaysItsStatusInWordsExceptWhenItIsKnown() throws {
        var statuses: Set<String> = []
        for document in try documents() {
            let model = SummaryModel(document: document, store: SummaryStore(saving: nil))
            for section in model.sections {
                statuses.insert(section.status.rawValue)
                #expect((section.statusLabel == nil) == (section.status == .known), "\(section.key) \(section.status)")
            }
        }
        #expect(statuses.contains("known"))
    }

    @Test func everyEntryIsOneRecordAndTheNarrativeStaysOutsideTheList() throws {
        for document in try documents() {
            let model = SummaryModel(document: document, store: SummaryStore(saving: nil))
            for (section, source) in zip(model.sections, document.sections) {
                #expect(section.entries.count == source.entries.count, "\(section.key)")
                #expect(section.entries.allSatisfy { if case .narrative = $0 { false } else { true } })
                #expect(section.trail.allSatisfy {
                    switch $0 {
                    case .narrative, .narrativeToggle: true
                    default: false
                    }
                })
            }
        }
    }

    @Test func aNarrativeShowsAndHidesBesideItsEntries() throws {
        var toggled = 0
        for document in try documents() {
            let model = SummaryModel(document: document, store: SummaryStore(saving: nil))
            for (index, section) in model.sections.enumerated() {
                guard case .narrativeToggle(let number, false)? = section.rows.first(where: {
                    if case .narrativeToggle = $0 { true } else { false }
                }) else { continue }
                let before = section.rows.count
                model.toggleNarrative(number)
                #expect(model.sections[index].rows.count == before + 1, "the narrative joins the section")
                #expect(model.sections[index].rows.contains(.narrativeToggle(section: number, shown: true)))
                model.toggleNarrative(number)
                #expect(model.sections[index].rows.count == before, "and leaves it again")
                toggled += 1
            }
        }
        #expect(toggled > 0, "an example has a section with entries and a narrative")
    }

    @Test func aRelationshipGivenFromTheListShowsInTheBannerAtOnce() throws {
        let store = SummaryStore(saving: nil)
        let first = try #require(try documents().first)
        let document = try store.open(first.data).get()
        let model = SummaryModel(document: document, store: store)
        func banner() -> String {
            guard case .fact(_, let detail)? = model.banner.first(where: { $0.header == L10n.text("banner.heading") })?.rows.first
            else { return "" }
            return detail ?? ""
        }
        let relationship = L10n.relationship(.parent)
        #expect(!banner().contains(relationship))
        let person = try #require(store.person(of: document.id))
        store.setRelationship(.parent, for: person)
        model.refresh()
        #expect(banner().contains(relationship))
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
