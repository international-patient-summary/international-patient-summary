// swift-tools-version: 6.0
// IPSKit: the app's UIKit-free core (spec §3). Foundation, and CryptoKit for
// the encrypted store, so `swift test` proves it on a Mac without a simulator.
import PackageDescription

let package = Package(
    name: "IPSKit",
    defaultLocalization: "en",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "IPSKit", targets: ["IPSKit"])
    ],
    targets: [
        .target(name: "IPSKit"),
        .testTarget(
            name: "IPSKitTests",
            dependencies: ["IPSKit"],
            resources: [.copy("Fixtures")]
        ),
    ],
    swiftLanguageModes: [.v6]
)
