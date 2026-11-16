// M-CHECK-1, M-CHECK-2: every refusal code and pointer, in S-API-2 order.
package io.github.internationalpatientsummary.app.ips

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class CheckTest {
    private fun minimal(
        resourceType: String = "\"Bundle\"",
        type: String = "\"document\"",
        composition: String = "\"Composition\"",
        coding: String = """{"system":"http://loinc.org","code":"60591-5"}""",
        subject: String = """{"reference":"urn:uuid:2"}""",
    ) = """
        {"resourceType":$resourceType,"type":$type,"entry":[{"fullUrl":"urn:uuid:1","resource":
          {"resourceType":$composition,"type":{"coding":[$coding]},"subject":$subject}}]}
    """.trimIndent()

    private fun refusalOf(text: String): Refusal? = try {
        IpsCheck.parse(text.toByteArray())
        null
    } catch (e: RefusedException) {
        e.refusal
    }

    private fun assertRefused(expected: Refusal, text: String) = assertEquals(expected, refusalOf(text))

    @Test fun acceptsAMinimalIps() = assertNull(refusalOf(minimal()))

    @Test fun refusesTextThatIsNotJson() {
        assertRefused(Refusal.NOT_JSON, "not json")
        assertRefused(Refusal.NOT_JSON, "{\"resourceType\":")
        assertRefused(Refusal.NOT_JSON, "")
    }

    @Test fun refusesANonBundle() {
        assertRefused(Refusal.NOT_A_BUNDLE, "[]")
        assertRefused(Refusal.NOT_A_BUNDLE, "\"Bundle\"")
        assertRefused(Refusal.NOT_A_BUNDLE, """{"resourceType":"Patient"}""")
        assertRefused(Refusal.NOT_A_BUNDLE, minimal(resourceType = "\"Patient\""))
    }

    @Test fun refusesABundleThatIsNotADocument() {
        assertRefused(Refusal.NOT_A_DOCUMENT, minimal(type = "\"collection\""))
        assertRefused(Refusal.NOT_A_DOCUMENT, """{"resourceType":"Bundle"}""")
    }

    @Test fun refusesAMissingOrMisplacedComposition() {
        assertRefused(Refusal.NO_COMPOSITION, """{"resourceType":"Bundle","type":"document","entry":[]}""")
        assertRefused(Refusal.NO_COMPOSITION, """{"resourceType":"Bundle","type":"document"}""")
        assertRefused(Refusal.NO_COMPOSITION, minimal(composition = "\"Patient\""))
    }

    @Test fun refusesAnotherKindOfDocument() {
        assertRefused(Refusal.NOT_A_PATIENT_SUMMARY, minimal(coding = """{"system":"http://loinc.org","code":"34133-9"}"""))
        assertRefused(Refusal.NOT_A_PATIENT_SUMMARY, minimal(coding = """{"system":"http://snomed.info/sct","code":"60591-5"}"""))
    }

    @Test fun refusesACompositionWithoutASubject() {
        assertRefused(Refusal.NO_SUBJECT, minimal(subject = """{"reference":" "}"""))
        assertRefused(Refusal.NO_SUBJECT, minimal(subject = """{"display":"Someone"}"""))
        assertRefused(Refusal.NO_SUBJECT, minimal(subject = "null"))
    }

    @Test fun checksInOrderReportingTheFirstFailure() =
        assertRefused(Refusal.NOT_A_DOCUMENT, minimal(type = "\"collection\"", composition = "\"Patient\""))

    @Test fun refusesTooLargeBeforeParsing() {
        val big = ByteArray(IpsCheck.MAX_BYTES + 1) { 'x'.code.toByte() }
        assertEquals(Refusal.TOO_LARGE, try {
            IpsCheck.parse(big); null
        } catch (e: RefusedException) {
            e.refusal
        })
        assertEquals(Refusal.TOO_LARGE, try {
            IpsCheck.readCapped(big.inputStream()); null
        } catch (e: RefusedException) {
            e.refusal
        })
        assertEquals(IpsCheck.MAX_BYTES, IpsCheck.readCapped(ByteArray(IpsCheck.MAX_BYTES).inputStream()).size)
    }

    @Test fun codesAndPointersMatchTheService() {
        val expected = listOf(
            "too_large" to "#",
            "not_json" to "#",
            "not_a_bundle" to "#/resourceType",
            "not_a_document" to "#/type",
            "no_composition" to "#/entry/0/resource/resourceType",
            "not_a_patient_summary" to "#/entry/0/resource/type",
            "no_subject" to "#/entry/0/resource/subject/reference",
        )
        assertEquals(expected, Refusal.entries.map { it.code to it.pointer })
    }

    @Test fun acceptsAByteOrderMark() {
        try {
            IpsCheck.parse(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + minimal().toByteArray())
        } catch (e: RefusedException) {
            fail("refused ${e.refusal}")
        }
    }
}
