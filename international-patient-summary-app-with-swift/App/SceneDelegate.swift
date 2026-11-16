import UIKit

/// The window: the summaries list and the open summary (side by side when wide), and the privacy cover.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var cover: UIView?

    func scene(
        _ scene: UIScene, willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = SplitViewController(store: SummaryStore.shared)
        window.makeKeyAndVisible()
        self.window = window
    }

    // M-PRIV-2: the app switcher shows a cover, never a patient's record.
    func sceneWillResignActive(_ scene: UIScene) {
        guard cover == nil, let window else { return }
        let cover = PrivacyCoverView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(cover)
        self.cover = cover
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        cover?.removeFromSuperview()
        cover = nil
    }
}

/// A plain screen with the app's name.
final class PrivacyCoverView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .systemBackground
        let label = UILabel()
        label.text = L10n.text("app.name")
        label.font = .preferredFont(forTextStyle: .title1)
        label.adjustsFontForContentSizeCategory = true
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: centerXAnchor),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError("not used") }
}
