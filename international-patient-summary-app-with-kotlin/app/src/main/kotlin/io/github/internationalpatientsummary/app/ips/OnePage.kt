// The one-page PDF (spec M-PDF-1, M-PDF-2), after the web viewer's
// src/lib/export/pdf.ts: what the page says, in what order, and the plans
// tried, in order, until it fits on one page. Fitting takes a page counter, so
// the rules are tested on the JVM with a fake one; the app measures and draws
// with the platform's text and PDF tools (OnePagePdf.kt) and says every block
// in the reader's words.
package io.github.internationalpatientsummary.app.ips

import java.util.Locale

/** Paper sizes in PDF points (1/72 inch). */
enum class Paper(val width: Int, val height: Int) {
    A4(595, 842),
    LETTER(612, 792),
    ;

    companion object {
        /** US Letter for US English (en-US), A4 otherwise (M-PDF-1). */
        fun of(locale: Locale): Paper =
            if (locale.language.equals("en", ignoreCase = true) && locale.country.equals("US", ignoreCase = true)) LETTER else A4
    }
}

/** One line under a section heading. */
sealed interface PdfRow {
    /** An entry: its concept in bold, then its details joined with " · ". */
    data class Item(val entry: Entry) : PdfRow

    /** The narrative of a section that carries its content there (Patient story, another code). */
    data class Text(val text: String) : PdfRow
}

/**
 * A section as the PDF shows it: [mustShow] rows are never trimmed (current
 * medications); [others] may be, most recent first.
 */
class PdfSection(val section: Section, val mustShow: List<PdfRow>, val others: List<PdfRow>) {
    val priority: Int get() = section.key?.pdfPriority ?: SectionKey.OTHER_PDF_PRIORITY
    val hasRows: Boolean get() = mustShow.isNotEmpty() || others.isNotEmpty()
}

/** How many of a section's trimmable rows a plan shows. */
sealed interface Cap {
    /** At most [count] of the trimmable rows, then "More not shown". */
    data class Most(val count: Int) : Cap

    /** The whole section is replaced with "Section present — not shown on this one-page summary". */
    data object Omit : Cap
}

/** One attempt: a font size and caps on sections, by their index in [OnePage.sections]. */
data class PdfPlan(val fontSize: Float, val caps: Map<Int, Cap> = emptyMap())

/** What lays out: the plan, and whether the page runs over (both pages say "CONTINUED"). */
data class PdfFit(val plan: PdfPlan, val continued: Boolean)

/** One block of the page, in order; the app puts each in words. */
sealed interface PdfBlock {
    /** "The allergies section is missing from this document" (M-VIEW-1), only when it is. */
    data object AllergiesMissing : PdfBlock

    data class Heading(val section: Section) : PdfBlock
    data class Row(val row: PdfRow) : PdfBlock

    /** The section's absent state in words (M-VIEW-5). */
    data class State(val section: Section) : PdfBlock

    /** "Section present — not shown on this one-page summary". */
    data object SectionNotShown : PdfBlock

    /** "More not shown: [count]". */
    data class More(val count: Int) : PdfBlock

    /** "Not shown on this page: …", naming each trimmed or replaced section. */
    data class NotShown(val sections: List<Section>) : PdfBlock
}

/** The content of the one-page PDF for a summary. */
class OnePage private constructor(
    val summary: Summary,
    /** The alerts and allergies sections, shown whole in the box. */
    val boxSections: List<PdfSection>,
    /** Every other section, by PDF priority (then Composition order). */
    val sections: List<PdfSection>,
) {
    /**
     * The box headed "Alerts and allergies", never trimmed (M-PDF-1, M-PDF-2):
     * the Alerts section, then every allergy (each with its own criticality, so
     * the banner's high-criticality lines are not repeated), then M-VIEW-1's
     * notice only when the document has no allergies section.
     */
    fun boxBlocks(): List<PdfBlock> = buildList {
        for (section in boxSections) {
            add(PdfBlock.Heading(section.section))
            if (!section.hasRows) add(PdfBlock.State(section.section)) else section.others.forEach { add(PdfBlock.Row(it)) }
        }
        if (summary.allergyAlert.sectionMissing) add(PdfBlock.AllergiesMissing)
    }

    /** The sections under the box, as [plan] shows them. */
    fun bodyBlocks(plan: PdfPlan): List<PdfBlock> = buildList {
        sections.forEachIndexed { index, section ->
            add(PdfBlock.Heading(section.section))
            if (!section.hasRows) {
                add(PdfBlock.State(section.section))
                return@forEachIndexed
            }
            when (val cap = plan.caps[index]) {
                Cap.Omit -> add(PdfBlock.SectionNotShown)
                else -> {
                    val shown = if (cap is Cap.Most) section.others.take(cap.count) else section.others
                    (section.mustShow + shown).forEach { add(PdfBlock.Row(it)) }
                    val hidden = section.others.size - shown.size
                    if (hidden > 0) add(PdfBlock.More(hidden))
                }
            }
        }
        val notShown = notShown(plan)
        if (notShown.isNotEmpty()) add(PdfBlock.NotShown(notShown))
    }

    /** The sections [plan] trims or replaces, in the order the page prints them. */
    fun notShown(plan: PdfPlan): List<Section> = sections.filterIndexed { index, section ->
        val cap = plan.caps[index]
        section.hasRows && when (cap) {
            null -> false
            Cap.Omit -> true
            is Cap.Most -> section.others.size > cap.count
        }
    }.map { it.section }

    /**
     * The order plans are tried (M-PDF-2), the web viewer's `plans()`: shrink
     * the font; then, at the smallest, cap the lowest-priority sections with
     * something to trim at 3, then 1; then replace them, lowest first, except
     * that a medication section with current medications keeps them (cap 0).
     */
    fun plans(): Sequence<PdfPlan> = sequence {
        for (size in FONT_SIZES) yield(PdfPlan(size))
        val floor = FONT_SIZES.last()
        val caps = linkedMapOf<Int, Cap>()
        val trimmable = sections.indices.filter { sections[it].others.isNotEmpty() }.sortedByDescending { sections[it].priority }
        for (limit in listOf(3, 1)) {
            for (index in trimmable) {
                if (sections[index].others.size <= limit) continue
                caps[index] = Cap.Most(limit)
                yield(PdfPlan(floor, caps.toMap()))
            }
        }
        for (index in trimmable) {
            caps[index] = if (sections[index].mustShow.isNotEmpty()) Cap.Most(0) else Cap.Omit
            yield(PdfPlan(floor, caps.toMap()))
        }
    }

    /**
     * The first plan that [pages] lays out on one page; else the last one
     * (everything trimmed that can be, at 8 pt), continued on a second page.
     */
    fun fit(pages: (PdfPlan) -> Int): PdfFit {
        var last = PdfPlan(FONT_SIZES.first())
        for (plan in plans()) {
            last = plan
            if (pages(plan) <= 1) return PdfFit(plan, continued = false)
        }
        return PdfFit(last, continued = true)
    }

    companion object {
        val FONT_SIZES = listOf(10f, 9.5f, 9f, 8.5f, 8f)

        /** Medication statuses that make a medicine current: the web viewer's `MedicationModel.current`. */
        val CURRENT_STATUSES = setOf("active", "intended", "on-hold", "draft")

        private val IN_BOX = setOf(SectionKey.ALERTS, SectionKey.ALLERGIES)

        fun of(summary: Summary): OnePage {
            val prepared = summary.sections.map(::prepare)
            return OnePage(
                summary,
                boxSections = prepared.filter { it.section.key == SectionKey.ALERTS } +
                    prepared.filter { it.section.key == SectionKey.ALLERGIES },
                sections = prepared.filter { it.section.key !in IN_BOX }.sortedBy { it.priority },
            )
        }

        /** True for a medication entry whose status is current. */
        fun isCurrentMedication(entry: Entry): Boolean =
            entry is Entry.Resolved &&
                entry.absent == null &&
                (entry.resourceType == "MedicationStatement" || entry.resourceType == "MedicationRequest") &&
                entry.details.any { it.kind == DetailKind.STATUS && it.codes.any { code -> code in CURRENT_STATUSES } }

        /** The FHIR date an entry is sorted by, most recent first; "" sorts last. */
        private fun dateOf(row: PdfRow): String =
            ((row as? PdfRow.Item)?.entry as? Entry.Resolved)?.details?.firstOrNull { it.kind == DetailKind.DATE }?.value ?: ""

        private fun prepare(section: Section): PdfSection {
            if (section.state != SectionState.KNOWN) return PdfSection(section, emptyList(), emptyList())
            val rows = section.entries.map { PdfRow.Item(it) }.ifEmpty {
                listOfNotNull(section.narrative?.let { PdfRow.Text(it) })
            }
            val (mustShow, others) = if (section.key == SectionKey.MEDICATIONS) {
                rows.partition { isCurrentMedication(it.entryOrNull()) }
            } else {
                Pair(emptyList(), rows)
            }
            val inBox = section.key in IN_BOX
            // The box keeps the document's order; elsewhere the most recent come first.
            return PdfSection(section, mustShow, if (inBox) others else others.sortedByDescending(::dateOf))
        }

        private fun PdfRow.entryOrNull(): Entry = (this as? PdfRow.Item)?.entry ?: Entry.NotFound
    }
}

/** The PDF file's name and type (M-PDF-1): the document's date, never the patient. */
object PdfFile {
    const val MIME_TYPE = "application/pdf"
    private val DATE = Regex("""^\d{4}(-\d{2}(-\d{2})?)?""")

    /** "international-patient-summary-2026-09-30.pdf", from the Composition date only (the web viewer's `exportFilename`). */
    fun name(documentDate: String?): String {
        val date = documentDate?.let { DATE.find(it)?.value }
        return if (date != null) "international-patient-summary-$date.pdf" else "international-patient-summary.pdf"
    }
}

/**
 * The PDF's title metadata (M-PDF-1). Android's PdfDocument writes no title,
 * so one is added as an incremental update: a new document information
 * dictionary, its cross-reference section, and a trailer that points back to
 * the original. The original bytes are untouched; a file whose trailer cannot
 * be read is returned as it is.
 */
object PdfInfo {
    private val STARTXREF = Regex("""startxref\s+(\d+)\s+%%EOF\s*$""")
    private val SIZE = Regex("""/Size\s+(\d+)""")
    private val ROOT = Regex("""/Root\s+(\d+\s+\d+\s+R)""")
    private val ID = Regex("""/ID\s*\[[^\]]*\]""")

    fun withTitle(pdf: ByteArray, title: String): ByteArray {
        val text = String(pdf, Charsets.ISO_8859_1)
        val previous = STARTXREF.find(text)?.groupValues?.get(1)?.toLongOrNull() ?: return pdf
        val trailerAt = text.lastIndexOf("trailer")
        if (trailerAt < 0) return pdf
        val trailer = text.substring(trailerAt, text.lastIndexOf("startxref"))
        val size = SIZE.find(trailer)?.groupValues?.get(1)?.toIntOrNull() ?: return pdf
        val root = ROOT.find(trailer)?.groupValues?.get(1) ?: return pdf
        val id = ID.find(trailer)?.value?.let { " $it" } ?: ""
        val separator = if (text.endsWith("\n")) "" else "\n"
        val objectAt = pdf.size + separator.length
        val info = "$size 0 obj\n<< /Title (${escape(title)}) >>\nendobj\n"
        val xrefAt = objectAt + info.length
        val update = buildString {
            append(separator)
            append(info)
            append("xref\n$size 1\n")
            append(String.format(Locale.ROOT, "%010d 00000 n \n", objectAt))
            append("trailer\n<< /Size ${size + 1} /Root $root /Info $size 0 R /Prev $previous$id >>\n")
            append("startxref\n$xrefAt\n%%EOF\n")
        }
        return pdf + update.toByteArray(Charsets.ISO_8859_1)
    }

    /** A PDF literal string: ASCII only (the name is), with \, ( and ) escaped. */
    private fun escape(value: String): String =
        value.filter { it.code in 0x20..0x7e }.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
}
