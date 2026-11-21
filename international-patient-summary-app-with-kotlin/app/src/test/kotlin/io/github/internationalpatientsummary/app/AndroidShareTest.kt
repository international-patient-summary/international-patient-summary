// ShareFiles and DocumentFiles against a real (Robolectric) Context: the chooser
// intent (M-SHARE-1), the share directory (M-PRIV-1) and a content: URI read (M-LOAD-4).
package io.github.internationalpatientsummary.app

import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.test.core.app.ApplicationProvider
import io.github.internationalpatientsummary.app.ips.Fixtures
import io.github.internationalpatientsummary.app.ips.IpsCheck
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.RefusedException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class AndroidShareTest {
    private val context: Application get() = ApplicationProvider.getApplicationContext()

    @Before fun freshFileProvider() = resetFileProviderCache()

    @Test fun theChooserOffersTheExactBytesAndLeavesNoCopyAfterRemove() {
        val bytes = Fixtures.bytes("bundle-minimal")
        val prepared = ShareFiles.intent(context, bytes, "Share")
        assertEquals(Intent.ACTION_CHOOSER, prepared.intent.action)
        val send = prepared.intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)!!
        assertEquals(ShareFiles.MIME_TYPE, send.type)
        val shared = File(context.cacheDir, "share")
        assertTrue(shared.walkTopDown().any { it.isFile && it.readBytes().contentEquals(bytes) })
        prepared.remove()
        assertFalse(shared.walkTopDown().any { it.isFile })
        ShareFiles.clear(context)
        assertFalse(shared.exists())
    }

    /** A `content:` provider whose stated size and body the test sets. */
    class Provider : ContentProvider() {
        override fun onCreate() = true
        override fun query(u: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?): Cursor? =
            if (statedSize == NO_CURSOR) null
            else MatrixCursor(arrayOf(OpenableColumns.SIZE)).apply { addRow(arrayOf(statedSize.takeIf { it >= 0 })) }
        override fun getType(uri: Uri): String? = null
        override fun insert(uri: Uri, values: ContentValues?): Uri? = null
        override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?) = 0
        override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?) = 0
        override fun openFile(uri: Uri, mode: String) = ParcelFileDescriptor.open(
            File.createTempFile("body", ".bin").apply { writeBytes(body); deleteOnExit() },
            ParcelFileDescriptor.MODE_READ_ONLY,
        )

        companion object {
            const val NO_CURSOR = -2L
            var statedSize = -1L
            var body = ByteArray(0)
        }
    }

    private fun read(size: Long, bytes: ByteArray): ByteArray {
        Provider.statedSize = size
        Provider.body = bytes
        Robolectric.setupContentProvider(Provider::class.java, AUTHORITY)
        return DocumentFiles.read(context.contentResolver, Uri.parse("content://$AUTHORITY/x"))
    }

    @Test fun aContentUriIsReadWhole() {
        val bytes = Fixtures.bytes("bundle-minimal")
        assertArrayEquals(bytes, read(bytes.size.toLong(), bytes))
    }

    @Test fun aProviderThatStatesNoSizeIsReadAndStillCheckedWhileRead() {
        val bytes = Fixtures.bytes("bundle-minimal")
        assertArrayEquals(bytes, read(-1, bytes))
        assertArrayEquals(bytes, read(Provider.NO_CURSOR, bytes))
    }

    @Test fun aStatedSizeOverTheLimitIsRefusedBeforeReading() {
        val error = assertThrows(RefusedException::class.java) { read(IpsCheck.MAX_BYTES + 1L, ByteArray(0)) }
        assertEquals(Refusal.TOO_LARGE, error.refusal)
    }

    private companion object {
        const val AUTHORITY = "test.docs"
    }
}
