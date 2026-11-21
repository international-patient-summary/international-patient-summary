import Foundation
import Testing

@testable import IPSKit

/// The IPS section catalogue (spec M-READ-3) and the Document paths that read
/// references and authors from a hand-built Bundle.
@Suite struct SectionsTests {
    @Test func levelsFollowTheGuide() {
        for key in [SectionKey.allergies, .medications, .problems] { #expect(key.level == .required) }
        for key in [SectionKey.immunizations, .results, .procedures, .devices] {
            #expect(key.level == .recommended)
        }
        for key in SectionKey.allCases where !SectionKey.required.contains(key)
            && ![.immunizations, .results, .procedures, .devices].contains(key)
        {
            #expect(key.level == .optional)
        }
    }

    @Test func everyCodeRoundTripsAndUnknownCodesAreNil() {
        for key in SectionKey.allCases { #expect(SectionKey(code: key.code) == key) }
        #expect(SectionKey(code: "0-0") == nil)
        #expect(SectionKey.required == [.allergies, .medications, .problems])
    }

    @Test func onlyPatientStoryIsNarrative() {
        for key in SectionKey.allCases { #expect(key.expectsEntries == (key != .patientStory)) }
    }

    static func document(_ json: String) throws -> Document {
        let typed = json.replacingOccurrences(
            of: "\"resourceType\":\"Composition\",",
            with:
                "\"resourceType\":\"Composition\",\"type\":{\"coding\":[{\"system\":\"http://loinc.org\",\"code\":\"60591-5\"}]},")
        return try Document.open(Data(typed.utf8)).get()
    }

    @Test func authorsResolveByDisplayNameHumanNameAndPractitionerRole() throws {
        let document = try Self.document(
            """
            {"resourceType":"Bundle","type":"document","entry":[
             {"fullUrl":"urn:c","resource":{"resourceType":"Composition","title":"T","date":"2020-01-01",
              "subject":{"reference":"Patient/p"},
              "author":[{"display":"Shown"},{"reference":"Organization/o"},{"reference":"Practitioner/pr"},
               {"reference":"PractitionerRole/role"},{"reference":"Device/missing"},{"reference":"Device/d"}],
              "section":[]}},
             {"resource":{"resourceType":"Patient","id":"p","name":[{"family":"Doe","given":["Jo"]}]}},
             {"resource":{"resourceType":"Organization","id":"o","name":"Clinic"}},
             {"resource":{"resourceType":"Practitioner","id":"pr","name":[{"family":"Who","given":["Dr"]}]}},
             {"resource":{"resourceType":"PractitionerRole","id":"role","practitioner":{"reference":"Practitioner/pr"}}},
             {"resource":{"resourceType":"Device","id":"d"}}]}
            """)
        #expect(document.authors.prefix(3) == ["Shown", "Clinic", "Dr Who"].prefix(3))
        #expect(document.authors.count == 4)
    }

    @Test func identifiersUseTheSystemOrTheTypeText() throws {
        let document = try Self.document(
            """
            {"resourceType":"Bundle","type":"document","entry":[
             {"resource":{"resourceType":"Composition","subject":{"reference":"Patient/p"},"section":[]}},
             {"resource":{"resourceType":"Patient","id":"p","identifier":[
               {"system":"http://example.org/ids","value":"1"},
               {"type":{"text":"Passport"},"value":"2"},
               {"value":"3"},{"system":"x"}]}}]}
            """)
        let identifiers = document.identifiers
        #expect(identifiers.count == 3)
        #expect(identifiers[1].system == "Passport")
        #expect(identifiers[2].system == "")
    }

    @Test func aReferenceResolvesByTheLastTwoSegmentsOfAnAbsoluteUrl() throws {
        let document = try Self.document(
            """
            {"resourceType":"Bundle","type":"document","entry":[
             {"resource":{"resourceType":"Composition","subject":{"reference":"https://h.example/fhir/Patient/p"},"section":[]}},
             {"resource":{"resourceType":"Patient","id":"p"}}]}
            """)
        #expect(document.patient != nil)
        #expect(document.resolve(nil) == nil)
        #expect(document.resolve("lonely") == nil)
    }
}

/// Entry fallbacks and section states, from hand-built resources.
@Suite struct EntryVariantTests {
    static func entries(_ resources: [String], extra: String = "") throws -> [Entry] {
        let refs = resources.indices.map { "{\"reference\":\"urn:r\($0)\"}" }.joined(separator: ",")
        let body = resources.enumerated().map {
            "{\"fullUrl\":\"urn:r\($0.offset)\",\"resource\":\($0.element)}"
        }.joined(separator: ",")
        let json = """
            {"resourceType":"Bundle","type":"document","entry":[
             {"resource":{"resourceType":"Composition","type":{"coding":[{"system":"http://loinc.org","code":"60591-5"}]},
              "subject":{"reference":"Patient/p"},"section":[{"code":{"coding":[{"code":"11450-4"}]},"entry":[\(refs)]}]}},\(body),{"resource":{"resourceType":"Patient","id":"p"}}\(extra)]}
            """
        return try Document.open(Data(json.utf8)).get().sections[0].entries
    }

    @Test func fallbacksFillTextAndDetails() throws {
        let entries = try Self.entries([
            #"{"resourceType":"MedicationRequest","medicationReference":{"reference":"urn:med","display":"Pill"},"status":"active","dosageInstruction":[{"text":"daily"}],"timingPeriod":{"start":"2020-01-02"}}"#,
            #"{"resourceType":"DeviceUseStatement","device":{"display":"Pump"},"recordedOn":"x"}"#,
            #"{"resourceType":"ImmunizationRecommendation","recommendation":[{"vaccineCode":[{"text":"Flu"}]}]}"#,
            #"{"resourceType":"Observation","title":"T","valueBoolean":true,"onsetPeriod":{"start":"2019-05-06"},"abatementString":"gone","interpretation":[{"text":"High"}],"referenceRange":[{"text":"1-2"}]}"#,
            #"{"resourceType":"Observation","description":"D","valueInteger":7,"occurrenceString":"last year","onsetString":"early"}"#,
            #"{"resourceType":"Observation","category":[{"text":"Cat"}],"valueString":"s","performedPeriod":{"start":"2018-01-01"},"valueBoolean":false}"#,
            #"{"resourceType":"Immunization","vaccineCode":{"text":"MMR"},"protocolApplied":[{"doseNumberPositiveInt":2}],"lotNumber":"L1","occurrenceString":"spring"}"#,
            #"{"resourceType":"AllergyIntolerance","code":{"text":"Nuts"},"type":"allergy","criticality":"high","reaction":[{"manifestation":[{"text":"Hives"}],"severity":"severe"}]}"#,
            #"{"resourceType":"Condition"}"#,
        ])
        #expect(entries[0].text == "Pill")
        #expect(entries[0].details.contains { $0.kind == .dosage && $0.value == "daily" })
        #expect(entries[1].text == "Pump")
        #expect(entries[2].text == "Flu")
        #expect(entries[3].text == "T")
        #expect(entries[3].details.contains { $0.kind == .value && $0.value == "true" })
        #expect(entries[4].text == "D")
        #expect(entries[4].details.contains { $0.kind == .value && $0.value == "7" })
        #expect(entries[5].text == "Cat")
        #expect(entries[6].details.contains { $0.kind == .lot && $0.value == "L1" })
        #expect(entries[7].criticality == "high")
        #expect(entries[7].details.contains { $0.kind == .reaction && $0.value == "Hives (severe)" })
        #expect(entries[8].text == "Condition")
    }

    @Test func detailKindsThatAreCodes() {
        for kind in [DetailKind.status, .verification, .type, .criticality] { #expect(kind.isCode) }
        for kind in [DetailKind.dosage, .onset, .value, .lot] { #expect(!kind.isCode) }
    }
}
