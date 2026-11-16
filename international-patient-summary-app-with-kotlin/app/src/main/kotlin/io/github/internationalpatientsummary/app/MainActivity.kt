// The one activity. It keeps patient data out of the app switcher (M-PRIV-2),
// removes leftover share files (M-PRIV-1), and hands the share sheet the
// exact bytes of a summary (M-SHARE-1).
package io.github.internationalpatientsummary.app

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.mutableStateOf
import io.github.internationalpatientsummary.app.ips.Summary
import io.github.internationalpatientsummary.app.ui.App

class MainActivity : ComponentActivity() {
    private val viewModel: AppViewModel by viewModels()

    /**
     * Covers the window while paused (M-PRIV-2). On Android 13 and later
     * setRecentsScreenshotEnabled(false) also stops the saved thumbnail, but the
     * switcher still shows the live window as it opens, so the cover is drawn on
     * every version. The Pixel launcher keeps the app live (resumed) in the
     * switcher, so losing window focus also covers it (both seen on an API 33
     * emulator, 2026-11-16).
     */
    private val covered = mutableStateOf(false)

    private val share = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        ShareFiles.clear(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) ShareFiles.clear(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(false)
        enableEdgeToEdge()
        setContent {
            App(viewModel = viewModel, covered = covered.value, onShare = ::shareSummary)
        }
    }

    override fun onPause() {
        super.onPause()
        covered.value = true
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        covered.value = !hasFocus
    }

    override fun onResume() {
        super.onResume()
        covered.value = false
    }

    private fun shareSummary(summary: Summary) {
        share.launch(ShareFiles.intent(this, summary.bytes, getString(R.string.share_title)))
    }
}
