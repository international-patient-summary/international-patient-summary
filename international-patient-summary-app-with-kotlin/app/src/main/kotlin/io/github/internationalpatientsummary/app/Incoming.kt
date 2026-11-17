// M-LOAD-4: a document sent from another app ("Open with" or Share from
// Files, Gmail, a browser). Which part of the intent holds it is decided here,
// from plain values, so a JVM test can check it; MainActivity reads the intent
// and opens what this answers exactly as Import file does (M-LOAD-1).
package io.github.internationalpatientsummary.app

object Incoming {
    /**
     * The only types the manifest's ACTION_VIEW and ACTION_SEND filters name
     * (`ManifestTest` keeps them the same). Not `text/plain` or
     * `application/octet-stream`: those would offer the app for every shared
     * link, note and unknown file. Such a file still opens with Import file.
     */
    val TYPES: List<String> = listOf("application/json", "application/fhir+json")

    // Intent.ACTION_VIEW, Intent.ACTION_SEND, Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY.
    const val ACTION_VIEW = "android.intent.action.VIEW"
    const val ACTION_SEND = "android.intent.action.SEND"
    const val FLAG_LAUNCHED_FROM_HISTORY = 0x00100000

    /** Where the incoming document is. */
    sealed interface Source {
        /** A `content:` URI, read under the intent's grant. */
        data class Content(val uri: String) : Source

        /** Text shared as the document itself (ACTION_SEND with EXTRA_TEXT only). */
        data class Text(val text: String) : Source

        /** A VIEW or SEND that holds nothing the app can read: the "could not be read" alert. */
        data object Unreadable : Source
    }

    /**
     * The document an intent carries, or null when it carries none to open:
     * any other action (the launcher's MAIN), or an intent the system hands back
     * again when the app is reopened from Recents (already opened once).
     *
     * @param data the intent's data URI (ACTION_VIEW)
     * @param stream EXTRA_STREAM (ACTION_SEND), preferred to [text]
     * @param text EXTRA_TEXT (ACTION_SEND)
     */
    fun source(action: String?, flags: Int, data: String?, stream: String?, text: CharSequence?): Source? {
        if (flags and FLAG_LAUNCHED_FROM_HISTORY != 0) return null
        return when (action) {
            ACTION_VIEW -> content(data)
            ACTION_SEND -> when {
                stream != null -> content(stream)
                !text.isNullOrEmpty() -> Source.Text(text.toString())
                else -> Source.Unreadable
            }
            else -> null
        }
    }

    /** Only `content:` URIs; a `file:` URI is not the app's to read (no storage permission). */
    private fun content(uri: String?): Source =
        if (uri != null && uri.startsWith("content:", ignoreCase = true)) Source.Content(uri) else Source.Unreadable
}
