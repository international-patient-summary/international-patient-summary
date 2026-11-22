// The Compose screens on the JVM (Robolectric): the smoke test's path without the
// share sheet (spec §9 step 1). Fictional bundled examples only.
package io.github.internationalpatientsummary.app

import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.printToString
import android.os.Looper
import io.github.internationalpatientsummary.app.ips.Fixtures
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
// A tall phone, so the lazy list composes every row.
@Config(sdk = [36], qualifiers = "w411dp-h4000dp-xxhdpi")
class AppScreensTest {
    @get:Rule val compose = createEmptyComposeRule()

    @Before fun freshFileProvider() = resetFileProviderCache()

    private val context get() = ApplicationProvider.getApplicationContext<android.app.Application>()

    private fun text(id: Int, vararg args: Any): String = context.getString(id, *args)

    private fun SemanticsNodeInteractionsProvider.count(matcher: SemanticsMatcher): Int =
        onAllNodes(matcher).fetchSemanticsNodes().size

    /** Background work (IO, the writer thread) posts back to the main looper: keep idling it. */
    private fun waitFor(matcher: SemanticsMatcher, count: Int) {
        val end = System.nanoTime() + TIMEOUT * 1_000_000
        while (true) {
            shadowOf(Looper.getMainLooper()).idle()
            compose.waitForIdle()
            if (compose.count(matcher) == count) return
            check(System.nanoTime() < end) { "timed out; screen:\n" + compose.onAllNodes(isRoot()).let { r -> (0 until r.fetchSemanticsNodes().size).joinToString("\n----\n") { r[it].printToString(20) } } }
            Thread.sleep(20)
        }
    }

    @Test fun loadOpenAboutAndClearAll() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithText(text(R.string.empty_title)).assertExists()
            compose.onNodeWithText(text(R.string.action_examples)).performClick()
            waitFor(isSelectable(), 5)
            assertEquals(3, compose.count(isSelectable() and hasText(MARTHA)))

            compose.onAllNodes(isSelectable() and hasText(MARTHA))[0].performClick()
            waitFor(hasText(text(R.string.alert_high_criticality, PENICILLIN)), 1)
            compose.onNodeWithText(text(R.string.patient_heading)).assertExists()

            compose.onNode(hasContentDescription(text(R.string.action_back))).performClick()
            compose.onNode(hasContentDescription(text(R.string.action_about))).performClick()
            compose.onNodeWithText(text(R.string.action_clear_all)).performClick()
            compose.onNode(hasText(text(R.string.clear_all_confirm)) and hasAnyAncestor(isDialog())).performClick()
            waitFor(hasText(text(R.string.empty_title)), 1)
            assertEquals(0, compose.count(isSelectable()))
            assertEquals(0, compose.count(isHeading() and hasText(MARTHA)))
        }
    }

    private fun loadExamples() {
        compose.onNodeWithText(text(R.string.action_examples)).performClick()
        waitFor(isSelectable(), 5)
    }

    @Test fun relationshipsAndForgettingAPerson() {
        ActivityScenario.launch(MainActivity::class.java).use {
            loadExamples()
            val options = hasContentDescription(text(R.string.people_options, MARTHA))
            compose.onNode(options).performClick()
            compose.onNodeWithText(text(R.string.people_relationship)).assertExists()
            compose.onNodeWithText(text(R.string.relationship_parent)).performClick()
            // The relationship is kept: the menu shows it chosen next time.
            compose.onNode(options).performClick()
            compose.onNode(hasText(text(R.string.relationship_parent)) and isSelected()).assertExists()
            compose.onNodeWithText(text(R.string.people_forget)).performClick()
            // Cancel first, then forget for real.
            compose.onNode(hasText(text(R.string.action_cancel)) and hasAnyAncestor(isDialog())).performClick()
            assertEquals(5, compose.count(isSelectable()))
            compose.onNode(options).performClick()
            compose.onNodeWithText(text(R.string.people_forget)).performClick()
            compose.onNode(hasText(text(R.string.people_forget_confirm)) and hasAnyAncestor(isDialog())).performClick()
            // Martha had three of the five summaries.
            waitFor(isSelectable(), 2)
        }
    }

    @Test fun shareAsksFirstThenOffersTheFileAndDeleteRemovesTheSummary() {
        ActivityScenario.launch(MainActivity::class.java).use {
            loadExamples()
            compose.onAllNodes(isSelectable() and hasText(MARTHA))[0].performClick()
            waitFor(hasText(text(R.string.alert_high_criticality, PENICILLIN)), 1)
            compose.onNode(hasContentDescription(text(R.string.action_share))).performClick()
            compose.onNodeWithText(text(R.string.share_file)).performClick()
            compose.onNode(hasText(text(R.string.share_confirm_action)) and hasAnyAncestor(isDialog())).performClick()
            shadowOf(Looper.getMainLooper()).idle()
            // Delete this summary, from its own screen.
            compose.onNode(hasContentDescription(text(R.string.action_delete_summary))).performClick()
            waitFor(isSelectable(), 4)
        }
    }

    @Test fun anEmptyClipboardIsReportedAndDismissed() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithText(text(R.string.action_paste)).performClick()
            waitFor(hasText(text(R.string.problem_empty_clipboard)), 1)
            compose.onNode(hasText(text(R.string.problem_ok)) and hasAnyAncestor(isDialog())).performClick()
            waitFor(hasText(text(R.string.problem_empty_clipboard)), 0)
        }
    }

    @Test fun pastedTextFromTheClipboardOpensAsASummary() {
        ActivityScenario.launch(MainActivity::class.java).use {
            val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
            clipboard.setPrimaryClip(
                android.content.ClipData.newPlainText("summary", String(Fixtures.bytes("bundle-minimal"), Charsets.UTF_8)),
            )
            compose.onNodeWithText(text(R.string.action_paste)).performClick()
            waitFor(hasText(text(R.string.patient_heading)), 1)
        }
    }

    @Test fun anUnresolvedEntryAndMissingAllergiesAreStatedOnTheSummary() {
        ActivityScenario.launch(MainActivity::class.java).use {
            val bundle = Fixtures.bundle(
                """{"code":{"coding":[{"system":"http://loinc.org","code":"11450-4"}]},"entry":[{"reference":"Condition/nowhere"}]}""",
            )
            val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("summary", String(bundle, Charsets.UTF_8)))
            compose.onNodeWithText(text(R.string.action_paste)).performClick()
            waitFor(hasText(text(R.string.entry_not_found)), 1)
            compose.onNodeWithText(text(R.string.alert_allergies_missing)).assertExists()
        }
    }

    @Test fun aSummaryWithNoPatientAndANarrativeOnlySectionSaysSo() {
        ActivityScenario.launch(MainActivity::class.java).use {
            val bundle = Fixtures.bundle(
                """{"code":{"coding":[{"system":"http://loinc.org","code":"11450-4"}]},"text":{"status":"generated","div":"<div xmlns=\"http://www.w3.org/1999/xhtml\">Only a narrative</div>"}}""",
                subject = "Patient/elsewhere",
            )
            val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("summary", String(bundle, Charsets.UTF_8)))
            compose.onNodeWithText(text(R.string.action_paste)).performClick()
            waitFor(hasText(text(R.string.patient_not_in_document)), 1)
            compose.onNodeWithText("Only a narrative").assertExists()
        }
    }

    private companion object {
        const val TIMEOUT = 10_000L
        const val MARTHA = "Martha DeLarosa"
        const val PENICILLIN = "Substance with penicillin structure (substance)"
    }
}

/** A tablet or unfolded foldable: the list and the open summary side by side (M-TAB-*). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w1100dp-h3000dp-mdpi")
class TwoPaneScreensTest {
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

    @Test fun theListAndTheOpenSummaryShowTogetherAndAboutReplacesBoth() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithText(text(R.string.action_examples)).performClick()
            waitFor(isSelectable(), 5)
            compose.onAllNodes(isSelectable() and hasText("Martha DeLarosa"))[0].performClick()
            // The list stays while the summary is open beside it.
            waitFor(hasText(text(R.string.patient_heading)), 1)
            assertEquals(5, compose.onAllNodes(isSelectable()).fetchSemanticsNodes().size)
            compose.onNode(hasContentDescription(text(R.string.action_about))).performClick()
            compose.onNodeWithText(text(R.string.action_clear_all)).assertExists()
        }
    }
}
