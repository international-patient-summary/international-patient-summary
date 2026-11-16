// One section entry as a row (spec M-VIEW-4): the concept in words, then the
// detail lines that are present. Values are shown as written.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

object EntryReader {
    fun read(resource: JsonObject, index: BundleIndex, absent: SectionState?): Entry.Resolved {
        val type = resource.string("resourceType") ?: ""
        val details = buildList {
            status(resource).takeIf { it.isNotEmpty() }?.let { add(Detail(DetailKind.STATUS, it.joinToString(", "), it)) }
            if (type == "AllergyIntolerance") {
                resource.text("criticality")?.let { add(Detail(DetailKind.CRITICALITY, it)) }
                val reactions = resource.list("reaction").flatMap { it.list("manifestation") }.mapNotNull { Format.displayOf(it) }
                if (reactions.isNotEmpty()) add(Detail(DetailKind.REACTIONS, reactions.distinct().joinToString(", ")))
            }
            dosage(resource, type)?.let { add(Detail(DetailKind.DOSAGE, it)) }
            date(resource)?.let { add(Detail(DetailKind.DATE, it)) }
            value(resource)?.let { add(Detail(DetailKind.VALUE, it)) }
            val interpretation = resource.list("interpretation").firstNotNullOfOrNull { Format.displayOf(it) }
            interpretation?.let { add(Detail(DetailKind.INTERPRETATION, it)) }
        }
        return Entry.Resolved(type, concept(resource, type, index), details, absent)
    }

    /** The entry's concept in words (M-VIEW-4, M-VIEW-7). */
    fun concept(resource: JsonObject, type: String, index: BundleIndex): String? = when (type) {
        "MedicationStatement", "MedicationRequest" ->
            Format.displayOf(resource.field("medicationCodeableConcept"))
                ?: index.resolve(resource.field("medicationReference"))?.let { Format.displayOf(it.field("code")) }
                ?: resource.obj("medicationReference").text("display")
        "Immunization" -> Format.displayOf(resource.field("vaccineCode"))
        "DeviceUseStatement" ->
            index.resolve(resource.field("device"))?.let { Format.displayOf(it.field("type")) }
                ?: resource.obj("device").text("display")
        "Device" -> Format.displayOf(resource.field("type"))
        else -> Format.displayOf(resource.field("code"))
            ?: resource.list("category").firstNotNullOfOrNull { Format.displayOf(it) }
    }

    /** Clinical then verification status codes, else the resource's own status code. */
    private fun status(resource: JsonElement): List<String> {
        val coded = listOfNotNull(
            Format.statusCode(resource.field("clinicalStatus")),
            Format.statusCode(resource.field("verificationStatus")),
        )
        return coded.ifEmpty { listOfNotNull(resource.text("status")) }
    }

    private fun dosage(resource: JsonElement, type: String): String? {
        val field = when (type) {
            "MedicationStatement" -> "dosage"
            "MedicationRequest" -> "dosageInstruction"
            else -> return null
        }
        return resource.list(field).mapNotNull { it.text("text") }.joinToString("; ").ifEmpty { null }
    }

    private fun date(resource: JsonElement): String? =
        listOf("onsetDateTime", "effectiveDateTime", "occurrenceDateTime", "performedDateTime")
            .firstNotNullOfOrNull { resource.text(it) }
            ?: listOf("onsetPeriod", "effectivePeriod", "performedPeriod")
                .firstNotNullOfOrNull { resource.obj(it).text("start") }
            ?: listOf("onsetString", "occurrenceString", "performedString").firstNotNullOfOrNull { resource.text(it) }

    private fun value(resource: JsonElement): String? =
        Format.quantity(resource.field("valueQuantity"))
            ?: resource.text("valueString")
            ?: Format.displayOf(resource.field("valueCodeableConcept"))
            ?: resource.number("valueInteger")
            ?: resource.boolean("valueBoolean")?.toString()
}
