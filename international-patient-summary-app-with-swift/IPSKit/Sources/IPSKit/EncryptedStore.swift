import CryptoKit
import Foundation

/// Where the store's one key lives (M-STORE-2). The app's is the Keychain, for this
/// device only; tests use a key in memory.
public protocol StoreKeys: Sendable {
    /// The key, or nil when there is none. Throws when it exists but cannot be read
    /// now (for example, the device is locked): the store is then left alone.
    func existing() throws -> SymmetricKey?
    /// Make, keep, and return a new key.
    func create() throws -> SymmetricKey
    /// Delete the key, so nothing encrypted under it can be read again.
    func delete()
}

/// `save` was called while the saved summaries cannot be read (M-STORE-5).
public struct StoreUnavailable: Error {}

/// The encrypted on-device store (spec §5.2, M-STORE-1..5): each summary's exact
/// bytes in a file of its own, and an index of the summaries, newest first, with
/// their relationships. Each file is sealed with AES-256-GCM, a fresh nonce, and
/// its role as associated data, so a file cannot stand in for another.
///
/// Not thread-safe: the app uses it from the main actor only.
public final class EncryptedStore {
    private let directory: URL
    private let keys: any StoreKeys
    private let writing: Data.WritingOptions
    /// False when the saved summaries could not be read just now (the key or a
    /// file exists but cannot be read, for example while the device is locked):
    /// then nothing is written or deleted, so they are not lost (M-STORE-3,
    /// M-STORE-5). The next `load()` tries again.
    public private(set) var isWritable = true

    /// Seams for the tests, which make a read or a write fail (M-STORE-5).
    var readFile: (URL) throws -> Data = { try Data(contentsOf: $0) }
    var writeFile: (Data, URL, Data.WritingOptions) throws -> Void = { try $0.write(to: $1, options: $2) }

    static let indexName = "index.sealed"

    /// - Parameter writing: the platform's file protection (`.completeFileProtection` on iOS).
    public init(directory: URL, keys: any StoreKeys, writing: Data.WritingOptions = []) {
        self.directory = directory
        self.keys = keys
        self.writing = writing
    }

    struct Index: Codable {
        struct Entry: Codable {
            let id: UUID
            let relationship: String?
        }
        var version = 1
        var summaries: [Entry]
    }

    // MARK: Reading (M-STORE-1, M-STORE-3)

    /// The saved summaries, newest first, each checked again, and their relationships.
    /// A summary that cannot be decrypted or no longer passes the check is left out
    /// and its file deleted. Without a key, or with an index that cannot be
    /// decrypted or decoded, the store is deleted and starts empty. A key or file
    /// that exists but cannot be read now is not damage: the store is left alone,
    /// the result is empty and `isWritable` is false.
    public func load() -> (documents: [Document], relationships: [Document.ID: Relationship]) {
        isWritable = true
        let key: SymmetricKey
        do {
            guard let existing = try keys.existing() else {
                removeFiles()
                return ([], [:])
            }
            try prepareDirectory()
            key = existing
        } catch {
            return unavailable()
        }
        let sealed: Data
        do {
            sealed = try readFile(file(Self.indexName))
        } catch where Self.isMissing(error) {
            removeFiles()
            return ([], [:])
        } catch {
            return unavailable()
        }
        guard let plain = try? open(sealed, key: key, role: "index"),
            let index = try? JSONDecoder().decode(Index.self, from: plain)
        else {
            removeFiles()
            return ([], [:])
        }
        var documents: [Document] = []
        var relationships: [Document.ID: Relationship] = [:]
        var damaged: [URL] = []
        for entry in index.summaries {
            let url = file(Self.summaryName(entry.id))
            let sealed: Data
            do {
                sealed = try readFile(url)
            } catch where Self.isMissing(error) {
                continue
            } catch {
                return unavailable()
            }
            guard let bytes = try? open(sealed, key: key, role: "summary:\(entry.id.uuidString)"),
                case .success(let document) = Document.open(bytes, id: entry.id)
            else {
                damaged.append(url)
                continue
            }
            documents.append(document)
            if let raw = entry.relationship, let relationship = Relationship(rawValue: raw), relationship != .none {
                relationships[entry.id] = relationship
            }
        }
        // Every file was read, so what failed is damage, and goes; so do files the
        // index does not name (an interrupted save).
        for url in damaged { try? FileManager.default.removeItem(at: url) }
        let named = Set([Self.indexName] + documents.map { Self.summaryName($0.id) })
        for url in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        where !named.contains(url.lastPathComponent) {
            try? FileManager.default.removeItem(at: url)
        }
        // If this fails, the next load leaves out the same summaries again.
        if documents.count != index.summaries.count { try? save(documents, relationships: relationships) }
        return (documents, relationships)
    }

    private func unavailable() -> (documents: [Document], relationships: [Document.ID: Relationship]) {
        isWritable = false
        return ([], [:])
    }

    static func isMissing(_ error: any Error) -> Bool {
        if let error = error as? CocoaError, error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
            return true
        }
        return (error as? POSIXError)?.code == .ENOENT
    }

    // MARK: Writing (M-STORE-1, M-STORE-4, M-STORE-5)

    /// Save exactly these summaries (newest first) and relationships: summaries
    /// without a file are written, then the index, then removed summaries' files
    /// are deleted. A summary's bytes never change, so its file is written once;
    /// one a failed save left unwritten is written by the next. Throws when
    /// anything could not be written: what was saved before still loads, and the
    /// summaries stay open in memory. Nothing is logged (M-PRIV-4).
    public func save(_ documents: [Document], relationships: [Document.ID: Relationship]) throws {
        guard isWritable else { throw StoreUnavailable() }
        if documents.isEmpty {
            do {
                try FileManager.default.removeItem(at: directory)
            } catch where Self.isMissing(error) {}
            return
        }
        let key = try keys.existing() ?? keys.create()
        try prepareDirectory()
        let present = Set(try FileManager.default.contentsOfDirectory(atPath: directory.path(percentEncoded: false)))
        for document in documents where !present.contains(Self.summaryName(document.id)) {
            try writeFile(
                seal(document.data, key: key, role: "summary:\(document.id.uuidString)"),
                file(Self.summaryName(document.id)), writing.union(.atomic))
        }
        let index = Index(
            summaries: documents.map {
                Index.Entry(id: $0.id, relationship: relationships[$0.id].map(\.rawValue))
            })
        try writeFile(seal(JSONEncoder().encode(index), key: key, role: "index"), file(Self.indexName), writing.union(.atomic))
        // A file left here is not in the index, so the next load deletes it.
        let kept = Set([Self.indexName] + documents.map { Self.summaryName($0.id) })
        for name in present where !kept.contains(name) {
            try? FileManager.default.removeItem(at: file(name))
        }
    }

    /// M-STORE-4: Clear all deletes every file and the key.
    public func clear() {
        removeFiles()
        keys.delete()
        isWritable = true
    }

    // MARK: Sealing

    private func seal(_ data: Data, key: SymmetricKey, role: String) throws -> Data {
        // The combined box is nonce, ciphertext and tag; the nonce is fresh each time.
        guard let combined = try AES.GCM.seal(data, using: key, authenticating: Data(role.utf8)).combined else {
            throw CocoaError(.coderInvalidValue)
        }
        return combined
    }

    private func open(_ sealed: Data, key: SymmetricKey, role: String) throws -> Data {
        try AES.GCM.open(AES.GCM.SealedBox(combined: sealed), using: key, authenticating: Data(role.utf8))
    }

    static func summaryName(_ id: UUID) -> String { "\(id.uuidString).sealed" }

    private func file(_ name: String) -> URL { directory.appending(path: name, directoryHint: .notDirectory) }

    /// Clear all and an empty store remove the directory. Apply the backup
    /// exclusion before each write and repair existing installs when loading.
    private func prepareDirectory() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var url = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }

    private func removeFiles() {
        try? FileManager.default.removeItem(at: directory)
    }
}
