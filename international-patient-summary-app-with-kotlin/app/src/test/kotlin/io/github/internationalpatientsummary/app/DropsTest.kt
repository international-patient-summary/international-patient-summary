// M-TAB-3: what may be dropped onto the list; the IPS check does the rest.
package io.github.internationalpatientsummary.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DropsTest {
    @Test fun jsonFilesAndTextAreWelcome() {
        assertTrue(Drops.accepts(listOf("application/json")))
        assertTrue(Drops.accepts(listOf("application/fhir+json")))
        assertTrue(Drops.accepts(listOf("Application/JSON")))
        assertTrue(Drops.accepts(listOf("application/octet-stream")))
        assertTrue(Drops.accepts(listOf("text/plain")))
        assertTrue(Drops.accepts(listOf("image/png", "text/plain")))
    }

    @Test fun picturesAndOtherDocumentsAreNot() {
        assertFalse(Drops.accepts(listOf("image/png")))
        assertFalse(Drops.accepts(listOf("application/pdf")))
        assertFalse(Drops.accepts(emptyList()))
    }
}
