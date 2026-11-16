// A section's narrative as plain text (spec M-VIEW-6). No web view renders
// it, so nothing in it runs or loads: markup is removed, entities decoded.
package io.github.internationalpatientsummary.app.ips

object Narrative {
    private val DROPPED = Regex("""<(script|style)\b[^>]*>.*?</\1\s*>""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
    private val COMMENT = Regex("""<!--.*?-->""", RegexOption.DOT_MATCHES_ALL)
    private val LINE_BREAK = Regex("""<br\s*/?>|</(p|div|tr|li|h[1-6]|table|thead|tbody|tfoot|ul|ol|dl|dt|dd|caption|blockquote|pre)\s*>""", RegexOption.IGNORE_CASE)
    private val CELL_END = Regex("""</t[dh]\s*>""", RegexOption.IGNORE_CASE)
    private val TAG = Regex("""<[^>]*>""")
    private val ENTITY = Regex("""&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);""")
    private val SPACES = Regex("""[ \t \r]+""")
    private const val CELL = "\u0000"

    private val NAMED = mapOf("amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ")

    /** The text of an XHTML narrative, one line per block, cells joined by " | ". */
    fun plainText(xhtml: String?): String? {
        if (xhtml.isNullOrBlank()) return null
        val stripped = xhtml
            .replace(DROPPED, "")
            .replace(COMMENT, "")
            .replace(LINE_BREAK, "\n")
            .replace(CELL_END, CELL)
            .replace(TAG, "")
            .replace(ENTITY) { decode(it.groupValues[1]) ?: it.value }
        val lines = stripped.split("\n").map { line ->
            line.split(CELL).map { it.replace(SPACES, " ").trim() }.filter { it.isNotEmpty() }.joinToString(" | ")
        }.filter { it.isNotEmpty() }
        return lines.joinToString("\n").ifEmpty { null }
    }

    private fun decode(name: String): String? = when {
        name.startsWith("#x") || name.startsWith("#X") -> name.drop(2).toIntOrNull(16)?.let(::codePoint)
        name.startsWith("#") -> name.drop(1).toIntOrNull()?.let(::codePoint)
        else -> NAMED[name]
    }

    private fun codePoint(value: Int): String? =
        if (Character.isValidCodePoint(value) && value != 0) String(Character.toChars(value)) else null
}
