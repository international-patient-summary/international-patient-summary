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

/// The encrypted on-device store (spec §5.2, M-STORE-1..4): each summary's exact
/// bytes in a file of its own, and an index of the summaries, newest first, with
/// their relationships. Each file is sealed with AES-256-GCM, a fresh nonce, and
/// its role as associated data, so a file cannot stand in for another.
///
/// Not thread-safe: the app uses it from the main actor only.
public final class EncryptedStore {
    private let directory: URL
    private let keys: any StoreKeys
    private let writing: Data.WritingOptions
    /// False when the key exists but could not be read at launch: then nothing is
    /// written, so a locked device never loses its summaries.
    public private(set) var isWritable = true

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
    /// and its file deleted. Without a key, or with an index that cannot be read,
    /// the store is deleted and starts empty.
    public func load() -> (documents: [Document], relationships: [Document.ID: Relationship]) {
        let key: SymmetricKey
        do {
            guard let existing = try keys.existing() else {
                removeFiles()
                return ([], [:])
            }
            try prepareDirectory()
            key = existing
        } catch {
            isWritable = false
            return ([], [:])
        }
        guard let sealed = try? Data(contentsOf: file(Self.indexName)),
            let plain = try? open(sealed, key: key, role: "index"),
            let index = try? JSONDecoder().decode(Index.self, from: plain)
        else {
            removeFiles()
            return ([], [:])
        }
        var documents: [Document] = []
        var relationships: [Document.ID: Relationship] = [:]
        for entry in index.summaries {
            let url = file(Self.summaryName(entry.id))
            guard let sealed = try? Data(contentsOf: url),
                let bytes = try? open(sealed, key: key, role: "summary:\(entry.id.uuidString)"),
                case .success(let document) = Document.open(bytes, id: entry.id)
            else {
                try? FileManager.default.removeItem(at: url)
                continue
            }
            documents.append(document)
            if let raw = entry.relationship, let relationship = Relationship(rawValue: raw), relationship != .none {
                relationships[entry.id] = relationship
            }
        }
        // Files the index does not name (an interrupted save) go.
        let named = Set([Self.indexName] + documents.map { Self.summaryName($0.id) })
        for url in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        where !named.contains(url.lastPathComponent) {
            try? FileManager.default.removeItem(at: url)
        }
        if documents.count != index.summaries.count { save(documents, relationships: relationships) }
        return (documents, relationships)
    }

    // MARK: Writing (M-STORE-1, M-STORE-4)

    /// Save exactly these summaries (newest first) and relationships: new summaries'
    /// files are written, removed ones deleted, and the index rewritten. A summary's
    /// bytes never change, so its file is written once.
    public func save(_ documents: [Document], relationships: [Document.ID: Relationship]) {
        guard isWritable else { return }
        if documents.isEmpty {
            removeFiles()
            return
        }
        do {
            let key = try keys.existing() ?? keys.create()
            try prepareDirectory()
            let present = Set(
                (try? FileManager.default.contentsOfDirectory(atPath: directory.path(percentEncoded: false))) ?? [])
            for document in documents where !present.contains(Self.summaryName(document.id)) {
                try seal(document.data, key: key, role: "summary:\(document.id.uuidString)")
                    .write(to: file(Self.summaryName(document.id)), options: writing.union(.atomic))
            }
            let index = Index(
                summaries: documents.map {
                    Index.Entry(id: $0.id, relationship: relationships[$0.id].map(\.rawValue))
                })
            try seal(JSONEncoder().encode(index), key: key, role: "index")
                .write(to: file(Self.indexName), options: writing.union(.atomic))
            let kept = Set([Self.indexName] + documents.map { Self.summaryName($0.id) })
            for name in present where !kept.contains(name) {
                try? FileManager.default.removeItem(at: file(name))
            }
        } catch {
            // Nothing is logged (M-PRIV-4); the summaries stay open in memory.
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
