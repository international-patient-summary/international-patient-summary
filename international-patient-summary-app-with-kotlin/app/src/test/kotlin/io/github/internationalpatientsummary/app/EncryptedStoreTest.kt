// M-STORE-1..4: the encrypted store, with a plain AES-256 key in place of the
// Android Keystore's (the same cipher, AES/GCM/NoPadding, with the nonce the
// cipher chooses).
package io.github.internationalpatientsummary.app

import io.github.internationalpatientsummary.app.ips.Fixtures
import io.github.internationalpatientsummary.app.ips.Summary
import io.github.internationalpatientsummary.app.ips.SummaryReader
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class EncryptedStoreTest {
    private class TestKeys : KeyProvider {
        var current: SecretKey? = null
        var deletes = 0

        override fun key(): SecretKey = current ?: KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().also { current = it }

        override fun delete() {
            deletes++
            current = null
        }
    }

    private val root: File = Files.createTempDirectory("store-test").toFile()
    private val dir = File(root, "store")
    private val keys = TestKeys()

    @After fun cleanUp() {
        root.deleteRecursively()
    }

    private fun newStore(provider: KeyProvider = keys) = EncryptedStore(dir, provider)

    private fun load(store: EncryptedStore = newStore()): Loaded<Summary> = store.load { id, bytes -> SummaryReader.open(bytes, id) }

    /** Open fixtures into a SummaryStore and save them as the app does. */
    private fun saved(vararg names: String): SummaryStore {
        val memory = SummaryStore()
        val store = newStore()
        names.forEach { name ->
            val summary = SummaryReader.open(Fixtures.bytes(name), memory.newId())
            memory.add(summary)
            store.save(memory.index(), mapOf(summary.id to summary.bytes))
        }
        return memory
    }

    private fun summaryFiles() = File(dir, "summaries").listFiles().orEmpty().map { it.name }.toSet()

    @Test fun aRoundTripKeepsOrderIdsRelationshipsAndBytes() {
        val memory = saved("IPS-examples-Bundle-01", "bundle-ips-all-sections", "bundle-minimal")
        val martha = memory.all().first { it.bytes.contentEquals(Fixtures.bytes("IPS-examples-Bundle-01")) }
        val other = memory.all().first { it.bytes.contentEquals(Fixtures.bytes("bundle-ips-all-sections")) }
        memory.setRelationship(martha.id, Relationship.PARENT)
        memory.setRelationship(other.id, Relationship.SELF)
        newStore().save(memory.index())

        val loaded = load()
        assertEquals(memory.all().map { it.id }, loaded.items.map { it.id })
        memory.all().zip(loaded.items).forEach { (before, after) -> assertArrayEquals(before.bytes, after.bytes) }
        assertEquals(memory.index(), loaded.index)

        val again = SummaryStore()
        again.restore(loaded.index, loaded.items)
        assertEquals(memory.people().map { p -> p.summaries.map { it.id } to p.relationship }, again.people().map { p -> p.summaries.map { it.id } to p.relationship })
        // Ids stay unique after a launch.
        assertTrue(again.newId() > memory.all().maxOf { it.id })
    }

    @Test fun nothingSavedLoadsEmpty() {
        val loaded = load()
        assertTrue(loaded.items.isEmpty())
        assertEquals(StoreIndex.EMPTY, loaded.index)
    }

    @Test fun theFilesHoldNoPlaintext() {
        saved("bundle-minimal", "IPS-examples-Bundle-01").setRelationship(1, Relationship.PARENT)
        val files = dir.walkTopDown().filter { it.isFile }.toList()
        assertTrue(files.size >= 3)
        files.forEach { file ->
            val text = String(file.readBytes(), Charsets.ISO_8859_1)
            listOf("DeLarosa", "resourceType", "Bundle", "relationship", "PARENT", "summaries").forEach {
                assertFalse("${file.name} holds $it", text.contains(it))
            }
        }
        assertEquals(setOf("1.bin", "2.bin"), summaryFiles())
    }

    @Test fun eachWriteHasAFreshNonce() {
        val key = keys.key()
        val plain = Fixtures.bytes("bundle-minimal")
        val aad = "a".toByteArray()
        val one = EncryptedStore.encrypt(key, plain, aad)
        val two = EncryptedStore.encrypt(key, plain, aad)
        assertNotEquals(one.copyOfRange(1, 13).toList(), two.copyOfRange(1, 13).toList())
        assertNotEquals(one.toList(), two.toList())
        assertArrayEquals(plain, EncryptedStore.decrypt(key, one, aad))
        assertArrayEquals(plain, EncryptedStore.decrypt(key, two, aad))
    }

    @Test fun aTamperedSummaryIsDroppedAndDeleted() {
        saved("bundle-minimal", "bundle-ips-all-sections", "IPS-examples-Bundle-01")
        val file = File(dir, "summaries/2.bin")
        val bytes = file.readBytes()
        bytes[bytes.size - 5] = (bytes[bytes.size - 5].toInt() xor 1).toByte()
        file.writeBytes(bytes)

        val loaded = load()
        assertEquals(listOf(3L, 1L), loaded.items.map { it.id })
        assertFalse(file.exists())
        // The index was rewritten without it.
        assertEquals(listOf(3L, 1L), load().index.entries.map { it.id })
    }

    @Test fun aSwappedSummaryFileIsDropped() {
        saved("bundle-minimal", "bundle-ips-all-sections")
        // The additional data names the file, so one summary's file cannot stand for another's.
        File(dir, "summaries/1.bin").copyTo(File(dir, "summaries/2.bin"), overwrite = true)
        assertEquals(listOf(1L), load().items.map { it.id })
    }

    @Test fun aSummaryThatNoLongerPassesTheCheckIsDropped() {
        saved("bundle-minimal", "bundle-ips-all-sections")
        val loaded = newStore().load { id, bytes -> if (id == 2L) null else SummaryReader.open(bytes, id) }
        assertEquals(listOf(1L), loaded.items.map { it.id })
        assertEquals(setOf("1.bin"), summaryFiles())
        // A check that throws is a refusal too.
        val again = newStore().load<Summary> { _, _ -> throw IllegalStateException() }
        assertTrue(again.items.isEmpty())
        assertTrue(summaryFiles().isEmpty())
    }

    @Test fun aCorruptIndexStartsEmptyWithoutACrash() {
        saved("bundle-minimal", "bundle-ips-all-sections")
        File(dir, "index.bin").writeBytes(byteArrayOf(1, 2, 3))
        val loaded = load()
        assertTrue(loaded.items.isEmpty())
        assertFalse(dir.exists())
        assertEquals(1, keys.deletes)
    }

    @Test fun anIndexThatIsNotAnIndexStartsEmpty() {
        saved("bundle-minimal")
        val file = File(dir, "index.bin")
        file.writeBytes(EncryptedStore.encrypt(keys.key(), "{\"version\":2}".toByteArray(), "ips-store/1/index".toByteArray()))
        assertTrue(load().items.isEmpty())
        assertFalse(dir.exists())
    }

    @Test fun aWrongKeyDeletesTheStore() {
        saved("bundle-minimal", "bundle-ips-all-sections")
        keys.current = null // As after a restore to another device: a different key.
        val loaded = load()
        assertTrue(loaded.items.isEmpty())
        assertFalse(dir.exists())
        assertEquals(1, keys.deletes)
        // And it works again afterwards.
        saved("bundle-minimal")
        assertEquals(1, load().items.size)
    }

    @Test fun aMissingKeyDeletesTheStore() {
        saved("bundle-minimal")
        val broken = object : KeyProvider {
            override fun key(): SecretKey = throw java.security.InvalidKeyException("gone")
            override fun delete() = keys.delete()
        }
        assertTrue(load(newStore(broken)).items.isEmpty())
        assertFalse(dir.exists())
        assertEquals(1, keys.deletes)
    }

    @Test fun deleteForgetAndClearRemoveFiles() {
        val memory = saved("IPS-examples-Bundle-01", "bundle-ips-all-sections", "bundle-minimal", "bundle-no-info-required-sections")
        val store = newStore()

        // Delete (M-LIST-2).
        memory.remove(2)
        store.save(memory.index(), removed = listOf(2L))
        assertFalse(File(dir, "summaries/2.bin").exists())
        assertEquals(memory.all().map { it.id }, load().items.map { it.id })

        // Forget this person (M-PEOPLE-4): IPS-examples-Bundle-01 and bundle-minimal are Martha.
        val martha = memory.personOf(1)!!.summaries.map { it.id }
        assertEquals(setOf(1L, 3L), martha.toSet())
        memory.forgetPerson(1)
        store.save(memory.index(), removed = martha)
        assertEquals(setOf("4.bin"), summaryFiles())
        assertEquals(listOf(4L), load().items.map { it.id })

        // Clear all (M-PRIV-3) deletes every file and the key.
        val key = keys.current
        store.clear()
        assertFalse(dir.exists())
        assertEquals(1, keys.deletes)
        assertTrue(load().items.isEmpty())
        saved("bundle-minimal")
        assertNotEquals(key, keys.current)
    }

    @Test fun leftoversFromAStoppedWriteAreRemoved() {
        saved("bundle-minimal")
        File(dir, "summaries/9.bin").writeBytes(byteArrayOf(1, 2))
        File(dir, "summaries/1.tmp").writeBytes(byteArrayOf(1, 2))
        File(dir, "index.tmp").writeBytes(byteArrayOf(1, 2))
        assertEquals(listOf(1L), load().items.map { it.id })
        assertEquals(setOf("1.bin"), summaryFiles())
        assertFalse(File(dir, "index.tmp").exists())
    }
}
