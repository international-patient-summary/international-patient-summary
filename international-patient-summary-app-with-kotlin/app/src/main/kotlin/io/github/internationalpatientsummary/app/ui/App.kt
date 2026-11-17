// The app's root: theme, state-driven navigation, Back, the refusal alert,
// and the cover that hides patient data from the app switcher (M-PRIV-2).
package io.github.internationalpatientsummary.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.internationalpatientsummary.app.AppViewModel
import io.github.internationalpatientsummary.app.Problem
import io.github.internationalpatientsummary.app.R
import io.github.internationalpatientsummary.app.Relationship
import io.github.internationalpatientsummary.app.Screen
import io.github.internationalpatientsummary.app.ShareFormat
import io.github.internationalpatientsummary.app.Shortcut
import io.github.internationalpatientsummary.app.ips.Summary

/** Wide enough for the list beside the open summary (M-TAB-1): Material's "expanded" width. */
val TWO_PANE_WIDTH = 840.dp

@Composable
fun App(viewModel: AppViewModel, covered: Boolean, onShare: (Summary, ShareFormat) -> Unit) {
    IpsTheme {
        CompositionLocalProvider(LocalCovered provides covered) {
            BackHandler(enabled = viewModel.screen != Screen.Summaries) { viewModel.back() }
            val actions = rememberOpenActions(viewModel)
            // M-TAB-2: a keyboard shortcut runs the same action as its button, from any screen.
            LaunchedEffect(viewModel.pending) {
                when (viewModel.pending) {
                    Shortcut.IMPORT -> actions.onImport()
                    Shortcut.PASTE -> actions.onPaste()
                    Shortcut.EXAMPLES -> actions.onExamples()
                    Shortcut.DELETE_OPEN, null -> Unit
                }
                viewModel.shortcutDone()
            }
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val twoPane = maxWidth >= TWO_PANE_WIDTH
                when (val screen = viewModel.screen) {
                    Screen.About -> AboutScreen(viewModel)
                    else -> if (twoPane) {
                        Row(Modifier.fillMaxSize()) {
                            Box(Modifier.weight(2f)) { SummariesScreen(viewModel, actions, selected = (screen as? Screen.Open)?.id) }
                            VerticalDivider()
                            Box(Modifier.weight(3f)) { Detail(viewModel, screen, onShare, showBack = false) }
                        }
                    } else if (screen is Screen.Open) {
                        Detail(viewModel, screen, onShare, showBack = true)
                    } else {
                        SummariesScreen(viewModel, actions, selected = null)
                    }
                }
                viewModel.problem?.let { ProblemAlert(it, viewModel::dismissProblem) }
                if (covered) Cover()
            }
        }
    }
}

/** The open summary, or (beside the list, before one is chosen) what to do. */
@Composable
private fun Detail(viewModel: AppViewModel, screen: Screen, onShare: (Summary, ShareFormat) -> Unit, showBack: Boolean) {
    val summary = (screen as? Screen.Open)?.let { viewModel.summary(it.id) }
    if (summary == null) {
        if (screen is Screen.Open) LaunchedEffect(screen) { viewModel.back() }
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surfaceContainerLow) {
            Box(Modifier.padding(24.dp), contentAlignment = Alignment.Center) {
                Text(
                    stringResource(R.string.detail_placeholder),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    } else {
        // M-SHARE-2: with more than one person's summaries open, ask before sharing.
        // The format chosen from Share, while M-SHARE-2's question is open.
        var confirmingShare by rememberSaveable(summary.id) { mutableStateOf<ShareFormat?>(null) }
        SummaryScreen(
            summary = summary,
            relationship = viewModel.personOf(summary.id)?.relationship ?: Relationship.NONE,
            onBack = if (showBack) ({ viewModel.back() }) else null,
            onShare = { format -> if (viewModel.shareAsksFirst) confirmingShare = format else onShare(summary, format) },
            onDelete = { viewModel.delete(summary.id) },
        )
        confirmingShare?.let { format ->
            val name = summary.patient?.name ?: stringResource(R.string.people_not_named)
            AlertDialog(
                onDismissRequest = { confirmingShare = null },
                title = {
                    TrackPopupFocus()
                    // A dialog is a window above the cover: while covered it leaves out the name.
                    if (!LocalCovered.current) Text(stringResource(R.string.share_confirm_title, name))
                },
                text = { Text(stringResource(R.string.share_confirm_body)) },
                confirmButton = {
                    TextButton(onClick = {
                        confirmingShare = null
                        onShare(summary, format)
                    }) { Text(stringResource(R.string.share_confirm_action)) }
                },
                dismissButton = {
                    TextButton(onClick = { confirmingShare = null }) { Text(stringResource(R.string.action_cancel)) }
                },
            )
        }
    }
}

@Composable
private fun ProblemAlert(problem: Problem, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.problem_ok)) } },
        title = {
            TrackPopupFocus()
            Text(stringResource(R.string.problem_title))
        },
        text = {
            val message = stringResource(problemText(problem))
            if (problem is Problem.Refused) {
                Text(message + "\n\n" + stringResource(R.string.problem_code, problem.refusal.code))
            } else {
                Text(message)
            }
        },
    )
}

/** Which of the app's own menus and dialogs have window focus (M-PRIV-2). */
class PopupFocus {
    private val windows = mutableStateMapOf<Any, Boolean>()

    val anyFocused: Boolean get() = windows.values.any { it }

    fun report(key: Any, focused: Boolean) {
        windows[key] = focused
    }

    fun gone(key: Any) {
        windows.remove(key)
    }
}

val LocalPopupFocus = staticCompositionLocalOf<PopupFocus?> { null }

/** Whether the cover is drawn (M-PRIV-2). */
val LocalCovered = compositionLocalOf { false }

/**
 * Call inside a menu or dialog: it tells the activity whether that window has
 * focus, so the cover stays off while the person uses it. Until the window
 * first has focus it counts as focused, so opening it does not flash the cover.
 */
@Composable
fun TrackPopupFocus() {
    val popups = LocalPopupFocus.current ?: return
    val key = remember { Any() }
    var seen by remember { mutableStateOf(false) }
    val focused = LocalWindowInfo.current.isWindowFocused
    if (focused) seen = true
    val effective = focused || !seen
    DisposableEffect(popups, key) { onDispose { popups.gone(key) } }
    SideEffect { popups.report(key, effective) }
}

/** Drawn over everything while paused, so a snapshot shows no patient data. */
@Composable
private fun Cover() {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Box(contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall)
        }
    }
}
