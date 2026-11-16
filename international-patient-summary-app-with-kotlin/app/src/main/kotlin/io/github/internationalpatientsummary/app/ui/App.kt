// The app's root: theme, state-driven navigation, Back, the refusal alert,
// and the cover that hides patient data from the app switcher (M-PRIV-2).
package io.github.internationalpatientsummary.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import io.github.internationalpatientsummary.app.AppViewModel
import io.github.internationalpatientsummary.app.Problem
import io.github.internationalpatientsummary.app.R
import io.github.internationalpatientsummary.app.Screen
import io.github.internationalpatientsummary.app.ips.Summary

@Composable
fun App(viewModel: AppViewModel, covered: Boolean, onShare: (Summary) -> Unit) {
    IpsTheme {
        BackHandler(enabled = viewModel.screen != Screen.Summaries) { viewModel.back() }
        Box(Modifier.fillMaxSize()) {
            when (val screen = viewModel.screen) {
                Screen.Summaries -> SummariesScreen(viewModel)
                Screen.About -> AboutScreen(viewModel)
                is Screen.Open -> {
                    val summary = viewModel.summary(screen.id)
                    if (summary == null) {
                        LaunchedEffect(screen) { viewModel.back() }
                    } else {
                        SummaryScreen(
                            summary = summary,
                            onBack = { viewModel.back() },
                            onShare = { onShare(summary) },
                            onDelete = { viewModel.delete(summary.id) },
                        )
                    }
                }
            }
            viewModel.problem?.let { ProblemAlert(it, viewModel::dismissProblem) }
            if (covered) Cover()
        }
    }
}

@Composable
private fun ProblemAlert(problem: Problem, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.problem_ok)) } },
        title = { Text(stringResource(R.string.problem_title)) },
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

/** Drawn over everything while paused, so a snapshot shows no patient data. */
@Composable
private fun Cover() {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Box(contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall)
        }
    }
}
