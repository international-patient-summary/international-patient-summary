import Foundation

/// A JSON value. FHIR resources stay as JSON; the readers in this package
/// pick out what the screens show, and nothing else is interpreted.
public enum JSON: Sendable, Equatable {
    case null
    case bool(Bool)
    /// The exact JSON token, so a clinical decimal is never rounded or normalised.
    case number(String)
    case string(String)
    case array([JSON])
    case object([String: JSON])

    /// Parse UTF-8 JSON text.
    public static func parse(_ data: Data) throws -> JSON {
        var parser = Parser(data)
        return try parser.parse()
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

    public var number: String? {
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

/// A small RFC 8259 parser that keeps number lexemes. Foundation's numeric
/// decoders turn them into Double and lose trailing zeroes and precision.
private struct Parser {
    private let bytes: [UInt8]
    private var at = 0

    init(_ data: Data) { bytes = Array(data) }

    mutating func parse() throws -> JSON {
        space()
        let value = try value()
        space()
        guard at == bytes.count else { throw error() }
        return value
    }

    private mutating func value() throws -> JSON {
        guard let byte = peek else { throw error() }
        switch byte {
        case 0x6E: try word("null"); return .null
        case 0x74: try word("true"); return .bool(true)
        case 0x66: try word("false"); return .bool(false)
        case 0x22: return .string(try string())
        case 0x5B: return try array()
        case 0x7B: return try object()
        default: return .number(try number())
        }
    }

    private mutating func array() throws -> JSON {
        at += 1
        space()
        var values: [JSON] = []
        if take(0x5D) { return .array(values) }
        while true {
            space()
            values.append(try value())
            space()
            if take(0x5D) { return .array(values) }
            guard take(0x2C) else { throw error() }
        }
    }

    private mutating func object() throws -> JSON {
        at += 1
        space()
        var values: [String: JSON] = [:]
        if take(0x7D) { return .object(values) }
        while true {
            space()
            guard peek == 0x22 else { throw error() }
            let key = try string()
            space()
            guard take(0x3A) else { throw error() }
            space()
            values[key] = try value()
            space()
            if take(0x7D) { return .object(values) }
            guard take(0x2C) else { throw error() }
        }
    }

    private mutating func string() throws -> String {
        let start = at
        at += 1
        var escaped = false
        while at < bytes.count {
            let byte = bytes[at]
            at += 1
            if escaped {
                escaped = false
            } else if byte == 0x5C {
                escaped = true
            } else if byte == 0x22 {
                return try JSONDecoder().decode(String.self, from: Data(bytes[start..<at]))
            }
        }
        throw error()
    }

    private mutating func number() throws -> String {
        let start = at
        _ = take(0x2D)
        if take(0x30) {
            // A leading zero is the whole integer part.
        } else {
            guard takeDigit(1...9) else { throw error() }
            while takeDigit(0...9) {}
        }
        if take(0x2E) {
            guard takeDigit(0...9) else { throw error() }
            while takeDigit(0...9) {}
        }
        if peek == 0x65 || peek == 0x45 {
            at += 1
            if peek == 0x2B || peek == 0x2D { at += 1 }
            guard takeDigit(0...9) else { throw error() }
            while takeDigit(0...9) {}
        }
        guard let number = String(bytes: bytes[start..<at], encoding: .utf8) else { throw error() }
        return number
    }

    private mutating func word(_ word: StaticString) throws {
        let expected = Array("\(word)".utf8)
        guard at + expected.count <= bytes.count, Array(bytes[at..<(at + expected.count)]) == expected else {
            throw error()
        }
        at += expected.count
    }

    private mutating func space() {
        while let byte = peek, byte == 0x20 || byte == 0x09 || byte == 0x0A || byte == 0x0D { at += 1 }
    }

    private var peek: UInt8? { at < bytes.count ? bytes[at] : nil }

    private mutating func take(_ byte: UInt8) -> Bool {
        guard peek == byte else { return false }
        at += 1
        return true
    }

    private mutating func takeDigit(_ range: ClosedRange<UInt8>) -> Bool {
        guard let byte = peek, byte >= 0x30, byte <= 0x39, range.contains(byte - 0x30) else { return false }
        at += 1
        return true
    }

    private func error() -> DecodingError {
        .dataCorrupted(.init(codingPath: [], debugDescription: "Invalid JSON at byte \(at)"))
    }
}
