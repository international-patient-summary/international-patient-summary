// About (spec M-ABOUT-1): safety, what the app keeps and sends, versions, and
// Clear all with confirmation (M-PRIV-3).
package io.github.internationalpatientsummary.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.internationalpatientsummary.app.AppViewModel
import io.github.internationalpatientsummary.app.BuildConfig
import io.github.internationalpatientsummary.app.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutScreen(viewModel: AppViewModel) {
    var confirming by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.about_title), Modifier.semantics { heading() }) },
                navigationIcon = {
                    IconButton(onClick = { viewModel.back() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Part(R.string.about_safety_heading, R.string.about_safety_body)
            Part(R.string.about_privacy_heading, R.string.about_privacy_body)
            Text(
                stringResource(R.string.about_versions_heading),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(stringResource(R.string.about_ips_version))
            Text(stringResource(R.string.about_app_version, BuildConfig.VERSION_NAME))
            Button(
                onClick = { confirming = true },
                modifier = Modifier.heightIn(min = 48.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) { Text(stringResource(R.string.action_clear_all)) }
        }
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = {
                TrackPopupFocus()
                Text(stringResource(R.string.clear_all_title))
            },
            text = { Text(stringResource(R.string.clear_all_body)) },
            confirmButton = {
                TextButton(onClick = {
                    confirming = false
                    viewModel.clearAll()
                }) { Text(stringResource(R.string.clear_all_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.action_cancel)) }
            },
        )
    }
}

@Composable
private fun Part(heading: Int, body: Int) {
    Text(stringResource(heading), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
    Text(stringResource(body), style = MaterialTheme.typography.bodyLarge)
}
