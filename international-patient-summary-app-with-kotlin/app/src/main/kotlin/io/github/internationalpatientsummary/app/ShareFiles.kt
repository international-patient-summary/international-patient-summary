// The one place a summary leaves memory: a temporary file for the system share
// sheet, written only on a Share tap (spec M-SHARE-1) and deleted when sharing
// ends or on the next launch (M-PRIV-1).
package io.github.internationalpatientsummary.app

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

object ShareFiles {
    /** Never the patient's name or identifiers in a file name. */
    const val FILE_NAME = "international-patient-summary.json"
    const val MIME_TYPE = "application/fhir+json"

    private fun directory(context: Context) = File(context.cacheDir, "share")

    /** Write [bytes] for sharing and answer the chooser intent that offers them. */
    fun intent(context: Context, bytes: ByteArray, chooserTitle: CharSequence): Intent {
        val directory = directory(context).apply { mkdirs() }
        val file = File(directory, FILE_NAME)
        file.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.share", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = MIME_TYPE
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(send, chooserTitle).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    /** Delete every share file. */
    fun clear(context: Context) {
        directory(context).deleteRecursively()
    }
}
