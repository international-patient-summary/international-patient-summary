import IPSKit
import SwiftUI
import UIKit

/// A block of rows under one heading.
struct SummaryBlock: Equatable {
    let header: String
    var rows: [SummaryRow]
}

enum SummaryRow: Equatable {
    /// A fact: main text and detail lines.
    case fact(String, String?)
    /// Something that must not be missed (M-VIEW-1): words and a symbol, not colour alone.
    case alert(String)
    /// What the app says about the data, rather than what the document says.
    case note(String)
    /// The document's narrative, as plain text (M-VIEW-6).
    case narrative(String)
    /// Shows or hides a section's narrative.
    case narrativeToggle(section: Int, shown: Bool)
}

/// One summary (spec §4.2) as rows: alerts, the patient, the document, then its sections. Plain data a test reads without a screen.
@MainActor @Observable final class SummaryModel {
    let document: IPSKit.Document
    private(set) var blocks: [SummaryBlock] = []
    /// Sections whose narrative is shown alongside their entries.
    private var expanded: Set<Int> = []
    private let store: SummaryStore

    init(document: IPSKit.Document, store: SummaryStore = .shared) {
        self.document = document
        self.store = store
        build()
    }

    /// Shows or hides one section's narrative.
    func toggleNarrative(_ section: Int) {
        if expanded.contains(section) { expanded.remove(section) } else { expanded.insert(section) }
        build()
    }

    /// A relationship given from the list shows in the banner at once (M-PEOPLE-3).
    func refresh() { build() }

    private func build() {
        var blocks: [SummaryBlock] = []

        // M-VIEW-1: alerts first, never collapsed.
        var alerts = document.highCriticalityAllergies.map {
            SummaryRow.alert(L10n.text("alerts.highCriticality", $0))
        }
        if document.allergiesMissing { alerts.append(.alert(L10n.text("alerts.allergiesMissing"))) }
        if !alerts.isEmpty { blocks.append(SummaryBlock(header: L10n.text("alerts.heading"), rows: alerts)) }

        blocks.append(SummaryBlock(header: L10n.text("banner.heading"), rows: patientRows()))
        blocks.append(SummaryBlock(header: L10n.text("document.heading"), rows: documentRows()))

        // M-VIEW-3: Composition order, then the missing required sections.
        for (index, section) in document.sections.enumerated() {
            // M-VIEW-3: the app's name for a known section; the document's own title beneath it.
            let header = section.key.map { L10n.sectionTitle($0) } ?? section.title ?? L10n.sectionTitle(nil)
            var rows = rows(section, index)
            if section.key != nil, let title = section.title, title != header { rows.insert(.note(title), at: 0) }
            blocks.append(SummaryBlock(header: header, rows: rows))
        }
        self.blocks = blocks
    }

    private func patientRows() -> [SummaryRow] {
        guard document.patient != nil else { return [.note(L10n.text("banner.unknownPatient"))] }
        var lines: [String] = []
        let store = self.store
        if let person = store.person(of: document.id), store.relationship(of: person) != .none {
            lines.append(L10n.text("banner.relationship", L10n.relationship(store.relationship(of: person))))
        }
        if let born = formatFHIRDate(document.birthDate) {
            lines.append(
                ageText(birthDate: document.birthDate).map { L10n.text("banner.bornAge", born, $0) }
                    ?? L10n.text("banner.born", born))
        }
        if let gender = document.gender { lines.append(L10n.text("banner.gender", L10n.gender(gender))) }
        var rows: [SummaryRow] = [
            .fact(document.patientName ?? L10n.text("banner.noName"), lines.isEmpty ? nil : lines.joined(separator: "\n"))
        ]
        rows += document.identifiers.map {
            .fact($0.value, $0.system.isEmpty ? L10n.text("banner.identifier") : $0.system)
        }
        return rows
    }

    private func documentRows() -> [SummaryRow] {
        var rows: [SummaryRow] = []
        if let title = document.title { rows.append(.fact(title, L10n.text("document.title"))) }
        if let date = formatFHIRDate(document.date) { rows.append(.fact(date, L10n.text("document.date"))) }
        for author in document.authors { rows.append(.fact(author, L10n.text("document.author"))) }
        return rows
    }

    private func rows(_ section: IPSKit.Section, _ index: Int) -> [SummaryRow] {
        var rows: [SummaryRow] = []
        // A section that takes entries but has only a narrative says so, then shows it.
        let narrativeOnly = section.entries.isEmpty && section.narrative != nil
        if narrativeOnly, section.state == .notRecorded {
            rows.append(.note(L10n.text("state.narrativeOnly")))
        } else if let words = L10n.state(section.state, reason: section.emptyReason) {
            rows.append(.note(words))
        }
        for entry in section.entries {
            guard entry.resolved else {
                rows.append(.note(L10n.text("entry.unresolved")))
                continue
            }
            let details = entry.details.map { L10n.detail($0.kind, $0.value) }
            rows.append(.fact(entry.text, details.isEmpty ? nil : details.joined(separator: "\n")))
        }
        if let narrative = section.narrative {
            if section.entries.isEmpty {
                rows.append(.narrative(narrative))
            } else {
                let shown = expanded.contains(index)
                rows.append(.narrativeToggle(section: index, shown: shown))
                if shown { rows.append(.narrative(narrative)) }
            }
        }
        return rows
    }
}

/// The summary as a list (spec §4.2), headings first. SwiftUI first.
struct SummaryView: View {
    let model: SummaryModel

    var body: some View {
        List {
            ForEach(Array(model.blocks.enumerated()), id: \.offset) { _, block in
                Section {
                    ForEach(Array(block.rows.enumerated()), id: \.offset) { _, row in
                        rowView(row)
                    }
                } header: {
                    Text(verbatim: block.header).font(.headline).textCase(nil)
                }
            }
        }
    }

    @ViewBuilder private func rowView(_ row: SummaryRow) -> some View {
        switch row {
        case .fact(let text, let secondary):
            VStack(alignment: .leading, spacing: 4) {
                Text(verbatim: text)
                if let secondary { Text(verbatim: secondary).foregroundStyle(.secondary) }
            }
            .accessibilityElement(children: .combine)
        case .alert(let text):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red).accessibilityHidden(true)
                Text(verbatim: text).fontWeight(.semibold)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: text))
            .listRowBackground(Color.red.opacity(0.12))
        case .note(let text):
            Text(verbatim: text).italic().foregroundStyle(.secondary)
        case .narrative(let text):
            Text(verbatim: text).font(.callout)
        case .narrativeToggle(let section, let shown):
            Button { model.toggleNarrative(section) } label: {
                Text(verbatim: L10n.text(shown ? "narrative.hide" : "narrative.show"))
            }
        }
    }
}

/// Hosts `SummaryView` in the UIKit navigation stack, with Share in the bar (the menu and the share sheet are UIKit).
final class SummaryViewController: UIHostingController<SummaryView> {
    private let document: IPSKit.Document
    let model: SummaryModel
    private var observer: (any NSObjectProtocol)?

    init(document: IPSKit.Document) {
        self.document = document
        let model = SummaryModel(document: document)
        self.model = model
        super.init(rootView: SummaryView(model: model))
    }

    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = document.patientName ?? L10n.text("summary.title")
        navigationItem.largeTitleDisplayMode = .never
        // M-SHARE-1, M-PDF-1: the file, or a PDF for people.
        let share = UIBarButtonItem(image: UIImage(systemName: "square.and.arrow.up"), menu: nil)
        share.menu = UIMenu(children: [
            UIAction(title: L10n.text("summary.share.file"), image: UIImage(systemName: "doc")) {
                [weak self, weak share] _ in self?.share(.file, from: share)
            },
            UIAction(title: L10n.text("summary.share.pdf"), image: UIImage(systemName: "doc.richtext")) {
                [weak self, weak share] _ in self?.share(.pdf, from: share)
            },
        ])
        share.accessibilityLabel = L10n.text("summary.share")
        share.accessibilityIdentifier = "share"
        navigationItem.rightBarButtonItem = share
        observer = NotificationCenter.default.addObserver(
            forName: SummaryStore.changed, object: SummaryStore.shared, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.model.refresh() }
        }
    }

    // MARK: Sharing (M-SHARE-1)

    enum ShareKind { case file, pdf }

    /// M-SHARE-2: with more than one person open, first confirm whose summary this is.
    private func share(_ kind: ShareKind, from item: UIBarButtonItem?) {
        guard SummaryStore.shared.hasSeveralPeople else { return shareNow(kind, from: item) }
        let name = document.patientName ?? L10n.text("people.notNamed")
        let confirm = UIAlertController(
            title: L10n.text("share.confirm.title", name), message: L10n.text("share.confirm.body"),
            preferredStyle: .alert)
        confirm.addAction(UIAlertAction(title: L10n.text("cancel"), style: .cancel))
        let share = UIAlertAction(title: L10n.text("share.confirm.action"), style: .default) { [weak self] _ in
            self?.shareNow(kind, from: item)
        }
        confirm.addAction(share)
        confirm.preferredAction = share
        present(confirm, animated: true)
    }

    private func shareNow(_ kind: ShareKind, from item: UIBarButtonItem?) {
        let exported: TemporaryShare
        do {
            switch kind {
            case .file:
                exported = try TemporaryShare.write(
                    document.data, name: "international-patient-summary.json", under: AppDelegate.shareDirectory,
                    options: [.atomic, .completeFileProtection])
            case .pdf:
                let pdf = SummaryPDF.make(document)
                exported = try TemporaryShare.write(
                    pdf.data, name: pdf.name, under: AppDelegate.shareDirectory,
                    options: [.atomic, .completeFileProtection])
            }
        } catch {
            return
        }
        let activity = UIActivityViewController(activityItems: [exported.url], applicationActivities: nil)
        activity.popoverPresentationController?.sourceItem = item
        activity.completionWithItemsHandler = { _, _, _, _ in exported.remove() }
        present(activity, animated: true)
    }
}
