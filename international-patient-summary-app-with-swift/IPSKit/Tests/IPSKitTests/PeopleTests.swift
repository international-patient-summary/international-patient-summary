import Foundation
import Testing

@testable import IPSKit

/// M-PEOPLE-1..3: which summaries are about the same person, and their relationships.
@Suite struct PeopleTests {
    /// A summary whose patient has these details.
    static func summary(
        name: (given: String, family: String)? = nil, birthDate: String? = nil,
        identifiers: [(system: String?, value: String)] = []
    ) throws -> Document {
        var patient: [String: Any] = ["resourceType": "Patient"]
        if let name { patient["name"] = [["given": [name.given], "family": name.family]] }
        if let birthDate { patient["birthDate"] = birthDate }
        if !identifiers.isEmpty {
            patient["identifier"] = identifiers.map { identifier -> [String: Any] in
                var item: [String: Any] = ["value": identifier.value]
                if let system = identifier.system { item["system"] = system }
                return item
            }
        }
        let bundle: [String: Any] = [
            "resourceType": "Bundle", "type": "document",
            "entry": [
                [
                    "fullUrl": "urn:uuid:c",
                    "resource": [
                        "resourceType": "Composition",
                        "type": ["coding": [["system": "http://loinc.org", "code": "60591-5"]]],
                        "subject": ["reference": "urn:uuid:p"],
                    ],
                ],
                ["fullUrl": "urn:uuid:p", "resource": patient],
            ],
        ]
        return try Document.open(JSONSerialization.data(withJSONObject: bundle)).get()
    }

    static let nhi = "https://standards.digital.health.nz/ns/nhi-id"

    @Test func theExamplesAreThreePeople() throws {
        // Newest first, as the list holds them.
        let documents = try [
            "IPS-examples-Bundle-01", "bundle-ips-all-sections", "IPS-examples-Bundle-with-immunization",
            "bundle-no-info-required-sections", "bundle-minimal",
        ].map(DocumentTests.open)
        let everyone = people(documents)
        #expect(everyone.map(\.name) == ["Martha DeLarosa", "Patricia JORDANA", "James Judge"])
        #expect(everyone[0].documents.map(\.id) == [documents[0].id, documents[2].id, documents[4].id])
        #expect(everyone[0].birthDate == "1972-05-01")
    }

    @Test func aSharedIdentifierIsTheSamePerson() throws {
        let a = try Self.summary(name: ("Ana", "Silva"), identifiers: [(Self.nhi, "X1")])
        let b = try Self.summary(name: ("Ana Maria", "Silva"), identifiers: [(Self.nhi, "X1")])
        #expect(people([a, b]).count == 1)
    }

    @Test func theSameValueInAnotherSystemIsNot() throws {
        let a = try Self.summary(identifiers: [(Self.nhi, "X1")])
        let b = try Self.summary(identifiers: [("urn:oid:2.16.840.1.113883.2.4.6.3", "X1")])
        let c = try Self.summary(identifiers: [(nil, "X1")])
        let d = try Self.summary(identifiers: [(nil, "X1")])
        #expect(people([a, b, c, d]).count == 4, "no system, no link")
    }

    @Test func theSameNameAndBirthDateIgnoringCaseAccentsAndSpacing() throws {
        let a = try Self.summary(name: ("Patricia", "JORDANA"), birthDate: "1956-09-30")
        let b = try Self.summary(name: ("patricia ", "Jordána"), birthDate: "1956-09-30")
        let c = try Self.summary(name: ("Patricia", "Jordana"), birthDate: "1956-09-29")
        #expect(people([a, b, c]).map(\.documents.count) == [2, 1])
    }

    @Test func aNameWithoutABirthDateIsAPersonOfTheirOwn() throws {
        let a = try Self.summary(name: ("Sam", "Lee"))
        let b = try Self.summary(name: ("Sam", "Lee"))
        let c = try Self.summary(birthDate: "2001-01-01")
        let d = try Self.summary(birthDate: "2001-01-01")
        #expect(people([a, b, c, d]).count == 4)
    }

    @Test func linksAreTransitive() throws {
        // a and c share nothing, but each shares something with b.
        let a = try Self.summary(name: ("Kim", "Ito"), birthDate: "1990-02-03")
        let b = try Self.summary(name: ("Kim", "Ito"), birthDate: "1990-02-03", identifiers: [(Self.nhi, "K9")])
        let c = try Self.summary(name: ("Kimiko", "Ito"), identifiers: [(Self.nhi, "K9")])
        let other = try Self.summary(name: ("Lee", "Ito"), birthDate: "1990-02-03")
        let everyone = people([a, other, c, b])
        #expect(everyone.count == 2)
        #expect(everyone[0].documents.map(\.id) == [a.id, c.id, b.id], "newest first, joined through b")
        #expect(everyone[0].name == "Kim Ito", "the newest summary's name")
    }

    @Test func aPersonKeepsTheirRelationshipWhenAnotherSummaryOpens() throws {
        let older = try Self.summary(identifiers: [(Self.nhi, "P1")])
        var relationships = Relationships()
        let before = people([older])
        relationships.set(.parent, for: before[0], among: before)
        let newer = try Self.summary(identifiers: [(Self.nhi, "P1")])
        let after = people([newer, older])
        #expect(relationships.of(after[0]) == .parent)
        #expect(after[0].id == before[0].id, "a person's ID outlasts a newer summary")
    }

    @Test func onlyOnePersonIsMe() throws {
        let everyone = try people([
            Self.summary(identifiers: [(Self.nhi, "A")]), Self.summary(identifiers: [(Self.nhi, "B")]),
        ])
        var relationships = Relationships()
        relationships.set(.me, for: everyone[0], among: everyone)
        relationships.set(.me, for: everyone[1], among: everyone)
        #expect(relationships.of(everyone[0]) == .none)
        #expect(relationships.of(everyone[1]) == .me)
        relationships.set(.child, for: everyone[0], among: everyone)
        relationships.set(.none, for: everyone[1], among: everyone)
        #expect(relationships.of(everyone[0]) == .child)
        #expect(relationships.of(everyone[1]) == .none)
    }

    @Test func deletingTheSummaryThatHeldTheRelationshipKeepsIt() throws {
        let older = try Self.summary(identifiers: [(Self.nhi, "P1")])
        var relationships = Relationships()
        relationships.set(.grandparent, for: people([older])[0], among: people([older]))
        let newer = try Self.summary(identifiers: [(Self.nhi, "P1")])
        relationships.remove(older.id, from: people([newer, older])[0])
        #expect(relationships.of(people([newer])[0]) == .grandparent)
    }

    @Test func whenASummaryJoinsTwoPeopleTheNewerRelationshipAndMeWin() throws {
        let a = try Self.summary(name: ("Ana", "Silva"), birthDate: "1950-01-01")
        let b = try Self.summary(identifiers: [(Self.nhi, "S1")])
        var relationships = Relationships()
        let apart = people([b, a])
        relationships.set(.me, for: apart[1], among: apart)
        relationships.set(.parent, for: apart[0], among: apart)
        // A newer summary carries both a's name and birth date and b's identifier.
        let both = try Self.summary(name: ("Ana", "Silva"), birthDate: "1950-01-01", identifiers: [(Self.nhi, "S1")])
        let together = people([both, b, a])
        relationships.settle(together)
        #expect(together.count == 1)
        #expect(relationships.of(together[0]) == .parent, "b's, the newer of the two")
        // Deleting the summary that joined them parts them again: both keep parent; no Me.
        relationships.remove(both.id, from: together[0])
        let parted = people([b, a])
        relationships.settle(parted)
        #expect(parted.map { relationships.of($0) } == [.parent, .parent])
    }

    @Test func twoPeopleWhoAreMeAfterAPartingKeepTheNewerOne() throws {
        let a = try Self.summary(name: ("Ana", "Silva"), birthDate: "1950-01-01")
        let b = try Self.summary(identifiers: [(Self.nhi, "S1")])
        let both = try Self.summary(name: ("Ana", "Silva"), birthDate: "1950-01-01", identifiers: [(Self.nhi, "S1")])
        var relationships = Relationships()
        let together = people([both, b, a])
        relationships.set(.me, for: together[0], among: together)
        relationships.remove(both.id, from: together[0])
        let parted = people([b, a])
        relationships.settle(parted)
        #expect(parted.map { relationships.of($0) } == [.me, .none])
    }

    @Test func forgettingSummariesForgetsTheirRelationship() throws {
        let everyone = try people([Self.summary(identifiers: [(Self.nhi, "A")])])
        var relationships = Relationships()
        relationships.set(.sibling, for: everyone[0], among: everyone)
        relationships.forget(everyone[0].documents.map(\.id))
        #expect(relationships.isEmpty)
    }

    @Test func everyRelationshipHasAString() throws {
        let catalog = try CatalogTests.load()
        for relationship in Relationship.allCases {
            #expect(catalog["relationship.\(relationship.rawValue)"] != nil, "\(relationship)")
        }
    }
}
