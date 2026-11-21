import CryptoKit
import Foundation
import Testing

@testable import IPSKit

/// What the store and the lists do on the unusual paths.
@Suite struct StoreEdgeTests {
    let directory = FileManager.default.temporaryDirectory.appending(path: "edge-\(UUID().uuidString)")
    let keys = MemoryKeys()
    func store() -> EncryptedStore { EncryptedStore(directory: directory, keys: keys) }

    @Test func absentCodesAreReadByTheirSystem() throws {
        func concept(_ system: String, _ code: String) -> JSON {
            try! JSON.parse(Data(#"{"coding":[{"code":"x"},{"system":"\#(system)","code":"\#(code)"},{"system":"s"}]}"#.utf8))
        }
        #expect(absentState(ofConcept: concept(absentUnknownSystem, "no-known-allergies")) == .noneKnown)
        #expect(absentState(ofConcept: concept(absentUnknownSystem, "unknown-info")) == .notRecorded)
        #expect(absentState(ofConcept: concept(absentUnknownSystem, "other")) == nil)
        #expect(absentState(ofConcept: concept(snomedSystem, "0")) == nil)
        #expect(absentState(ofConcept: try JSON.parse(Data(#"{"coding":[{"system":"s"}]}"#.utf8))) == nil)
        #expect(absentState(ofConcept: nil) == nil)
    }

    @Test func savingNothingWhenNothingWasSavedIsFine() throws {
        try store().save([], relationships: [:])
        #expect(!FileManager.default.fileExists(atPath: directory.path(percentEncoded: false)))
    }

    @Test func aMissingIndexWithAKeyStartsEmpty() throws {
        let document = try DocumentTests.open("bundle-minimal")
        let saved = store()
        try saved.save([document], relationships: [:])
        try FileManager.default.removeItem(at: directory.appending(path: EncryptedStore.indexName))
        #expect(store().load().documents.isEmpty)
    }

    @Test func aSummaryFileThatIsGoneIsSkippedAndStrayFilesAreRemoved() throws {
        let documents = try [DocumentTests.open("bundle-minimal"), DocumentTests.open("IPS-examples-Bundle-01")]
        let saved = store()
        try saved.save(documents, relationships: [:])
        try FileManager.default.removeItem(at: directory.appending(path: EncryptedStore.summaryName(documents[0].id)))
        try Data("x".utf8).write(to: directory.appending(path: "stray"))
        let loaded = store().load()
        #expect(loaded.documents.map(\.id) == [documents[1].id])
        #expect(!FileManager.default.fileExists(atPath: directory.appending(path: "stray").path(percentEncoded: false)))
    }

    @Test func removingOneSummaryKeepsThePersonsRelationshipOnTheRest() throws {
        let a = try PeopleTests.summary(name: ("Ann", "Lee"), birthDate: "1990-01-01")
        let b = try PeopleTests.summary(name: ("Ann", "Lee"), birthDate: "1990-01-01")
        let everyone = people([a, b])
        #expect(everyone.count == 1)
        var relationships = Relationships()
        relationships.set(.parent, for: everyone[0], among: everyone)
        relationships.remove(a.id, from: everyone[0])
        #expect(relationships.all[a.id] == nil)
        #expect(relationships.all[b.id] == .parent)
        relationships.forget([b.id])
        #expect(relationships.isEmpty)
        relationships.set(.me, for: everyone[0], among: everyone)
        relationships.removeAll()
        #expect(relationships.isEmpty)
        // A person with no relationship has nothing to carry over.
        relationships.remove(b.id, from: everyone[0])
        #expect(relationships.isEmpty)
        #expect(everyone[0].contains(a.id))
    }
}
