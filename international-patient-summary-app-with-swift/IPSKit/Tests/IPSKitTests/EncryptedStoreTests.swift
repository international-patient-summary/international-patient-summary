import CryptoKit
import Foundation
import Synchronization
import Testing

@testable import IPSKit

/// A key in memory, standing in for the Keychain.
final class MemoryKeys: StoreKeys {
    private let key = Mutex<SymmetricKey?>(nil)
    private let locked = Mutex(false)
    let deletions = Mutex(0)

    func existing() throws -> SymmetricKey? {
        if locked.withLock({ $0 }) { throw CocoaError(.fileReadNoPermission) }
        return key.withLock { $0 }
    }

    func create() throws -> SymmetricKey {
        let new = SymmetricKey(size: .bits256)
        key.withLock { $0 = new }
        return new
    }

    func delete() {
        key.withLock { $0 = nil }
        deletions.withLock { $0 += 1 }
    }

    func lock(_ value: Bool) { locked.withLock { $0 = value } }
    func replace() { key.withLock { $0 = SymmetricKey(size: .bits256) } }
}

/// M-STORE-1..4: the encrypted on-device store.
@Suite struct EncryptedStoreTests {
    let directory = FileManager.default.temporaryDirectory.appending(path: "store-\(UUID().uuidString)")
    let keys = MemoryKeys()

    func store() -> EncryptedStore { EncryptedStore(directory: directory, keys: keys) }

    /// The five examples, newest first, as the list holds them after Load examples.
    func examples() throws -> [Document] {
        try [
            "IPS-examples-Bundle-01", "bundle-ips-all-sections", "IPS-examples-Bundle-with-immunization",
            "bundle-no-info-required-sections", "bundle-minimal",
        ].map(DocumentTests.open)
    }

    func files() -> [URL] {
        (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
    }

    @Test func whatIsSavedComesBackAfterARestart() throws {
        let documents = try examples()
        store().save(documents, relationships: [documents[0].id: .parent, documents[3].id: .me])
        // A new store, as after the app closes or the phone restarts.
        let (loaded, relationships) = store().load()
        #expect(loaded.map(\.id) == documents.map(\.id), "same summaries, same order, same IDs")
        #expect(loaded.map(\.data) == documents.map(\.data), "the exact bytes")
        #expect(relationships == [documents[0].id: .parent, documents[3].id: .me])
        #expect(files().count == 6, "five summaries and the index")
    }

    @Test func nothingIsReadableOnDisk() throws {
        store().save(try examples(), relationships: [:])
        for url in files() {
            let bytes = try Data(contentsOf: url)
            #expect(bytes.range(of: Data("DeLarosa".utf8)) == nil, "\(url.lastPathComponent)")
            #expect(bytes.range(of: Data("resourceType".utf8)) == nil)
            #expect(bytes.range(of: Data("parent".utf8)) == nil)
        }
    }

    @Test func theSameBytesSealTwiceDiffer() throws {
        let document = try examples()[0]
        store().save([document], relationships: [:])
        let url = directory.appending(path: EncryptedStore.summaryName(document.id))
        let first = try Data(contentsOf: url)
        try FileManager.default.removeItem(at: url)
        store().save([document], relationships: [:])
        let second = try Data(contentsOf: url)
        #expect(first != second, "the same key, a fresh nonce")
        #expect(first.prefix(12) != second.prefix(12))
    }

    @Test func aDamagedSummaryIsLeftOutAndDeleted() throws {
        let documents = try examples()
        store().save(documents, relationships: [:])
        let damaged = directory.appending(path: EncryptedStore.summaryName(documents[1].id))
        var bytes = try Data(contentsOf: damaged)
        bytes[bytes.count / 2] ^= 0xFF
        try bytes.write(to: damaged)
        let (loaded, _) = store().load()
        #expect(loaded.map(\.id) == documents.enumerated().filter { $0.offset != 1 }.map(\.element.id))
        #expect(!FileManager.default.fileExists(atPath: damaged.path(percentEncoded: false)))
        #expect(store().load().documents.count == 4, "the index was rewritten")
    }

    @Test func oneSummaryCannotStandInForAnother() throws {
        let documents = try Array(examples().prefix(2))
        store().save(documents, relationships: [:])
        let a = directory.appending(path: EncryptedStore.summaryName(documents[0].id))
        let b = directory.appending(path: EncryptedStore.summaryName(documents[1].id))
        try FileManager.default.removeItem(at: a)
        try FileManager.default.copyItem(at: b, to: a)
        #expect(store().load().documents.map(\.id) == [documents[1].id])
    }

    @Test func aDamagedIndexOrAnotherKeyStartsEmpty() throws {
        store().save(try examples(), relationships: [:])
        keys.replace()
        #expect(store().load().documents.isEmpty)
        #expect(files().isEmpty, "the store is deleted")
    }

    @Test func withoutTheKeyTheStoreIsDeleted() throws {
        store().save(try examples(), relationships: [:])
        keys.delete()
        #expect(store().load().documents.isEmpty)
        #expect(files().isEmpty)
    }

    @Test func aKeyThatCannotBeReadNowLeavesTheStoreAlone() throws {
        let documents = try examples()
        store().save(documents, relationships: [:])
        keys.lock(true)
        let locked = store()
        #expect(locked.load().documents.isEmpty)
        locked.save([], relationships: [:])
        #expect(files().count == 6, "nothing deleted or written while locked")
        keys.lock(false)
        #expect(store().load().documents.count == 5)
    }

    @Test func deletingASummaryDeletesItsFile() throws {
        let documents = try examples()
        store().save(documents, relationships: [:])
        store().save(Array(documents.dropFirst(2)), relationships: [:])
        #expect(files().count == 4)
        #expect(store().load().documents.map(\.id) == documents.dropFirst(2).map(\.id))
    }

    @Test func clearAllDeletesEveryFileAndTheKey() throws {
        store().save(try examples(), relationships: [:])
        store().clear()
        #expect(files().isEmpty)
        #expect(keys.deletions.withLock { $0 } == 1)
        #expect(try keys.existing() == nil)
    }
}
