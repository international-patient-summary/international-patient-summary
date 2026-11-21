// Fallback paths of the reader: who wrote a document, what an entry is called, a local date-time.
package io.github.internationalpatientsummary.app.ips

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class ReaderFallbacksTest {
    private fun entryTexts(vararg resources: String): List<String?> {
        val refs = resources.indices.joinToString(",") { """{"reference":"urn:uuid:r$it"}""" }
        val wrapped = resources.mapIndexed { i, r -> """{"fullUrl":"urn:uuid:r$i","resource":$r}""" }
        val section = """{"code":{"coding":[{"code":"11450-4"}]},"entry":[$refs]}"""
        val summary = SummaryReader.open(Fixtures.bundle(section, *wrapped.toTypedArray()), 1)
        return summary.sections.first { it.key == SectionKey.PROBLEMS }.entries
            .filterIsInstance<Entry.Resolved>().map { it.text }
    }

    @Test fun authorsAreNamedByTheirResource() {
        val authors = """
            [{"display":"Shown"},{"reference":"Organization/o"},{"reference":"Device/d"},
             {"reference":"PractitionerRole/role"},{"reference":"PractitionerRole/bare"},
             {"reference":"Questionnaire/q"},{"reference":"Nothing/there"}]
        """.trimIndent()
        val bytes = """
            {"resourceType":"Bundle","type":"document","entry":[
             {"resource":{"resourceType":"Composition","type":{"coding":[{"system":"http://loinc.org","code":"60591-5"}]},
              "subject":{"reference":"Patient/p1"},"author":$authors,"section":[]}},
             {"resource":{"resourceType":"Patient","id":"p1"}},
             {"resource":{"resourceType":"Organization","id":"o","name":"Clinic"}},
             {"resource":{"resourceType":"Device","id":"d","deviceName":[{"name":"Scanner"}]}},
             {"resource":{"resourceType":"Practitioner","id":"pr","name":[{"family":"Who","given":["Dr"]}]}},
             {"resource":{"resourceType":"PractitionerRole","id":"role","practitioner":{"reference":"Practitioner/pr"}}},
             {"resource":{"resourceType":"PractitionerRole","id":"bare","organization":{"reference":"Organization/gone","display":"Elsewhere"}}},
             {"resource":{"resourceType":"Questionnaire","id":"q"}}]}
        """.trimIndent().toByteArray()
        val named = SummaryReader.open(bytes, 1).document.authors
        assertTrue(named.toString(), named.containsAll(listOf("Shown", "Clinic", "Scanner", "Dr Who", "Elsewhere")))
        assertEquals(5, named.size)
    }

    @Test fun entriesAreNamedByTheirFallbacks() {
        val texts = entryTexts(
            """{"resourceType":"MedicationRequest","medicationReference":{"reference":"urn:uuid:m","display":"Pill"}}""",
            """{"resourceType":"DeviceUseStatement","device":{"display":"Pump"}}""",
            """{"resourceType":"Device","type":{"text":"Valve"}}""",
            """{"resourceType":"Observation","category":[{"text":"Vital"}]}""",
            """{"resourceType":"Condition","code":{"text":"Asthma"}}""",
        )
        assertEquals(listOf("Pill", "Pump", "Valve", "Vital", "Asthma"), texts)
    }

    @Test fun aDateTimeWithoutAnOffsetIsStillShown() {
        val shown = Format.date("2020-05-06T07:08:09", Locale.US)
        assertTrue(shown.toString(), shown!!.contains("2020"))
    }
}
