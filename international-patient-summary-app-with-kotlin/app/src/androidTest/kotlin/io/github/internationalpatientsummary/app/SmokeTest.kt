// The Compose smoke test (P1-T13), on an emulator or device: spec §9 step 1
// without a person. Load examples (M-LOAD-3), the list by person (M-LIST-1,
// M-PEOPLE-2), open one with its alert and banner (M-VIEW-1), share it as a
// PDF (M-SHARE-1, M-SHARE-2, M-PDF-3), then Clear all (M-PRIV-3). It uses
// only the bundled, fictional examples.
//
// The app saves summaries (M-STORE-1), so the test starts from an empty store
// by deleting the store's files before the activity starts; nothing in the
// app changes for the test. It ends with the app's own Clear all.
package io.github.internationalpatientsummary.app

import android.accessibilityservice.AccessibilityService
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class SmokeTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    private fun text(id: Int, vararg args: Any): String = context.getString(id, *args)

    private fun SemanticsNodeInteractionsProvider.count(matcher: SemanticsMatcher): Int =
        onAllNodes(matcher).fetchSemanticsNodes().size

    private fun waitFor(matcher: SemanticsMatcher, count: Int) {
        compose.waitUntil(TIMEOUT) { compose.count(matcher) == count }
    }

    @Before fun startEmpty() {
        // Earlier runs left saved summaries: start from none (no index means an empty store).
        File(context.noBackupFilesDir, "store").deleteRecursively()
    }

    @Test fun loadOpenAndClearAll() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithText(text(R.string.empty_title)).assertExists()

            // M-LOAD-3, M-PEOPLE-2: five examples about three people.
            compose.onNodeWithText(text(R.string.action_examples)).performClick()
            PEOPLE.forEach { waitFor(isHeading() and hasText(it), 1) }
            waitFor(isSelectable(), 5)
            assertEquals(3, compose.count(isSelectable() and hasText(MARTHA)))

            // M-LIST-1: the list is newest first, so Martha's first row is her newest
            // summary (bundle-minimal, the first example).
            compose.onAllNodes(isSelectable() and hasText(MARTHA))[0].performClick()

            // M-VIEW-1: the high-criticality allergy alert, and the banner with her name.
            val alert = text(R.string.alert_high_criticality, PENICILLIN)
            waitFor(hasText(alert), 1)
            compose.onNodeWithText(text(R.string.patient_heading)).assertExists()
            compose.onNode(hasText(MARTHA) and !isSelectable() and !isHeading()).assertExists()

            // M-SHARE-1, M-SHARE-2, M-PDF-3: Share offers the file or a PDF; with three
            // people open it asks first; the PDF is written to the share folder and
            // the share sheet opens over the app; when it closes the file is gone.
            val shareFolder = File(context.cacheDir, "share")
            fun pdfs() = shareFolder.listFiles().orEmpty().filter { file -> file.name.endsWith(".pdf") }
            compose.onNode(hasContentDescription(text(R.string.action_share))).performClick()
            compose.onNodeWithText(text(R.string.share_file)).assertExists()
            compose.onNodeWithText(text(R.string.share_pdf)).performClick()
            compose.onNode(hasText(text(R.string.share_confirm_action)) and hasAnyAncestor(isDialog())).performClick()
            compose.waitUntil(TIMEOUT) { pdfs().isNotEmpty() }
            // Named by the document's date, never the patient (M-PDF-1).
            assertTrue(pdfs().single().name.matches(Regex("""international-patient-summary(-\d{4}(-\d{2}){0,2})?\.pdf""")))
            // The share sheet is another app's window, now in front; Back closes it.
            val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
            compose.waitUntil(TIMEOUT) { automation.rootInActiveWindow?.packageName?.let { name -> name != context.packageName } == true }
            automation.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            compose.waitUntil(TIMEOUT) { it.state == Lifecycle.State.RESUMED && pdfs().isEmpty() }

            // M-PRIV-3: Clear all from About, after confirming, leaves the empty state.
            compose.onNode(hasContentDescription(text(R.string.action_back))).performClick()
            compose.onNode(hasContentDescription(text(R.string.action_about))).performClick()
            compose.onNodeWithText(text(R.string.action_clear_all)).performClick()
            compose.onNode(hasText(text(R.string.clear_all_confirm)) and hasAnyAncestor(isDialog())).performClick()
            waitFor(hasText(text(R.string.empty_title)), 1)
            assertEquals(0, compose.count(isSelectable()))
        }
    }

    private companion object {
        const val TIMEOUT = 10_000L
        const val MARTHA = "Martha DeLarosa"
        val PEOPLE = listOf(MARTHA, "Patricia JORDANA", "James Judge")
        const val PENICILLIN = "Substance with penicillin structure (substance)"
    }
}
