// M-LOAD-3, M-READ-*, M-VIEW-1..6 on the five IG examples and crafted Bundles.
package io.github.internationalpatientsummary.app.ips

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.util.Locale

class SummaryReaderTest {
    @Test fun everyExampleIsAcceptedWithItsPatient() {
        val names = Fixtures.NAMES.associateWith { Fixtures.open(it).patient?.name }
        assertEquals(
            mapOf(
                "bundle-minimal" to "Martha DeLarosa",
                "bundle-ips-all-sections" to "Patricia JORDANA",
                "bundle-no-info-required-sections" to "James Judge",
                "IPS-examples-Bundle-01" to "Martha DeLarosa",
                "IPS-examples-Bundle-with-immunization" to "Martha DeLarosa",
            ),
            names,
        )
    }

    @Test fun keepsTheExactBytes() {
        val bytes = Fixtures.bytes("bundle-minimal")
        assertTrue(bytes.contentEquals(SummaryReader.open(bytes, 7).bytes))
    }

    @Test fun sectionsFollowCompositionOrder() {
        val summary = Fixtures.open("IPS-examples-Bundle-01")
        assertEquals(
            listOf("11450-4", "10160-0", "48765-2", "11348-0", "18776-5", "30954-2"),
            summary.sections.map { it.code },
        )
        val all = Fixtures.open("bundle-ips-all-sections")
        assertEquals(16, all.sections.size)
        assertEquals(SectionKey.entries.toSet(), all.sections.mapNotNull { it.key }.toSet())
        assertEquals(SectionKey.PROBLEMS, all.sections.first().key)
    }

    @Test fun missingRequiredSectionsComeLast() {
        val summary = SummaryReader.open(
            Fixtures.bundle("""{"title":"Immunizations","code":{"coding":[{"system":"http://loinc.org","code":"11369-6"}]}}"""),
            1,
        )
        assertEquals(
            listOf(SectionKey.IMMUNIZATIONS, SectionKey.ALLERGIES, SectionKey.MEDICATIONS, SectionKey.PROBLEMS),
            summary.sections.map { it.key },
        )
        assertEquals(listOf(SectionState.MISSING), summary.sections.drop(1).map { it.state }.distinct())
        assertTrue(summary.allergyAlert.sectionMissing)
    }

    @Test fun noInfoSectionsAreUnavailable() {
        val summary = Fixtures.open("bundle-no-info-required-sections")
        val byKey = summary.sections.associateBy { it.key }
        assertEquals(SectionState.UNAVAILABLE, byKey[SectionKey.ALLERGIES]!!.state)
        assertEquals(SectionState.UNAVAILABLE, byKey[SectionKey.PROBLEMS]!!.state)
        assertEquals(SectionState.UNAVAILABLE, byKey[SectionKey.MEDICATIONS]!!.state)
        assertEquals(SectionState.KNOWN, byKey[SectionKey.IMMUNIZATIONS]!!.state)
        assertFalse(summary.allergyAlert.sectionMissing)
    }

    @Test fun emptyReasonsAndAbsentCodesMapToTheirStates() {
        fun stateOf(section: String, vararg entries: String) =
            SummaryReader.open(Fixtures.bundle(section, *entries), 1).sections.first().state
        val allergies = """"code":{"coding":[{"system":"http://loinc.org","code":"48765-2"}]}"""
        fun reason(code: String) =
            """{$allergies,"emptyReason":{"coding":[{"system":"http://terminology.hl7.org/CodeSystem/list-empty-reason","code":"$code"}]}}"""
        assertEquals(SectionState.NONE_KNOWN, stateOf(reason("nilknown")))
        assertEquals(SectionState.NOT_RECORDED, stateOf(reason("notasked")))
        assertEquals(SectionState.NOT_RECORDED, stateOf(reason("notstarted")))
        assertEquals(SectionState.UNAVAILABLE, stateOf(reason("withheld")))
        assertEquals(SectionState.UNAVAILABLE, stateOf(reason("closed")))
        assertEquals(SectionState.UNAVAILABLE, stateOf(reason("something-else")))
        assertEquals(SectionState.NOT_RECORDED, stateOf("{$allergies}"))

        fun allergy(system: String, code: String) =
            """{"fullUrl":"urn:uuid:a","resource":{"resourceType":"AllergyIntolerance","code":{"coding":[{"system":"$system","code":"$code"}]}}}"""
        val withEntry = """{$allergies,"entry":[{"reference":"urn:uuid:a"}]}"""
        assertEquals(SectionState.NONE_KNOWN, stateOf(withEntry, allergy(Absent.ABSENT_UNKNOWN_SYSTEM, "no-known-allergies")))
        assertEquals(SectionState.NOT_RECORDED, stateOf(withEntry, allergy(Absent.ABSENT_UNKNOWN_SYSTEM, "no-allergy-info")))
        assertEquals(SectionState.NONE_KNOWN, stateOf(withEntry, allergy(Absent.SNOMED, "716186003")))
        assertEquals(SectionState.KNOWN, stateOf(withEntry, allergy(Absent.SNOMED, "764146007")))
    }

    @Test fun resolvesByFullUrlAndByTypeAndId() {
        // bundle-minimal uses urn:uuid fullUrls; all-sections uses "Type/id".
        val minimal = Fixtures.open("bundle-minimal")
        assertEquals(
            "Substance with penicillin structure (substance)",
            (minimal.sections.first { it.key == SectionKey.ALLERGIES }.entries.single() as Entry.Resolved).text,
        )
        val all = Fixtures.open("bundle-ips-all-sections")
        val allergies = all.sections.first { it.key == SectionKey.ALLERGIES }.entries
        assertEquals("Penicillin", (allergies.single() as Entry.Resolved).text)
        assertTrue(all.sections.all { section -> section.entries.none { it == Entry.NotFound } })
        assertEquals("Patricia JORDANA", all.patient?.name)
    }

    @Test fun anUnresolvedReferenceIsShownNotDropped() {
        val summary = SummaryReader.open(
            Fixtures.bundle("""{"code":{"coding":[{"system":"http://loinc.org","code":"11450-4"}]},"entry":[{"reference":"Condition/nowhere"}]}"""),
            1,
        )
        val problems = summary.sections.first()
        assertEquals(listOf(Entry.NotFound), problems.entries)
        assertEquals(SectionState.UNAVAILABLE, problems.state)
    }

    @Test fun anUnresolvedSubjectStillOpens() {
        val summary = SummaryReader.open(Fixtures.bundle("", subject = "Patient/elsewhere"), 1)
        assertNull(summary.patient)
        assertEquals("Crafted", summary.listTitle)
    }

    @Test fun theBannerAlertListsHighCriticalityAllergies() {
        val summary = Fixtures.open("IPS-examples-Bundle-01")
        assertEquals(listOf("Substance with penicillin structure (substance)"), summary.allergyAlert.highCriticality)
        assertFalse(summary.allergyAlert.sectionMissing)
        assertTrue(Fixtures.open("bundle-ips-all-sections").allergyAlert.isEmpty)
    }

    @Test fun readsPatientAndDocumentDetails() {
        val summary = Fixtures.open("bundle-minimal")
        val patient = summary.patient!!
        assertEquals("1972-05-01", patient.birthDate)
        assertEquals("female", patient.gender)
        assertEquals("574687583", patient.identifiers.single().value)
        assertEquals("Patient Summary as of December 11, 2020 14:30", summary.document.title)
        assertEquals("2020-12-11T14:30:00+01:00", summary.document.date)
        assertTrue(summary.document.authors.isNotEmpty())
    }

    @Test fun entriesCarryTheirDetails() {
        val summary = Fixtures.open("IPS-examples-Bundle-01")
        val allergy = summary.sections.first { it.key == SectionKey.ALLERGIES }.entries.first() as Entry.Resolved
        assertTrue(allergy.details.any { it.kind == DetailKind.CRITICALITY && it.value == "high" })
        val medications = summary.sections.first { it.key == SectionKey.MEDICATIONS }.entries.filterIsInstance<Entry.Resolved>()
        assertTrue(medications.all { it.text != null })
        val results = summary.sections.first { it.key == SectionKey.RESULTS }.entries.filterIsInstance<Entry.Resolved>()
        assertTrue(results.isNotEmpty())
    }

    @Test fun bannerScreenAndPdfKeepSourceDatesAndClinicalDecimals() {
        val source = Fixtures.bytes("bundle-ips-all-sections").toString(Charsets.UTF_8)
            .replace("\"birthDate\" : \"1956-09-30\"", "\"birthDate\" : \"2023-02-31\"")
            .replaceFirst("\"value\" : 4.1", "\"value\" : 0.12345678901234567890")
        val summary = SummaryReader.open(source.toByteArray(), 1)

        assertEquals("2023-02-31", summary.patient?.birthDate)
        assertEquals("2023-02-31", Format.date(summary.patient?.birthDate, Locale.UK))
        assertNull(Format.ageInYears(summary.patient?.birthDate, LocalDate.of(2026, 11, 19)))
        val entry = summary.sections.flatMap { it.entries }.filterIsInstance<Entry.Resolved>()
            .first { row -> row.details.any { it.kind == DetailKind.VALUE && it.value == "0.12345678901234567890\u00a0mmol/L" } }
        val pdfRows = OnePage.of(summary).boxBlocks() + OnePage.of(summary).bodyBlocks(PdfPlan(10f))
        assertTrue(pdfRows.any { it == PdfBlock.Row(PdfRow.Item(entry)) })
    }

    @Test fun statusDetailsKeepEachCode() {
        // M-VIEW-7: clinical then verification status, as codes the screen words.
        val summary = Fixtures.open("bundle-minimal")
        val problem = summary.sections.first { it.key == SectionKey.PROBLEMS }.entries.first() as Entry.Resolved
        val status = problem.details.single { it.kind == DetailKind.STATUS }
        assertEquals(listOf("active", "confirmed"), status.codes)
        assertEquals("active, confirmed", status.value)
    }

    @Test fun narrativeWithoutEntriesIsKept() {
        val summary = Fixtures.open("IPS-examples-Bundle-01")
        val plan = summary.sections.first { it.key == SectionKey.PLAN_OF_CARE }
        assertTrue(plan.entries.isEmpty())
        assertTrue(plan.narrative!!.isNotBlank())
        assertFalse(plan.narrative.contains("<"))
    }

    @Test fun aSectionWithAnotherCodeIsGeneric() {
        val summary = SummaryReader.open(
            Fixtures.bundle("""{"title":"Travel","code":{"coding":[{"system":"http://loinc.org","code":"00000-0"}]},"text":{"div":"<div>Abroad</div>"}}"""),
            1,
        )
        val generic = summary.sections.first()
        assertNull(generic.key)
        assertEquals("Travel", generic.documentTitle)
        assertEquals(SectionState.KNOWN, generic.state)
    }

    @Test fun wrongJsonTypesReadAsAbsent() {
        val summary = SummaryReader.open(
            Fixtures.bundle(""""oops",{"code":5,"entry":"x"}""", """{"fullUrl":7,"resource":[]}"""),
            1,
        )
        assertEquals("Pat Example", summary.patient?.name)
        assertEquals(SectionState.NOT_RECORDED, summary.sections.first().state)
    }
}
