import IPSKit
import UIKit

/// About (spec M-ABOUT-1): safety, privacy, versions, and Clear all (M-PRIV-3).
final class AboutViewController: UITableViewController {
    private let store: SummaryStore
    private let sections: [(header: String, rows: [(String, String?)])]

    init(store: SummaryStore) {
        self.store = store
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        sections = [
            (L10n.text("about.safety.heading"), [(L10n.text("about.safety.body"), nil)]),
            (L10n.text("about.privacy.heading"), [(L10n.text("about.privacy.body"), nil)]),
            (
                L10n.text("about.versions.heading"),
                [(version, L10n.text("about.version")), ("2.0.1", L10n.text("about.ips"))]
            ),
        ]
        super.init(style: .insetGrouped)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = L10n.text("about.title")
        navigationItem.largeTitleDisplayMode = .never
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "row")
        tableView.register(HeadingView.self, forHeaderFooterViewReuseIdentifier: "heading")
    }

    override func numberOfSections(in tableView: UITableView) -> Int { sections.count + 1 }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        section < sections.count ? sections[section].rows.count : 1
    }

    override func tableView(_ tableView: UITableView, viewForHeaderInSection section: Int) -> UIView? {
        guard section < sections.count else { return nil }
        let view = tableView.dequeueReusableHeaderFooterView(withIdentifier: "heading") as? HeadingView
        view?.set(sections[section].header)
        return view
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath)
        var content = UIListContentConfiguration.subtitleCell()
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.color = .secondaryLabel
        if indexPath.section < sections.count {
            let (text, secondary) = sections[indexPath.section].rows[indexPath.row]
            content.text = text
            content.secondaryText = secondary
            cell.selectionStyle = .none
            cell.accessibilityTraits = .staticText
        } else {
            content.text = L10n.text("about.clearAll")
            content.textProperties.color = .systemRed
            cell.accessibilityTraits = .button
            cell.accessibilityIdentifier = "clearAll"
        }
        cell.contentConfiguration = content
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard indexPath.section == sections.count else { return }
        let confirm = UIAlertController(
            title: L10n.text("about.clearAll.confirm.title"), message: L10n.text("about.clearAll.confirm.body"),
            preferredStyle: .alert)
        confirm.addAction(UIAlertAction(title: L10n.text("cancel"), style: .cancel))
        confirm.addAction(
            UIAlertAction(title: L10n.text("about.clearAll.confirm.action"), style: .destructive) { [weak self] _ in
                self?.store.clear()
                self?.navigationController?.popToRootViewController(animated: true)
            })
        present(confirm, animated: true)
    }
}
