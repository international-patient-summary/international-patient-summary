import Foundation
import IPSKit

/// The open summaries, newest first, and the relationships given to the people
/// they are about. Every change is saved at once to the encrypted store on this
/// device (M-STORE-1, M-STORE-2), and read back at launch, so they outlast closing
/// the app and restarting the phone. Only the encrypted store persists this state (M-PRIV-1).
@MainActor
final class SummaryStore {
    static let shared: SummaryStore = {
        let saving = EncryptedStore(
            directory: SummaryStore.directory, keys: KeychainKeys(), writing: .completeFileProtection)
        // The UI tests start each run empty.
        if CommandLine.arguments.contains("-startEmpty") { saving.clear() }
        return SummaryStore(saving: saving)
    }()

    /// Application Support/Store, kept out of backups and device transfer (M-STORE-2).
    static var directory: URL {
        URL.applicationSupportDirectory.appending(path: "Store", directoryHint: .isDirectory)
    }

    private let saved: EncryptedStore?

    /// - Parameter saving: the encrypted store, read now; nil keeps everything in memory.
    init(saving: EncryptedStore?) {
        saved = saving
        if let (documents, relationships) = saving?.load() {
            self.documents = documents
            self.relationships = Relationships(relationships)
        }
    }
    static let changed = Notification.Name("SummaryStore.changed")

    private(set) var documents: [Document] = []
    /// M-PEOPLE-3: each person's relationship to the person using the app; never shared.
    private var relationships = Relationships()

    /// M-PEOPLE-1, M-PEOPLE-2: the people the summaries are about, newest first.
    var people: [Person] { IPSKit.people(documents) }

    func person(of id: Document.ID) -> Person? { people.first { $0.contains(id) } }

    func relationship(of person: Person) -> Relationship { relationships.of(person) }

    func setRelationship(_ relationship: Relationship, for person: Person) {
        relationships.set(relationship, for: person, among: people)
        changed()
    }

    /// M-SHARE-2: a carer confirms whose summary they share when there is more than one person.
    var hasSeveralPeople: Bool { people.count > 1 }

    /// Check `data` and, if it is an IPS document, open it at the top of the list.
    @discardableResult
    func open(_ data: Data) -> Result<Document, Refusal> {
        let result = Document.open(data)
        if case .success(let document) = result {
            documents.insert(document, at: 0)
            relationships.settle(people)
            changed()
        }
        return result
    }

    func remove(_ id: Document.ID) {
        if let person = person(of: id) { relationships.remove(id, from: person) }
        documents.removeAll { $0.id == id }
        relationships.settle(people)
        changed()
    }

    /// M-PEOPLE-4: forget every summary about a person, and their relationship.
    func forget(_ person: Person) {
        let ids = Set(person.documents.map(\.id))
        documents.removeAll { ids.contains($0.id) }
        relationships.forget(ids)
        changed()
    }

    /// M-PRIV-3: forget every summary and every relationship.
    func clear() {
        documents.removeAll()
        relationships.removeAll()
        // M-STORE-4: every file, and the key.
        saved?.clear()
        changed()
    }

    private func changed() {
        saved?.save(documents, relationships: relationships.all)
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

    /// Write a file to share (the document's exact bytes, or its PDF), protected
    /// while the device is locked; removed when sharing ends and at launch (M-PDF-3).
    static func write(_ data: Data, name: String = name) throws -> URL {
        removeAll()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appending(path: name)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    static func removeAll() {
        try? FileManager.default.removeItem(at: directory)
    }
}
