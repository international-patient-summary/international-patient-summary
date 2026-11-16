import Foundation

/// A JSON value. FHIR resources stay as JSON; the readers in this package
/// pick out what the screens show, and nothing else is interpreted.
public enum JSON: Sendable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    /// Parse UTF-8 JSON text.
    public static func parse(_ data: Data) throws -> JSON {
        try JSONDecoder().decode(JSON.self, from: data)
    }

    public subscript(key: String) -> JSON? {
        if case .object(let members) = self { members[key] } else { nil }
    }

    public subscript(index: Int) -> JSON? {
        if case .array(let items) = self, items.indices.contains(index) { items[index] } else { nil }
    }

    /// The string, or nil for any other kind of value.
    public var string: String? {
        if case .string(let value) = self { value } else { nil }
    }

    /// The string with surrounding white space removed, or nil when that leaves nothing.
    public var text: String? {
        guard let trimmed = string?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty
        else { return nil }
        return trimmed
    }

    public var number: Double? {
        if case .number(let value) = self { value } else { nil }
    }

    public var bool: Bool? {
        if case .bool(let value) = self { value } else { nil }
    }

    /// The items of an array; an empty array for any other kind of value.
    public var items: [JSON] {
        if case .array(let items) = self { items } else { [] }
    }

    public var isObject: Bool {
        if case .object = self { true } else { false }
    }
}

extension JSON: Decodable {
    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSON].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSON].self))
        }
    }
}
