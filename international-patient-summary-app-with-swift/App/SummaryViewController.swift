import IPSKit
import UIKit

/// One summary (spec §4.2): alerts, the patient, the document, then its sections.
final class SummaryViewController: UITableViewController {
    private let document: Document
    private var blocks: [Block] = []
    /// Sections whose narrative is shown alongside their entries.
    private var expanded: Set<Int> = []

    struct Block {
        let header: String
        var rows: [Row]
    }

    enum Row {
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

    private var observer: (any NSObjectProtocol)?

    init(document: Document) {
        self.document = document
        super.init(style: .insetGrouped)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

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
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "row")
        tableView.register(HeadingView.self, forHeaderFooterViewReuseIdentifier: "heading")
        build()
        // A relationship given from the list shows in the banner at once (M-PEOPLE-3).
        observer = NotificationCenter.default.addObserver(
            forName: SummaryStore.changed, object: SummaryStore.shared, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.build()
                self?.tableView.reloadData()
            }
        }
    }

    // MARK: Building the rows

    private func build() {
        var blocks: [Block] = []

        // M-VIEW-1: alerts first, never collapsed.
        var alerts = document.highCriticalityAllergies.map {
            Row.alert(L10n.text("alerts.highCriticality", $0))
        }
        if document.allergiesMissing { alerts.append(.alert(L10n.text("alerts.allergiesMissing"))) }
        if !alerts.isEmpty { blocks.append(Block(header: L10n.text("alerts.heading"), rows: alerts)) }

        blocks.append(Block(header: L10n.text("banner.heading"), rows: patientRows()))
        blocks.append(Block(header: L10n.text("document.heading"), rows: documentRows()))

        // M-VIEW-3: Composition order, then the missing required sections.
        for (index, section) in document.sections.enumerated() {
            // M-VIEW-3: the app's name for a known section; the document's own title beneath it.
            let header = section.key.map { L10n.sectionTitle($0) } ?? section.title ?? L10n.sectionTitle(nil)
            var rows = rows(section, index)
            if section.key != nil, let title = section.title, title != header { rows.insert(.note(title), at: 0) }
            blocks.append(Block(header: header, rows: rows))
        }
        self.blocks = blocks
    }

    private func patientRows() -> [Row] {
        guard document.patient != nil else { return [.note(L10n.text("banner.unknownPatient"))] }
        var lines: [String] = []
        let store = SummaryStore.shared
        if let person = store.person(of: document.id), store.relationship(of: person) != .none {
            lines.append(L10n.text("banner.relationship", L10n.relationship(store.relationship(of: person))))
        }
        if let born = formatFHIRDate(document.birthDate) {
            lines.append(
                ageInYears(birthDate: document.birthDate).map { L10n.text("banner.bornAge", born, $0) }
                    ?? L10n.text("banner.born", born))
        }
        if let gender = document.gender { lines.append(L10n.text("banner.gender", L10n.gender(gender))) }
        var rows: [Row] = [
            .fact(document.patientName ?? L10n.text("banner.noName"), lines.isEmpty ? nil : lines.joined(separator: "\n"))
        ]
        rows += document.identifiers.map {
            .fact($0.value, $0.system.isEmpty ? L10n.text("banner.identifier") : $0.system)
        }
        return rows
    }

    private func documentRows() -> [Row] {
        var rows: [Row] = []
        if let title = document.title { rows.append(.fact(title, L10n.text("document.title"))) }
        if let date = formatFHIRDate(document.date) { rows.append(.fact(date, L10n.text("document.date"))) }
        for author in document.authors { rows.append(.fact(author, L10n.text("document.author"))) }
        return rows
    }

    private func rows(_ section: Section, _ index: Int) -> [Row] {
        var rows: [Row] = []
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
        let url: URL
        do {
            switch kind {
            case .file: url = try ShareFile.write(document.data)
            case .pdf:
                let pdf = SummaryPDF.make(document)
                url = try ShareFile.write(pdf.data, name: pdf.name)
            }
        } catch {
            return
        }
        let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        activity.popoverPresentationController?.sourceItem = item
        activity.completionWithItemsHandler = { _, _, _, _ in ShareFile.removeAll() }
        present(activity, animated: true)
    }

    // MARK: Table

    override func numberOfSections(in tableView: UITableView) -> Int { blocks.count }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        blocks[section].rows.count
    }

    override func tableView(_ tableView: UITableView, viewForHeaderInSection section: Int) -> UIView? {
        let view = tableView.dequeueReusableHeaderFooterView(withIdentifier: "heading") as? HeadingView
        view?.set(blocks[section].header)
        return view
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)
        var content = UIListContentConfiguration.subtitleCell()
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.numberOfLines = 0
        content.secondaryTextProperties.color = .secondaryLabel
        content.textToSecondaryTextVerticalPadding = 4
        cell.selectionStyle = .none
        cell.accessoryType = .none
        cell.accessibilityTraits = .staticText
        cell.backgroundConfiguration = nil

        switch blocks[indexPath.section].rows[indexPath.row] {
        case .fact(let text, let secondary):
            content.text = text
            content.secondaryText = secondary
        case .alert(let text):
            content.text = text
            content.textProperties.font = UIFontMetrics(forTextStyle: .body).scaledFont(
                for: .systemFont(ofSize: 17, weight: .semibold))
            content.image = UIImage(systemName: "exclamationmark.triangle.fill")
            content.imageProperties.tintColor = .systemRed
            var background = UIBackgroundConfiguration.listCell()
            background.backgroundColor = .systemRed.withAlphaComponent(0.12)
            cell.backgroundConfiguration = background
        case .note(let text):
            content.text = text
            content.textProperties.color = .secondaryLabel
            content.textProperties.font = UIFontMetrics(forTextStyle: .body).scaledFont(
                for: .italicSystemFont(ofSize: 17))
        case .narrative(let text):
            content.text = text
            content.textProperties.font = .preferredFont(forTextStyle: .callout)
        case .narrativeToggle(_, let shown):
            content.text = L10n.text(shown ? "narrative.hide" : "narrative.show")
            content.textProperties.color = .tintColor
            cell.selectionStyle = .default
            cell.accessibilityTraits = .button
        }
        cell.contentConfiguration = content
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard case .narrativeToggle(let index, let shown) = blocks[indexPath.section].rows[indexPath.row]
        else { return }
        if shown { expanded.remove(index) } else { expanded.insert(index) }
        build()
        tableView.reloadSections([indexPath.section], with: .automatic)
    }
}

/// A section heading that VoiceOver announces as a heading (M-A11Y-1).
final class HeadingView: UITableViewHeaderFooterView {
    func set(_ text: String) {
        var content = UIListContentConfiguration.prominentInsetGroupedHeader()
        content.text = text
        content.textProperties.numberOfLines = 0
        contentConfiguration = content
        isAccessibilityElement = true
        accessibilityLabel = text
        accessibilityTraits = .header
    }
}
