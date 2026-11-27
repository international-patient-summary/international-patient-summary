// M-VIEW-8: the summary's contents name every section in order, and choosing one
// moves the list to that section, on an ordinary phone where most sections start
// off screen. Fictional bundled examples only.
package io.github.internationalpatientsummary.app

import android.os.Looper
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isHeading
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import io.github.internationalpatientsummary.app.ips.SectionKey
import io.github.lilydesignsystem.core.IpsSectionEntry
import io.github.lilydesignsystem.core.IpsSectionStatus
import io.github.internationalpatientsummary.app.ui.contentsItemIndex
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h800dp-xxhdpi")
class ContentsTest {
    @get:Rule val compose = createEmptyComposeRule()

    @Before fun freshFileProvider() = resetFileProviderCache()

    private val context get() = ApplicationProvider.getApplicationContext<android.app.Application>()

    private fun idleUntil(matcher: SemanticsMatcher) {
        val end = System.nanoTime() + 10_000_000_000
        while (compose.onAllNodes(matcher).fetchSemanticsNodes().isEmpty()) {
            check(System.nanoTime() < end) { "timed out waiting for $matcher" }
            shadowOf(Looper.getMainLooper()).idle()
            compose.waitForIdle()
            Thread.sleep(20)
        }
    }

    @Test fun choosingAnEntryMovesToItsSection() {
        ActivityScenario.launch(MainActivity::class.java).use {
            compose.onNodeWithText(context.getString(R.string.action_examples)).performClick()
            idleUntil(isSelectable())
            compose.onAllNodes(isSelectable())[0].performClick()
            val inContents = hasAnyAncestor(hasContentDescription(context.getString(R.string.summary_contents))) and hasClickAction()
            idleUntil(inContents)
            val entries = compose.onAllNodes(inContents).fetchSemanticsNodes()
                .map { it.config.getOrNull(SemanticsProperties.Text)?.joinToString("").orEmpty() }
            assertTrue("a contents entry per section: $entries", entries.size >= 3)
            val last = entries.last()
            compose.onAllNodes(inContents and hasText(last))[0].performClick()
            idleUntil(isHeading() and hasText(last))
            compose.onAllNodes(isHeading() and hasText(last))[0].assertIsDisplayed()
        }
    }

    @Test fun anEntryNamesTheItemAfterTheBannerAndTheContents() {
        val entries = listOf(
            IpsSectionEntry(SectionKey.ALLERGIES.key, "Allergies", IpsSectionStatus.Known),
            IpsSectionEntry("other-1", "Notes", IpsSectionStatus.Known),
        )
        val headings = mapOf("medications" to "Medications", "allergies" to "Allergies", "problems" to "Problems")
        assertEquals(2, contentsItemIndex(entries, headings, SectionKey.ALLERGIES.key))
        assertEquals(3, contentsItemIndex(entries, headings, "other-1"))
        // Medications and problems are missing, so Lily adds them after the document's own.
        assertEquals(4, contentsItemIndex(entries, headings, "medications"))
        assertNull(contentsItemIndex(entries, headings, "nowhere"))
    }
}
