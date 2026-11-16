// Summaries, the home screen (spec M-LIST-1, M-LIST-2, M-LOAD-*): the open
// summaries newest first, and the three ways to open one.
package io.github.internationalpatientsummary.app.ui

import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.internationalpatientsummary.app.AppViewModel
import io.github.internationalpatientsummary.app.Problem
import io.github.internationalpatientsummary.app.R
import io.github.internationalpatientsummary.app.Screen
import io.github.internationalpatientsummary.app.ips.Format
import io.github.internationalpatientsummary.app.ips.IpsCheck
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.RefusedException
import io.github.internationalpatientsummary.app.ips.Summary
import java.io.IOException

/** The bundled examples (M-LOAD-3), the service's tests/fixtures/. */
val EXAMPLES = listOf(
    "bundle-minimal.json",
    "bundle-ips-all-sections.json",
    "bundle-no-info-required-sections.json",
    "IPS-examples-Bundle-01.json",
    "IPS-examples-Bundle-with-immunization.json",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummariesScreen(viewModel: AppViewModel) {
    val context = LocalContext.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.open { readDocument(context, uri) }
    }
    val actions = OpenActions(
        onImport = { pick.launch(arrayOf("application/json", "*/*")) },
        onPaste = { paste(context, viewModel) },
        onExamples = {
            viewModel.openExamples(EXAMPLES) { name ->
                context.assets.open("examples/$name").use { IpsCheck.readCapped(it) }
            }
        },
    )
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.summaries_title), Modifier.semantics { heading() }) },
                actions = {
                    IconButton(onClick = { viewModel.show(Screen.About) }) {
                        Icon(Icons.Filled.Info, contentDescription = stringResource(R.string.action_about))
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (viewModel.busy) {
                val busy = stringResource(R.string.busy)
                LinearProgressIndicator(Modifier.fillMaxWidth().semantics { contentDescription = busy })
            }
            if (viewModel.summaries.isEmpty()) {
                Empty(actions)
            } else {
                LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                    item { ActionRow(actions, Modifier.padding(16.dp)) }
                    items(viewModel.summaries, key = { it.id }) { summary ->
                        SummaryRow(
                            summary = summary,
                            onOpen = { viewModel.show(Screen.Open(summary.id)) },
                            onDelete = { viewModel.delete(summary.id) },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

private class OpenActions(val onImport: () -> Unit, val onPaste: () -> Unit, val onExamples: () -> Unit)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ActionRow(actions: OpenActions, modifier: Modifier = Modifier) {
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Button(onClick = actions.onImport, Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.action_import)) }
        OutlinedButton(onClick = actions.onPaste, Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.action_paste)) }
        OutlinedButton(onClick = actions.onExamples, Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.action_examples)) }
    }
}

@Composable
private fun Empty(actions: OpenActions) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            stringResource(R.string.empty_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
        Text(stringResource(R.string.empty_body), style = MaterialTheme.typography.bodyLarge)
        ActionRow(actions)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SummaryRow(summary: Summary, onOpen: () -> Unit, onDelete: () -> Unit) {
    val locale = currentLocale()
    val deleteLabel = stringResource(R.string.action_delete_summary)
    val state = rememberSwipeToDismissBoxState()
    SwipeToDismissBox(
        state = state,
        onDismiss = { onDelete() },
        backgroundContent = {
            Box(
                Modifier.fillMaxSize().background(MaterialTheme.colorScheme.errorContainer).padding(horizontal = 16.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Text(stringResource(R.string.row_delete_background), color = MaterialTheme.colorScheme.onErrorContainer)
            }
        },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface)
                .heightIn(min = 72.dp)
                .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                Modifier
                    .weight(1f)
                    .clickable(onClick = onOpen)
                    .semantics(mergeDescendants = true) {
                        customActions = listOf(CustomAccessibilityAction(deleteLabel) { onDelete(); true })
                    },
            ) {
                Text(summary.listTitle ?: stringResource(R.string.list_untitled), style = MaterialTheme.typography.titleMedium)
                summary.document.title?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                Format.date(summary.document.date, locale, withTime = false)?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = deleteLabel)
            }
        }
    }
}

@Composable
fun currentLocale(): java.util.Locale = LocalConfiguration.current.locales[0]

/** Read a picked file, refusing one over the limit before reading it all (M-CHECK-2). */
private fun readDocument(context: Context, uri: Uri): ByteArray {
    val resolver = context.contentResolver
    resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst() && !cursor.isNull(0) && cursor.getLong(0) > IpsCheck.MAX_BYTES) {
            throw RefusedException(Refusal.TOO_LARGE)
        }
    }
    val input = resolver.openInputStream(uri) ?: throw IOException("no stream")
    return input.use { IpsCheck.readCapped(it) }
}

/** Read the clipboard, only now that the person has tapped Paste (M-LOAD-2). */
private fun paste(context: Context, viewModel: AppViewModel) {
    val clipboard = context.getSystemService(ClipboardManager::class.java)
    val text = clipboard?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()
    if (text.isNullOrEmpty()) {
        viewModel.report(Problem.EmptyClipboard)
    } else {
        viewModel.open { text.toByteArray(Charsets.UTF_8) }
    }
}
