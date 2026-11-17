// Read a checked Bundle into a Summary (spec §3.2, §4.2): resolve the subject,
// map sections through the registry, classify each section's state as the web
// viewer's src/lib/fhir/composition.ts does, and add missing required sections.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

object SummaryReader {
    /**
     * Parse, check and read a document.
     *
     * @throws RefusedException when it is refused (M-CHECK-1, M-CHECK-2).
     */
    fun open(bytes: ByteArray, id: Long): Summary = read(IpsCheck.parse(bytes), bytes, id)

    /** Read a Bundle that has passed [IpsCheck.check]. */
    fun read(bundle: JsonObject, bytes: ByteArray, id: Long): Summary {
        val index = BundleIndex(bundle)
        val composition = bundle.list("entry").first().obj("resource")!!
        val subject = index.resolve(composition.field("subject"))?.takeIf { it.string("resourceType") == "Patient" }
        val sections = composition.list("section").filterIsInstance<JsonObject>().map { readSection(it, index) }
        val present = sections.mapNotNull { it.key }.toSet()
        val missing = SectionKey.REQUIRED.filter { it !in present }.map {
            Section(it, it.loinc, null, SectionState.MISSING, emptyList(), null)
        }
        val allergies = sections.filter { it.key == SectionKey.ALLERGIES }
        return Summary(
            id = id,
            bytes = bytes,
            patient = subject?.let(::readPatient),
            document = DocumentInfo(
                title = composition.text("title"),
                date = composition.text("date"),
                authors = composition.list("author").mapNotNull { authorName(it, index) },
            ),
            sections = sections + missing,
            allergyAlert = AllergyAlert(
                sectionMissing = allergies.isEmpty(),
                highCriticality = allergies.flatMap { section ->
                    section.highCriticalityTexts
                },
            ),
        )
    }

    private val Section.highCriticalityTexts: List<String>
        get() = entries.filterIsInstance<Entry.Resolved>().filter { entry ->
            entry.absent == null && entry.details.any { it.kind == DetailKind.CRITICALITY && it.value == "high" }
        }.mapNotNull { it.text }

    private fun readPatient(patient: JsonObject) = PatientInfo(
        name = Format.humanName(patient.list("name")),
        birthDate = patient.text("birthDate"),
        gender = patient.text("gender"),
        identifiers = patient.list("identifier").mapNotNull { identifier ->
            val value = identifier.text("value") ?: return@mapNotNull null
            val system = identifier.string("system")
            IdentifierLabel(Format.systemLabel(system), value, Format.displayOf(identifier.field("type")), identifier.text("system"))
        },
    )

    /** The name of whoever a reference names: a person, a role, an organisation, a device. */
    private fun authorName(reference: JsonElement, index: BundleIndex): String? {
        val resource = index.resolve(reference) ?: return reference.text("display")
        return nameOf(resource, index) ?: reference.text("display")
    }

    private fun nameOf(resource: JsonObject, index: BundleIndex): String? = when (resource.string("resourceType")) {
        "Practitioner", "Patient", "RelatedPerson" -> Format.humanName(resource.list("name"))
        "Organization" -> resource.text("name")
        "Device" -> resource.list("deviceName").firstNotNullOfOrNull { it.text("name") }
        "PractitionerRole" -> listOf("practitioner", "organization").firstNotNullOfOrNull { field ->
            index.resolve(resource.field(field))?.let { nameOf(it, index) } ?: resource.obj(field).text("display")
        }
        else -> null
    }

    private fun sectionCode(section: JsonElement): String {
        val codings = section.obj("code").list("coding")
        return codings.firstOrNull { it.string("system") == IpsCheck.LOINC_SYSTEM && it.string("code") != null }?.string("code")
            ?: codings.firstNotNullOfOrNull { it.string("code") }
            ?: ""
    }

    private fun readSection(section: JsonObject, index: BundleIndex): Section {
        val code = sectionCode(section)
        val key = SectionKey.byCode(code)
        val entries = mutableListOf<Entry>()
        var known = 0
        var unresolved = 0
        val absentKinds = mutableSetOf<SectionState>()
        for (reference in section.list("entry")) {
            val resource = index.resolve(reference)
            if (resource == null) {
                unresolved++
                entries += Entry.NotFound
                continue
            }
            val absent = Absent.kindOfResource(resource, index)
            if (absent != null) absentKinds += absent else known++
            entries += EntryReader.read(resource, index, absent)
        }
        val narrative = Narrative.plainText(section.obj("text").string("div"))
        // A section the IG gives no entries (Patient story, or an unknown code)
        // carries its content in the narrative.
        val narrativeIsContent = key == null || key.resourceTypes.isEmpty()
        val state = when {
            known > 0 -> SectionState.KNOWN
            SectionState.NONE_KNOWN in absentKinds -> SectionState.NONE_KNOWN
            SectionState.NOT_RECORDED in absentKinds -> SectionState.NOT_RECORDED
            section.field("emptyReason") != null -> Absent.stateFromEmptyReason(section.field("emptyReason"))!!
            unresolved > 0 -> SectionState.UNAVAILABLE
            narrative != null && narrativeIsContent -> SectionState.KNOWN
            else -> SectionState.NOT_RECORDED
        }
        return Section(key, code, section.text("title"), state, entries, narrative)
    }
}
