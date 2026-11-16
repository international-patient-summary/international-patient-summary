// Resolve references within a Bundle (spec M-READ-1), as the web viewer's
// src/lib/fhir/bundle.ts does: by exact fullUrl, then by "Type/id" against
// each resource's own type and id, then against a fullUrl ending in "Type/id".
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

class BundleIndex(bundle: JsonElement) {
    private val byFullUrl = HashMap<String, JsonObject>()
    private val byTypeId = HashMap<String, JsonObject>()

    init {
        for (entry in bundle.list("entry")) {
            val resource = entry.obj("resource") ?: continue
            val fullUrl = entry.string("fullUrl")
            if (fullUrl != null) byFullUrl[fullUrl] = resource
            val type = resource.string("resourceType")
            val id = resource.string("id")
            if (type != null && id != null) byTypeId.putIfAbsent("$type/$id", resource)
            if (fullUrl != null) typeIdOf(fullUrl)?.let { byTypeId.putIfAbsent(it, resource) }
        }
    }

    /** The resource a reference names within this Bundle, or null. */
    fun resolve(reference: String?): JsonObject? {
        if (reference.isNullOrBlank()) return null
        byFullUrl[reference]?.let { return it }
        return typeIdOf(reference)?.let { byTypeId[it] }
    }

    /** The resource a Reference element names. */
    fun resolve(reference: JsonElement?): JsonObject? = resolve(reference.string("reference"))

    companion object {
        private val TYPE_ID = Regex("""(?:^|/)([A-Z][A-Za-z]+)/([A-Za-z0-9\-.]{1,64})(?:/_history/[^/]+)?$""")

        /** "Type/id" from a reference or fullUrl, or null when it has none. */
        fun typeIdOf(reference: String): String? =
            TYPE_ID.find(reference)?.let { "${it.groupValues[1]}/${it.groupValues[2]}" }
    }
}
