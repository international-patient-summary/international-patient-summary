// M-TAB-3: what may be dropped onto the list. Anything accepted still goes
// through the one IPS check, so this only keeps out what cannot be a document.
package io.github.internationalpatientsummary.app

object Drops {
    private val TYPES = setOf("application/json", "application/fhir+json", "application/octet-stream")

    /** Typed as JSON, FHIR JSON, an untyped file, or text. (One item only: checked on drop.) */
    fun accepts(mimeTypes: List<String>): Boolean =
        mimeTypes.any { it.lowercase() in TYPES || it.lowercase().startsWith("text/") }
}
