// The structural IPS check (spec M-CHECK-1, M-CHECK-2). It mirrors the
// service's S-API-2 (international-patient-summary-service-with-axum
// src/ips.rs), the web viewer's checkIps, and the iOS app: change all of them
// together, in the same order, with the same codes and pointers.
package io.github.internationalpatientsummary.app.ips

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import java.io.InputStream

/** Why a document was refused: a stable code and a JSON pointer, never its content. */
enum class Refusal(val code: String, val pointer: String) {
    TOO_LARGE("too_large", "#"),
    NOT_JSON("not_json", "#"),
    NOT_A_BUNDLE("not_a_bundle", "#/resourceType"),
    NOT_A_DOCUMENT("not_a_document", "#/type"),
    NO_COMPOSITION("no_composition", "#/entry/0/resource/resourceType"),
    NOT_A_PATIENT_SUMMARY("not_a_patient_summary", "#/entry/0/resource/type"),
    NO_SUBJECT("no_subject", "#/entry/0/resource/subject/reference"),
}

/** A refusal as an exception, for callers that read and check in one go. */
class RefusedException(val refusal: Refusal) : Exception(refusal.code)

object IpsCheck {
    /** 10 MiB: the service's and the web viewer's limit (M-CHECK-2). */
    const val MAX_BYTES: Int = 10 * 1024 * 1024

    /** The LOINC code of the Composition type "Patient summary Document". */
    const val IPS_LOINC_CODE = "60591-5"
    const val LOINC_SYSTEM = "http://loinc.org"

    /** The UTF-8 byte-order mark some editors write at the start of a file. */
    private val UTF8_BOM = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())

    /** The first structural refusal that applies, in S-API-2 order, or null when it passes. */
    fun check(bundle: JsonElement): Refusal? {
        if (bundle !is JsonObject || bundle.string("resourceType") != "Bundle") return Refusal.NOT_A_BUNDLE
        if (bundle.string("type") != "document") return Refusal.NOT_A_DOCUMENT
        val composition = bundle.list("entry").firstOrNull().obj("resource")
        if (composition == null || composition.string("resourceType") != "Composition") {
            return Refusal.NO_COMPOSITION
        }
        val isIps = composition.obj("type").list("coding").any {
            it.string("system") == LOINC_SYSTEM && it.string("code") == IPS_LOINC_CODE
        }
        if (!isIps) return Refusal.NOT_A_PATIENT_SUMMARY
        val reference = composition.obj("subject").string("reference")
        if (reference.isNullOrBlank()) return Refusal.NO_SUBJECT
        return null
    }

    /**
     * Parse and check a document's bytes. Size is checked before parsing.
     *
     * @throws RefusedException with the first refusal that applies.
     */
    fun parse(bytes: ByteArray): JsonObject {
        if (bytes.size > MAX_BYTES) throw RefusedException(Refusal.TOO_LARGE)
        val element = try {
            val start = if (bytes.size >= 3 && bytes.copyOfRange(0, 3).contentEquals(UTF8_BOM)) 3 else 0
            Json.parseToJsonElement(String(bytes, start, bytes.size - start, Charsets.UTF_8))
        } catch (_: SerializationException) {
            throw RefusedException(Refusal.NOT_JSON)
        } catch (_: IllegalArgumentException) {
            throw RefusedException(Refusal.NOT_JSON)
        }
        check(element)?.let { throw RefusedException(it) }
        return element as JsonObject
    }

    /**
     * Read at most [MAX_BYTES] from a stream, so an oversized file is refused
     * without being held in memory.
     *
     * @throws RefusedException with [Refusal.TOO_LARGE] when the stream holds more.
     */
    fun readCapped(input: InputStream): ByteArray {
        // InputStream.readNBytes needs API 33; minSdk is 29.
        val out = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val remaining = MAX_BYTES - out.size()
            val read = input.read(buffer, 0, minOf(buffer.size, remaining + 1))
            if (read < 0) break
            if (read > remaining) throw RefusedException(Refusal.TOO_LARGE)
            out.write(buffer, 0, read)
        }
        return out.toByteArray()
    }
}
