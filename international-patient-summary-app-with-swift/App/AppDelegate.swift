import IPSKit
import UIKit

/// UIKit's entry point. The one scene is configured in code, so there is no storyboard.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // M-PRIV-1: a share file left by a previous run is removed at launch.
        TemporaryShare.removeAll(under: Self.shareDirectory)
        return true
    }

    static var shareDirectory: URL {
        FileManager.default.temporaryDirectory.appending(path: "share", directoryHint: .isDirectory)
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}
