import Foundation
import IPSKit
import Testing

@testable import IPSApp

/// The open summaries, their people and relationships, and the share file
/// (M-PEOPLE-*, M-PRIV-3, M-SHARE-1), in memory: the app's own store, no disk.
@MainActor
@Suite struct SummaryStoreTests {
    @Test func theFiveExamplesShipInTheApp() {
        #expect(Examples.data().count == Examples.names.count)
    }

    @Test func openingKeepsTheNewestOnTopAndRefusesWhatIsNotASummary() throws {
        let store = SummaryStore(saving: nil)
        let data = Examples.data()
        for bytes in data { store.open(bytes) }
        #expect(store.documents.count == 5)
        #expect(store.documents.first?.data == data.last)
        guard case .failure = store.open(Data("{}".utf8)) else {
            Issue.record("a non-summary was opened")
            return
        }
        #expect(store.documents.count == 5)
        #expect(store.saving == .saved)
    }

    @Test func peopleRelationshipsAndForgetting() throws {
        let store = SummaryStore(saving: nil)
        Examples.data().forEach { store.open($0) }
        let people = store.people
        #expect(people.count == 3)
        #expect(store.hasSeveralPeople)

        let first = try #require(people.first)
        store.setRelationship(.parent, for: first)
        #expect(store.relationship(of: try #require(store.person(of: first.documents[0].id))) == .parent)

        let id = first.documents[0].id
        store.remove(id)
        #expect(store.documents.contains { $0.id == id } == false)
        #expect(store.person(of: id) == nil)

        let again = try #require(store.people.first)
        store.forget(again)
        #expect(store.people.count == 2)

        store.clear()
        #expect(store.documents.isEmpty)
        #expect(!store.hasSeveralPeople)
    }

    @Test func aChangeIsAnnounced() {
        let store = SummaryStore(saving: nil)
        var heard = 0
        let token = NotificationCenter.default.addObserver(
            forName: SummaryStore.changed, object: store, queue: nil
        ) { _ in MainActor.assumeIsolated { heard += 1 } }
        defer { NotificationCenter.default.removeObserver(token) }
        Examples.data().prefix(2).forEach { store.open($0) }
        store.retry()
        #expect(heard == 3)
    }

    @Test func theShareFileHoldsTheExactBytesAndGoesAway() throws {
        let bytes = try #require(Examples.data().first)
        let url = try ShareFile.write(bytes)
        #expect(url.lastPathComponent == ShareFile.name)
        #expect(try Data(contentsOf: url) == bytes)
        let pdf = try ShareFile.write(Data([1, 2, 3]), name: "summary.pdf")
        #expect(!FileManager.default.fileExists(atPath: url.path()), "one share at a time")
        #expect(FileManager.default.fileExists(atPath: pdf.path()))
        ShareFile.removeAll()
        #expect(!FileManager.default.fileExists(atPath: pdf.path()))
    }
}
