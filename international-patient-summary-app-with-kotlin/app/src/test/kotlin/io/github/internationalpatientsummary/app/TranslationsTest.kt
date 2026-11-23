// M-I18N-1: every language has every interface string, with the same
// placeholders as English, so no screen falls back half-way or crashes on a
// format. Lint checks plural quantities; this checks names and placeholders.
package io.github.internationalpatientsummary.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

class TranslationsTest {
    private val res = File("src/main/res")
    private val placeholder = Regex("""%(\d+\$)?[sd]""")

    /** name -> text, with each plural item as name[quantity]. */
    private fun read(file: File): Map<String, String> {
        val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
        val out = linkedMapOf<String, String>()
        val nodes = document.documentElement.childNodes
        for (i in 0 until nodes.length) {
            val e = nodes.item(i) as? Element ?: continue
            when (e.tagName) {
                "string" -> out[e.getAttribute("name")] = e.textContent
                "plurals" -> {
                    val items = e.getElementsByTagName("item")
                    for (j in 0 until items.length) {
                        val item = items.item(j) as Element
                        out["${e.getAttribute("name")}[${item.getAttribute("quantity")}]"] = item.textContent
                    }
                }
            }
        }
        return out
    }

    private val english = read(File(res, "values/strings.xml"))
    private val translations = res.listFiles { f -> f.name.startsWith("values-") && File(f, "strings.xml").exists() }!!
        .associate { it.name to read(File(it, "strings.xml")) }

    private fun placeholders(text: String) = placeholder.findAll(text).map { it.value }.sorted().toList()

    @Test fun thereAreTranslations() {
        assertTrue("expected the shared language set, found ${translations.size}", translations.size >= 60)
        assertTrue(translations.containsKey("values-cy") && translations.containsKey("values-b+zh+Hans"))
    }

    @Test fun everyLanguageHasEveryString() {
        val names = english.keys.filterNot { it.contains('[') }.toSet()
        for ((folder, strings) in translations) {
            val got = strings.keys.filterNot { it.contains('[') }.toSet()
            assertEquals("$folder: missing ${names - got}, extra ${got - names}", names, got)
        }
    }

    @Test fun everyCodeStringIsWorded() {
        // M-VIEW-7: each code_* string is reachable from ui.CODE_WORDS, and back.
        val names = english.keys.filter { it.startsWith("code_") }.toSet()
        val mapped = io.github.internationalpatientsummary.app.ui.CODE_WORDS.keys.map { "code_" + it.replace('-', '_') }.toSet()
        assertEquals(names, mapped)
    }

    @Test fun placeholdersMatchEnglish() {
        for ((folder, strings) in translations) {
            for ((name, text) in strings) {
                val source = english.getValue(name)
                assertEquals("$folder $name", placeholders(source), placeholders(text))
                assertTrue("$folder $name is empty", text.isNotBlank())
            }
        }
    }
}
