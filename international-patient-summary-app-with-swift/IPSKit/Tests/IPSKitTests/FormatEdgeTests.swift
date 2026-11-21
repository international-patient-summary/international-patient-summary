import Foundation
import Testing

@testable import IPSKit

/// The edges of the formatters: absent input, bad dates, one-sided ranges.
@Suite struct FormatEdgeTests {
    static func json(_ text: String) -> JSON { try! JSON.parse(Data(text.utf8)) }

    @Test func systemLabelOfNothingIsEmpty() { #expect(systemLabel(nil) == "") }

    @Test func displayFallsBackToAnyCodingDisplayThenText() {
        #expect(displayOf(Self.json(#"{"coding":[{"code":"a"},{"display":"B"}]}"#)) == "B")
        #expect(displayOf(Self.json(#"{"coding":[{"code":"a"}],"text":"T"}"#)) == "T")
    }

    @Test func humanNameWithPrefixAndSuffix() {
        let names = Self.json(#"[{"prefix":["Dr"],"given":["Jo"],"family":"Doe","suffix":["Jr"]}]"#)
        #expect(formatHumanName(names) == "Dr Jo Doe Jr")
    }

    @Test func malformedDatesAreRefused() {
        for text in ["", "2020-13", "2020-00-01", "2020-02-30", "2020-01-32", "0000", "2020T", "2020T1T2", "x"] {
            #expect(FHIRDate(text) == nil, "\(text)")
        }
        #expect(FHIRDate(nil) == nil)
        #expect(FHIRDate("2020-01-05T10:00:00Z")?.day == 5)
        #expect(formatFHIRDate("2020-13") == "2020-13", "unreadable dates are shown as written")
        #expect(formatFHIRDate("  ") == nil)
        #expect(formatFHIRDate(nil) == nil)
    }

    @Test func ageNeedsAFullDateAndABirthInThePast() {
        let today = Date(timeIntervalSince1970: 1_700_000_000)  // 2023-11-14
        #expect(ageInYears(birthDate: "2000", today: today) == nil)
        #expect(ageInYears(birthDate: nil, today: today) == nil)
        #expect(ageInYears(birthDate: "2030-01-01", today: today) == nil)
        #expect(ageInYears(birthDate: "2000-12-01", today: today) == 22)
        #expect(ageInYears(birthDate: "2000-11-14", today: today) == 23)
    }

    @Test func rangesMayBeOneSided() {
        #expect(formatRange(Self.json(#"{"low":{"value":1,"unit":"mg"},"high":{"value":2}}"#)) == "1\u{00A0}mg–2")
        #expect(formatRange(Self.json(#"{"low":{"value":1}}"#)) == "≥1")
        #expect(formatRange(Self.json(#"{"high":{"value":2}}"#)) == "≤2")
        #expect(formatRange(Self.json("{}")) == nil)
        #expect(formatRange(nil) == nil)
        #expect(formatQuantity(Self.json(#"{"comparator":"<","value":3,"code":"g"}"#)) == "<3\u{00A0}g")
    }

    @Test func plainTextOfNothingIsNil() {
        #expect(plainText(fromXHTML: nil) == nil)
        #expect(plainText(fromXHTML: "") == nil)
    }
}
