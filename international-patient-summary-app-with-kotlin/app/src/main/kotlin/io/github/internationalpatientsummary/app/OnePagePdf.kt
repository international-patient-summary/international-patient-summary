// Draws the one-page PDF (spec M-PDF-1, M-PDF-2) with the platform's own
// tools: android.graphics.pdf.PdfDocument, StaticLayout and the system fonts,
// which cover every script. What the page says, and which plan fits, is the
// core's (ips/OnePage.kt); this puts each block in the reader's words, lays
// it out, counts pages and draws. An entry is one layout, so it never splits
// across a page. Every line runs in the reader's direction (right to left for
// Arabic, Hebrew, Persian, Urdu), with the document's text isolated within it.
package io.github.internationalpatientsummary.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextDirectionHeuristic
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import android.text.style.StyleSpan
import android.view.View
import androidx.core.graphics.withTranslation
import androidx.core.text.layoutDirection
import io.github.internationalpatientsummary.app.ips.Detail
import io.github.internationalpatientsummary.app.ips.DetailKind
import io.github.internationalpatientsummary.app.ips.Entry
import io.github.internationalpatientsummary.app.ips.Format
import io.github.internationalpatientsummary.app.ips.OnePage
import io.github.internationalpatientsummary.app.ips.Paper
import io.github.internationalpatientsummary.app.ips.PdfBlock
import io.github.internationalpatientsummary.app.ips.PdfFile
import io.github.internationalpatientsummary.app.ips.PdfFit
import io.github.internationalpatientsummary.app.ips.PdfInfo
import io.github.internationalpatientsummary.app.ips.PdfPlan
import io.github.internationalpatientsummary.app.ips.PdfRow
import io.github.internationalpatientsummary.app.ips.Section
import io.github.internationalpatientsummary.app.ips.SectionState
import io.github.internationalpatientsummary.app.ips.Summary
import io.github.internationalpatientsummary.app.ui.CODE_WORDS
import io.github.internationalpatientsummary.app.ui.genderWord
import io.github.internationalpatientsummary.app.ui.sectionTitle
import io.github.internationalpatientsummary.app.ui.stateText
import java.io.ByteArrayOutputStream
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import java.util.Locale

/** A made PDF: its bytes, and how it fitted (for checks and tests). */
class MadePdf(val bytes: ByteArray, val fileName: String, val pageCount: Int, val fit: PdfFit, val paper: Paper)

/** Makes the PDF for [summary] in [context]'s language; call off the main thread. */
class OnePagePdf(private val context: Context, private val summary: Summary, private val now: LocalDateTime = LocalDateTime.now()) {
    private val locale: Locale = context.resources.configuration.locales[0]
    private val rtl = locale.layoutDirection == View.LAYOUT_DIRECTION_RTL
    /** Every line runs in the reader's direction; the document's own text is isolated within it. */
    private val direction: TextDirectionHeuristic = if (rtl) TextDirectionHeuristics.RTL else TextDirectionHeuristics.LTR
    private val paper = Paper.of(locale)
    private val page = OnePage.of(summary)
    private val contentWidth = paper.width - 2 * SIDE

    fun make(): MadePdf {
        val fit = page.fit { plan -> paginate(pieces(plan), top(continued = false)).pages }
        val pieces = pieces(fit.plan)
        val laid = paginate(pieces, top(fit.continued))
        val document = PdfDocument()
        try {
            for (number in 0 until laid.pages) {
                val info = PdfDocument.PageInfo.Builder(paper.width, paper.height, number + 1).create()
                val pdfPage = document.startPage(info)
                draw(pdfPage.canvas, laid, number, fit)
                document.finishPage(pdfPage)
            }
            val out = ByteArrayOutputStream()
            document.writeTo(out)
            val name = PdfFile.name(summary.document.date)
            return MadePdf(PdfInfo.withTitle(out.toByteArray(), name), name, laid.pages, fit, paper)
        } finally {
            document.close()
        }
    }

    // ---- Words ----

    private fun string(id: Int, vararg args: Any): String = context.getString(id, *args)

    private fun sectionName(section: Section): String = when (val key = section.key) {
        null -> section.documentTitle?.let(::isolate) ?: string(R.string.section_untitled)
        else -> string(sectionTitle(key))
    }

    private fun stateWords(section: Section): String {
        val state = string(stateText(section.state) ?: R.string.state_not_recorded)
        // "None known: No known allergies", as the document coded it.
        val coded = section.entries.filterIsInstance<Entry.Resolved>().filter { it.absent != null }.mapNotNull { it.text }.distinct()
        return if (section.state != SectionState.MISSING && coded.isNotEmpty()) {
            string(R.string.detail_line, state, isolate(coded.joinToString(", ")))
        } else {
            state
        }
    }

    private fun list(items: List<String>): String = items.reduce { first, second -> string(R.string.list_pair, first, second) }

    private fun detailWords(detail: Detail): String = when (detail.kind) {
        DetailKind.DATE -> isolate(Format.date(detail.value, locale) ?: detail.value)
        DetailKind.STATUS, DetailKind.CRITICALITY -> list(detail.codes.map { code -> CODE_WORDS[code]?.let { string(it) } ?: isolate(code) })
        else -> isolate(detail.value)
    }

    private fun rowText(row: PdfRow): CharSequence = when (row) {
        is PdfRow.Text -> isolate(row.text)
        is PdfRow.Item -> when (val entry = row.entry) {
            Entry.NotFound -> bold(string(R.string.entry_not_found))
            is Entry.Resolved -> {
                val text = SpannableStringBuilder(bold(entry.text?.let(::isolate) ?: string(R.string.entry_no_concept, entry.resourceType)))
                val details = entry.details.map(::detailWords).filter { it.isNotBlank() }
                if (details.isNotEmpty()) text.append("  ").append(details.joinToString(" · "))
                text
            }
        }
    }

    private fun headerLines(): List<Pair<CharSequence, Float>> {
        val patient = summary.patient ?: return listOf(bold(string(R.string.patient_not_in_document)) to NAME_STEP)
        val facts = buildList {
            Format.date(patient.birthDate, locale)?.let(::isolate)?.let { born ->
                val age = Format.ageInYears(patient.birthDate, now.toLocalDate())
                add(
                    if (age == null) {
                        string(R.string.patient_born, born)
                    } else {
                        string(R.string.patient_born_with_age, born, context.resources.getQuantityString(R.plurals.age_years, age, age))
                    },
                )
            }
            patient.gender?.let { add(string(R.string.patient_gender, genderWord(it)?.let(::string) ?: isolate(it))) }
            patient.identifiers.firstOrNull()?.let { identifier ->
                val system = identifier.type ?: identifier.system.ifEmpty { string(R.string.identifier_no_system) }
                add(string(R.string.identifier_line, isolate(system), isolate(identifier.value)))
            }
        }
        return listOfNotNull(
            bold(patient.name?.let(::isolate) ?: string(R.string.patient_unnamed)) to NAME_STEP,
            facts.takeIf { it.isNotEmpty() }?.let { it.joinToString("    ") to 0f },
        )
    }

    private fun footerText(): String = listOfNotNull(
        string(R.string.pdf_generated, isolate(Format.date(now.truncatedTo(ChronoUnit.MINUTES).toString(), locale) ?: "")),
        Format.date(summary.document.date, locale)?.let { string(R.string.pdf_source, isolate(it)) },
        string(R.string.pdf_version),
        string(R.string.pdf_not_device),
    ).joinToString(" · ")

    // ---- Layout ----

    private enum class Group { HEADER, BOX, BODY }

    private class Piece(val layout: StaticLayout, val group: Group, val spaceBefore: Float, val keepWithNext: Boolean = false)

    private class Placed(val piece: Piece, val page: Int, val y: Float)

    private class Laid(val placed: List<Placed>, val pages: Int)

    private fun top(continued: Boolean): Float = if (continued) TOP_CONTINUED else TOP

    private fun paint(size: Float, color: Int = Color.BLACK): TextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        this.color = color
        typeface = Typeface.DEFAULT
        textLocale = locale
    }

    private fun layout(text: CharSequence, paint: TextPaint, width: Int, center: Boolean = false): StaticLayout {
        val alignment = if (center) Layout.Alignment.ALIGN_CENTER else Layout.Alignment.ALIGN_NORMAL
        return StaticLayout.Builder.obtain(text, 0, text.length, paint, width.coerceAtLeast(1))
            .setAlignment(alignment)
            .setTextDirection(direction)
            .setIncludePad(false)
            .setLineSpacing(0f, LINE_HEIGHT)
            .build()
    }

    private fun pieces(plan: PdfPlan): List<Piece> {
        val base = plan.fontSize
        val regular = paint(base)
        val large = paint(base + 1)
        val inner = contentWidth - 2 * PAD_X.toInt()
        fun piece(text: CharSequence, group: Group, before: Float, paint: TextPaint = regular, keep: Boolean = false): Piece {
            val width = if (group == Group.BODY) contentWidth else inner
            return Piece(layout(text, paint, width), group, before, keep)
        }
        return buildList {
            add(piece(string(R.string.pdf_title), Group.HEADER, 0f, paint(base - 1, TEAL)))
            headerLines().forEach { (text, step) -> add(piece(text, Group.HEADER, 1f, if (step > 0) paint(base + step) else regular)) }

            add(piece(bold(string(R.string.pdf_alerts)), Group.BOX, 0f, large))
            for (block in page.boxBlocks()) add(blockPiece(block, Group.BOX, base, regular, ::piece))

            for (block in page.bodyBlocks(plan)) {
                add(
                    when (block) {
                        is PdfBlock.Heading -> piece(bold(sectionName(block.section)), Group.BODY, base * 0.4f, large, keep = true)
                        else -> blockPiece(block, Group.BODY, base, regular, ::piece)
                    },
                )
            }
        }
    }

    private fun blockPiece(
        block: PdfBlock,
        group: Group,
        base: Float,
        paint: TextPaint,
        piece: (CharSequence, Group, Float, TextPaint, Boolean) -> Piece,
    ): Piece = when (block) {
        PdfBlock.AllergiesMissing -> piece(bold(string(R.string.alert_allergies_missing)), group, 1f, paint, false)
        is PdfBlock.Heading -> piece(bold(sectionName(block.section)), group, 2f, paint, true)
        is PdfBlock.Row -> piece(rowText(block.row), group, base * 0.15f, paint, false)
        is PdfBlock.State -> piece(italic(stateWords(block.section)), group, 1f, paint, false)
        PdfBlock.SectionNotShown -> piece(italic(string(R.string.pdf_section_not_shown)), group, 1f, paint, false)
        is PdfBlock.More -> piece(italic(string(R.string.pdf_more, block.count)), group, 1f, paint, false)
        is PdfBlock.NotShown -> piece(bold(string(R.string.pdf_not_shown, list(block.sections.map(::sectionName)))), group, base * 0.6f, paint, false)
    }

    private fun padTop(group: Group) = when (group) {
        Group.HEADER -> 5f
        Group.BOX -> 4f
        Group.BODY -> 0f
    }

    private fun padBottom(group: Group) = padTop(group)

    /** Place every piece; one that does not fit goes, whole, to the next page. */
    private fun paginate(pieces: List<Piece>, top: Float): Laid {
        val bottom = paper.height - BOTTOM
        val gapBetweenGroups = GROUP_GAP
        val placed = mutableListOf<Placed>()
        var pageNumber = 0
        var y = top
        var previous: Piece? = null
        pieces.forEachIndexed { index, piece ->
            fun gap(prev: Piece?): Float = when {
                prev == null -> padTop(piece.group)
                prev.group != piece.group -> padBottom(prev.group) + gapBetweenGroups + padTop(piece.group)
                else -> piece.spaceBefore
            }
            val next = pieces.getOrNull(index + 1)?.takeIf { piece.keepWithNext && it.group == piece.group }
            val keep = next?.let { it.spaceBefore + it.layout.height } ?: 0f
            var before = gap(previous)
            if (previous != null && y + before + piece.layout.height + keep + padBottom(piece.group) > bottom) {
                pageNumber++
                y = top
                before = gap(null)
            }
            placed += Placed(piece, pageNumber, y + before)
            y += before + piece.layout.height
            previous = piece
        }
        return Laid(placed, pageNumber + 1)
    }

    // ---- Drawing ----

    private fun draw(canvas: Canvas, laid: Laid, number: Int, fit: PdfFit) {
        val onPage = laid.placed.filter { it.page == number }
        for (group in listOf(Group.HEADER, Group.BOX)) {
            val pieces = onPage.filter { it.piece.group == group }
            if (pieces.isEmpty()) continue
            val top = pieces.first().y - padTop(group)
            val bottom = pieces.last().let { it.y + it.piece.layout.height } + padBottom(group)
            val left = SIDE.toFloat()
            val right = (paper.width - SIDE).toFloat()
            if (group == Group.HEADER) {
                canvas.drawRect(left, top, right, bottom, Paint().apply { color = BAND; style = Paint.Style.FILL })
            } else {
                val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = RED; style = Paint.Style.STROKE; strokeWidth = 1.5f }
                canvas.drawRect(left, top, right, bottom, stroke)
            }
        }
        for (placed in onPage) {
            val x = SIDE + if (placed.piece.group == Group.BODY) 0f else PAD_X
            canvas.withTranslation(x, placed.y) { placed.piece.layout.draw(this) }
        }
        if (fit.continued) {
            val banner = layout(bold(string(R.string.pdf_continued)), paint(9f, RED), contentWidth, center = true)
            canvas.withTranslation(SIDE.toFloat(), 12f) { banner.draw(this) }
        }
        drawFooter(canvas, number + 1, laid.pages)
    }

    private fun drawFooter(canvas: Canvas, number: Int, pages: Int) {
        val small = paint(FOOTER_SIZE, GREY)
        val pageLabel = string(R.string.pdf_page, number, pages)
        val labelWidth = small.measureText(pageLabel).toInt() + 1
        val textWidth = contentWidth - labelWidth - 12
        val y = paper.height - BOTTOM + 10f
        val text = layout(footerText(), small, textWidth)
        val label = layout(pageLabel, small, labelWidth)
        // The notice on the reading side, the page number on the other.
        val textX = if (rtl) SIDE + labelWidth + 12f else SIDE.toFloat()
        val labelX = if (rtl) SIDE.toFloat() else (paper.width - SIDE - labelWidth).toFloat()
        canvas.withTranslation(textX, y) { text.draw(this) }
        canvas.withTranslation(labelX, y) { label.draw(this) }
    }

    private companion object {
        const val SIDE = 28
        const val TOP = 26f
        const val TOP_CONTINUED = 34f
        const val BOTTOM = 40f
        const val PAD_X = 6f
        const val GROUP_GAP = 6f
        const val NAME_STEP = 5f
        const val FOOTER_SIZE = 7f
        const val LINE_HEIGHT = 1.05f
        val TEAL = Color.rgb(0x0b, 0x5e, 0x59)
        val BAND = Color.rgb(0xe6, 0xf2, 0xf1)
        val RED = Color.rgb(0xb4, 0x23, 0x18)
        val GREY = Color.rgb(0x44, 0x44, 0x44)

        /**
         * The document's own words, and values put into the app's sentences, as a
         * first-strong isolate (U+2068 … U+2069): English clinical text keeps its
         * order and punctuation in an Arabic line, and the reverse.
         */
        fun isolate(text: String): String = "\u2068$text\u2069"

        fun bold(text: String): CharSequence = styled(text, Typeface.BOLD)

        fun italic(text: String): CharSequence = styled(text, Typeface.ITALIC)

        fun styled(text: String, style: Int): CharSequence =
            SpannableStringBuilder(text).apply { setSpan(StyleSpan(style), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
    }
}
