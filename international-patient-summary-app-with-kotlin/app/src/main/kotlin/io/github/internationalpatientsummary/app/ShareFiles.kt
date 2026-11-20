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
import java.util.UUID

/** What Share sends (M-SHARE-1). */
enum class ShareFormat { FILE, PDF }

object ShareFiles {
    /** Never the patient's name or identifiers in a file name. */
    const val FILE_NAME = "international-patient-summary.json"
    const val MIME_TYPE = "application/fhir+json"

    private fun directory(context: Context) = File(context.cacheDir, "share")

    /** One share owns one directory; finishing it never removes another share. */
    class Prepared internal constructor(val intent: Intent, private val directory: File) {
        fun remove() {
            removeDirectory(directory)
        }
    }

    /** The pure file operation used by JVM tests and by [chooser]. */
    internal fun write(root: File, name: String, bytes: ByteArray, id: String = UUID.randomUUID().toString()): File {
        val directory = File(root, id).apply { mkdirs() }
        return File(directory, name).also { it.writeBytes(bytes) }
    }

    internal fun remove(file: File) = removeDirectory(file.parentFile!!)

    private fun removeDirectory(directory: File) {
        directory.deleteRecursively()
    }

    /** Write [bytes] for sharing and answer the chooser intent that offers them. */
    fun intent(context: Context, bytes: ByteArray, chooserTitle: CharSequence): Prepared =
        chooser(context, FILE_NAME, MIME_TYPE, bytes, chooserTitle)

    /**
     * Make the one-page PDF (M-PDF-1) in [context]'s language, write it for
     * sharing, and answer the chooser intent. Slow: call off the main thread.
     */
    fun pdfIntent(context: Context, summary: Summary, chooserTitle: CharSequence): Prepared {
        val pdf = OnePagePdf(context, summary).make()
        return chooser(context, pdf.fileName, PdfFile.MIME_TYPE, pdf.bytes, chooserTitle)
    }

    private fun chooser(context: Context, name: String, type: String, bytes: ByteArray, chooserTitle: CharSequence): Prepared {
        val file = write(directory(context), name, bytes)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.share", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            this.type = type
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        // The app accepts JSON itself (M-LOAD-4); sharing to itself would only open a copy.
        val self = arrayOf(ComponentName(context, MainActivity::class.java))
        val chooser = Intent.createChooser(send, chooserTitle)
            .putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, self)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return Prepared(chooser, file.parentFile!!)
    }

    /** Delete every share file. */
    fun clear(context: Context) {
        clear(directory(context))
    }


    internal fun clear(root: File) {
        root.deleteRecursively()
    }
}
