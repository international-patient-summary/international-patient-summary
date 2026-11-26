// The one-page PDF's layout and drawing on the JVM (M-PDF-1, M-PDF-2): every example in
// three locales, and crafted summaries that trim and that run to a second page, drawn
// through a fake PdfSink, because the platform's PdfDocument is closed under Robolectric.
// The device test (OnePagePdfTest) covers the real PdfDocument.
package io.github.internationalpatientsummary.app

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.test.core.app.ApplicationProvider
import io.github.internationalpatientsummary.app.ips.AllergyAlert
import io.github.internationalpatientsummary.app.ips.Detail
import io.github.internationalpatientsummary.app.ips.DetailKind
import io.github.internationalpatientsummary.app.ips.DocumentInfo
import io.github.internationalpatientsummary.app.ips.Entry
import io.github.internationalpatientsummary.app.ips.Fixtures
import io.github.internationalpatientsummary.app.ips.Paper
import io.github.internationalpatientsummary.app.ips.PatientInfo
import io.github.internationalpatientsummary.app.ips.Section
import io.github.internationalpatientsummary.app.ips.SectionKey
import io.github.internationalpatientsummary.app.ips.SectionState
import io.github.internationalpatientsummary.app.ips.Summary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDateTime
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OnePagePdfJvmTest {
    private val application: Application get() = ApplicationProvider.getApplicationContext()

    /** Records each page and draws it on a real bitmap canvas. */
    private class RecordingSink : PdfSink {
        val sizes = mutableListOf<Triple<Int, Int, Int>>()
        var closed = false

        override fun page(width: Int, height: Int, number: Int, draw: (Canvas) -> Unit) {
            sizes += Triple(width, height, number)
            draw(Canvas(Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)))
        }

        override fun bytes(): ByteArray = "%PDF-1.4\n".toByteArray()

        override fun close() {
            closed = true
        }
    }

    private fun inLocale(tag: String): Context {
        val configuration = Configuration(application.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(tag))
        return application.createConfigurationContext(configuration)
    }

    private fun make(tag: String, summary: Summary): Pair<MadePdf, RecordingSink> {
        val sink = RecordingSink()
        val pdf = OnePagePdf(inLocale(tag), summary, LocalDateTime.of(2026, 11, 26, 9, 30)) { sink }.make()
        return pdf to sink
    }

    @Test fun everyExampleIsDrawnOnOnePageInEachPaperAndDirection() {
        for ((tag, paper) in listOf("en-US" to Paper.LETTER, "en-GB" to Paper.A4, "ar" to Paper.A4)) {
            for (name in Fixtures.NAMES) {
                val (pdf, sink) = make(tag, Fixtures.open(name))
                assertEquals("$name $tag", paper, pdf.paper)
                // Robolectric's text metrics are not a device's, so the fit is the device test's;
                // here every page is drawn at the paper's size, in order.
                assertEquals("$name $tag", (1..pdf.pageCount).map { Triple(paper.width, paper.height, it) }, sink.sizes)
                assertTrue(sink.closed)
            }
        }
    }

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

    @Test fun aLongSummaryIsDrawnAndItsPagesCountedAsTheSinkSawThem() {
        val (pdf, sink) = make("en-GB", crafted(current = 3, problems = 150))
        assertEquals(pdf.pageCount, sink.sizes.size)
        assertTrue(sink.closed)
    }

    @Test fun tooManyCurrentMedicinesRunToASecondPageThatSaysSo() {
        val (pdf, sink) = make("en-GB", crafted(current = 150, problems = 10))
        assertTrue(pdf.fit.continued)
        assertTrue(pdf.pageCount >= 2)
        assertEquals((1..pdf.pageCount).toList(), sink.sizes.map { it.third })
    }
}
