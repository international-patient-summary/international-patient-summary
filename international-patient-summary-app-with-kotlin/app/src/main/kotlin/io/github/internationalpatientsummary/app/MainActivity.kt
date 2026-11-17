// The one activity. It keeps patient data out of the app switcher (M-PRIV-2),
// removes leftover share files (M-PRIV-1), and hands the share sheet the
// exact bytes of a summary or its one-page PDF (M-SHARE-1, M-PDF-3). It
// also opens a document sent from another app (M-LOAD-4), at launch and
// while running.
package io.github.internationalpatientsummary.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.KeyboardShortcutGroup
import android.view.KeyboardShortcutInfo
import android.view.Menu
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.IntentCompat
import androidx.core.net.toUri
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import io.github.internationalpatientsummary.app.ips.Summary
import io.github.internationalpatientsummary.app.ui.App
import io.github.internationalpatientsummary.app.ui.LocalPopupFocus
import io.github.internationalpatientsummary.app.ui.PopupFocus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class MainActivity : ComponentActivity() {
    private val viewModel: AppViewModel by viewModels {
        viewModelFactory {
            // The encrypted store (M-STORE-2): out of backups, under a Keystore key.
            initializer { AppViewModel(EncryptedStore(File(application.noBackupFilesDir, "store"), KeystoreKeys())) }
        }
    }

    /**
     * Covers the window while paused (M-PRIV-2). On Android 13 and later
     * setRecentsScreenshotEnabled(false) also stops the saved thumbnail, but the
     * switcher still shows the live window as it opens, so the cover is drawn on
     * every version. The Pixel launcher keeps the app live (resumed) in the
     * switcher, so losing window focus also covers it (both seen on an API 33
     * emulator, 2026-11-16).
     *
     * The app's own menus and dialogs take window focus too, so while one of
     * them has it the window is not covered (M-PEOPLE-3's menu sat on the cover,
     * API 37 emulator, 2026-11-16); in the switcher the menu loses focus as well,
     * and the cover returns.
     */
    private val paused = mutableStateOf(false)
    private val focused = mutableStateOf(true)
    private val popups = PopupFocus()

    private val share = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        ShareFiles.clear(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) ShareFiles.clear(this)
        // Only a fresh start: a recreated activity (rotation, a fold) has the same
        // intent again, and its document is already open (M-LOAD-4).
        if (savedInstanceState == null) openIncoming(intent)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(false)
        enableEdgeToEdge()
        setContent {
            val covered = paused.value || (!focused.value && !popups.anyFocused)
            CompositionLocalProvider(LocalPopupFocus provides popups) {
                App(viewModel = viewModel, covered = covered, onShare = ::shareSummary)
            }
        }
    }

    /** launchMode singleTask: a document sent while the app runs comes here (M-LOAD-4). */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openIncoming(intent)
    }

    /**
     * M-LOAD-4: open a JSON file from "Open with" or Share exactly as Import
     * file does: the same size-first read, the same check, the same alert, and
     * saved by the store only once it opens. The URI is read under the intent's
     * grant, which lasts while this activity does (rotation included); the view
     * model reads it once the saved summaries have loaded. No copy is made.
     */
    private fun openIncoming(intent: Intent) {
        val stream = if (intent.action == Intent.ACTION_SEND) {
            IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.toString()
        } else {
            null
        }
        val text = if (intent.action == Intent.ACTION_SEND) intent.getCharSequenceExtra(Intent.EXTRA_TEXT) else null
        val source = Incoming.source(intent.action, intent.flags, intent.data?.toString(), stream, text) ?: return
        val resolver = applicationContext.contentResolver
        when (source) {
            is Incoming.Source.Content -> {
                val uri = source.uri.toUri()
                viewModel.open { DocumentFiles.read(resolver, uri) }
            }
            is Incoming.Source.Text -> viewModel.open { source.text.toByteArray(Charsets.UTF_8) }
            Incoming.Source.Unreadable -> viewModel.report(Problem.Unreadable)
        }
    }

    override fun onPause() {
        super.onPause()
        paused.value = true
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        focused.value = hasFocus
    }

    override fun onResume() {
        super.onResume()
        paused.value = false
        focused.value = true
    }

    // M-TAB-2: Ctrl shortcuts from a hardware keyboard.
    override fun onKeyShortcut(keyCode: Int, event: KeyEvent): Boolean {
        val shortcut = Shortcuts.of(keyCode, event.isCtrlPressed) ?: return super.onKeyShortcut(keyCode, event)
        return viewModel.shortcut(shortcut) || super.onKeyShortcut(keyCode, event)
    }

    /** Listed in the system's keyboard shortcuts helper (Meta+/). */
    override fun onProvideKeyboardShortcuts(data: MutableList<KeyboardShortcutGroup>, menu: Menu?, deviceId: Int) {
        super.onProvideKeyboardShortcuts(data, menu, deviceId)
        val ctrl = KeyEvent.META_CTRL_ON
        data.add(
            KeyboardShortcutGroup(
                getString(R.string.app_name),
                listOf(
                    KeyboardShortcutInfo(getString(R.string.action_import), KeyEvent.KEYCODE_O, ctrl),
                    KeyboardShortcutInfo(getString(R.string.action_paste), KeyEvent.KEYCODE_V, ctrl),
                    KeyboardShortcutInfo(getString(R.string.action_examples), KeyEvent.KEYCODE_E, ctrl),
                    KeyboardShortcutInfo(getString(R.string.action_delete_summary), KeyEvent.KEYCODE_DEL, ctrl),
                ),
            ),
        )
    }

    /** The PDF being made, so a second tap does not make another (M-PDF-3). */
    private var making: Job? = null

    private fun shareSummary(summary: Summary, format: ShareFormat) {
        val title = getString(R.string.share_title)
        when (format) {
            ShareFormat.FILE -> share.launch(ShareFiles.intent(this, summary.bytes, title))
            ShareFormat.PDF -> {
                if (making?.isActive == true) return
                // Laid out and drawn off the main thread; shared once it is written.
                making = lifecycleScope.launch {
                    val intent = withContext(Dispatchers.Default) { ShareFiles.pdfIntent(this@MainActivity, summary, title) }
                    share.launch(intent)
                }
            }
        }
    }
}
