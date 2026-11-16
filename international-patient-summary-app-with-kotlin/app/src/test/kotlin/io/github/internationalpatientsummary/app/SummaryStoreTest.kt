// M-LIST-1 newest first; M-PRIV-3 clear all.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.Fixtures
import io.github.internationalpatientsummary.app.ips.SummaryReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SummaryStoreTest {
    @Test fun newestFirstAndClearAll() {
        val store = SummaryStore()
        val first = SummaryReader.open(Fixtures.bytes("bundle-minimal"), store.newId())
        val second = SummaryReader.open(Fixtures.bytes("bundle-ips-all-sections"), store.newId())
        store.add(first)
        store.add(second)
        assertEquals(listOf(second.id, first.id), store.all().map { it.id })
        store.remove(second.id)
        assertNull(store.get(second.id))
        store.clear()
        assertTrue(store.all().isEmpty())
    }
}
