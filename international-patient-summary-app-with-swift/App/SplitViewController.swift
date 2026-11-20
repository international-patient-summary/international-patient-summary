import IPSKit
import UIKit

/// The window's root (spec M-TAB-1): on iPad and in wide windows the summaries
/// list sits beside the open summary; on iPhone and in narrow windows it
/// collapses to one navigation stack, as before.
final class SplitViewController: UISplitViewController, UISplitViewControllerDelegate {
    private let store: SummaryStore
    private var observer: (any NSObjectProtocol)?
    private weak var storageAlert: UIAlertController?
    /// The summary in the secondary column, if any.
    private(set) var shownID: Document.ID?

    init(store: SummaryStore) {
        self.store = store
        super.init(style: .doubleColumn)
        delegate = self
        preferredDisplayMode = .oneBesideSecondary
        preferredSplitBehavior = .tile
        presentsWithGesture = false
        let list = UINavigationController(rootViewController: SummaryListViewController(store: store))
        list.navigationBar.prefersLargeTitles = true
        setViewController(list, for: .primary)
        setViewController(PlaceholderViewController.inNavigation(), for: .secondary)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        // A summary that is deleted or cleared leaves the secondary column (M-PRIV-3).
        observer = NotificationCenter.default.addObserver(
            forName: SummaryStore.changed, object: store, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.forgetIfGone()
                self?.showStorageProblemIfNeeded()
            }
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // An unavailable store was found before the view began observing.
        showStorageProblemIfNeeded()
    }

    /// Show a summary: beside the list when expanded, pushed over it when collapsed.
    func show(_ document: Document) {
        shownID = document.id
        setViewController(SummaryViewController(document: document), for: .secondary)
        show(.secondary)
    }

    // MARK: Keyboard (M-TAB-2): the same actions as the buttons, named in the ⌘ menu.

    override var keyCommands: [UIKeyCommand]? {
        [
            UIKeyCommand(title: L10n.text("list.import"), action: #selector(importFile), input: "o", modifierFlags: .command),
            UIKeyCommand(title: L10n.text("list.paste"), action: #selector(pasteSummary), input: "v", modifierFlags: .command),
            UIKeyCommand(title: L10n.text("list.examples"), action: #selector(loadExamples), input: "e", modifierFlags: .command),
        ]
    }

    private var list: SummaryListViewController? {
        (viewController(for: .primary) as? UINavigationController)?.viewControllers.first as? SummaryListViewController
    }

    /// M-LOAD-4: a file from another app.
    func openIncoming(_ url: URL) { list?.openIncoming(url) }

    @objc private func importFile() { list?.importFile() }
    @objc private func pasteSummary() { list?.paste() }
    @objc private func loadExamples() { list?.loadExamples() }
    /// ⌘⌫ (on the list, which the Delete key reaches first): forget the open summary.
    func deleteShown() {
        if let id = shownID { store.remove(id) }
    }

    private func forgetIfGone() {
        guard let id = shownID, !store.documents.contains(where: { $0.id == id }) else { return }
        shownID = nil
        setViewController(PlaceholderViewController.inNavigation(), for: .secondary)
        if isCollapsed, let list = viewController(for: .primary) as? UINavigationController {
            list.popToRootViewController(animated: true)
        }
    }

    /// M-STORE-5: patient data stays open after a failed save, with an explicit retry.
    private func showStorageProblemIfNeeded() {
        guard store.saving != .saved else {
            storageAlert?.dismiss(animated: true)
            storageAlert = nil
            return
        }
        guard storageAlert == nil else { return }
        let message = switch store.saving {
        case .saved: ""
        case .unsaved: L10n.text("storage.notSaved.body")
        case .unavailable: L10n.text("storage.unavailable.body")
        }
        let alert = UIAlertController(
            title: L10n.text("storage.notSaved.title"), message: message, preferredStyle: .alert)
        alert.view.accessibilityIdentifier = "storageProblem"
        alert.addAction(UIAlertAction(title: L10n.text("retry"), style: .default) { [weak self, weak alert] _ in
            self?.storageAlert = nil
            alert?.dismiss(animated: true) {
                self?.store.retry()
                self?.showStorageProblemIfNeeded()
            }
        })
        alert.addAction(UIAlertAction(title: L10n.text("ok"), style: .cancel) { [weak self] _ in
            self?.storageAlert = nil
        })
        storageAlert = alert
        present(alert, animated: true)
    }

    // Collapsing (iPhone, narrow windows): the list is on top unless a summary is open.
    func splitViewController(
        _ svc: UISplitViewController, topColumnForCollapsingToProposedTopColumn proposedTopColumn: Column
    ) -> Column {
        shownID == nil ? .primary : proposedTopColumn
    }

    // The list's rows show a disclosure arrow only when collapsed, and keep their selection when not.
    func splitViewControllerDidCollapse(_ svc: UISplitViewController) { listChanged() }
    func splitViewControllerDidExpand(_ svc: UISplitViewController) { listChanged() }

    private func listChanged() { list?.layoutChanged() }
}

/// The secondary column before a summary is chosen: what to do, in words.
final class PlaceholderViewController: UIViewController {
    /// In a new navigation controller, so nothing of the last summary (its bar, its title) stays behind.
    static func inNavigation() -> UINavigationController {
        UINavigationController(rootViewController: PlaceholderViewController())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        let label = UILabel()
        label.text = L10n.text("list.open")
        label.font = .preferredFont(forTextStyle: .title3)
        label.textColor = .secondaryLabel
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        let guide = view.readableContentGuide
        NSLayoutConstraint.activate([
            label.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
            label.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
        ])
    }
}
