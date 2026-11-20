// M-LIST-1 newest first; M-PRIV-3 clear all; M-PEOPLE-2..4 people and their relationships.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.Fixtures
import io.github.internationalpatientsummary.app.ips.Summary
import io.github.internationalpatientsummary.app.ips.SummaryReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SummaryStoreTest {
    private val store = SummaryStore()

    private fun add(name: String): Summary = SummaryReader.open(Fixtures.bytes(name), store.newId()).also(store::add)

    private fun relationshipOf(summary: Summary) = store.personOf(summary.id)?.relationship

    @Test fun newestFirstAndClearAll() {
        val first = add("bundle-minimal")
        val second = add("bundle-ips-all-sections")
        assertEquals(listOf(second.id, first.id), store.all().map { it.id })
        store.remove(second.id)
        assertNull(store.get(second.id))
        store.clear()
        assertTrue(store.all().isEmpty())
    }

    @Test fun peopleAreInTheOrderOfTheirNewestSummary() {
        val martha1 = add("IPS-examples-Bundle-01")
        val patricia = add("bundle-ips-all-sections")
        val martha2 = add("bundle-minimal")
        val people = store.people()
        assertEquals(listOf(listOf(martha2.id, martha1.id), listOf(patricia.id)), people.map { p -> p.summaries.map { it.id } })
        assertEquals(martha2.id, people.first().newest.id)
    }

    @Test fun aRelationshipIsKeptWhenASummaryJoinsAndGoesWithTheLast() {
        val martha1 = add("IPS-examples-Bundle-01")
        store.setRelationship(martha1.id, Relationship.PARENT)
        val martha2 = add("bundle-minimal")
        assertEquals(Relationship.PARENT, relationshipOf(martha2))
        store.remove(martha1.id)
        assertEquals(Relationship.PARENT, relationshipOf(martha2))
        store.remove(martha2.id)
        // The same person opened again starts with none: the last summary took it.
        val again = add("bundle-minimal")
        assertEquals(Relationship.NONE, relationshipOf(again))
    }

    @Test fun onlyOnePersonIsMe() {
        val martha = add("bundle-minimal")
        val james = add("bundle-no-info-required-sections")
        store.setRelationship(martha.id, Relationship.SELF)
        store.setRelationship(james.id, Relationship.SELF)
        assertEquals(Relationship.NONE, relationshipOf(martha))
        assertEquals(Relationship.SELF, relationshipOf(james))
        store.setRelationship(martha.id, Relationship.CHILD)
        assertEquals(Relationship.CHILD, relationshipOf(martha))
        assertEquals(Relationship.SELF, relationshipOf(james))
    }

    @Test fun forgetAPersonForgetsTheirSummariesAndRelationshipOnly() {
        val martha1 = add("IPS-examples-Bundle-01")
        val james = add("bundle-no-info-required-sections")
        val martha2 = add("bundle-minimal")
        store.setRelationship(martha1.id, Relationship.CARED_FOR)
        store.setRelationship(james.id, Relationship.SIBLING)
        store.forgetPerson(martha2.id)
        assertEquals(listOf(james.id), store.all().map { it.id })
        assertEquals(Relationship.SIBLING, relationshipOf(james))
        assertEquals(Relationship.NONE, relationshipOf(add("bundle-minimal")))
    }

    @Test fun clearAllForgetsEveryRelationship() {
        val martha = add("bundle-minimal")
        store.setRelationship(martha.id, Relationship.SELF)
        store.clear()
        assertTrue(store.people().isEmpty())
        assertEquals(Relationship.NONE, relationshipOf(add("bundle-minimal")))
    }

    @Test fun reopenPutsSummariesOpenedWhileUnavailableAboveSavedOnes() {
        val saved = add("bundle-ips-all-sections")
        store.setRelationship(saved.id, Relationship.PARENT)
        val index = store.index()
        store.clear()
        val meanwhile = add("bundle-no-info-required-sections")
        store.setRelationship(meanwhile.id, Relationship.SIBLING)

        store.reopen(index, listOf(saved))

        assertEquals(listOf(meanwhile.id, saved.id), store.all().map { it.id })
        assertEquals(Relationship.SIBLING, relationshipOf(meanwhile))
        assertEquals(Relationship.PARENT, relationshipOf(saved))
        assertTrue(store.newId() > maxOf(meanwhile.id, saved.id))
    }
}
