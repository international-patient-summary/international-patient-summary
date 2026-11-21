// M-I18N-1: every model value has words of its own, and a code the app does not know shows as written.
package io.github.internationalpatientsummary.app.ui

import io.github.internationalpatientsummary.app.Problem
import io.github.internationalpatientsummary.app.Relationship
import io.github.internationalpatientsummary.app.ips.DetailKind
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.SectionKey
import io.github.internationalpatientsummary.app.ips.SectionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WordsTest {
    private fun assertOwnWords(what: String, ids: List<Int>) {
        assertTrue("$what: each value has a string", ids.all { it != 0 })
        assertEquals("$what: no two values share a string", ids.size, ids.toSet().size)
    }

    @Test fun everyEnumValueHasItsOwnWords() {
        assertOwnWords("refusals", Refusal.entries.map(::refusalText))
        assertOwnWords("relationships", Relationship.entries.map(::relationshipText))
        assertOwnWords("sections", SectionKey.entries.map(::sectionTitle))
        assertOwnWords("details", DetailKind.entries.map(::detailLabel))
    }

    @Test fun problemsUseTheirRefusalOrTheirOwnWords() {
        assertEquals(refusalText(Refusal.NOT_JSON), problemText(Problem.Refused(Refusal.NOT_JSON)))
        assertOwnWords("problems", listOf(problemText(Problem.Unreadable), problemText(Problem.EmptyClipboard)))
    }

    @Test fun onlyAKnownSectionNeedsNoStateWords() {
        assertNull(stateText(SectionState.KNOWN))
        val others = SectionState.entries.filter { it != SectionState.KNOWN }.map { stateText(it) }
        assertTrue(others.all { it != null })
        assertEquals(others.size, others.toSet().size)
    }

    @Test fun gendersAreWordedAndAnUnknownCodeIsNot() {
        assertOwnWords("genders", listOf("male", "female", "other", "unknown").map { genderWord(it)!! })
        assertNull(genderWord("x"))
    }
}
