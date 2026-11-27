import IPSKit
import LilyUI
import SwiftUI
import UIKit

/// What About says (spec M-ABOUT-1): safety, privacy, and the versions. Plain data, so a test reads it without a screen.
struct AboutContent: Equatable {
    struct Row: Equatable {
        let text: String
        let secondary: String?
    }

    struct Section: Equatable {
        let heading: String
        let rows: [Row]

        /// Every row names what it is (the versions), as against a paragraph.
        var isTermsAndValues: Bool { rows.allSatisfy { $0.secondary != nil } }
    }

    let sections: [Section]

    init(appVersion: String) {
        sections = [
            Section(heading: L10n.text("about.safety.heading"), rows: [Row(text: L10n.text("about.safety.body"), secondary: nil)]),
            Section(heading: L10n.text("about.privacy.heading"), rows: [Row(text: L10n.text("about.privacy.body"), secondary: nil)]),
            Section(
                heading: L10n.text("about.versions.heading"),
                rows: [
                    Row(text: appVersion, secondary: L10n.text("about.version")),
                    Row(text: "2.0.1", secondary: L10n.text("about.ips")),
                ]),
        ]
    }
}

/// Clear all (M-PRIV-3): it asks first, and nothing is cleared until it is confirmed.
@MainActor @Observable final class AboutModel {
    let store: SummaryStore
    var confirming = false
    private let cleared: () -> Void

    init(store: SummaryStore, cleared: @escaping () -> Void) {
        self.store = store
        self.cleared = cleared
    }

    func askToClearAll() { confirming = true }

    func confirmClearAll() {
        store.clear()
        cleared()
    }
}

/// About (spec M-ABOUT-1): safety, privacy, versions, and Clear all (M-PRIV-3). The first SwiftUI screen (SwiftUI first, UIKit as the fallback).
struct AboutView: View {
    @Bindable var model: AboutModel
    let content: AboutContent

    var body: some View {
        List {
            ForEach(content.sections, id: \.heading) { section in
                Section {
                    if section.isTermsAndValues {
                        // The versions: a term and its value, read as one element each (Lily's SummaryList).
                        SummaryList(label: section.heading) {
                            ForEach(section.rows, id: \.text) { row in
                                SummaryListItem(term: row.secondary ?? "") { Text(verbatim: row.text) }
                            }
                        }
                    } else {
                        ForEach(section.rows, id: \.text) { row in Text(verbatim: row.text) }
                    }
                } header: {
                    Text(verbatim: section.heading)
                }
            }
            Section {
                Button(role: .destructive, action: model.askToClearAll) {
                    Text(verbatim: L10n.text("about.clearAll"))
                }
                .accessibilityIdentifier("clearAll")
            }
        }
        .alert(
            L10n.text("about.clearAll.confirm.title"), isPresented: $model.confirming
        ) {
            Button(L10n.text("cancel"), role: .cancel) {}
            Button(L10n.text("about.clearAll.confirm.action"), role: .destructive, action: model.confirmClearAll)
        } message: {
            Text(verbatim: L10n.text("about.clearAll.confirm.body"))
        }
        .lilyAppearance()
    }
}

/// Hosts `AboutView` for the UIKit navigation stack around it.
final class AboutViewController: UIHostingController<AboutView> {
    let model: AboutModel

    init(store: SummaryStore) {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        var cleared: () -> Void = {}
        let model = AboutModel(store: store) { cleared() }
        self.model = model
        super.init(rootView: AboutView(model: model, content: AboutContent(appVersion: version)))
        cleared = { [weak self] in self?.navigationController?.popToRootViewController(animated: true) }
        title = L10n.text("about.title")
        navigationItem.largeTitleDisplayMode = .never
    }

    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("not used") }
}
