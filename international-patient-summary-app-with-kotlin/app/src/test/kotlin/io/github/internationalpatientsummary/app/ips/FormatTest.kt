// M-VIEW-7 displayOf precedence, system labels, names, dates, ages, quantities, narrative.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.util.Locale

class FormatTest {
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

    @Test fun displayPrefersCodingDisplayThenTextThenSystemAndCode() {
        assertEquals(
            "Asthma",
            Format.displayOf(json("""{"coding":[{"system":"http://snomed.info/sct","code":"195967001"},{"display":" Asthma "}],"text":"Wheezy"}""")),
        )
        assertEquals("Wheezy", Format.displayOf(json("""{"coding":[{"system":"http://snomed.info/sct","code":"195967001"}],"text":"Wheezy"}""")))
        assertEquals("SNOMED CT|195967001", Format.displayOf(json("""{"coding":[{"system":"http://snomed.info/sct","code":"195967001"}]}""")))
        assertEquals("http://example.org|x", Format.displayOf(json("""{"coding":[{"system":"http://example.org","code":"x"}]}""")))
        assertEquals("x", Format.displayOf(json("""{"coding":[{"code":"x"}]}""")))
        assertNull(Format.displayOf(json("""{}""")))
        assertNull(Format.displayOf(null))
    }

    @Test fun statusIsAWordNotAUri() {
        assertEquals("active", Format.statusOf(json("""{"coding":[{"system":"http://terminology.hl7.org/CodeSystem/condition-clinical","code":"active"}]}""")))
    }

    @Test fun systemLabels() {
        assertEquals("SNOMED CT", Format.systemLabel("http://snomed.info/sct"))
        assertEquals("NHS number", Format.systemLabel("https://fhir.nhs.uk/Id/nhs-number"))
        assertEquals("urn:oid:1.2.3", Format.systemLabel("urn:oid:1.2.3"))
        assertEquals("", Format.systemLabel(null))
    }

    @Test fun namesPreferOfficialThenUsual() {
        val names = json("""[{"use":"old","family":"Old"},{"use":"usual","given":["Sam"],"family":"Usual"},{"use":"official","text":" Dr Sam Official "}]""")
        assertEquals("Dr Sam Official", Format.humanName(names as kotlinx.serialization.json.JsonArray))
        assertEquals("Sam Usual", Format.humanName(json("""[{"use":"old","family":"Old"},{"use":"usual","given":["Sam"],"family":"Usual"}]""") as kotlinx.serialization.json.JsonArray))
        assertNull(Format.humanName(emptyList()))
    }

    @Test fun datesWriteTheMonthAsTextAndStayPartial() {
        assertEquals("2017", Format.date("2017", Locale.UK))
        assertEquals("Jan 2017", Format.date("2017-01", Locale.UK))
        assertEquals("12 Jan 2017", Format.date("2017-01-12", Locale.UK))
        assertEquals("Jan 12, 2017", Format.date("2017-01-12", Locale.US))
        val withTime = Format.date("2020-12-11T14:30:00+01:00", Locale.UK)!!
        assertTrue(withTime, withTime.startsWith("11 Dec 2020") && withTime.contains("14:30"))
        assertEquals("11 Dec 2020", Format.date("2020-12-11T14:30:00+01:00", Locale.UK, withTime = false))
        assertEquals("not a date", Format.date("not a date", Locale.UK))
        assertNull(Format.date(null, Locale.UK))
    }

    @Test fun agesAreWholeYearsAndNeverGuessed() {
        val today = LocalDate.of(2026, 11, 16)
        assertEquals(54, Format.ageInYears("1972-05-01", today))
        assertEquals(53, Format.ageInYears("1972-11-17", today))
        assertEquals(54, Format.ageInYears("1972-11-16", today))
        assertNull(Format.ageInYears("1972-05", today))
        assertNull(Format.ageInYears("2030-01-01", today))
        assertNull(Format.ageInYears(null, today))
    }

    @Test fun quantitiesAreWrittenAsGiven() {
        assertEquals("5.0 mg", Format.quantity(json("""{"value":5.0,"unit":"mg"}""")))
        assertEquals("<5 mmol/L", Format.quantity(json("""{"value":5,"comparator":"<","code":"mmol/L"}""")))
        assertEquals("12", Format.quantity(json("""{"value":12}""")))
        assertNull(Format.quantity(json("""{}""")))
    }

    @Test fun narrativeBecomesPlainText() {
        val text = Narrative.plainText(
            """<div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script><p>Penicillin &amp; <b>amoxicillin</b></p><table><tr><td>A</td><td>B</td></tr></table><img src="http://x/y.png"/>&#233;</div>""",
        )
        assertEquals("Penicillin & amoxicillin\nA | B\né", text)
        assertNull(Narrative.plainText("<div> </div>"))
    }
}
