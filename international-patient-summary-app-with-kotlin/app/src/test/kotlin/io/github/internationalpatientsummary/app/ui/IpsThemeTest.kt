// The app's theme provides Lily's tokens for the system's appearance (spec §8.1), so
// Lily's components draw with Lily's light or dark colour pairs.
package io.github.internationalpatientsummary.app.ui

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import io.github.lilydesignsystem.compose.themes.LilyTokens
import io.github.lilydesignsystem.compose.themes.LocalLilyTokens
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import android.os.Looper

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class IpsThemeTest {
    private fun tokensIn(dark: Boolean): LilyTokens? {
        var seen: LilyTokens? = null
        Robolectric.buildActivity(ComponentActivity::class.java).setup().get().setContent {
            IpsTheme(dark = dark) { seen = LocalLilyTokens.current }
        }
        shadowOf(Looper.getMainLooper()).idle()
        return seen
    }

    @Test fun lightUsesLilysLightTokens() = assertSame(LilyTokens.light, tokensIn(dark = false))

    @Test fun darkUsesLilysDarkTokens() = assertSame(LilyTokens.dark, tokensIn(dark = true))

    @Test fun theTokensFollowTheAppearance() {
        assertSame(LilyTokens.light, lilyTokens(dark = false))
        assertSame(LilyTokens.dark, lilyTokens(dark = true))
    }
}
