// M-PRIV-1: no network permission and no backup, in the source manifest and,
// when the build has made it, the merged one (dependencies included).
package io.github.internationalpatientsummary.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ManifestTest {
    private val source = File("src/main/AndroidManifest.xml")

    private fun merged(): List<File> =
        File("build/intermediates").walkTopDown()
            .filter { it.name == "AndroidManifest.xml" && it.path.contains("merged_manifest") && it.path.contains("debug", ignoreCase = true) }
            .toList()

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

    @Test fun theMergedManifestAsksForNoNetwork() {
        val manifests = merged()
        assertTrue("no merged manifest; the test task depends on processDebugMainManifest", manifests.isNotEmpty())
        manifests.forEach(::assertPrivate)
    }

    @Test fun theExamplesShipInTheApp() {
        val examples = File("src/main/assets/examples").list()!!.toSet()
        assertTrue(examples.containsAll(io.github.internationalpatientsummary.app.ips.Fixtures.NAMES.map { "$it.json" }))
    }
}
