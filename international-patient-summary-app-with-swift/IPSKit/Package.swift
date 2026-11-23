// swift-tools-version: 6.0
// IPSKit: the app's UIKit-free core (spec §3). Foundation, and CryptoKit for
// the encrypted store, and Lily's pure-Swift LilyCore, so `swift test` proves it on a Mac without a simulator.
import PackageDescription

let package = Package(
    name: "IPSKit",
    defaultLocalization: "en",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "IPSKit", targets: ["IPSKit"])
    ],
    dependencies: [
        // Lily Design System (spec §8.1): a local checkout beside this repository, not published.
        .package(name: "lily-design-system-swift", path: "../../../../lilydesignsystem/lily-design-system/lily-design-system-swift")
    ],
    targets: [
        .target(name: "IPSKit", dependencies: [.product(name: "LilyCore", package: "lily-design-system-swift")]),
        .testTarget(
            name: "IPSKitTests",
            dependencies: ["IPSKit"],
            resources: [.copy("Fixtures")]
        ),
    ],
    swiftLanguageModes: [.v6]
)
