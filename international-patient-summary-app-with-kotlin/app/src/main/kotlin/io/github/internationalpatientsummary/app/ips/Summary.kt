// What the app shows of a checked document (spec §3.2, §4.2). Built once, on
// opening, by SummaryReader; the screens only lay it out.
package io.github.internationalpatientsummary.app.ips

/** An open summary: the exact bytes it was opened from, and what they say. */
class Summary(
    /** In-memory id, unique for this run of the app; never written anywhere. */
    val id: Long,
    /** The exact bytes it was opened from, for Share (M-SHARE-1). */
    val bytes: ByteArray,
    /** The subject, or null when the Composition's subject does not resolve (M-READ-2). */
    val patient: PatientInfo?,
    val document: DocumentInfo,
    val sections: List<Section>,
    val allergyAlert: AllergyAlert,
) {
    /** What the list shows first (M-LIST-1): the patient's name, else the document title. */
    val listTitle: String? get() = patient?.name ?: document.title
}

data class PatientInfo(
    val name: String?,
    /** As written: "1972-05-01", or a partial date. */
    val birthDate: String?,
    /** The FHIR code: male, female, other, unknown (or whatever the document says). */
    val gender: String?,
    val identifiers: List<IdentifierLabel>,
)

data class IdentifierLabel(val system: String, val value: String, val type: String?)

data class DocumentInfo(val title: String?, val date: String?, val authors: List<String>)

/** The banner alert (M-VIEW-1): high-criticality allergies, or the allergies section is missing. */
data class AllergyAlert(val sectionMissing: Boolean, val highCriticality: List<String>) {
    val isEmpty: Boolean get() = !sectionMissing && highCriticality.isEmpty()
}

data class Section(
    /** The registry entry, or null for a section with another code ("generic"). */
    val key: SectionKey?,
    val code: String,
    /** The document's own title for the section. */
    val documentTitle: String?,
    val state: SectionState,
    val entries: List<Entry>,
    /** The narrative as plain text (M-VIEW-6). */
    val narrative: String?,
)

/** One row of a section (M-VIEW-4). */
sealed interface Entry {
    data class Resolved(
        val resourceType: String,
        /** The concept in words, or null when the resource has none. */
        val text: String?,
        val details: List<Detail>,
        /** Set when the resource itself states an absence ("No known allergy"). */
        val absent: SectionState?,
    ) : Entry

    /** A reference that does not resolve in this Bundle (M-READ-1). */
    data object NotFound : Entry
}

enum class DetailKind { STATUS, CRITICALITY, REACTIONS, DOSAGE, DATE, VALUE, INTERPRETATION }

/** A detail line. DATE values are FHIR dates, written by the screen in its locale. */
data class Detail(val kind: DetailKind, val value: String)
