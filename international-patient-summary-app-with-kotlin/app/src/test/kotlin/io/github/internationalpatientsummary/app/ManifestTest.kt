// M-PRIV-1, M-STORE-2: no network permission and no backup or device
// transfer, in the source manifest and, when the build has made it, the merged
// one (dependencies included). M-LOAD-4: the app is offered for JSON files
// only, and runs as one activity.
package io.github.internationalpatientsummary.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

class ManifestTest {
    private val source = File("src/main/AndroidManifest.xml")

    private fun manifests(): Sequence<File> =
        File("build/intermediates").walkTopDown()
            .filter { it.name == "AndroidManifest.xml" && it.path.contains("merged_manifest") && it.path.contains("debug", ignoreCase = true) }

    /** The app's merged manifests; the instrumented test APK's (debugAndroidTest) is a separate package. */
    private fun merged(): List<File> = manifests().filterNot { it.path.contains("AndroidTest") }.toList()

    /** The smoke test APK's merged manifest (P1-T13), once connectedDebugAndroidTest has built it. */
    private fun testApk(): List<File> = manifests().filter { it.path.contains("AndroidTest") }.toList()

    private fun assertPrivate(file: File) {
        val text = file.readText()
        assertFalse("${file.path} asks for INTERNET", text.contains("android.permission.INTERNET"))
        assertFalse("${file.path} asks for network state", text.contains("android.permission.ACCESS_NETWORK_STATE"))
        assertTrue("${file.path} allows backup", text.contains("android:allowBackup=\"false\""))
    }

    @Test fun theSourceManifestAsksForNoNetworkAndNoBackup() {
        assertTrue(source.exists())
        assertPrivate(source)
        assertTrue(source.readText().contains("android:dataExtractionRules"))
        assertTrue(source.readText().contains("android:fullBackupContent"))
    }

    @Test fun theBackupRulesExcludeEveryDomain() {
        val domains = listOf("root", "file", "database", "sharedpref", "external")
        val extraction = File("src/main/res/xml/data_extraction_rules.xml").readText()
        listOf("cloud-backup", "device-transfer").forEach { part ->
            val body = extraction.substringAfter("<$part>").substringBefore("</$part>")
            assertFalse("$part includes something", body.contains("<include"))
            domains.forEach { assertTrue("$part keeps $it", body.contains("<exclude domain=\"$it\"")) }
        }
        val full = File("src/main/res/xml/backup_rules.xml").readText()
        assertFalse(full.contains("<include"))
        domains.forEach { assertTrue("full backup keeps $it", full.contains("<exclude domain=\"$it\" path=\".\"")) }
    }

    @Test fun theMergedManifestAsksForNoNetwork() {
        val manifests = merged()
        assertTrue("no merged manifest; the test task depends on processDebugMainManifest", manifests.isNotEmpty())
        manifests.forEach(::assertPrivate)
    }

    @Test fun theTestApkAsksForNoNetworkEither() {
        testApk().forEach { file ->
            val text = file.readText()
            assertFalse("${file.path} asks for INTERNET", text.contains("android.permission.INTERNET"))
            assertFalse("${file.path} asks for network state", text.contains("android.permission.ACCESS_NETWORK_STATE"))
        }
    }

    private val android = "http://schemas.android.com/apk/res/android"

    private fun Element.children(name: String): List<Element> {
        val nodes = getElementsByTagName(name)
        return (0 until nodes.length).map { nodes.item(it) as Element }
    }

    /** Each intent filter of the activity as its actions, categories and MIME types. */
    private data class Filter(val actions: Set<String>, val categories: Set<String>, val types: List<String>)

    private fun filters(file: File, activity: String): List<Filter> {
        val factory = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
        val root = factory.newDocumentBuilder().parse(file).documentElement
        val element = root.children("activity").single { it.getAttributeNS(android, "name").endsWith(activity) }
        return element.children("intent-filter").map { filter ->
            Filter(
                filter.children("action").map { it.getAttributeNS(android, "name") }.toSet(),
                filter.children("category").map { it.getAttributeNS(android, "name") }.toSet(),
                filter.children("data").map { it.getAttributeNS(android, "mimeType") },
            )
        }
    }

    private fun assertOpensJsonOnly(file: File) {
        val filters = filters(file, ".MainActivity")
        val default = setOf("android.intent.category.DEFAULT")
        assertEquals(
            "${file.path}: the launcher, then Open with and Share for exactly the JSON types",
            listOf(
                Filter(setOf("android.intent.action.MAIN"), setOf("android.intent.category.LAUNCHER"), emptyList()),
                Filter(setOf(Incoming.ACTION_VIEW), default, Incoming.TYPES),
                Filter(setOf(Incoming.ACTION_SEND), default, Incoming.TYPES),
            ),
            filters,
        )
        assertEquals(listOf("application/json", "application/fhir+json"), Incoming.TYPES)
        // Nothing else in the app (or a library) is offered for a type: no text/plain, no */*.
        val everyType = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
            .newDocumentBuilder().parse(file).documentElement.children("data")
            .map { it.getAttributeNS(android, "mimeType") }.filter { it.isNotEmpty() }
        assertEquals(file.path, Incoming.TYPES + Incoming.TYPES, everyType)
    }

    @Test fun theAppOpensJsonFilesFromOtherAppsOnly() {
        assertOpensJsonOnly(source)
        merged().forEach(::assertOpensJsonOnly)
    }

    @Test fun oneActivityHoldsTheStore() {
        // A second activity from another app's task would load and write the same store.
        assertTrue(source.readText().contains("android:launchMode=\"singleTask\""))
        merged().forEach { assertTrue(it.path, it.readText().contains("android:launchMode=\"singleTask\"")) }
    }

    @Test fun theExamplesShipInTheApp() {
        val examples = File("src/main/assets/examples").list()!!.toSet()
        assertTrue(examples.containsAll(io.github.internationalpatientsummary.app.ips.Fixtures.NAMES.map { "$it.json" }))
    }
}
