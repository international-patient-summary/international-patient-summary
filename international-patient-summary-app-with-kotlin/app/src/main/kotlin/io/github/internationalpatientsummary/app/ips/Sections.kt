// The section registry (spec M-READ-3; IPS 2.0.1, the web viewer's spec §2.1).
// The interface title of each section is a string resource named after its key.
package io.github.internationalpatientsummary.app.ips

enum class SectionLevel { REQUIRED, RECOMMENDED, OPTIONAL }

enum class SectionKey(
    val key: String,
    val loinc: String,
    val level: SectionLevel,
    /** Resource types the IG expects as entries; others still show generically. */
    val resourceTypes: List<String>,
    /**
     * Rank on the one-page PDF (M-PDF-1, M-PDF-2), the web viewer's
     * `pdfPriority`: lower is printed first and trimmed last.
     */
    val pdfPriority: Int,
) {
    ALLERGIES("allergies", "48765-2", SectionLevel.REQUIRED, listOf("AllergyIntolerance"), 1),
    MEDICATIONS("medications", "10160-0", SectionLevel.REQUIRED, listOf("MedicationStatement", "MedicationRequest"), 2),
    PROBLEMS("problems", "11450-4", SectionLevel.REQUIRED, listOf("Condition"), 3),
    IMMUNIZATIONS("immunizations", "11369-6", SectionLevel.RECOMMENDED, listOf("Immunization"), 4),
    RESULTS("results", "30954-2", SectionLevel.RECOMMENDED, listOf("Observation", "DiagnosticReport"), 5),
    PROCEDURES("procedures", "47519-4", SectionLevel.RECOMMENDED, listOf("Procedure"), 6),
    DEVICES("devices", "46264-8", SectionLevel.RECOMMENDED, listOf("DeviceUseStatement"), 7),
    VITAL_SIGNS("vitalSigns", "8716-3", SectionLevel.OPTIONAL, listOf("Observation"), 9),
    PAST_ILLNESS("pastIllness", "11348-0", SectionLevel.OPTIONAL, listOf("Condition"), 10),
    FUNCTIONAL("functional", "47420-5", SectionLevel.OPTIONAL, listOf("Condition", "ClinicalImpression"), 13),
    PLAN_OF_CARE("planOfCare", "18776-5", SectionLevel.OPTIONAL, listOf("CarePlan", "ImmunizationRecommendation"), 11),
    SOCIAL_HISTORY("socialHistory", "29762-2", SectionLevel.OPTIONAL, listOf("Observation"), 12),
    PREGNANCY("pregnancy", "10162-6", SectionLevel.OPTIONAL, listOf("Observation"), 14),
    ADVANCE_DIRECTIVES("advanceDirectives", "42348-3", SectionLevel.OPTIONAL, listOf("Consent"), 8),
    ALERTS("alerts", "104605-1", SectionLevel.OPTIONAL, listOf("Flag"), 0),
    PATIENT_STORY("patientStory", "81338-6", SectionLevel.OPTIONAL, emptyList(), 15),
    ;

    companion object {
        private val BY_CODE = entries.associateBy { it.loinc }

        /** The registry entry for a LOINC section code, or null for a generic section. */
        fun byCode(code: String?): SectionKey? = code?.let { BY_CODE[it] }

        /** Required sections, in registry order: allergies, medications, problems. */
        val REQUIRED: List<SectionKey> = entries.filter { it.level == SectionLevel.REQUIRED }

        /** The PDF rank of a section with another code (the web viewer's 99). */
        const val OTHER_PDF_PRIORITY = 99
    }
}
