// KeystoreKeys against the Keystore Robolectric provides (M-STORE-2), and the
// theme's four colour paths: dynamic or fixed, light or dark (M-TAB-*, accessibility).
package io.github.internationalpatientsummary.app

import android.security.keystore.KeyGenParameterSpec
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.InputStream
import java.io.OutputStream
import java.security.Key
import java.security.KeyStoreSpi
import java.security.Provider
import java.security.SecureRandom
import java.security.Security
import java.security.cert.Certificate
import java.security.spec.AlgorithmParameterSpec
import java.util.Collections
import java.util.Date
import java.util.Enumeration
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.KeyGeneratorSpi
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

/** An in-memory stand-in for the "AndroidKeyStore" provider, which the JVM does not have. */
private class FakeAndroidKeyStore : Provider("AndroidKeyStore", 1.0, "test") {
    init {
        put("KeyStore.AndroidKeyStore", FakeKeyStoreSpi::class.java.name)
        put("KeyGenerator.AES", FakeKeyGeneratorSpi::class.java.name)
    }
}

class FakeKeyStoreSpi : KeyStoreSpi() {
    override fun engineGetKey(alias: String, password: CharArray?): Key? = entries[alias]
    override fun engineGetCertificateChain(alias: String): Array<Certificate>? = null
    override fun engineGetCertificate(alias: String): Certificate? = null
    override fun engineGetCreationDate(alias: String): Date? = null
    override fun engineSetKeyEntry(alias: String, key: Key, password: CharArray?, chain: Array<Certificate>?) {
        entries[alias] = key
    }
    override fun engineSetKeyEntry(alias: String, key: ByteArray?, chain: Array<Certificate>?) = Unit
    override fun engineSetCertificateEntry(alias: String, cert: Certificate?) = Unit
    override fun engineDeleteEntry(alias: String) {
        entries.remove(alias)
    }
    override fun engineAliases(): Enumeration<String> = Collections.enumeration(entries.keys)
    override fun engineContainsAlias(alias: String) = entries.containsKey(alias)
    override fun engineSize() = entries.size
    override fun engineIsKeyEntry(alias: String) = entries.containsKey(alias)
    override fun engineIsCertificateEntry(alias: String) = false
    override fun engineGetCertificateAlias(cert: Certificate?): String? = null
    override fun engineStore(stream: OutputStream?, password: CharArray?) = Unit
    override fun engineLoad(stream: InputStream?, password: CharArray?) = Unit

    companion object {
        val entries = ConcurrentHashMap<String, Key>()
    }
}

class FakeKeyGeneratorSpi : KeyGeneratorSpi() {
    private var alias = ""
    override fun engineInit(random: SecureRandom?) = error("a spec is required")
    override fun engineInit(params: AlgorithmParameterSpec, random: SecureRandom?) {
        alias = (params as KeyGenParameterSpec).keystoreAlias
    }
    override fun engineInit(keysize: Int, random: SecureRandom?) = error("a spec is required")
    override fun engineGenerateKey(): SecretKey = SecretKeySpec(ByteArray(32).also { SecureRandom().nextBytes(it) }, "AES")
        .also { FakeKeyStoreSpi.entries[alias] = it }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class KeystoreKeysTest {
    @Before fun install() {
        Security.removeProvider("AndroidKeyStore")
        Security.addProvider(FakeAndroidKeyStore())
        FakeKeyStoreSpi.entries.clear()
    }

    @After fun remove() {
        Security.removeProvider("AndroidKeyStore")
    }

    @Test fun theKeyIsMadeOnceKeptAndReplacedAfterDelete() {
        val keys = KeystoreKeys("test-alias")
        val first = keys.key()
        assertEquals("AES", first.algorithm)
        assertSame("cached", first, keys.key())
        // A second provider finds the key the first made.
        assertArrayEquals(first.encoded, KeystoreKeys("test-alias").key().encoded)
        keys.delete()
        keys.delete()
        assertNotEquals(first, KeystoreKeys("test-alias").key())
    }
}

abstract class ThemedLaunch {
    @get:Rule val compose = createEmptyComposeRule()

    fun launches() {
        val context = ApplicationProvider.getApplicationContext<android.app.Application>()
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithText(context.getString(R.string.empty_title)).assertExists()
        }
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "night")
class DynamicDarkThemeTest : ThemedLaunch() {
    @Test fun launches_() = launches()
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class FixedLightThemeTest : ThemedLaunch() {
    @Test fun launches_() = launches()
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], qualifiers = "night")
class FixedDarkThemeTest : ThemedLaunch() {
    @Test fun launches_() = launches()
}
