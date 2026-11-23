// Writing FHIR datatypes for people (spec M-VIEW-1, M-VIEW-7), after the web
// viewer's src/lib/fhir/format.ts. These decide how a value is written, never
// what it is: no unit conversion, no rounding, no terminology lookups. Dates
// write the month as text so a date cannot be read two ways.
package io.github.internationalpatientsummary.app.ips

import android.icu.text.MeasureFormat
import android.icu.util.Measure
import android.icu.util.MeasureUnit
import kotlinx.serialization.json.JsonElement
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.Period
import java.time.temporal.ChronoUnit
import java.time.Year
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.DecimalStyle
import java.time.format.FormatStyle
import java.util.Locale

object Format {
    private val SYSTEM_LABELS = mapOf(
        "http://snomed.info/sct" to "SNOMED CT",
        "http://loinc.org" to "LOINC",
        "http://www.whocc.no/atc" to "ATC",
        "http://hl7.org/fhir/sid/icd-10" to "ICD-10",
        "http://hl7.org/fhir/sid/icd-10-cm" to "ICD-10-CM",
        "http://id.who.int/icd/release/11/mms" to "ICD-11",
        "http://hl7.org/fhir/sid/cvx" to "CVX",
        "http://www.nlm.nih.gov/research/umls/rxnorm" to "RxNorm",
        "http://unitsofmeasure.org" to "UCUM",
        "http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips" to "IPS absent/unknown",
        "http://terminology.hl7.org/CodeSystem/list-empty-reason" to "List empty reason",
        "http://terminology.hl7.org/CodeSystem/data-absent-reason" to "Data absent reason",
        "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation" to "v3 ObservationInterpretation",
        "http://terminology.hl7.org/CodeSystem/v3-ActCode" to "v3 ActCode",
        "http://terminology.hl7.org/CodeSystem/v3-Confidentiality" to "v3 Confidentiality",
        "http://standardterms.edqm.eu" to "EDQM",
        "urn:oid:1.2.36.1.2001.1005.17" to "AMT",
        "http://hl7.org/fhir/sid/ndc" to "NDC",
        "http://hl7.org/fhir/sid/us-ssn" to "US SSN",
        "https://fhir.nhs.uk/Id/nhs-number" to "NHS number",
    )

    /** A short name for a code system URI; the URI itself when it has none. */
    fun systemLabel(system: String?): String = if (system == null) "" else SYSTEM_LABELS[system] ?: system

    /**
     * The words for a CodeableConcept: Coding.display, then
     * CodeableConcept.text, then system|code (M-VIEW-7).
     */
    fun displayOf(concept: JsonElement?): String? {
        if (concept == null) return null
        val codings = concept.list("coding")
        codings.firstNotNullOfOrNull { it.text("display") }?.let { return it }
        concept.text("text")?.let { return it }
        val any = codings.firstOrNull { it.string("code") != null } ?: return null
        val code = any.string("code")!!
        val system = any.string("system")
        return if (system != null) "${systemLabel(system)}|$code" else code
    }

    /**
     * The code of a status concept (`clinicalStatus`, `verificationStatus`), such
     * as "active", which the screen puts in words (M-VIEW-7); falls back to the
     * display, then `text`. The same order as the iOS app's `statusCode`.
     */
    fun statusCode(concept: JsonElement?): String? {
        if (concept == null) return null
        val codings = concept.list("coding")
        return codings.firstNotNullOfOrNull { it.text("code") }
            ?: codings.firstNotNullOfOrNull { it.text("display") }
            ?: concept.text("text")
    }

    /** The name to show: official, then usual, then any current; text, else parts. */
    fun humanName(names: List<JsonElement>): String? {
        var best: String? = null
        var bestRank = 4
        for (name in names) {
            val rank = when (name.string("use")) {
                "official" -> 0
                "usual" -> 1
                "old", "maiden" -> 3
                else -> 2
            }
            if (rank >= bestRank) continue
            val words = nameText(name) ?: continue
            if (rank == 0) return words
            best = words
            bestRank = rank
        }
        return best
    }

    private fun nameText(name: JsonElement): String? {
        name.text("text")?.let { return it }
        fun parts(field: String) = name.list(field).mapNotNull { it.asString()?.trim()?.takeIf(String::isNotEmpty) }
        val given = parts("given")
        val family = name.text("family")
        if (given.isEmpty() && family == null) return null
        return (parts("prefix") + given + listOfNotNull(family) + parts("suffix")).joinToString(" ")
    }

    /** "5 mg", "<5 mmol/L": comparator, the value as written, a no-break space, the unit. */
    fun quantity(quantity: JsonElement?): String? {
        if (quantity == null) return null
        val unit = quantity.text("unit") ?: quantity.text("code") ?: ""
        val value = quantity.number("value") ?: return unit.ifEmpty { null }
        val comparator = quantity.string("comparator")?.takeIf { it in COMPARATORS } ?: ""
        return if (unit.isEmpty()) "$comparator$value" else "$comparator$value $unit"
    }

    private val COMPARATORS = setOf("<", "<=", ">=", ">")

    private val YEAR = Regex("""^\d{4}$""")
    private val YEAR_MONTH = Regex("""^\d{4}-\d{2}$""")
    private val FULL_DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")

    /**
     * A FHIR date or dateTime in [locale]: "2017", "Jan 2017", "12 Jan 2017",
     * or with a time at the document's own offset. Partial dates stay partial;
     * nothing is invented. An unparseable value is returned as written.
     */
    fun date(value: String?, locale: Locale, withTime: Boolean = true): String? {
        if (value.isNullOrBlank()) return null
        return try {
            when {
                YEAR.matches(value) -> Year.parse(value).format(digits(DateTimeFormatter.ofPattern("y", locale), locale))
                YEAR_MONTH.matches(value) ->
                    YearMonth.parse(value).format(digits(DateTimeFormatter.ofPattern("MMM yyyy", locale), locale))
                FULL_DATE.matches(value) -> LocalDate.parse(value).format(mediumDate(locale))
                else -> {
                    val parsed = try {
                        OffsetDateTime.parse(value).toLocalDateTime()
                    } catch (_: DateTimeParseException) {
                        LocalDateTime.parse(value)
                    }
                    if (withTime) {
                        parsed.format(digits(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale), locale))
                    } else {
                        parsed.toLocalDate().format(mediumDate(locale))
                    }
                }
            }
        } catch (_: DateTimeParseException) {
            value
        }
    }

    private fun mediumDate(locale: Locale) = digits(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale), locale)

    /**
     * The language's own digits (Arabic-Indic for Arabic), as the age beside a
     * date already has them (M-I18N-2). java.time writes ASCII digits unless told.
     */
    private fun digits(formatter: DateTimeFormatter, locale: Locale): DateTimeFormatter =
        formatter.withDecimalStyle(DecimalStyle.of(locale))

    /**
     * The age for a clinician (spec M-VIEW-1) on [today]: days under 28 days; weeks and days under a year; months and
     * days under two; years and months under 18; then years alone. Whole calendar units, in the reader's words from
     * ICU (no strings of ours, so every language has them); a zero second part is left out. Null for a partial,
     * missing, invalid or future birth date.
     */
    fun ageText(birthDate: String?, today: LocalDate, locale: Locale): String? {
        if (birthDate == null || !FULL_DATE.matches(birthDate)) return null
        val born = try {
            LocalDate.parse(birthDate)
        } catch (_: DateTimeParseException) {
            return null
        }
        if (born.isAfter(today)) return null
        val span = Period.between(born, today)
        val totalDays = ChronoUnit.DAYS.between(born, today)
        val parts = when {
            totalDays < 28 -> listOf(MeasureUnit.DAY to totalDays)
            span.years < 1 -> listOf(MeasureUnit.WEEK to totalDays / 7, MeasureUnit.DAY to totalDays % 7)
            span.years < 2 -> listOf(MeasureUnit.MONTH to span.years * 12L + span.months, MeasureUnit.DAY to span.days.toLong())
            span.years < 18 -> listOf(MeasureUnit.YEAR to span.years.toLong(), MeasureUnit.MONTH to span.months.toLong())
            else -> listOf(MeasureUnit.YEAR to span.years.toLong())
        }
        // A zero second part is left out ("3 years", not "3 years 0 months"); a zero first part ("0 days") stays.
        val shown = parts.filterIndexed { index, (_, value) -> index == 0 || value != 0L }
        // Each part is worded alone and the parts are joined by a space, as on iOS: "2 years 1 month".
        val words = MeasureFormat.getInstance(locale, MeasureFormat.FormatWidth.WIDE)
        return shown.joinToString(" ") { (unit, value) -> words.format(Measure(value, unit)) }
    }
}
