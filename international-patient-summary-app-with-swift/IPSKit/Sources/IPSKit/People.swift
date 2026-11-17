import Foundation

/// M-PEOPLE-3: how a person relates to the person using the app. The raw value
/// names the interface string (`relationship.<raw>`).
public enum Relationship: String, CaseIterable, Sendable {
    case none
    case me = "self"
    case partner, parent, child, sibling, grandparent, grandchild, family, caredFor
}

/// M-PEOPLE-1: the summaries about one person, newest first. Display only: the
/// documents are never merged or changed.
public struct Person: Sendable, Identifiable {
    public let documents: [Document]

    /// Their oldest summary's ID, which a newer summary for them does not change.
    public var id: Document.ID { documents[documents.count - 1].id }
    /// The name from their newest summary that has one.
    public var name: String? { documents.lazy.compactMap(\.patientName).first }
    public var birthDate: String? { documents.lazy.compactMap(\.birthDate).first }

    public func contains(_ id: Document.ID) -> Bool { documents.contains { $0.id == id } }
}

extension Document {
    /// What links this summary's patient to another's (M-PEOPLE-1): each
    /// identifier with both a system and a value, and the name with the birth
    /// date when both are known. Empty for a patient that cannot be matched.
    var personKeys: [String] {
        var keys: [String] = (patient?["identifier"]?.items ?? []).compactMap { identifier in
            guard let system = identifier["system"]?.text, let value = identifier["value"]?.text else { return nil }
            return "id\u{1F}\(system)\u{1F}\(value)"
        }
        if let name = patientName.map(normalizedName), !name.isEmpty, let birthDate {
            keys.append("name\u{1F}\(name)\u{1F}\(birthDate)")
        }
        return keys
    }
}

/// A name compared ignoring case, accents and spacing.
func normalizedName(_ name: String) -> String {
    name.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
        .split(whereSeparator: \.isWhitespace).joined(separator: " ")
}

/// M-PEOPLE-1, M-PEOPLE-2: the people that `documents` (newest first) are about,
/// in the order of each person's newest summary.
public func people(_ documents: [Document]) -> [Person] {
    // Union-find over the documents, joined by any shared key; links are transitive.
    var parent = Array(documents.indices)
    func root(_ i: Int) -> Int {
        var i = i
        while parent[i] != i {
            parent[i] = parent[parent[i]]
            i = parent[i]
        }
        return i
    }
    var firstWithKey: [String: Int] = [:]
    for (index, document) in documents.enumerated() {
        for key in document.personKeys {
            if let other = firstWithKey[key] {
                let (a, b) = (root(index), root(other))
                // The lower index (the newer summary) leads, so order stays newest first.
                if a != b { parent[max(a, b)] = min(a, b) }
            } else {
                firstWithKey[key] = index
            }
        }
    }
    var groups: [Int: [Document]] = [:]
    var order: [Int] = []
    for (index, document) in documents.enumerated() {
        let r = root(index)
        if groups[r] == nil { order.append(r) }
        groups[r, default: []].append(document)
    }
    return order.map { Person(documents: groups[$0]!) }
}

/// M-PEOPLE-3: the relationships given to people, in memory only (M-PRIV-1).
/// Kept per summary, so a person keeps theirs when another summary about them opens.
public struct Relationships: Sendable {
    private var bySummary: [Document.ID: Relationship] = [:]

    public init() {}

    /// Relationships read back from the store (M-STORE-1).
    public init(_ bySummary: [Document.ID: Relationship]) {
        self.bySummary = bySummary.filter { $0.value != .none }
    }

    /// Every summary's relationship, for the store.
    public var all: [Document.ID: Relationship] { bySummary }

    /// The person's relationship: the one given to their newest summary that has one.
    public func of(_ person: Person) -> Relationship {
        person.documents.lazy.compactMap { bySummary[$0.id] }.first { $0 != .none } ?? .none
    }

    /// Give `person` a relationship. Only one person is Me: choosing Me sets the
    /// last one back to Not set.
    public mutating func set(_ relationship: Relationship, for person: Person, among everyone: [Person]) {
        if relationship == .me {
            for other in everyone where other.id != person.id && of(other) == .me {
                for document in other.documents { bySummary[document.id] = nil }
            }
        }
        for document in person.documents {
            bySummary[document.id] = relationship == .none ? nil : relationship
        }
    }

    /// After summaries join or part people (M-PEOPLE-3): each person takes the
    /// relationship of their newest summary that has one, and if two are Me, the
    /// one with the newer summary (earlier in `everyone`, newest first) stays Me.
    public mutating func settle(_ everyone: [Person]) {
        var sawMe = false
        for person in everyone {
            var relationship = of(person)
            if relationship == .me {
                if sawMe { relationship = .none }
                sawMe = true
            }
            for document in person.documents {
                bySummary[document.id] = relationship == .none ? nil : relationship
            }
        }
    }

    /// One summary is deleted: the person's other summaries keep their relationship.
    public mutating func remove(_ id: Document.ID, from person: Person) {
        let kept = of(person)
        bySummary[id] = nil
        guard kept != .none else { return }
        for document in person.documents where document.id != id { bySummary[document.id] = kept }
    }

    /// Forget what was given to these summaries (a person forgotten, or all cleared).
    public mutating func forget(_ ids: some Sequence<Document.ID>) {
        for id in ids { bySummary[id] = nil }
    }

    public mutating func removeAll() { bySummary.removeAll() }

    public var isEmpty: Bool { bySummary.isEmpty }
}
