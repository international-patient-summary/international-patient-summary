import IPSKit
import UIKit
import UniformTypeIdentifiers

/// Home (spec §4.1): the open summaries, and the three ways to open one.
final class SummaryListViewController: UITableViewController, UIDocumentPickerDelegate, UITableViewDropDelegate {
    private let store: SummaryStore
    private var observer: (any NSObjectProtocol)?

    init(store: SummaryStore) {
        self.store = store
        super.init(style: .insetGrouped)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = L10n.text("list.title")
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "summary")
        tableView.accessibilityIdentifier = "summaries"
        tableView.dropDelegate = self
        let openMenu = UIMenu(children: [
            UIAction(title: L10n.text("list.import"), image: UIImage(systemName: "doc")) { [weak self] _ in
                self?.importFile()
            },
            UIAction(title: L10n.text("list.paste"), image: UIImage(systemName: "doc.on.clipboard")) {
                [weak self] _ in self?.paste()
            },
            UIAction(title: L10n.text("list.examples"), image: UIImage(systemName: "books.vertical")) {
                [weak self] _ in self?.loadExamples()
            },
        ])
        let add = UIBarButtonItem(systemItem: .add, menu: openMenu)
        add.accessibilityLabel = L10n.text("list.open")
        add.accessibilityIdentifier = "open"
        navigationItem.rightBarButtonItem = add
        let about = UIBarButtonItem(
            image: UIImage(systemName: "info.circle"), primaryAction: UIAction { [weak self] _ in
                self?.navigationController?.pushViewController(
                    AboutViewController(store: SummaryStore.shared), animated: true)
            })
        about.accessibilityLabel = L10n.text("about.title")
        about.accessibilityIdentifier = "about"
        navigationItem.leftBarButtonItem = about
        observer = NotificationCenter.default.addObserver(
            forName: SummaryStore.changed, object: store, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.reload() }
        }
        reload()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        clearsSelectionOnViewWillAppear = splitViewController?.isCollapsed ?? true
    }

    // M-TAB-2: ⌘⌫ deletes the open summary. Declared here, not on the split view, because
    // the table takes the Delete key before it would reach the split view.
    override var keyCommands: [UIKeyCommand]? {
        guard let split = splitViewController as? SplitViewController, split.shownID != nil else { return nil }
        let delete = UIKeyCommand(
            title: L10n.text("list.delete"), action: #selector(deleteShown), input: UIKeyCommand.inputDelete,
            modifierFlags: .command, attributes: .destructive)
        delete.wantsPriorityOverSystemBehavior = true
        // The same key as DEL, which some keyboards and the simulator send; not listed twice.
        let del = UIKeyCommand(action: #selector(deleteShown), input: "\u{7F}", modifierFlags: .command)
        del.wantsPriorityOverSystemBehavior = true
        return [delete, del]
    }

    @objc private func deleteShown() { (splitViewController as? SplitViewController)?.deleteShown() }

    /// The split view collapsed or expanded.
    func layoutChanged() { reload() }

    private func reload() {
        tableView.reloadData()
        selectShown()
        guard store.documents.isEmpty else {
            tableView.backgroundView = nil
            return
        }
        // The background view gets no safe area of its own, so the empty state is
        // pinned to the table's, below the navigation bar.
        let container = UIView()
        let scroll = emptyState()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(scroll)
        tableView.backgroundView = container
        let guide = tableView.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: guide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: guide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        ])
    }

    // MARK: Opening (M-LOAD-1, M-LOAD-2, M-LOAD-3)

    func importFile() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        open(readDocumentFile(at: url))
        // The picker's copy is ours to remove; the summary now lives in memory only.
        try? FileManager.default.removeItem(at: url)
    }

    /// A file's bytes, or why not (M-CHECK-2: an oversized file is refused before it is read).
    private func open(_ file: Result<Data, DocumentFileProblem>) {
        switch file {
        case .success(let data): open(data)
        case .failure(.refused(let refusal)): show(refusal)
        case .failure(.unreadable): alert(title: L10n.text("import.unreadable"), message: nil)
        }
    }

    // MARK: Drop (M-TAB-3): a JSON file or text from another app, through the same check.

    func tableView(_ tableView: UITableView, canHandle session: any UIDropSession) -> Bool {
        session.items.count == 1
            && session.hasItemsConforming(toTypeIdentifiers: [UTType.json.identifier, UTType.plainText.identifier])
    }

    func tableView(
        _ tableView: UITableView, dropSessionDidUpdate session: any UIDropSession,
        withDestinationIndexPath destinationIndexPath: IndexPath?
    ) -> UITableViewDropProposal {
        UITableViewDropProposal(operation: .copy, intent: .unspecified)
    }

    func tableView(_ tableView: UITableView, performDropWith coordinator: any UITableViewDropCoordinator) {
        guard let provider = coordinator.session.items.first?.itemProvider else { return }
        if provider.hasItemConformingToTypeIdentifier(UTType.json.identifier) {
            // The system's copy of the file lasts only for this handler, so it is read here.
            _ = provider.loadFileRepresentation(for: .json) { [weak self] url, _, _ in
                let file: Result<Data, DocumentFileProblem> = url.map { readDocumentFile(at: $0) } ?? .failure(.unreadable)
                Task { @MainActor in self?.open(file) }
            }
        } else {
            _ = provider.loadObject(ofClass: String.self) { [weak self] text, _ in
                let data = text.map { Data($0.utf8) }
                Task { @MainActor in
                    if let data { self?.open(data) } else { self?.alert(title: L10n.text("import.unreadable"), message: nil) }
                }
            }
        }
    }

    func paste() {
        guard let text = UIPasteboard.general.string else {
            alert(title: L10n.text("paste.empty"), message: nil)
            return
        }
        open(Data(text.utf8))
    }

    func loadExamples() {
        for data in Examples.data() {
            if case .failure(let refusal) = store.open(data) { show(refusal) }
        }
    }

    private func open(_ data: Data) {
        switch store.open(data) {
        case .success(let document): show(document)
        case .failure(let refusal): show(refusal)
        }
    }

    private func show(_ document: Document) {
        if let split = splitViewController as? SplitViewController {
            split.show(document)
            selectShown()
        } else {
            navigationController?.pushViewController(SummaryViewController(document: document), animated: true)
        }
    }

    /// Beside the open summary (M-TAB-1), its row stays selected.
    private func selectShown() {
        guard let split = splitViewController as? SplitViewController, !split.isCollapsed,
            let row = store.documents.firstIndex(where: { $0.id == split.shownID })
        else { return }
        tableView.selectRow(at: IndexPath(row: row, section: 0), animated: false, scrollPosition: .none)
    }

    /// M-LIST-3: the problem in words, and its code; the list is unchanged.
    private func show(_ refusal: Refusal) {
        alert(
            title: L10n.text("refusal.title"),
            message: L10n.refusal(refusal) + "\n\n" + L10n.text("refusal.code", refusal.code))
    }

    private func alert(title: String, message: String?) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: L10n.text("ok"), style: .default))
        present(alert, animated: true)
    }

    // MARK: The list (M-LIST-1, M-LIST-2)

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        store.documents.count
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "summary", for: indexPath)
        let document = store.documents[indexPath.row]
        var content = UIListContentConfiguration.subtitleCell()
        let title = document.title ?? L10n.text("list.untitled")
        content.text = document.patientName ?? title
        content.secondaryText = [
            document.patientName == nil ? nil : title, formatFHIRDate(document.date),
        ].compactMap { $0 }.joined(separator: "\n")
        content.secondaryTextProperties.numberOfLines = 0
        content.secondaryTextProperties.color = .secondaryLabel
        cell.contentConfiguration = content
        cell.accessoryType = splitViewController?.isCollapsed ?? true ? .disclosureIndicator : .none
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        if splitViewController?.isCollapsed ?? true { tableView.deselectRow(at: indexPath, animated: true) }
        show(store.documents[indexPath.row])
    }

    override func tableView(
        _ tableView: UITableView, trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath
    ) -> UISwipeActionsConfiguration? {
        let id = store.documents[indexPath.row].id
        let delete = UIContextualAction(style: .destructive, title: L10n.text("list.delete")) {
            [weak self] _, _, done in
            self?.store.remove(id)
            done(true)
        }
        return UISwipeActionsConfiguration(actions: [delete])
    }

    override func tableView(
        _ tableView: UITableView, contextMenuConfigurationForRowAt indexPath: IndexPath, point: CGPoint
    ) -> UIContextMenuConfiguration? {
        let id = store.documents[indexPath.row].id
        return UIContextMenuConfiguration(actionProvider: { [weak self] _ in
            UIMenu(children: [
                UIAction(
                    title: L10n.text("list.delete"), image: UIImage(systemName: "trash"), attributes: .destructive
                ) { _ in self?.store.remove(id) }
            ])
        })
    }

    // VoiceOver users delete without a swipe: the rotor's actions list has Delete too.
    override func tableView(_ tableView: UITableView, willDisplay cell: UITableViewCell, forRowAt indexPath: IndexPath) {
        let id = store.documents[indexPath.row].id
        cell.accessibilityCustomActions = [
            UIAccessibilityCustomAction(name: L10n.text("list.delete")) { [weak self] _ in
                self?.store.remove(id)
                return true
            }
        ]
    }

    // MARK: Empty state

    private func emptyState() -> UIView {
        let heading = UILabel()
        heading.text = L10n.text("list.empty.title")
        heading.font = .preferredFont(forTextStyle: .title2)
        heading.accessibilityTraits = .header
        let body = UILabel()
        body.text = L10n.text("list.empty.body")
        body.font = .preferredFont(forTextStyle: .body)
        body.textColor = .secondaryLabel
        for label in [heading, body] {
            label.numberOfLines = 0
            label.textAlignment = .center
            label.adjustsFontForContentSizeCategory = true
        }
        let buttons = [
            button("list.examples", "books.vertical", filled: true) { [weak self] in self?.loadExamples() },
            button("list.import", "doc", filled: false) { [weak self] in self?.importFile() },
            button("list.paste", "doc.on.clipboard", filled: false) { [weak self] in self?.paste() },
        ]
        let stack = UIStackView(arrangedSubviews: [heading, body] + buttons)
        stack.axis = .vertical
        stack.spacing = 16
        stack.setCustomSpacing(24, after: body)
        stack.translatesAutoresizingMaskIntoConstraints = false
        let scroll = UIScrollView()
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 32),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -32),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -24),
        ])
        return scroll
    }

    private func button(_ key: String, _ symbol: String, filled: Bool, action: @escaping () -> Void) -> UIButton {
        var configuration: UIButton.Configuration = filled ? .filled() : .gray()
        configuration.title = L10n.text(key)
        configuration.image = UIImage(systemName: symbol)
        configuration.imagePadding = 8
        configuration.buttonSize = .large
        configuration.titleLineBreakMode = .byWordWrapping
        let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
        button.accessibilityIdentifier = key
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        return button
    }
}
