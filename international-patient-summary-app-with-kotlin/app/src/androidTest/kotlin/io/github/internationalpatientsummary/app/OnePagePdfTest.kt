// The one-page PDF on a device (M-PDF-1, M-PDF-2): every bundled, fictional
// example is laid out, counted and drawn with the platform's PdfDocument and
// StaticLayout, in US English (Letter), British English (A4) and Arabic
// (right to left); a crafted long summary is trimmed to one page, and one
// whose current medicines alone overrun runs to a second page. With the
// instrumentation argument pdfOut=1 the PDFs are also written to the app's
// cacheDir/share/ (removed at the next launch, as a share file is) for
// checking by eye or with pdftotext.
package io.github.internationalpatientsummary.app

import android.content.Context
import android.content.res.Configuration
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.internationalpatientsummary.app.ips.AllergyAlert
import io.github.internationalpatientsummary.app.ips.Detail
import io.github.internationalpatientsummary.app.ips.DetailKind
import io.github.internationalpatientsummary.app.ips.DocumentInfo
import io.github.internationalpatientsummary.app.ips.Entry
import io.github.internationalpatientsummary.app.ips.OnePage
import io.github.internationalpatientsummary.app.ips.Paper
import io.github.internationalpatientsummary.app.ips.PatientInfo
import io.github.internationalpatientsummary.app.ips.PdfBlock
import io.github.internationalpatientsummary.app.ips.Section
import io.github.internationalpatientsummary.app.ips.SectionKey
import io.github.internationalpatientsummary.app.ips.SectionState
import io.github.internationalpatientsummary.app.ips.Summary
import io.github.internationalpatientsummary.app.ips.SummaryReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.Locale

@RunWith(AndroidJUnit4::class)
class OnePagePdfTest {
    private val target = InstrumentationRegistry.getInstrumentation().targetContext
    private val write = InstrumentationRegistry.getArguments().getString("pdfOut") == "1"

    private fun inLocale(tag: String): Context {
        val configuration = Configuration(target.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(tag))
        return target.createConfigurationContext(configuration)
    }

    private fun made(tag: String, example: String): MadePdf {
        val bytes = target.assets.open("examples/$example.json").use { it.readBytes() }
        val pdf = OnePagePdf(inLocale(tag), SummaryReader.open(bytes, 1)).make()
        if (write) {
            File(target.cacheDir, "share").apply { mkdirs() }.resolve("$example.$tag.pdf").writeBytes(pdf.bytes)
        }
        return pdf
    }

    @Test fun everyExampleIsOnePageWithItsTitle() {
        for (tag in listOf("en-US", "en-GB", "ar")) {
            for (example in EXAMPLES) {
                val pdf = made(tag, example)
                val text = String(pdf.bytes, Charsets.ISO_8859_1)
                assertTrue(text.startsWith("%PDF-"))
                assertTrue("$example $tag", text.contains("/Title (${pdf.fileName})"))
                assertEquals(if (tag == "en-US") Paper.LETTER else Paper.A4, pdf.paper)
                // A fit is one page; only a continued PDF runs over (M-PDF-2).
                assertEquals("$example $tag", !pdf.fit.continued, pdf.pageCount == 1)
                assertEquals("$example $tag", false, pdf.fit.continued)
            }
        }
    }

    /** A crafted, fictional summary: [current] current medicines and [problems] problems. */
    private fun crafted(current: Int, problems: Int): Summary {
        val medicines = (1..current).map {
            Entry.Resolved("MedicationStatement", "Medicine $it", listOf(Detail(DetailKind.STATUS, "active"), Detail(DetailKind.DOSAGE, "One tablet daily")), null)
        }
        val conditions = (1..problems).map {
            Entry.Resolved("Condition", "Condition $it", listOf(Detail(DetailKind.DATE, "20${10 + it % 15}-01-01")), null)
        }
        fun section(key: SectionKey, entries: List<Entry>, state: SectionState) = Section(key, key.loinc, null, state, entries, null)
        return Summary(
            id = 1,
            bytes = ByteArray(0),
            patient = PatientInfo("Pat Example", "1970-01-01", "female", emptyList()),
            document = DocumentInfo("Crafted", "2026-01-01", emptyList()),
            sections = listOf(
                section(SectionKey.ALLERGIES, emptyList(), SectionState.NONE_KNOWN),
                section(SectionKey.MEDICATIONS, medicines, SectionState.KNOWN),
                section(SectionKey.PROBLEMS, conditions, SectionState.KNOWN),
            ),
            allergyAlert = AllergyAlert(false, emptyList()),
        )
    }

    private fun made(summary: Summary, name: String): MadePdf {
        val pdf = OnePagePdf(inLocale("en-GB"), summary).make()
        if (write) File(target.cacheDir, "share").apply { mkdirs() }.resolve("$name.pdf").writeBytes(pdf.bytes)
        return pdf
    }

    @Test fun aLongSummaryIsTrimmedToOnePage() {
        val pdf = made(crafted(current = 3, problems = 150), "crafted-trimmed")
        assertEquals(1, pdf.pageCount)
        assertFalse(pdf.fit.continued)
        assertEquals(8f, pdf.fit.plan.fontSize)
        // Problems are capped (or replaced); the current medicines are never trimmed.
        val page = OnePage.of(crafted(3, 150))
        assertTrue(pdf.fit.plan.caps[1] != null)
        assertEquals(3, page.bodyBlocks(pdf.fit.plan).count { it is PdfBlock.Row && it.row in page.sections[0].mustShow })
    }

    @Test fun tooManyCurrentMedicinesRunToASecondPage() {
        val summary = crafted(current = 150, problems = 10)
        val pdf = made(summary, "crafted-continued")
        assertTrue(pdf.fit.continued)
        assertTrue(pdf.pageCount >= 2)
        assertEquals(OnePage.of(summary).plans().last(), pdf.fit.plan)
    }

    private companion object {
        val EXAMPLES = listOf(
            "bundle-minimal",
            "bundle-ips-all-sections",
            "bundle-no-info-required-sections",
            "IPS-examples-Bundle-01",
            "IPS-examples-Bundle-with-immunization",
        )
    }
}
