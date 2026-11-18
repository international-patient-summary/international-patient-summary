// M-CHECK-2 for Import file, drops and M-LOAD-4: a file over 10 MB is refused
// before it is read, by its stated size or while it is read.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.IpsCheck
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.RefusedException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.fail
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream

class DocumentFilesTest {
    @Test fun aStatedSizeOverTheLimitIsRefusedWithoutOpening() {
        val error = assertThrows(RefusedException::class.java) {
            DocumentFiles.readSized(IpsCheck.MAX_BYTES + 1L) { fail("opened"); null }
        }
        assertEquals(Refusal.TOO_LARGE, error.refusal)
    }

    @Test fun aStreamOverTheLimitIsRefusedWhileRead() {
        // No stated size (a provider may not give one); the stream is endless.
        var consumed = 0
        val endless = object : InputStream() {
            override fun read(): Int {
                consumed++
                return 0
            }
        }
        val error = assertThrows(RefusedException::class.java) { DocumentFiles.readSized(null) { endless } }
        assertEquals(Refusal.TOO_LARGE, error.refusal)
        assertEquals(IpsCheck.MAX_BYTES + 1, consumed)
    }

    @Test fun aFileAtTheLimitIsReadWhole() {
        val bytes = ByteArray(IpsCheck.MAX_BYTES) { ' '.code.toByte() }
        assertArrayEquals(bytes, DocumentFiles.readSized(bytes.size.toLong()) { ByteArrayInputStream(bytes) })
    }

    @Test fun noStreamIsUnreadable() {
        assertThrows(IOException::class.java) { DocumentFiles.readSized(10) { null } }
    }
}
