// Material 3, light or dark as the system says, with dynamic colour where the
// system offers it (spec M-A11Y-2); inside it, Lily's own theme with the
// matching light or dark tokens, so Lily's components (the allergy alert, the
// sections) draw with Lily's gated colour pairs (spec §8.1).
package io.github.internationalpatientsummary.app.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import io.github.lilydesignsystem.compose.themes.LilyTheme
import io.github.lilydesignsystem.compose.themes.LilyTokens

private val Light = lightColorScheme(
    primary = Color(0xFF0B5CAD),
    onPrimary = Color.White,
    error = Color(0xFFB3261E),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFA6C8FF),
    onPrimary = Color(0xFF00315F),
    error = Color(0xFFF2B8B5),
)

/** Lily's tokens for the system's light or dark appearance. */
fun lilyTokens(dark: Boolean): LilyTokens = if (dark) LilyTokens.dark else LilyTokens.light

@Composable
fun IpsTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = LocalContext.current
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else if (dark) {
        Dark
    } else {
        Light
    }
    MaterialTheme(colorScheme = colors) {
        LilyTheme(tokens = lilyTokens(dark), content = content)
    }
}
