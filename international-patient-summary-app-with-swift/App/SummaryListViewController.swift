import IPSKit
import UIKit
import UniformTypeIdentifiers

/// Home (spec §4.1): the open summaries, and the three ways to open one.
final class SummaryListViewController: UITableViewController, UIDocumentPickerDelegate {
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

    private func reload() {
        tableView.reloadData()
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

    private func importFile() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        // M-CHECK-2: refuse an oversized file before reading it.
        if let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > maximumDocumentBytes {
            show(.tooLarge)
            return
        }
        guard let data = try? Data(contentsOf: url) else {
            alert(title: L10n.text("import.unreadable"), message: nil)
            return
        }
        open(data)
        // The picker's copy is ours to remove; the summary now lives in memory only.
        try? FileManager.default.removeItem(at: url)
    }

    private func paste() {
        guard let text = UIPasteboard.general.string else {
            alert(title: L10n.text("paste.empty"), message: nil)
            return
        }
        open(Data(text.utf8))
    }

    private func loadExamples() {
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
        navigationController?.pushViewController(SummaryViewController(document: document), animated: true)
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
        cell.accessoryType = .disclosureIndicator
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
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
