import Foundation
import Testing

@testable import IPSKit

/// The five IG examples (spec §7) and what the summary screen reads from them.
@Suite struct DocumentTests {
    static let fixtures = [
        "bundle-minimal", "bundle-ips-all-sections", "bundle-no-info-required-sections",
        "IPS-examples-Bundle-01", "IPS-examples-Bundle-with-immunization",
    ]

    static func open(_ name: String) throws -> Document {
        let url = try #require(
            Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Document.open(Data(contentsOf: url)).get()
    }

    @Test(arguments: fixtures) func everyExampleOpens(name: String) throws {
        let document = try Self.open(name)
        #expect(document.patient != nil, "\(name): the subject resolves to a Patient")
        #expect(document.patientName != nil)
        #expect(document.sections.contains { $0.key == .allergies })
        #expect(document.sections.allSatisfy { $0.entries.allSatisfy(\.resolved) }, "\(name)")
    }

    @Test func patientBanner() throws {
        let martha = try Self.open("IPS-examples-Bundle-01")
        #expect(martha.patientName == "Martha DeLarosa")
        #expect(martha.birthDate == "1972-05-01")
        #expect(martha.gender == "female")
        #expect(martha.highCriticalityAllergies == ["Substance with penicillin structure (substance)"])
        #expect(!martha.allergiesMissing)

        // Resolved by ResourceType/id, not fullUrl.
        let patricia = try Self.open("bundle-ips-all-sections")
        #expect(patricia.patientName == "Patricia JORDANA")
    }

    @Test func documentDetails() throws {
        let document = try Self.open("IPS-examples-Bundle-01")
        #expect(document.title == "Patient Summary as of December 11, 2017 14:30")
        #expect(document.date == "2017-12-11T14:30:00+01:00")
        #expect(!document.authors.isEmpty)
    }

    @Test func sectionsKeepCompositionOrder() throws {
        let document = try Self.open("IPS-examples-Bundle-01")
        #expect(
            document.sections.map(\.key) == [
                .problems, .medications, .allergies, .pastIllness, .planOfCare, .results,
            ])
        let all = try Self.open("bundle-ips-all-sections")
        #expect(all.sections.count == 16)
        #expect(all.sections.allSatisfy { $0.key != nil }, "every IPS 2.0.1 section is in the registry")
    }

    @Test func medicationsResolveTheirMedication() throws {
        let document = try Self.open("IPS-examples-Bundle-01")
        let medications = try #require(document.sections.first { $0.key == .medications })
        #expect(medications.entries.count == 2)
        #expect(medications.entries.allSatisfy { $0.text != "MedicationStatement" })
    }

    @Test func absentStatesFromEmptyReason() throws {
        let document = try Self.open("bundle-no-info-required-sections")
        for key in SectionKey.required {
            let section = try #require(document.sections.first { $0.key == key })
            #expect(section.state == .unavailable, "\(key)")
            #expect(section.emptyReason == "Unavailable")
        }
        #expect(document.sections.first { $0.key == .immunizations }?.state == .known)
    }

    @Test func aMixedAllergyListIsKnown() throws {
        // One real allergy and one "no known food allergy": the section is not "none known".
        let document = try Self.open("IPS-examples-Bundle-01")
        let allergies = try #require(document.sections.first { $0.key == .allergies })
        #expect(allergies.state == .known)
        #expect(allergies.entries.map(\.absent) == [nil, .noneKnown])
    }

    @Test func aMissingRequiredSectionIsListedLast() throws {
        var bundle = try JSONSerialization.jsonObject(with: try Self.data("bundle-minimal"))
            as! [String: Any]
        var entries = bundle["entry"] as! [[String: Any]]
        var composition = entries[0]["resource"] as! [String: Any]
        let sections = composition["section"] as! [[String: Any]]
        composition["section"] = sections.filter {
            (($0["code"] as! [String: Any])["coding"] as! [[String: Any]])[0]["code"] as! String
                != "48765-2"
        }
        entries[0]["resource"] = composition
        bundle["entry"] = entries
        let document = try Document.open(JSONSerialization.data(withJSONObject: bundle)).get()
        #expect(document.sections.last?.key == .allergies)
        #expect(document.sections.last?.state == .omitted)
        #expect(document.allergiesMissing)
        #expect(document.highCriticalityAllergies.isEmpty)
    }

    @Test func anUnresolvedReferenceIsKeptAndMarked() throws {
        var bundle = try JSONSerialization.jsonObject(with: try Self.data("bundle-minimal"))
            as! [String: Any]
        var entries = bundle["entry"] as! [[String: Any]]
        var composition = entries[0]["resource"] as! [String: Any]
        var sections = composition["section"] as! [[String: Any]]
        sections[0]["entry"] = [["reference": "urn:uuid:not-in-this-bundle"]]
        composition["section"] = sections
        entries[0]["resource"] = composition
        bundle["entry"] = entries
        let document = try Document.open(JSONSerialization.data(withJSONObject: bundle)).get()
        #expect(document.sections[0].entries.count == 1)
        #expect(document.sections[0].entries[0].resolved == false)
        #expect(document.sections[0].state == .unavailable)
    }

    /// The web viewer's state order, which the Android app ports too.
    @Test func sectionStatesFollowTheViewersOrder() {
        let known = Entry(resourceType: "Condition", text: "x", details: [], resolved: true, absent: nil, criticality: nil)
        let none = Entry(resourceType: "AllergyIntolerance", text: "x", details: [], resolved: true, absent: .noneKnown, criticality: nil)
        let nilKnown = FormatTests.json(#"{"coding":[{"code":"nilknown"}]}"#)
        #expect(state(of: [none, .unresolved], emptyReason: nil, hasNarrative: false, narrativeIsContent: false) == .noneKnown)
        #expect(state(of: [known, .unresolved], emptyReason: nil, hasNarrative: false, narrativeIsContent: false) == .known)
        #expect(state(of: [.unresolved], emptyReason: nil, hasNarrative: true, narrativeIsContent: true) == .unavailable)
        #expect(state(of: [], emptyReason: nilKnown, hasNarrative: false, narrativeIsContent: false) == .noneKnown)
        #expect(state(of: [], emptyReason: nil, hasNarrative: true, narrativeIsContent: true) == .known)
        #expect(state(of: [], emptyReason: nil, hasNarrative: true, narrativeIsContent: false) == .notRecorded)
        #expect(state(of: [], emptyReason: nil, hasNarrative: false, narrativeIsContent: true) == .notRecorded)
    }

    @Test func aSubjectNotInTheBundleStillOpens() throws {
        let data = CheckTests.data(CheckTests.minimal())
        let document = try Document.open(data).get()
        #expect(document.patient == nil)
        #expect(document.sections.map(\.state) == [.omitted, .omitted, .omitted])
    }

    @Test func sharingGivesBackTheExactBytes() throws {
        let data = try Self.data("bundle-ips-all-sections")
        #expect(try Document.open(data).get().data == data)
    }

    @Test func observationsHaveAValue() throws {
        let document = try Self.open("bundle-ips-all-sections")
        let vitals = try #require(document.sections.first { $0.key == .vitalSigns })
        #expect(vitals.entries.contains { $0.detail(.value) != nil })
    }

    static func data(_ name: String) throws -> Data {
        let url = try #require(
            Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }
}
