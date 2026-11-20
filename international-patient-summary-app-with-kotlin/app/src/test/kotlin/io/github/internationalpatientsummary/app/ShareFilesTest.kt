// M-PRIV-1, M-SHARE-1, M-PDF-3: every export has an isolated lifetime.
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.Fixtures
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class ShareFilesTest {
    private val temporary = Files.createTempDirectory("share-files-test").toFile()
    private val root = File(temporary, "share")

    @After fun cleanUp() {
        temporary.deleteRecursively()
    }

    @Test fun twoPatientsSharingTheSameNameKeepTheirOwnExactBytes() {
        val martha = Fixtures.bytes("bundle-minimal")
        val patricia = Fixtures.bytes("bundle-ips-all-sections")
        val first = ShareFiles.write(root, ShareFiles.FILE_NAME, martha, "first")
        val second = ShareFiles.write(root, ShareFiles.FILE_NAME, patricia, "second")

        assertNotEquals(first.path, second.path)
        assertArrayEquals(martha, first.readBytes())
        assertArrayEquals(patricia, second.readBytes())
    }

    @Test fun cancellationRemovesOnlyThatShareWhileADelayedRecipientCanStillReadAnother() {
        val delayed = ShareFiles.write(root, ShareFiles.FILE_NAME, Fixtures.bytes("bundle-minimal"), "delayed")
        val cancelled = ShareFiles.write(root, ShareFiles.FILE_NAME, Fixtures.bytes("bundle-ips-all-sections"), "cancelled")

        ShareFiles.remove(cancelled)

        assertFalse(cancelled.exists())
        assertTrue(delayed.exists())
        assertArrayEquals(Fixtures.bytes("bundle-minimal"), delayed.readBytes())
        ShareFiles.remove(delayed)
        assertFalse(root.exists() && root.walkTopDown().any { it.isFile })
    }

    @Test fun theNextLaunchRemovesEveryAbandonedShare() {
        ShareFiles.write(root, ShareFiles.FILE_NAME, byteArrayOf(1), "one")
        ShareFiles.write(root, "summary.pdf", byteArrayOf(2), "two")

        ShareFiles.clear(root)

        assertFalse(root.exists())
    }
}
