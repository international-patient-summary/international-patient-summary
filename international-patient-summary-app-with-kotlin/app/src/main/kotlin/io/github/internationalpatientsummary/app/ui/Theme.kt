// Material 3, light or dark as the system says, with dynamic colour where the
// system offers it (spec M-A11Y-2).
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

@Composable
fun IpsTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val colors = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val context = LocalContext.current
        if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    } else if (dark) {
        Dark
    } else {
        Light
    }
    MaterialTheme(colorScheme = colors, content = content)
}
