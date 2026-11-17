// The encrypted store (spec M-STORE-1..4): every open summary's exact bytes,
// and an index of their order, ids and relationships, each in its own file,
// each encrypted with AES-256-GCM under one key. Plain Kotlin, java.* and
// javax.crypto only, so it runs in JVM tests with a plain AES key; the app
// gives it a key in the Android Keystore (KeystoreKeys.kt).
//
// Layout, under dir (the app uses noBackupFilesDir/store/):
//   index.bin            the index, JSON before encryption
//   summaries/<id>.bin   one summary's exact bytes
// Each file is: one format byte (1), the 12-byte nonce the cipher chose, then
// the ciphertext and its 16-byte tag. The additional authenticated data names
// the file's role ("index", or "summary/<id>"), so files cannot be swapped.
// Every write goes to a temporary file first and is then renamed over the old.
// Nothing here logs.
package io.github.internationalpatientsummary.app

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The store's one key. */
interface KeyProvider {
    /** The key, made when there is none. */
    fun key(): SecretKey

    /** Delete the key; the next [key] makes a new one. */
    fun delete()
}

/** What the index holds: summaries newest first, each with its person's relationship, and the next id. */
data class StoreIndex(val nextId: Long, val entries: List<Entry>) {
    data class Entry(val id: Long, val relationship: Relationship)

    companion object {
        val EMPTY = StoreIndex(1, emptyList())
    }
}

/** What a load found: the summaries that opened, in index order, and the index they came from. */
class Loaded<T>(val index: StoreIndex, val items: List<T>)

class EncryptedStore(private val dir: File, private val keys: KeyProvider) {
    private val summaries = File(dir, "summaries")
    private val indexFile = File(dir, "index.bin")

    /**
     * Read the store (M-STORE-1, M-STORE-3). [open] turns a summary's id and
     * bytes into a summary, checking it again; it returns null, or throws, to
     * refuse it. A summary that cannot be decrypted or is refused is left out
     * and its file deleted, and the index is rewritten without it. When the
     * key cannot be had, or the index cannot be decrypted or read (a missing
     * or replaced key, or a damaged index), the whole store and the key are
     * deleted and the result is empty. Never throws.
     */
    fun <T : Any> load(open: (Long, ByteArray) -> T?): Loaded<T> {
        File(dir, "index.tmp").delete()
        summaries.listFiles { file -> file.name.endsWith(".tmp") }?.forEach { it.delete() }
        if (!indexFile.exists()) {
            // Nothing saved, or only summary files whose index never got written.
            summaries.deleteRecursively()
            return Loaded(StoreIndex.EMPTY, emptyList())
        }
        val index = try {
            parseIndex(decrypt(keys.key(), indexFile.readBytes(), INDEX_AAD))
        } catch (_: GeneralSecurityException) {
            null
        } catch (_: IOException) {
            null
        } catch (_: RuntimeException) {
            // A Keystore failure, or JSON that is not an index.
            null
        }
        if (index == null) {
            wipe()
            return Loaded(StoreIndex.EMPTY, emptyList())
        }
        val kept = ArrayList<StoreIndex.Entry>()
        val items = ArrayList<T>()
        for (entry in index.entries) {
            val item = try {
                read(entry.id)?.let { open(entry.id, it) }
            } catch (_: Exception) {
                null
            }
            if (item == null) {
                fileOf(entry.id).delete()
            } else {
                kept.add(entry)
                items.add(item)
            }
        }
        // Files the index does not list (a write that stopped half way) go too.
        val listed = kept.map { fileOf(it.id).name }.toSet()
        summaries.listFiles()?.filter { it.name !in listed }?.forEach { it.delete() }
        val result = index.copy(entries = kept)
        // If this write fails, the next load drops the same entries again.
        if (kept.size != index.entries.size) runCatching { saveIndex(result) }
        return Loaded(result, items)
    }

    /**
     * Save a change (M-STORE-1, M-STORE-4): write the new summaries' files,
     * delete the removed ones', then write the index. Throws when it cannot
     * write; what was written before still loads.
     */
    fun save(index: StoreIndex, added: Map<Long, ByteArray> = emptyMap(), removed: Collection<Long> = emptyList()) {
        if (added.isNotEmpty()) {
            val key = keys.key()
            summaries.mkdirs()
            added.forEach { (id, bytes) -> write(fileOf(id), encrypt(key, bytes, summaryAad(id))) }
        }
        removed.forEach { fileOf(it).delete() }
        saveIndex(index)
    }

    /** Delete every file and the key (M-PRIV-3, M-STORE-4); the next save makes a new key. */
    fun clear() = wipe()

    private fun wipe() {
        dir.deleteRecursively()
        // Already gone, or the Keystore cannot be reached: the files are gone either way.
        runCatching { keys.delete() }
    }

    private fun saveIndex(index: StoreIndex) {
        dir.mkdirs()
        write(indexFile, encrypt(keys.key(), indexJson(index).toByteArray(Charsets.UTF_8), INDEX_AAD))
    }

    private fun read(id: Long): ByteArray? {
        val file = fileOf(id)
        if (!file.exists()) return null
        return try {
            decrypt(keys.key(), file.readBytes(), summaryAad(id))
        } catch (_: GeneralSecurityException) {
            null
        } catch (_: IOException) {
            null
        }
    }

    private fun fileOf(id: Long) = File(summaries, "$id.bin")

    private fun write(file: File, bytes: ByteArray) {
        val temporary = File(file.parentFile, file.nameWithoutExtension + ".tmp")
        FileOutputStream(temporary).use { out ->
            out.write(bytes)
            out.fd.sync()
        }
        Files.move(temporary.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }

    companion object {
        private const val FORMAT: Byte = 1
        private const val NONCE_BYTES = 12
        private const val TAG_BITS = 128
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private val INDEX_AAD = "ips-store/1/index".toByteArray(Charsets.UTF_8)

        private fun summaryAad(id: Long) = "ips-store/1/summary/$id".toByteArray(Charsets.UTF_8)

        /** Encrypt with a nonce the cipher chooses, fresh each time (the Keystore key requires it). */
        internal fun encrypt(key: SecretKey, plain: ByteArray, aad: ByteArray): ByteArray {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            cipher.updateAAD(aad)
            val sealed = cipher.doFinal(plain)
            val nonce = cipher.iv
            if (nonce.size != NONCE_BYTES) throw GeneralSecurityException("nonce")
            return byteArrayOf(FORMAT) + nonce + sealed
        }

        internal fun decrypt(key: SecretKey, file: ByteArray, aad: ByteArray): ByteArray {
            if (file.size < 1 + NONCE_BYTES + TAG_BITS / 8 || file[0] != FORMAT) throw GeneralSecurityException("format")
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, file, 1, NONCE_BYTES))
            cipher.updateAAD(aad)
            return cipher.doFinal(file, 1 + NONCE_BYTES, file.size - 1 - NONCE_BYTES)
        }

        internal fun indexJson(index: StoreIndex): String = JsonObject(
            mapOf(
                "version" to JsonPrimitive(1),
                "nextId" to JsonPrimitive(index.nextId),
                "summaries" to JsonArray(
                    index.entries.map {
                        JsonObject(mapOf("id" to JsonPrimitive(it.id), "relationship" to JsonPrimitive(it.relationship.name)))
                    },
                ),
            ),
        ).toString()

        /** Throws (a serialization or argument exception) when it is not an index. */
        internal fun parseIndex(bytes: ByteArray): StoreIndex {
            val root = Json.parseToJsonElement(String(bytes, Charsets.UTF_8)).jsonObject
            require(root["version"]?.jsonPrimitive?.long == 1L)
            val entries = root.getValue("summaries").jsonArray.map { element ->
                val entry = element.jsonObject
                val name = entry["relationship"]?.jsonPrimitive?.content
                StoreIndex.Entry(
                    entry.getValue("id").jsonPrimitive.long,
                    Relationship.entries.firstOrNull { it.name == name } ?: Relationship.NONE,
                )
            }
            require(entries.map { it.id }.toSet().size == entries.size)
            val nextId = maxOf(root.getValue("nextId").jsonPrimitive.long, (entries.maxOfOrNull { it.id } ?: 0) + 1)
            return StoreIndex(nextId, entries)
        }
    }
}
