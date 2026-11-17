// The one way a document file is read, for Import file (M-LOAD-1), a drop
// (M-TAB-3) and a file from another app (M-LOAD-4): refused by its size before
// it is read when over 10 MB (M-CHECK-2), then read with a cap. The bytes go
// only to the check; nothing is copied anywhere.
package io.github.internationalpatientsummary.app

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import io.github.internationalpatientsummary.app.ips.IpsCheck
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.RefusedException
import java.io.IOException
import java.io.InputStream

object DocumentFiles {
    /** Read a `content:` URI the app may read (a picked, dropped or sent file). */
    fun read(resolver: ContentResolver, uri: Uri): ByteArray {
        val size = resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else null
        }
        return readSized(size) { resolver.openInputStream(uri) }
    }

    /**
     * Refuse a file whose stated [size] is over the limit without opening it;
     * otherwise read at most the limit from the stream [open] gives.
     *
     * @throws RefusedException `too_large`, before or while reading
     * @throws IOException when there is no stream
     */
    fun readSized(size: Long?, open: () -> InputStream?): ByteArray {
        if (size != null && size > IpsCheck.MAX_BYTES) throw RefusedException(Refusal.TOO_LARGE)
        val input = open() ?: throw IOException("no stream")
        return input.use { IpsCheck.readCapped(it) }
    }
}
