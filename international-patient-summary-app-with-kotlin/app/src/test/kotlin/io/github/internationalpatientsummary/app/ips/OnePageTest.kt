package io.github.internationalpatientsummary.app.ips

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

/** M-PDF-1, M-PDF-2: what the one-page PDF says, and the plans tried to fit it. */
class OnePageTest {
    private fun medication(name: String, status: String, date: String) =
        Entry.Resolved("MedicationStatement", name, listOf(Detail(DetailKind.STATUS, status), Detail(DetailKind.DATE, date)), null)

    private fun condition(name: String, date: String?) =
        Entry.Resolved("Condition", name, listOfNotNull(date?.let { Detail(DetailKind.DATE, it) }), null)

    private fun section(key: SectionKey?, entries: List<Entry>, state: SectionState = SectionState.KNOWN, narrative: String? = null) =
        Section(key, key?.loinc ?: "00000-0", null, state, entries, narrative)

    private fun summary(vararg sections: Section, alert: AllergyAlert = AllergyAlert(false, emptyList())) = Summary(
        id = 1,
        bytes = ByteArray(0),
        patient = PatientInfo("Pat Example", "1970-01-01", "female", emptyList()),
        document = DocumentInfo("Crafted", "2026-09-30T10:00:00Z", emptyList()),
        sections = sections.toList(),
        allergyAlert = alert,
    )

    private val current = listOf(medication("Now A", "active", "2020-01-01"), medication("Now B", "on-hold", "2019-01-01"))
    private val past = (1..5).map { medication("Past $it", "completed", "201$it-06-01") }

    /** Medications (2 current, 5 past), problems (5), results (2), patient story (narrative), allergies. */
    private val crafted = summary(
        section(SectionKey.PATIENT_STORY, emptyList(), narrative = "My story"),
        section(SectionKey.RESULTS, listOf(condition("R1", "2021-01-01"), condition("R2", "2022-01-01"))),
        section(SectionKey.ALLERGIES, listOf(Entry.Resolved("AllergyIntolerance", "Penicillin", emptyList(), null))),
        section(SectionKey.PROBLEMS, (1..5).map { condition("P$it", "200$it") }),
        section(SectionKey.MEDICATIONS, past.take(2) + current + past.drop(2)),
    )

    private val page = OnePage.of(crafted)

    @Test fun sectionsAreInPdfPriorityOrderOutsideTheBox() {
        assertEquals(
            listOf(SectionKey.MEDICATIONS, SectionKey.PROBLEMS, SectionKey.RESULTS, SectionKey.PATIENT_STORY),
            page.sections.map { it.section.key },
        )
        assertEquals(listOf(SectionKey.ALLERGIES), page.boxSections.map { it.section.key })
    }

    @Test fun priorityIsTheWebViewers() {
        val expected = mapOf(
            SectionKey.ALERTS to 0, SectionKey.ALLERGIES to 1, SectionKey.MEDICATIONS to 2, SectionKey.PROBLEMS to 3,
            SectionKey.IMMUNIZATIONS to 4, SectionKey.RESULTS to 5, SectionKey.PROCEDURES to 6, SectionKey.DEVICES to 7,
            SectionKey.ADVANCE_DIRECTIVES to 8, SectionKey.VITAL_SIGNS to 9, SectionKey.PAST_ILLNESS to 10,
            SectionKey.PLAN_OF_CARE to 11, SectionKey.SOCIAL_HISTORY to 12, SectionKey.FUNCTIONAL to 13,
            SectionKey.PREGNANCY to 14, SectionKey.PATIENT_STORY to 15,
        )
        assertEquals(expected, SectionKey.entries.associateWith { it.pdfPriority })
        assertEquals(99, PdfSection(section(null, emptyList()), emptyList(), emptyList()).priority)
    }

    @Test fun currentMedicationsAreMustShowAndTheRestMostRecentFirst() {
        val medications = page.sections.first()
        assertEquals(current.map { PdfRow.Item(it) }, medications.mustShow)
        assertEquals(listOf("Past 5", "Past 4", "Past 3", "Past 2", "Past 1"), medications.others.map { ((it as PdfRow.Item).entry as Entry.Resolved).text })
        val problems = page.sections[1]
        assertEquals(listOf("P5", "P4", "P3", "P2", "P1"), problems.others.map { ((it as PdfRow.Item).entry as Entry.Resolved).text })
        assertEquals(listOf(PdfRow.Text("My story")), page.sections.last().others)
        // The web viewer's MedicationModel.current: active, intended, on hold, draft.
        for (status in listOf("active", "intended", "on-hold", "draft")) assertTrue(OnePage.isCurrentMedication(medication("x", status, "2020")))
        for (status in listOf("completed", "stopped", "not-taken", "entered-in-error")) assertFalse(OnePage.isCurrentMedication(medication("x", status, "2020")))
    }

    @Test fun plansAreTriedInTheWebViewersOrder() {
        val most = { n: Int -> Cap.Most(n) }
        // Indexes: 0 medications, 1 problems, 2 results, 3 patient story.
        val expected = listOf(
            PdfPlan(10f), PdfPlan(9.5f), PdfPlan(9f), PdfPlan(8.5f), PdfPlan(8f),
            // Cap at 3, lowest priority first, only sections with more than 3 to trim.
            PdfPlan(8f, mapOf(1 to most(3))),
            PdfPlan(8f, mapOf(1 to most(3), 0 to most(3))),
            // Then at 1.
            PdfPlan(8f, mapOf(1 to most(3), 0 to most(3), 2 to most(1))),
            PdfPlan(8f, mapOf(1 to most(1), 0 to most(3), 2 to most(1))),
            PdfPlan(8f, mapOf(1 to most(1), 0 to most(1), 2 to most(1))),
            // Then replace whole sections, lowest first; medications keep the current ones.
            PdfPlan(8f, mapOf(1 to most(1), 0 to most(1), 2 to most(1), 3 to Cap.Omit)),
            PdfPlan(8f, mapOf(1 to most(1), 0 to most(1), 2 to Cap.Omit, 3 to Cap.Omit)),
            PdfPlan(8f, mapOf(1 to Cap.Omit, 0 to most(1), 2 to Cap.Omit, 3 to Cap.Omit)),
            PdfPlan(8f, mapOf(1 to Cap.Omit, 0 to most(0), 2 to Cap.Omit, 3 to Cap.Omit)),
        )
        assertEquals(expected, page.plans().toList())
    }

    @Test fun currentMedicationsAreNeverTrimmedAndTheSectionNeverReplaced() {
        for (plan in page.plans()) {
            val rows = page.bodyBlocks(plan).filterIsInstance<PdfBlock.Row>().map { it.row }
            current.forEach { assertTrue(PdfRow.Item(it) in rows) }
            assertNotEquals(Cap.Omit, plan.caps[0])
        }
        // The box is the same in every plan: alerts and allergies are never trimmed.
        assertEquals(page.boxBlocks(), page.boxBlocks())
        assertTrue(PdfBlock.Row(PdfRow.Item(crafted.sections[2].entries.single())) in page.boxBlocks())
    }

    @Test fun trimmedAndReplacedSectionsAreNamedOnTheNotShownLine() {
        val plans = page.plans().toList()
        assertTrue(page.bodyBlocks(plans[4]).none { it is PdfBlock.NotShown })
        val capped = page.bodyBlocks(plans[5])
        assertTrue(PdfBlock.More(2) in capped)
        assertEquals(PdfBlock.NotShown(listOf(crafted.sections[3])), capped.last())
        val last = page.bodyBlocks(plans.last())
        assertTrue(PdfBlock.SectionNotShown in last)
        // Medications (current shown, 5 more), problems, results, patient story, in page order.
        assertEquals(
            PdfBlock.NotShown(listOf(crafted.sections[4], crafted.sections[3], crafted.sections[1], crafted.sections[0])),
            last.last(),
        )
        assertTrue(PdfBlock.More(5) in last)
    }

    @Test fun fitTakesTheFirstPlanOnOnePage() {
        // A fake measurer: one page while at most 12 rows are shown.
        val fit = page.fit { plan -> if (page.bodyBlocks(plan).count { it is PdfBlock.Row } <= 12) 1 else 2 }
        assertFalse(fit.continued)
        assertEquals(PdfPlan(8f, mapOf(1 to Cap.Most(3), 0 to Cap.Most(3))), fit.plan)
        assertEquals(PdfPlan(10f), page.fit { 1 }.plan)
    }

    @Test fun whatNeverTrimsRunsToASecondPageMarkedContinued() {
        val tried = mutableListOf<PdfPlan>()
        val fit = page.fit { tried += it; 2 }
        assertTrue(fit.continued)
        assertEquals(page.plans().toList(), tried)
        assertEquals(page.plans().last(), fit.plan)
        assertEquals(8f, fit.plan.fontSize)
        assertTrue(page.sections.indices.all { fit.plan.caps[it] != null })
    }

    @Test fun absentSectionsAreNotTrimmable() {
        val absent = OnePage.of(summary(section(SectionKey.PROBLEMS, emptyList(), SectionState.NONE_KNOWN), section(SectionKey.MEDICATIONS, current)))
        assertEquals(OnePage.FONT_SIZES.map { PdfPlan(it) }, absent.plans().toList())
        assertEquals(PdfBlock.State(absent.sections[1].section), absent.bodyBlocks(PdfPlan(10f))[4])
    }

    @Test fun theBoxHasTheAlertsSectionThenAllergiesThenTheMissingNotice() {
        val flag = Entry.Resolved("Flag", "Fall risk", emptyList(), null)
        val box = OnePage.of(
            summary(
                section(SectionKey.ALLERGIES, emptyList(), SectionState.MISSING),
                section(SectionKey.ALERTS, listOf(flag)),
                alert = AllergyAlert(true, listOf("Peanut")),
            ),
        )
        assertEquals(
            listOf(
                PdfBlock.Heading(box.summary.sections[1]),
                PdfBlock.Row(PdfRow.Item(flag)),
                PdfBlock.Heading(box.summary.sections[0]),
                PdfBlock.State(box.summary.sections[0]),
                PdfBlock.AllergiesMissing,
            ),
            box.boxBlocks(),
        )
        assertTrue(box.sections.isEmpty())
        // The banner's high-criticality lines are not repeated: each allergy shows its own criticality.
        val peanut = Entry.Resolved("AllergyIntolerance", "Peanut", listOf(Detail(DetailKind.CRITICALITY, "high")), null)
        val high = OnePage.of(summary(section(SectionKey.ALLERGIES, listOf(peanut)), alert = AllergyAlert(false, listOf("Peanut"))))
        assertEquals(listOf(PdfBlock.Heading(high.summary.sections[0]), PdfBlock.Row(PdfRow.Item(peanut))), high.boxBlocks())
    }

    @Test fun everyFixtureHasAPage() {
        for (name in Fixtures.NAMES) {
            val one = OnePage.of(Fixtures.open(name))
            assertTrue(name, one.boxSections.any { it.section.key == SectionKey.ALLERGIES })
            assertEquals(name, one.sections.map { it.priority }.sorted(), one.sections.map { it.priority })
            assertEquals(name, OnePage.FONT_SIZES.size + one.sections.sumOf { trims(it) }, one.plans().count())
        }
        val all = OnePage.of(Fixtures.open("bundle-ips-all-sections"))
        assertEquals(SectionKey.MEDICATIONS, all.sections.first().section.key)
    }

    /** How many plans a section adds: a cap at 3 and at 1 when it has more, and a replacement. */
    private fun trims(section: PdfSection): Int =
        if (section.others.isEmpty()) 0 else listOf(3, 1).count { section.others.size > it } + 1

    @Test fun paperIsLetterOnlyForUsEnglish() {
        assertEquals(Paper.LETTER, Paper.of(Locale.US))
        assertEquals(Paper.A4, Paper.of(Locale.UK))
        assertEquals(Paper.A4, Paper.of(Locale.ENGLISH))
        assertEquals(Paper.A4, Paper.of(Locale.forLanguageTag("es-US")))
        assertEquals(Paper.A4, Paper.of(Locale.forLanguageTag("ar")))
        assertEquals(612 to 792, Paper.LETTER.width to Paper.LETTER.height)
        assertEquals(595 to 842, Paper.A4.width to Paper.A4.height)
    }

    @Test fun fileNameHasTheDocumentDateOnly() {
        assertEquals("international-patient-summary-2026-09-30.pdf", PdfFile.name("2026-09-30T10:00:00+02:00"))
        assertEquals("international-patient-summary-2026-09-30.pdf", PdfFile.name("2026-09-30"))
        assertEquals("international-patient-summary.pdf", PdfFile.name(null))
        assertEquals("international-patient-summary.pdf", PdfFile.name("not a date"))
        for (name in Fixtures.NAMES) {
            val summary = Fixtures.open(name)
            val file = PdfFile.name(summary.document.date)
            summary.patient?.name?.split(" ")?.forEach { assertFalse(file.contains(it, ignoreCase = true)) }
        }
    }

    @Test fun titleIsAddedAsAnIncrementalUpdate() {
        val body = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n"
        val xref = body.length
        val original = (
            body + "xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n" +
                "trailer\n<< /Size 3 /Root 1 0 R /ID [<ab> <cd>] >>\nstartxref\n$xref\n%%EOF\n"
            ).toByteArray(Charsets.ISO_8859_1)
        val titled = PdfInfo.withTitle(original, "international-patient-summary-2026-09-30.pdf")
        val text = String(titled, Charsets.ISO_8859_1)
        assertTrue(text.startsWith(String(original, Charsets.ISO_8859_1)))
        assertTrue(text.contains("3 0 obj\n<< /Title (international-patient-summary-2026-09-30.pdf) >>"))
        assertTrue(text.contains("/Size 4 /Root 1 0 R /Info 3 0 R /Prev $xref /ID [<ab> <cd>]"))
        // The new xref entry and startxref point at the new object and section.
        val objectAt = text.indexOf("3 0 obj")
        assertTrue(text.contains(String.format(Locale.ROOT, "xref\n3 1\n%010d 00000 n \n", objectAt)))
        val startxref = Regex("""startxref\n(\d+)\n%%EOF\n$""").find(text)!!.groupValues[1].toInt()
        assertTrue(text.startsWith("xref\n3 1", startxref))
        // Not a PDF it can read: unchanged.
        val garbage = "not a pdf".toByteArray()
        assertTrue(PdfInfo.withTitle(garbage, "x").contentEquals(garbage))
    }
}
