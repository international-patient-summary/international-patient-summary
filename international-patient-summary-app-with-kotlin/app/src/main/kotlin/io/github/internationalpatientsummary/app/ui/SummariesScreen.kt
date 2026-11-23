// Summaries, the home screen (spec M-LIST-1, M-LIST-2, M-LOAD-*, M-PEOPLE-*):
// the open summaries grouped by person, newest first, and the three ways to
// open one.
package io.github.internationalpatientsummary.app.ui

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
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
import io.github.internationalpatientsummary.app.DocumentFiles
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.selected
import io.github.internationalpatientsummary.app.Person
import io.github.internationalpatientsummary.app.Relationship
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
import io.github.internationalpatientsummary.app.ips.Summary

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
    var forgetting by rememberSaveable { mutableStateOf<Long?>(null) }
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
                    viewModel.people.forEach { person ->
                        item(key = "person-${person.key}") {
                            PersonHeading(
                                person = person,
                                onRelationship = { viewModel.setRelationship(person.newest.id, it) },
                                onForget = { forgetting = person.newest.id },
                            )
                        }
                        items(person.summaries, key = { it.id }) { summary ->
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
    // M-PEOPLE-4: forget a person only after confirming.
    forgetting?.let { id ->
        val person = viewModel.personOf(id)
        if (person == null) {
            forgetting = null
        } else {
            val name = personName(person)
            AlertDialog(
                onDismissRequest = { forgetting = null },
                title = {
                    TrackPopupFocus()
                    // A dialog is a window above the cover: while covered it leaves out the name.
                    if (!LocalCovered.current) Text(stringResource(R.string.people_forget_title, name))
                },
                text = { Text(stringResource(R.string.people_forget_body)) },
                confirmButton = {
                    TextButton(onClick = {
                        forgetting = null
                        viewModel.forgetPerson(id)
                    }) { Text(stringResource(R.string.people_forget_confirm)) }
                },
                dismissButton = {
                    TextButton(onClick = { forgetting = null }) { Text(stringResource(R.string.action_cancel)) }
                },
            )
        }
    }
}

/** A person's name from their newest summary (M-PEOPLE-2). */
@Composable
fun personName(person: Person): String = person.newest.patient?.name ?: stringResource(R.string.people_not_named)

/**
 * A person's heading (M-PEOPLE-2): name, relationship and birth date, and a
 * button for their relationship and Forget this person (M-PEOPLE-3, M-PEOPLE-4).
 */
@Composable
private fun PersonHeading(person: Person, onRelationship: (Relationship) -> Unit, onForget: () -> Unit) {
    val locale = currentLocale()
    val name = personName(person)
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainer)
            .heightIn(min = 56.dp)
            .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) { heading() }) {
            Text(name, style = MaterialTheme.typography.titleLarge)
            if (person.relationship != Relationship.NONE) {
                Text(stringResource(relationshipText(person.relationship)), style = MaterialTheme.typography.bodyMedium)
            }
            Format.date(person.newest.patient?.birthDate, locale)?.let {
                Text(
                    stringResource(R.string.patient_born, it),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Box {
            IconButton(onClick = { menu = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.people_options, name))
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                TrackPopupFocus()
                Text(
                    stringResource(R.string.people_relationship),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).semantics { heading() },
                )
                Relationship.entries.forEach { choice ->
                    val chosen = choice == person.relationship
                    DropdownMenuItem(
                        text = { Text(stringResource(relationshipText(choice))) },
                        onClick = {
                            menu = false
                            onRelationship(choice)
                        },
                        leadingIcon = {
                            if (chosen) Icon(Icons.Filled.Check, contentDescription = null) else Spacer(Modifier.size(24.dp))
                        },
                        modifier = Modifier.semantics { selected = chosen },
                    )
                }
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.people_forget)) },
                    onClick = {
                        menu = false
                        onForget()
                    },
                    leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null) },
                )
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
        DropTarget { event -> dropped(event, context, activity, viewModel::open) }
    }
}

/** Opens what was dropped; false (not taken) for several items or an empty text (M-TAB-3). */
internal fun dropped(event: DragAndDropEvent, context: Context, activity: Activity?, open: (suspend () -> ByteArray) -> Unit): Boolean {
    val drag = event.toAndroidDragEvent()
    val clip = drag.clipData?.takeIf { it.itemCount == 1 } ?: return false
    val item = clip.getItemAt(0)
    val uri = item.uri
    if (uri != null) {
        val permissions = activity?.requestDragAndDropPermissions(drag)
        open {
            try {
                readDocument(context, uri)
            } finally {
                permissions?.release()
            }
        }
    } else {
        val text = item.coerceToText(context)?.toString().orEmpty()
        if (text.isEmpty()) return false
        open { text.toByteArray(Charsets.UTF_8) }
    }
    return true
}

/** Shows that a drop is welcome while something hovers over the list. */
internal class DropTarget(private val drop: (DragAndDropEvent) -> Boolean) : DragAndDropTarget {
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

/** Read a picked or dropped file, refusing one over the limit before reading it all (M-CHECK-2). */
private fun readDocument(context: Context, uri: Uri): ByteArray = DocumentFiles.read(context.contentResolver, uri)

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
