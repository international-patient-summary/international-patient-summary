import Foundation
import Testing

@testable import IPSKit

/// M-VIEW-5, M-VIEW-6, M-VIEW-7, and the writing of dates, ages and quantities.
@Suite struct FormatTests {
    static func json(_ text: String) -> JSON { try! JSON.parse(Data(text.utf8)) }

    @Test func displayPrefersDisplayThenTextThenSystemAndCode() {
        #expect(
            displayOf(Self.json(#"{"coding":[{"code":"1","display":"One"}],"text":"Uno"}"#)) == "One")
        #expect(displayOf(Self.json(#"{"coding":[{"code":"1"}],"text":"Uno"}"#)) == "Uno")
        #expect(
            displayOf(Self.json(#"{"coding":[{"system":"http://snomed.info/sct","code":"1"}]}"#))
                == "SNOMED CT|1")
        #expect(displayOf(Self.json(#"{"coding":[{"code":"1"}]}"#)) == "1")
        #expect(displayOf(Self.json("{}")) == nil)
    }

    @Test func statusesAreCodes() {
        let clinical = Self.json(
            #"{"coding":[{"system":"http://terminology.hl7.org/CodeSystem/condition-clinical","code":"active"}]}"#)
        #expect(statusCode(clinical) == "active")
        #expect(statusCode(Self.json(#"{"text":"Active"}"#)) == "Active")
        #expect(statusCode(nil) == nil)
    }

    @Test func systemLabels() {
        #expect(systemLabel("http://loinc.org") == "LOINC")
        #expect(systemLabel("https://fhir.nhs.uk/Id/nhs-number") == "NHS number")
        #expect(systemLabel("urn:example") == "urn:example")
    }

    @Test func names() {
        #expect(formatHumanName(Self.json(#"[{"given":["Martha"],"family":"DeLarosa"}]"#)) == "Martha DeLarosa")
        #expect(
            formatHumanName(Self.json(#"[{"use":"old","text":"A"},{"use":"official","text":"B"}]"#)) == "B")
        #expect(formatHumanName(Self.json("[]")) == nil)
    }

    @Test func datesWriteTheMonthAsText() {
        let locale = Locale(identifier: "en_GB")
        #expect(formatFHIRDate("2017-12-11T14:30:00+01:00", locale: locale) == "11 December 2017")
        #expect(formatFHIRDate("2017-12", locale: locale) == "December 2017")
        #expect(formatFHIRDate("2017", locale: locale) == "2017")
        #expect(formatFHIRDate("someday", locale: locale) == nil)
        #expect(formatFHIRDate("2017-12-11", locale: Locale(identifier: "en_US")) == "December 11, 2017")
    }

    @Test func ages() {
        let today = ISO8601DateFormatter().date(from: "2026-11-16T12:00:00Z")!
        #expect(ageInYears(birthDate: "1972-05-01", today: today) == 54)
        #expect(ageInYears(birthDate: "1972-11-17", today: today) == 53)
        #expect(ageInYears(birthDate: "1972-11-16", today: today) == 54)
        #expect(ageInYears(birthDate: "1972", today: today) == nil)
    }

    @Test func quantities() {
        #expect(formatQuantity(Self.json(#"{"value":120,"unit":"mm[Hg]"}"#)) == "120\u{00A0}mm[Hg]")
        #expect(formatQuantity(Self.json(#"{"value":1.5,"comparator":"<","code":"mg"}"#)) == "<1.5\u{00A0}mg")
        #expect(formatQuantity(Self.json(#"{"unit":"mg"}"#)) == nil)
        #expect(formatRange(Self.json(#"{"low":{"value":4},"high":{"value":10,"unit":"%"}}"#)) == "4–10\u{00A0}%")
    }

    @Test func narrativeBecomesPlainText() {
        let xhtml = """
            <div xmlns="http://www.w3.org/1999/xhtml"><p>Penicillin &amp; <b>amoxicillin</b></p>\
            <script>alert(1)</script><ul><li>Rash</li><li>Fever&#160;&#x2014; high</li></ul></div>
            """
        #expect(plainText(fromXHTML: xhtml) == "Penicillin & amoxicillin\n• Rash\n• Fever — high")
        #expect(plainText(fromXHTML: "<div/>") == nil)
        #expect(plainText(fromXHTML: "a &unknown; b") == "a &unknown; b")
    }

    @Test func absentStates() {
        #expect(state(fromEmptyReason: Self.json(#"{"coding":[{"code":"nilknown"}]}"#)) == .noneKnown)
        #expect(state(fromEmptyReason: Self.json(#"{"coding":[{"code":"notasked"}]}"#)) == .notRecorded)
        #expect(state(fromEmptyReason: Self.json(#"{"coding":[{"code":"withheld"}]}"#)) == .unavailable)
        #expect(state(fromEmptyReason: Self.json(#"{"text":"?"}"#)) == .unavailable)
        let ips = absentUnknownSystem
        #expect(absentState(ofConcept: Self.json(#"{"coding":[{"system":"\#(ips)","code":"no-known-allergies"}]}"#)) == .noneKnown)
        #expect(absentState(ofConcept: Self.json(#"{"coding":[{"system":"\#(ips)","code":"no-allergy-info"}]}"#)) == .notRecorded)
        #expect(absentState(ofConcept: Self.json(#"{"coding":[{"system":"http://snomed.info/sct","code":"716186003"}]}"#)) == .noneKnown)
        #expect(absentState(ofConcept: Self.json(#"{"coding":[{"system":"http://snomed.info/sct","code":"1"}]}"#)) == nil)
    }
}
