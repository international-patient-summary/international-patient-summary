// Writing FHIR datatypes for people (spec M-VIEW-1, M-VIEW-7), after the web
// viewer's src/lib/fhir/format.ts. These decide how a value is written, never
// what it is: no unit conversion, no rounding, no terminology lookups. Dates
// write the month as text so a date cannot be read two ways.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.JsonElement
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.Period
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
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

    /** A status concept in words: display, then text, then the bare code ("active"). */
    fun statusOf(concept: JsonElement?): String? {
        if (concept == null) return null
        val codings = concept.list("coding")
        return codings.firstNotNullOfOrNull { it.text("display") }
            ?: concept.text("text")
            ?: codings.firstNotNullOfOrNull { it.text("code") }
    }

    /** The name to show: official, then usual, then any current; text, else parts. */
    fun humanName(names: List<JsonElement>): String? {
        if (names.isEmpty()) return null
        val pick = names.firstOrNull { it.string("use") == "official" }
            ?: names.firstOrNull { it.string("use") == "usual" }
            ?: names.firstOrNull { it.string("use") != "old" && it.string("use") != "maiden" }
            ?: names.first()
        pick.text("text")?.let { return it }
        val parts = (pick.list("prefix") + pick.list("given")).mapNotNull { it.asString() } +
            listOfNotNull(pick.string("family")) +
            pick.list("suffix").mapNotNull { it.asString() }
        return parts.map { it.trim() }.filter { it.isNotEmpty() }.joinToString(" ").ifEmpty { null }
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
                YEAR.matches(value) -> value
                YEAR_MONTH.matches(value) ->
                    YearMonth.parse(value).format(DateTimeFormatter.ofPattern("MMM yyyy", locale))
                FULL_DATE.matches(value) -> LocalDate.parse(value).format(mediumDate(locale))
                else -> {
                    val parsed = try {
                        OffsetDateTime.parse(value).toLocalDateTime()
                    } catch (_: DateTimeParseException) {
                        LocalDateTime.parse(value)
                    }
                    if (withTime) {
                        parsed.format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale))
                    } else {
                        parsed.toLocalDate().format(mediumDate(locale))
                    }
                }
            }
        } catch (_: DateTimeParseException) {
            value
        }
    }

    private fun mediumDate(locale: Locale) = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)

    /** Age in whole years on [today], or null for a partial, missing or future birth date. */
    fun ageInYears(birthDate: String?, today: LocalDate): Int? {
        if (birthDate == null || !FULL_DATE.matches(birthDate)) return null
        return try {
            val born = LocalDate.parse(birthDate)
            if (born.isAfter(today)) null else Period.between(born, today).years
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
