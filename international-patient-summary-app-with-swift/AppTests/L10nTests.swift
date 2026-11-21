import IPSKit
import Testing

@testable import IPSApp

/// M-I18N-1: every value the app words has a string in the catalog; a missing
/// key would show as ⟦key⟧ (and the UI tests look for it).
@MainActor
@Suite struct L10nTests {
    private func worded(_ text: String?) -> Bool { text.map { !$0.isEmpty && !$0.contains("⟦") } ?? false }

    @Test func everySectionRelationshipAndRefusalHasWords() {
        for key in SectionKey.allCases { #expect(worded(L10n.sectionTitle(key)), "\(key)") }
        #expect(worded(L10n.sectionTitle(nil)))
        for relationship in Relationship.allCases { #expect(worded(L10n.relationship(relationship)), "\(relationship)") }
        for refusal in Refusal.allCases { #expect(worded(L10n.refusal(refusal)), "\(refusal)") }
    }

    @Test func stateWordsAreGivenForEveryStateButKnown() {
        #expect(L10n.state(.known, reason: nil) == nil)
        for state in [SectionState.noneKnown, .notRecorded, .unavailable, .omitted] {
            #expect(worded(L10n.state(state, reason: nil)), "\(state)")
        }
        let reason = L10n.state(.unavailable, reason: "not asked")
        #expect(reason?.contains("not asked") == true)
    }

    @Test func detailsCodesAndGendersAreWordedOrShownAsWritten() {
        for kind in DetailKind.allCases { #expect(worded(L10n.detail(kind, "x")), "\(kind)") }
        #expect(L10n.code("active") != "active", "a known code is in words")
        #expect(L10n.code("no-such-code") == "no-such-code")
        for gender in ["male", "female", "other", "unknown"] { #expect(worded(L10n.gender(gender))) }
        #expect(L10n.gender("x") == "x")
    }
}
