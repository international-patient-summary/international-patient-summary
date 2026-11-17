// Which open summaries are about the same person (spec M-PEOPLE-1). For
// display only: no document is merged or changed.
package io.github.internationalpatientsummary.app.ips

import java.text.Normalizer
import java.util.Locale

object People {
    /**
     * The summaries grouped by person, each group in the order given. Given
     * newest first, the groups come in the order of their newest summary
     * (M-PEOPLE-2).
     *
     * Two summaries are the same person when their patients share an
     * identifier (the same system and value), or both have a name and a birth
     * date and these are the same ([nameKey]). The link is transitive.
     */
    fun group(summaries: List<Summary>): List<List<Summary>> {
        val parent = IntArray(summaries.size) { it }
        fun find(i: Int): Int {
            var root = i
            while (parent[root] != root) root = parent[root]
            var at = i
            while (parent[at] != root) at = parent[at].also { parent[at] = root }
            return root
        }
        fun union(a: Int, b: Int) {
            val ra = find(a)
            val rb = find(b)
            // The earlier one stays the root, so the order is kept.
            if (ra != rb) parent[maxOf(ra, rb)] = minOf(ra, rb)
        }
        val firstWithKey = HashMap<String, Int>()
        summaries.forEachIndexed { index, summary ->
            keys(summary.patient).forEach { key ->
                val earlier = firstWithKey.putIfAbsent(key, index)
                if (earlier != null) union(earlier, index)
            }
        }
        val groups = LinkedHashMap<Int, MutableList<Summary>>()
        summaries.forEachIndexed { index, summary -> groups.getOrPut(find(index)) { ArrayList() }.add(summary) }
        return groups.values.toList()
    }

    /**
     * A name compared ignoring case, accents and spacing: decomposed (NFD),
     * combining marks dropped, runs of white space made one space, lower case.
     */
    fun nameKey(name: String): String =
        Normalizer.normalize(name, Normalizer.Form.NFD)
            .replace(COMBINING, "")
            .replace(SPACES, " ")
            .trim()
            .lowercase(Locale.ROOT)

    /** What links a patient to others; none for a summary whose patient does not resolve. */
    private fun keys(patient: PatientInfo?): Set<String> {
        if (patient == null) return emptySet()
        val keys = HashSet<String>()
        patient.identifiers.forEach { identifier ->
            // An identifier without a system names nothing in particular.
            val system = identifier.systemUri ?: return@forEach
            keys.add("id\u0000$system\u0000${identifier.value.trim()}")
        }
        val name = patient.name?.let(::nameKey)?.takeIf { it.isNotEmpty() }
        val born = patient.birthDate?.trim()?.takeIf { it.isNotEmpty() }
        if (name != null && born != null) keys.add("nb\u0000$name\u0000$born")
        return keys
    }

    private val COMBINING = Regex("\\p{M}+")
    private val SPACES = Regex("\\s+")
}
