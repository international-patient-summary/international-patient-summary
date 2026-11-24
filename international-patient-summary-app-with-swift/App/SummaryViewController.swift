import IPSKit
import LilyCore
import LilyUI
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

/// One section of the document, as Lily's `InternationalPatientSummarySection` takes it: its key, its heading, its status in words, its rows.
struct SummarySection: Equatable {
    /// Lily's key for the section; "other-N" for one this app does not know.
    let key: String
    let heading: String
    let status: IpsSectionStatus
    /// The status in words; nil only when the status is known.
    let statusLabel: String?
    /// What comes before the entries: the document's own title, and the narrative-only note.
    var lead: [SummaryRow]
    /// The entries, each a record in Lily's `RecordList`.
    var entries: [SummaryRow]
    /// The narrative, and the button that shows or hides it.
    var trail: [SummaryRow]

    var rows: [SummaryRow] { lead + entries + trail }
}

/// One summary (spec §4.2) as rows: alerts, the patient, the document (the banner), then its sections. Plain data a test reads without a screen.
@MainActor @Observable final class SummaryModel {
    let document: IPSKit.Document
    private(set) var banner: [SummaryBlock] = []
    private(set) var sections: [SummarySection] = []
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
        var banner: [SummaryBlock] = []

        // M-VIEW-1: alerts first, never collapsed.
        var alerts = document.highCriticalityAllergies.map {
            SummaryRow.alert(L10n.text("alerts.highCriticality", $0))
        }
        if document.allergiesMissing { alerts.append(.alert(L10n.text("alerts.allergiesMissing"))) }
        if !alerts.isEmpty { banner.append(SummaryBlock(header: L10n.text("alerts.heading"), rows: alerts)) }

        banner.append(SummaryBlock(header: L10n.text("banner.heading"), rows: patientRows()))
        banner.append(SummaryBlock(header: L10n.text("document.heading"), rows: documentRows()))
        self.banner = banner

        // M-VIEW-3: Composition order, then the missing required sections.
        sections = document.sections.enumerated().map { index, section in
            // M-VIEW-3: the app's name for a known section; the document's own title beneath it.
            let heading = section.key.map { L10n.sectionTitle($0) } ?? section.title ?? L10n.sectionTitle(nil)
            var built = rows(section, index)
            if section.key != nil, let title = section.title, title != heading { built.lead.insert(.note(title), at: 0) }
            return SummarySection(
                key: section.key?.lilyKey ?? "other-\(index)", heading: heading, status: built.status,
                statusLabel: built.statusLabel, lead: built.lead, entries: built.entries, trail: built.trail)
        }
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

    private func rows(_ section: IPSKit.Section, _ index: Int) -> (
        status: IpsSectionStatus, statusLabel: String?, lead: [SummaryRow], entries: [SummaryRow], trail: [SummaryRow]
    ) {
        var lead: [SummaryRow] = []
        var entries: [SummaryRow] = []
        var trail: [SummaryRow] = []
        var status = Self.status(section.state)
        var statusLabel = L10n.state(section.state, reason: section.emptyReason)
        // A section that takes entries but has only a narrative says so, then shows it.
        let narrativeOnly = section.entries.isEmpty && section.narrative != nil
        if narrativeOnly, section.state == .notRecorded {
            status = .known
            statusLabel = nil
            lead.append(.note(L10n.text("state.narrativeOnly")))
        }
        for entry in section.entries {
            guard entry.resolved else {
                entries.append(.note(L10n.text("entry.unresolved")))
                continue
            }
            let details = entry.details.map { L10n.detail($0.kind, $0.value) }
            entries.append(.fact(entry.text, details.isEmpty ? nil : details.joined(separator: "\n")))
        }
        if let narrative = section.narrative {
            if section.entries.isEmpty {
                trail.append(.narrative(narrative))
            } else {
                let shown = expanded.contains(index)
                trail.append(.narrativeToggle(section: index, shown: shown))
                if shown { trail.append(.narrative(narrative)) }
            }
        }
        return (status, statusLabel, lead, entries, trail)
    }

    private static func status(_ state: SectionState) -> IpsSectionStatus {
        switch state {
        case .known: .known
        case .noneKnown: .noneKnown
        case .notRecorded: .notRecorded
        case .unavailable: .unavailable
        case .omitted: .omitted
        }
    }
}

/// The summary (spec §4.2) on Lily's `InternationalPatientSummary`: the banner, then each section under its heading with its status in words. SwiftUI first.
struct SummaryView: View {
    let model: SummaryModel

    var body: some View {
        ScrollView {
            // The registry's required sections are always in the document (the document adds the missing ones), so Lily adds none.
            if let summary = try? InternationalPatientSummary(
                label: model.document.patientName ?? L10n.text("summary.title"),
                sections: model.sections.map { IpsSectionEntry(key: $0.key, heading: $0.heading, status: $0.status) },
                requiredHeadings: Dictionary(
                    uniqueKeysWithValues: ipsRequiredSections.map { key in (key, L10n.sectionTitle(SectionKey.allCases.first { $0.lilyKey == key })) }),
                omittedLabel: L10n.text("state.omitted"),
                banner: {
                    ForEach(Array(model.banner.enumerated()), id: \.offset) { _, block in card(block.header, block.rows) }
                },
                content: {
                    ForEach(model.sections, id: \.key) { section in
                        InternationalPatientSummarySection(
                            section: section.key, heading: section.heading, status: section.status,
                            statusLabel: section.statusLabel
                        ) {
                            VStack(alignment: .leading, spacing: 0) {
                                rows(section.lead)
                                // The entries are records: one list, named for the section, each entry one element.
                                if !section.entries.isEmpty {
                                    RecordList(status: .known, statusLabel: section.heading, label: section.heading) {
                                        records(section.entries)
                                    }
                                }
                                rows(section.trail)
                            }
                        }
                    }
                },
                details: { EmptyView() })
            {
                summary.padding()
            }
        }
        .background(Color(.systemGroupedBackground))
    }

    /// A banner block: its heading, then its rows on a card.
    private func card(_ header: String, _ rows: [SummaryRow]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: header).font(.title3.bold()).accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 0) { self.rows(rows) }
        }
    }

    private func rows(_ rows: [SummaryRow]) -> some View {
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
            rowView(row)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(background(row))
        }
    }

    private func records(_ entries: [SummaryRow]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                RecordListItem {
                    rowView(entry)
                }
                .padding(12)
                .background(background(entry))
            }
        }
    }

    private func background(_ row: SummaryRow) -> Color {
        if case .alert = row { Color.red.opacity(0.12) } else { Color(.secondarySystemGroupedBackground) }
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
