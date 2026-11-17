// M-PEOPLE-1: which summaries are about the same person.
package io.github.internationalpatientsummary.app.ips

import org.junit.Assert.assertEquals
import org.junit.Test

class PeopleTest {
    private var nextId = 1L

    private fun summary(name: String?, born: String?, vararg ids: Pair<String?, String>): Summary = Summary(
        id = nextId++,
        bytes = ByteArray(0),
        patient = PatientInfo(name, born, null, ids.map { (system, value) -> IdentifierLabel(system ?: "", value, null, system) }),
        document = DocumentInfo(null, null, emptyList()),
        sections = emptyList(),
        allergyAlert = AllergyAlert(sectionMissing = false, highCriticality = emptyList()),
    )

    private fun ids(groups: List<List<Summary>>) = groups.map { group -> group.map { it.id } }

    @Test fun theThreeMarthaDeLarosaExamplesAreOnePerson() {
        val summaries = Fixtures.NAMES.mapIndexed { index, name -> SummaryReader.open(Fixtures.bytes(name), index + 1L) }
        val groups = People.group(summaries)
        assertEquals(3, groups.size)
        val martha = groups.single { it.size == 3 }
        assertEquals(setOf("Martha DeLarosa"), martha.map { it.patient?.name }.toSet())
        assertEquals(
            setOf("bundle-minimal", "IPS-examples-Bundle-01", "IPS-examples-Bundle-with-immunization").map { Fixtures.NAMES.indexOf(it) + 1L }.toSet(),
            martha.map { it.id }.toSet(),
        )
    }

    @Test fun groupsKeepTheOrderGiven() {
        val a = summary("Ann", "2000-01-01", "urn:a" to "1")
        val b = summary("Bob", "2001-01-01", "urn:a" to "2")
        val c = summary("Ann", "2000-01-01")
        assertEquals(listOf(listOf(a.id, c.id), listOf(b.id)), ids(People.group(listOf(a, b, c))))
    }

    @Test fun nameAndBirthDateMatchIgnoringCaseAccentsAndSpacing() {
        val a = summary("Patricia JORDANA", "1956-09-30")
        val b = summary("  patrícia   Jordana ", "1956-09-30")
        val c = summary("Patricia Jordana", "1956-09-29")
        assertEquals(listOf(listOf(a.id, b.id), listOf(c.id)), ids(People.group(listOf(a, b, c))))
        assertEquals("patricia jordana", People.nameKey("PATRÍCIA\t Jordana"))
    }

    @Test fun theLinkIsTransitive() {
        // a and b share an identifier; b and c share name and birth date; a and c share nothing.
        val a = summary("A. Person", "1990-01-01", "urn:x" to "42")
        val b = summary("Alex Person", "1990-02-02", "urn:x" to "42")
        val c = summary("Alex Person", "1990-02-02")
        assertEquals(listOf(listOf(a.id, b.id, c.id)), ids(People.group(listOf(a, c, b)).map { g -> g.sortedBy { it.id } }))
    }

    @Test fun anIdentifierNeedsTheSameSystemAndValue() {
        val a = summary("One", "1980-01-01", "urn:system:one" to "123")
        val b = summary("Two", "1981-01-01", "urn:system:two" to "123")
        val c = summary("Three", "1982-01-01", null to "123")
        val d = summary("Four", "1983-01-01", null to "123")
        assertEquals(4, People.group(listOf(a, b, c, d)).size)
    }

    @Test fun withoutAnIdentifierANameAndABirthDateAreBothNeeded() {
        val a = summary("Pat Example", null)
        val b = summary("Pat Example", null)
        val c = summary(null, "1970-01-01")
        val d = summary(null, "1970-01-01")
        assertEquals(4, People.group(listOf(a, b, c, d)).size)
    }

    @Test fun aSummaryWithoutAPatientIsAPersonOfItsOwn() {
        val unresolved = summary(null, null).let {
            Summary(it.id, it.bytes, null, it.document, it.sections, it.allergyAlert)
        }
        val again = Summary(nextId++, ByteArray(0), null, unresolved.document, emptyList(), unresolved.allergyAlert)
        assertEquals(2, People.group(listOf(unresolved, again)).size)
    }
}
