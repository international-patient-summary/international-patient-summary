// The one place a summary leaves memory: a temporary file for the system share
// sheet, written only on a Share tap (spec M-SHARE-1, M-PDF-3) and deleted
// when sharing ends or on the next launch (M-PRIV-1). The file is the exact
// bytes (FHIR JSON) or the one-page PDF for people.
package io.github.internationalpatientsummary.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import io.github.internationalpatientsummary.app.ips.PdfFile
import io.github.internationalpatientsummary.app.ips.Summary
import java.io.File

/** What Share sends (M-SHARE-1). */
enum class ShareFormat { FILE, PDF }

object ShareFiles {
    /** Never the patient's name or identifiers in a file name. */
    const val FILE_NAME = "international-patient-summary.json"
    const val MIME_TYPE = "application/fhir+json"

    private fun directory(context: Context) = File(context.cacheDir, "share")

    /** Write [bytes] for sharing and answer the chooser intent that offers them. */
    fun intent(context: Context, bytes: ByteArray, chooserTitle: CharSequence): Intent =
        chooser(context, FILE_NAME, MIME_TYPE, bytes, chooserTitle)

    /**
     * Make the one-page PDF (M-PDF-1) in [context]'s language, write it for
     * sharing, and answer the chooser intent. Slow: call off the main thread.
     */
    fun pdfIntent(context: Context, summary: Summary, chooserTitle: CharSequence): Intent {
        val pdf = OnePagePdf(context, summary).make()
        return chooser(context, pdf.fileName, PdfFile.MIME_TYPE, pdf.bytes, chooserTitle)
    }

    private fun chooser(context: Context, name: String, type: String, bytes: ByteArray, chooserTitle: CharSequence): Intent {
        val directory = directory(context).apply { mkdirs() }
        val file = File(directory, name)
        file.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.share", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            this.type = type
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        // The app accepts JSON itself (M-LOAD-4); sharing to itself would only open a copy.
        val self = arrayOf(ComponentName(context, MainActivity::class.java))
        return Intent.createChooser(send, chooserTitle)
            .putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, self)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    /** Delete every share file. */
    fun clear(context: Context) {
        directory(context).deleteRecursively()
    }
}
