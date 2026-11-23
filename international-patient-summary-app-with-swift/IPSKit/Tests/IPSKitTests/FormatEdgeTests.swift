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

/// The age for a clinician (spec M-VIEW-1), at every band edge.
@Suite struct AgeTextTests {
    private let today = Calendar(identifier: .gregorian).date(from: DateComponents(timeZone: TimeZone(identifier: "UTC"), year: 2026, month: 11, day: 23))!
    private let english = Locale(identifier: "en_US")

    private func age(_ birth: String?) -> String? { ageText(birthDate: birth, today: today, locale: english) }

    @Test func daysUnderTwentyEight() {
        #expect(age("2026-11-23") == "0 days")
        #expect(age("2026-11-22") == "1 day")
        #expect(age("2026-10-27") == "27 days")
    }

    @Test func weeksAndDaysUnderAYear() {
        #expect(age("2026-10-26") == "4 weeks")
        #expect(age("2026-10-25") == "4 weeks 1 day")
        #expect(age("2025-11-25") == "51 weeks 6 days")
    }

    @Test func monthsAndDaysUnderTwo() {
        #expect(age("2025-11-23") == "12 months")
        #expect(age("2025-11-22") == "12 months 1 day")
        #expect(age("2024-11-24") == "23 months 30 days")
    }

    @Test func yearsAndMonthsUnderEighteen() {
        #expect(age("2024-11-23") == "2 years")
        #expect(age("2024-10-23") == "2 years 1 month")
        #expect(age("2008-11-24") == "17 years 11 months")
    }

    @Test func yearsAloneFromEighteen() {
        #expect(age("2008-11-23") == "18 years")
        #expect(age("2008-01-01") == "18 years")
        #expect(age("1972-05-01") == "54 years")
    }

    @Test func noAgeForAPartialInvalidOrFutureBirthDate() {
        #expect(age(nil) == nil)
        #expect(age("1972") == nil)
        #expect(age("1972-05") == nil)
        #expect(age("2023-02-31") == nil)
        #expect(age("2026-11-24") == nil)
    }

    @Test func theWordsFollowTheReadersLanguage() {
        // French sets a no-break space between a number and its unit.
        #expect(ageText(birthDate: "2024-10-23", today: today, locale: Locale(identifier: "fr_FR")) == "2 ans 1\u{a0}mois")
    }
}
