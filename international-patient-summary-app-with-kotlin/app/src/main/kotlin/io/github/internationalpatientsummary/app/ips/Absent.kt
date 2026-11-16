// Absent and unknown data (spec M-VIEW-5), the web viewer's src/lib/fhir/absent.ts:
//
//   emptyReason nilknown                      -> NONE_KNOWN
//   emptyReason notasked, notstarted          -> NOT_RECORDED
//   emptyReason unavailable, withheld, closed -> UNAVAILABLE (and any other code)
//   IPS absent/unknown "no-known-..."         -> NONE_KNOWN
//   IPS absent/unknown "no-...-info"          -> NOT_RECORDED
//   SNOMED CT "no known ..." concepts         -> NONE_KNOWN
//
// Words are never chosen here; the interface says each state from its strings.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.JsonElement

/** The state of a section, in the four words of M-VIEW-5 plus "known". */
enum class SectionState { KNOWN, NONE_KNOWN, NOT_RECORDED, UNAVAILABLE, MISSING }

object Absent {
    const val ABSENT_UNKNOWN_SYSTEM = "http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips"
    const val SNOMED = "http://snomed.info/sct"

    /** SNOMED CT concepts that state an explicit negation ("none known"). */
    private val SNOMED_NONE_KNOWN = setOf(
        "716186003", // No known allergy
        "409137002", // No known history of drug allergy
        "428607008", // No known environmental allergy
        "429625007", // No known food allergy
        "428197003", // No known insect allergy
        "160245001", // No current problems or disability
    )

    /** The state an emptyReason names; an unknown code reads as UNAVAILABLE. */
    fun stateFromEmptyReason(reason: JsonElement?): SectionState? {
        if (reason == null) return null
        return when (reason.list("coding").firstNotNullOfOrNull { it.string("code") }) {
            "nilknown" -> SectionState.NONE_KNOWN
            "notasked", "notstarted" -> SectionState.NOT_RECORDED
            else -> SectionState.UNAVAILABLE
        }
    }

    /** What an IPS absent/unknown or SNOMED CT negation code states, if anything. */
    fun kindOfConcept(concept: JsonElement?): SectionState? {
        for (coding in concept.list("coding")) {
            val system = coding.string("system")
            val code = coding.string("code") ?: continue
            if (system == ABSENT_UNKNOWN_SYSTEM) {
                if (code.startsWith("no-known-")) return SectionState.NONE_KNOWN
                if (code.endsWith("-info")) return SectionState.NOT_RECORDED
            }
            if (system == SNOMED && code in SNOMED_NONE_KNOWN) return SectionState.NONE_KNOWN
        }
        return null
    }

    /**
     * Whether a resource is an explicit statement of absence, such as an
     * AllergyIntolerance coded "no-known-allergies". Device use statements
     * carry the code on the referenced Device, so the index is passed in.
     */
    fun kindOfResource(resource: JsonElement, index: BundleIndex): SectionState? {
        return when (resource.string("resourceType")) {
            "DeviceUseStatement" -> {
                val device = index.resolve(resource.field("device"))
                if (device?.string("resourceType") == "Device") kindOfConcept(device.field("type")) else null
            }
            "MedicationStatement", "MedicationRequest" -> {
                val medication = resource.field("medicationReference")?.let { index.resolve(it) }
                if (medication?.string("resourceType") == "Medication") {
                    kindOfConcept(medication.field("code"))
                } else {
                    kindOfConcept(resource.field("medicationCodeableConcept"))
                }
            }
            "AllergyIntolerance", "Condition", "Procedure" -> kindOfConcept(resource.field("code"))
            "Immunization" -> kindOfConcept(resource.field("vaccineCode"))
            "Device" -> kindOfConcept(resource.field("type"))
            else -> null
        }
    }
}
