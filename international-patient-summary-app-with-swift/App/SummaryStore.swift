import Foundation
import IPSKit

/// The open summaries, newest first, in memory only (M-PRIV-1). Nothing here is
/// written to a file, the keychain, preferences, or a backup.
@MainActor
final class SummaryStore {
    static let shared = SummaryStore()
    static let changed = Notification.Name("SummaryStore.changed")

    private(set) var documents: [Document] = []

    /// Check `data` and, if it is an IPS document, open it at the top of the list.
    @discardableResult
    func open(_ data: Data) -> Result<Document, Refusal> {
        let result = Document.open(data)
        if case .success(let document) = result {
            documents.insert(document, at: 0)
            changed()
        }
        return result
    }

    func remove(_ id: Document.ID) {
        documents.removeAll { $0.id == id }
        changed()
    }

    /// M-PRIV-3: forget every summary.
    func clear() {
        documents.removeAll()
        changed()
    }

    private func changed() {
        NotificationCenter.default.post(name: Self.changed, object: self)
    }
}

/// The five IG examples bundled for M-LOAD-3, in the order they are opened.
enum Examples {
    static let names = [
        "bundle-minimal", "bundle-no-info-required-sections", "IPS-examples-Bundle-with-immunization",
        "bundle-ips-all-sections", "IPS-examples-Bundle-01",
    ]

    static func data() -> [Data] {
        names.compactMap { Bundle.main.url(forResource: $0, withExtension: "json") }
            .compactMap { try? Data(contentsOf: $0) }
    }
}

/// The temporary file a share hands to the share sheet (M-SHARE-1).
enum ShareFile {
    /// Never the patient's name or identifiers.
    static let name = "international-patient-summary.json"

    static var directory: URL {
        FileManager.default.temporaryDirectory.appending(path: "share", directoryHint: .isDirectory)
    }

    /// Write the document's exact bytes, protected while the device is locked.
    static func write(_ data: Data) throws -> URL {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appending(path: name)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    static func removeAll() {
        try? FileManager.default.removeItem(at: directory)
    }
}
