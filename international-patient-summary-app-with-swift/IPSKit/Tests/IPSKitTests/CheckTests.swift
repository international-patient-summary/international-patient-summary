import Foundation
import Testing

@testable import IPSKit

/// M-CHECK-1, M-CHECK-2: the service's S-API-2 check, code for code and pointer for pointer.
@Suite struct CheckTests {
    /// The smallest document that passes, as the service's `src/ips.rs` tests have it.
    static func minimal() -> [String: Any] {
        [
            "resourceType": "Bundle",
            "type": "document",
            "entry": [
                [
                    "fullUrl": "urn:uuid:1",
                    "resource": [
                        "resourceType": "Composition",
                        "type": ["coding": [["system": "http://loinc.org", "code": "60591-5"]]],
                        "subject": ["reference": "urn:uuid:2"],
                    ],
                ]
            ],
        ]
    }

    static func data(_ object: Any) -> Data {
        try! JSONSerialization.data(withJSONObject: object)
    }

    static func refusal(_ object: Any) -> Refusal? {
        if case .failure(let refusal) = check(data(object)) { refusal } else { nil }
    }

    static func composition(_ change: (inout [String: Any]) -> Void) -> [String: Any] {
        var bundle = minimal()
        var entries = bundle["entry"] as! [[String: Any]]
        var resource = entries[0]["resource"] as! [String: Any]
        change(&resource)
        entries[0]["resource"] = resource
        bundle["entry"] = entries
        return bundle
    }

    @Test func theMinimalDocumentPasses() {
        #expect(Self.refusal(Self.minimal()) == nil)
    }

    @Test func eachCheckHasTheServicesCodeAndPointer() {
        let cases: [(Refusal, String, String)] = [
            (.tooLarge, "too_large", "#"),
            (.notJSON, "not_json", "#"),
            (.notABundle, "not_a_bundle", "#/resourceType"),
            (.notADocument, "not_a_document", "#/type"),
            (.noComposition, "no_composition", "#/entry/0/resource/resourceType"),
            (.notAPatientSummary, "not_a_patient_summary", "#/entry/0/resource/type"),
            (.noSubject, "no_subject", "#/entry/0/resource/subject/reference"),
        ]
        #expect(cases.count == Refusal.allCases.count)
        for (refusal, code, pointer) in cases {
            #expect(refusal.code == code)
            #expect(refusal.pointer == pointer)
        }
    }

    @Test func notABundle() {
        #expect(Self.refusal(["resourceType": "Patient"]) == .notABundle)
        #expect(Self.refusal([1, 2, 3]) == .notABundle)
    }

    @Test func notADocument() {
        var bundle = Self.minimal()
        bundle["type"] = "collection"
        #expect(Self.refusal(bundle) == .notADocument)
    }

    @Test func noComposition() {
        var bundle = Self.minimal()
        bundle["entry"] = [["resource": ["resourceType": "Patient"]]]
        #expect(Self.refusal(bundle) == .noComposition)
        bundle["entry"] = [[String: Any]]()
        #expect(Self.refusal(bundle) == .noComposition)
    }

    @Test func notAPatientSummary() {
        let other = Self.composition {
            $0["type"] = ["coding": [["system": "http://loinc.org", "code": "34133-9"]]]
        }
        #expect(Self.refusal(other) == .notAPatientSummary)
        let wrongSystem = Self.composition {
            $0["type"] = ["coding": [["system": "http://snomed.info/sct", "code": "60591-5"]]]
        }
        #expect(Self.refusal(wrongSystem) == .notAPatientSummary)
    }

    @Test func noSubject() {
        #expect(Self.refusal(Self.composition { $0["subject"] = nil }) == .noSubject)
        #expect(Self.refusal(Self.composition { $0["subject"] = ["reference": "  "] }) == .noSubject)
    }

    @Test func theFirstFailingCheckWins() {
        var bundle = Self.composition { $0["subject"] = nil }
        bundle["type"] = "collection"
        #expect(Self.refusal(bundle) == .notADocument)
    }

    @Test func textThatIsNotJSONIsRefused() {
        guard case .failure(let refusal) = check(Data("resourceType: Bundle".utf8)) else {
            Issue.record("accepted YAML")
            return
        }
        #expect(refusal == .notJSON)
    }

    @Test func aDocumentOver10MiBIsRefusedBeforeParsing() {
        let tooBig = Data(repeating: 0x20, count: maximumDocumentBytes + 1)
        guard case .failure(let refusal) = check(tooBig) else {
            Issue.record("accepted 10 MiB + 1")
            return
        }
        #expect(refusal == .tooLarge)
        #expect(maximumDocumentBytes == 10_485_760)
    }
}
