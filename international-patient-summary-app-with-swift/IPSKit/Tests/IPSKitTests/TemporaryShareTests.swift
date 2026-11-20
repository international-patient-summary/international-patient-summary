import Foundation
import Testing

@testable import IPSKit

/// M-PRIV-1, M-SHARE-1, M-PDF-3: every export has an isolated lifetime.
@Suite struct TemporaryShareTests {
    let root = FileManager.default.temporaryDirectory.appending(path: "share-test-\(UUID().uuidString)")

    @Test func twoPatientsSharingTheSameNameKeepTheirOwnExactBytes() throws {
        let martha = try DocumentTests.data("bundle-minimal")
        let patricia = try DocumentTests.data("bundle-ips-all-sections")
        let first = try TemporaryShare.write(
            martha, name: "international-patient-summary.json", under: root,
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!)
        let second = try TemporaryShare.write(
            patricia, name: "international-patient-summary.json", under: root,
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!)

        #expect(first.url != second.url)
        #expect(try Data(contentsOf: first.url) == martha)
        #expect(try Data(contentsOf: second.url) == patricia)
        TemporaryShare.removeAll(under: root)
    }

    @Test func cancellationRemovesOnlyThatShareWhileADelayedRecipientCanStillReadAnother() throws {
        let delayedBytes = try DocumentTests.data("bundle-minimal")
        let delayed = try TemporaryShare.write(delayedBytes, name: "same.json", under: root)
        let cancelled = try TemporaryShare.write(Data("other".utf8), name: "same.json", under: root)

        cancelled.remove()

        #expect(!FileManager.default.fileExists(atPath: cancelled.url.path()))
        #expect(try Data(contentsOf: delayed.url) == delayedBytes)
        delayed.remove()
        TemporaryShare.removeAll(under: root)
    }

    @Test func theNextLaunchRemovesEveryAbandonedShare() throws {
        _ = try TemporaryShare.write(Data([1]), name: "one.json", under: root)
        _ = try TemporaryShare.write(Data([2]), name: "two.pdf", under: root)

        TemporaryShare.removeAll(under: root)

        #expect(!FileManager.default.fileExists(atPath: root.path()))
    }
}
