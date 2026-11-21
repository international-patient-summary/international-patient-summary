// M-LOAD-4 (a document sent from another app), M-TAB-2 (keyboard shortcuts),
// and the lifecycle that covers the screen (M-PRIV-*), on the JVM.
package io.github.internationalpatientsummary.app

import android.content.Intent
import android.os.Looper
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import io.github.internationalpatientsummary.app.ips.Fixtures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h4000dp-xxhdpi")
class MainActivityTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val context get() = ApplicationProvider.getApplicationContext<android.app.Application>()

    @Before fun freshFileProvider() = resetFileProviderCache()

    private fun text(id: Int, vararg args: Any): String = context.getString(id, *args)

    private fun waitFor(matcher: SemanticsMatcher, count: Int) {
        val end = System.nanoTime() + 10_000_000_000L
        while (true) {
            shadowOf(Looper.getMainLooper()).idle()
            compose.waitForIdle()
            if (compose.onAllNodes(matcher).fetchSemanticsNodes().size == count) return
            check(System.nanoTime() < end) { "timed out waiting for $count of $matcher" }
            Thread.sleep(20)
        }
    }

    private fun sent(vararg extras: Pair<String, CharSequence>) = Intent(context, MainActivity::class.java)
        .setAction(Intent.ACTION_SEND).setType("application/json")
        .apply { extras.forEach { (key, value) -> putExtra(key, value) } }

    private fun ctrl(code: Int) = KeyEvent(0, 0, KeyEvent.ACTION_DOWN, code, 0, KeyEvent.META_CTRL_ON)

    @Test fun sharedTextOpensAndALaterOneOpensToo() {
        val json = String(Fixtures.bytes("bundle-minimal"))
        ActivityScenario.launch<MainActivity>(sent(Intent.EXTRA_TEXT to json)).use { scenario ->
            waitFor(isSelectable(), 0)
            // singleTask delivers a document sent while the app runs to onNewIntent (protected).
            val later = sent(Intent.EXTRA_TEXT to String(Fixtures.bytes("bundle-ips-all-sections")))
            scenario.onActivity {
                MainActivity::class.java.getDeclaredMethod("onNewIntent", Intent::class.java)
                    .apply { isAccessible = true }.invoke(it, later)
            }
            scenario.moveToState(Lifecycle.State.STARTED)
            scenario.moveToState(Lifecycle.State.RESUMED)
            waitFor(hasText(text(R.string.patient_heading)), 1)
        }
    }

    @Test fun aSendWithNothingToReadIsReported() {
        ActivityScenario.launch<MainActivity>(sent()).use {
            waitFor(hasText(text(R.string.problem_unreadable)), 1)
        }
    }

    @Test fun keyboardShortcutsRunTheButtonsActions() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                assertTrue(activity.onKeyShortcut(KeyEvent.KEYCODE_V, ctrl(KeyEvent.KEYCODE_V)))
                assertTrue(activity.onKeyShortcut(KeyEvent.KEYCODE_O, ctrl(KeyEvent.KEYCODE_O)))
                // Nothing is open, so Delete does nothing and the key goes on.
                assertFalse(activity.onKeyShortcut(KeyEvent.KEYCODE_DEL, ctrl(KeyEvent.KEYCODE_DEL)))
                // Not a shortcut of the app's.
                assertFalse(activity.onKeyShortcut(KeyEvent.KEYCODE_Q, ctrl(KeyEvent.KEYCODE_Q)))
                assertTrue(activity.onKeyShortcut(KeyEvent.KEYCODE_E, ctrl(KeyEvent.KEYCODE_E)))
                val groups = mutableListOf<KeyboardShortcutGroup>()
                activity.onProvideKeyboardShortcuts(groups, null, 0)
                assertEquals(4, groups.sumOf { it.items.size })
            }
            waitFor(isSelectable(), 5)
        }
    }
}
