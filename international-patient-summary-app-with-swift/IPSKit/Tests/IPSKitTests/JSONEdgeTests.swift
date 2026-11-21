import Foundation
import Testing

@testable import IPSKit

/// The JSON reader's accessors and its refusals of malformed input.
@Suite struct JSONEdgeTests {
    static func parse(_ text: String) throws -> JSON { try JSON.parse(Data(text.utf8)) }

    @Test func accessorsAnswerOnlyForTheirOwnKind() throws {
        let value = try Self.parse(#"{"n":12,"b":true,"s":"x","a":[1],"z":null}"#)
        #expect(value["n"]?.number == "12")
        #expect(value["b"]?.bool == true)
        #expect(value["s"]?.number == nil)
        #expect(value["s"]?.bool == nil)
        #expect(value["n"]?.bool == nil)
        #expect(value["b"]?.number == nil)
    }

    @Test(arguments: [
        "", "   ", "{", "[1,", "[1 2]", "{\"a\" 1}", "{\"a\":1 \"b\":2}", "{1:2}", "{\"a\":}",
        "nul", "trux", "falsy", "-", "1.", "1e", "1e+", "01x", "[1]]", "\"abc", "\"\\u12\"",
        "@",
    ]) func malformedInputIsRefused(text: String) {
        #expect(throws: (any Error).self) { try Self.parse(text) }
    }

    @Test(arguments: ["0", "-0", "1.5", "1e5", "1E-5", "-12.25e+3", "null", "true", "false", "[]", "{}"])
    func wellFormedScalarsParse(text: String) throws {
        _ = try Self.parse(text)
    }

    @Test func invalidUTF8NumberBytesAreRefused() {
        #expect(throws: (any Error).self) { try JSON.parse(Data([0x31, 0xFF])) }
    }
}
