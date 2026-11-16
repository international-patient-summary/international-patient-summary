// Summaries, the home screen (spec M-LIST-1, M-LIST-2, M-LOAD-*): the open
// summaries newest first, and the three ways to open one.
package io.github.internationalpatientsummary.app.ui

import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.mimeTypes
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.graphics.Color
import io.github.internationalpatientsummary.app.Drops
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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

/** The three ways to open a summary, for the buttons and the keyboard (M-LOAD-*, M-TAB-2). */
@Composable
fun rememberOpenActions(viewModel: AppViewModel): OpenActions {
    val context = LocalContext.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.open { readDocument(context, uri) }
    }
    return OpenActions(
        onImport = { pick.launch(arrayOf("application/json", "*/*")) },
        onPaste = { paste(context, viewModel) },
        onExamples = {
            viewModel.openExamples(EXAMPLES) { name ->
                context.assets.open("examples/$name").use { IpsCheck.readCapped(it) }
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummariesScreen(viewModel: AppViewModel, actions: OpenActions, selected: Long? = null) {
    val drop = rememberDropTarget(viewModel)
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
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .background(if (drop.hovering) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
                .dragAndDropTarget(shouldStartDragAndDrop = { Drops.accepts(it.mimeTypes().toList()) }, target = drop),
        ) {
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
                            selected = summary.id == selected,
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

/**
 * M-TAB-3: a JSON file or text dropped from another app (split screen, desktop
 * windows) opens through the same check as Import and Paste. A file is read
 * under the drop's temporary permission, which is released once read.
 */
@Composable
private fun rememberDropTarget(viewModel: AppViewModel): DropTarget {
    val context = LocalContext.current
    val activity = LocalActivity.current
    return remember(viewModel, activity) {
        DropTarget { event ->
            val drag = event.toAndroidDragEvent()
            val clip = drag.clipData?.takeIf { it.itemCount == 1 } ?: return@DropTarget false
            val item = clip.getItemAt(0)
            val uri = item.uri
            if (uri != null) {
                val permissions = activity?.requestDragAndDropPermissions(drag)
                viewModel.open {
                    try {
                        readDocument(context, uri)
                    } finally {
                        permissions?.release()
                    }
                }
            } else {
                val text = item.coerceToText(context)?.toString().orEmpty()
                if (text.isEmpty()) return@DropTarget false
                viewModel.open { text.toByteArray(Charsets.UTF_8) }
            }
            true
        }
    }
}

/** Shows that a drop is welcome while something hovers over the list. */
private class DropTarget(private val drop: (DragAndDropEvent) -> Boolean) : DragAndDropTarget {
    var hovering by mutableStateOf(false)
        private set

    override fun onEntered(event: DragAndDropEvent) {
        hovering = true
    }

    override fun onExited(event: DragAndDropEvent) {
        hovering = false
    }

    override fun onEnded(event: DragAndDropEvent) {
        hovering = false
    }

    override fun onDrop(event: DragAndDropEvent): Boolean {
        hovering = false
        return drop(event)
    }
}

class OpenActions(val onImport: () -> Unit, val onPaste: () -> Unit, val onExamples: () -> Unit)

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
    // Scrolls, so the buttons stay reachable in a short window or at a large font scale.
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
private fun SummaryRow(summary: Summary, selected: Boolean, onOpen: () -> Unit, onDelete: () -> Unit) {
    val locale = currentLocale()
    val name = summary.listTitle ?: stringResource(R.string.list_untitled)
    val deleteLabel = stringResource(R.string.action_delete_named, name)
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
        // The open summary's row (M-TAB-1): a container colour with its paired text colour.
        val background = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface
        val foreground = if (selected) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurface
        val quiet = if (selected) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
        Row(
            Modifier
                .fillMaxWidth()
                .background(background)
                .heightIn(min = 72.dp)
                .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                Modifier
                    .weight(1f)
                    .selectable(selected = selected, onClick = onOpen)
                    .semantics(mergeDescendants = true) {
                        customActions = listOf(CustomAccessibilityAction(deleteLabel) { onDelete(); true })
                    },
            ) {
                Text(name, style = MaterialTheme.typography.titleMedium, color = foreground)
                summary.document.title?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = foreground) }
                Format.date(summary.document.date, locale, withTime = false)?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = quiet)
                }
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = deleteLabel, tint = foreground)
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
