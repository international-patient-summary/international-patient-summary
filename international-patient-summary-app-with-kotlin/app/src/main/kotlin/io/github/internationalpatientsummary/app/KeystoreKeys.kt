// The encrypted store's key (spec M-STORE-2): AES-256 for GCM, made in the
// Android Keystore, so it cannot be exported and never leaves the device.
// The Keystore chooses every nonce (randomized encryption is required).
package io.github.internationalpatientsummary.app

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class KeystoreKeys(private val alias: String = ALIAS) : KeyProvider {
    private var cached: SecretKey? = null

    private fun keyStore(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

    @Synchronized
    override fun key(): SecretKey = cached ?: find().also { cached = it }

    private fun find(): SecretKey {
        (keyStore().getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    @Synchronized
    override fun delete() {
        cached = null
        val store = keyStore()
        if (store.containsAlias(alias)) store.deleteEntry(alias)
    }

    companion object {
        private const val PROVIDER = "AndroidKeyStore"
        const val ALIAS = "ips-store"
    }
}
