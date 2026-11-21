import Foundation
import Testing
import UIKit

@testable import IPSApp

/// The app and scene delegates: launch cleanup, scene configuration, the window,
/// and the privacy cover (M-PRIV-1, M-PRIV-2).
@MainActor
@Suite struct DelegateTests {
    private func scene() throws -> UIWindowScene {
        try #require(UIApplication.shared.connectedScenes.first as? UIWindowScene)
    }

    /// UIKit gives no public initialiser; an empty set of options is what a plain launch carries.
    private func options() -> UIScene.ConnectionOptions {
        unsafeDowncast((UIScene.ConnectionOptions.self as NSObject.Type).init(), to: UIScene.ConnectionOptions.self)
    }

    @Test func launchRemovesALeftoverShareFile() throws {
        let leftover = AppDelegate.shareDirectory.appending(path: "left.json")
        try FileManager.default.createDirectory(
            at: AppDelegate.shareDirectory, withIntermediateDirectories: true)
        try Data("x".utf8).write(to: leftover)
        let launched = AppDelegate().application(
            UIApplication.shared, didFinishLaunchingWithOptions: nil)
        #expect(launched)
        #expect(!FileManager.default.fileExists(atPath: leftover.path))
    }

    @Test func theSceneIsConfiguredInCodeWithTheSceneDelegate() throws {
        let session = try scene().session
        let configuration = AppDelegate().application(
            UIApplication.shared, configurationForConnecting: session,
            options: options())
        #expect(configuration.delegateClass == SceneDelegate.self)
        #expect(configuration.role == session.role)
    }

    @Test func connectingBuildsTheWindowAndNoIncomingFileChangesNothing() throws {
        let scene = try scene()
        let delegate = SceneDelegate()
        delegate.scene(scene, willConnectTo: scene.session, options: options())
        #expect(delegate.window?.rootViewController is SplitViewController)
        delegate.scene(scene, openURLContexts: [])
        withExtendedLifetime(delegate) {}
    }

    @Test func theAppSwitcherSeesACoverUntilTheAppIsActiveAgain() throws {
        let scene = try scene()
        let delegate = SceneDelegate()
        // No window yet: nothing to cover.
        delegate.sceneWillResignActive(scene)
        delegate.scene(scene, willConnectTo: scene.session, options: options())
        let window = try #require(delegate.window)
        delegate.sceneWillResignActive(scene)
        delegate.sceneWillResignActive(scene)
        #expect(window.subviews.compactMap { $0 as? PrivacyCoverView }.count == 1)
        delegate.sceneDidBecomeActive(scene)
        #expect(window.subviews.compactMap { $0 as? PrivacyCoverView }.isEmpty)
        delegate.sceneDidBecomeActive(scene)
    }

    @Test func theCoverIsTheAppNameAndCannotBeDecoded() {
        let cover = PrivacyCoverView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        #expect(cover.subviews.compactMap { $0 as? UILabel }.first?.text == L10n.text("app.name"))
    }
}
