// One summary (spec M-VIEW-1 to M-VIEW-7): the allergy alert above
// everything, the patient banner, the document, then the sections in order.
// Nothing here decides what a value is; it lays out what SummaryReader read.
package io.github.internationalpatientsummary.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import io.github.lilydesignsystem.compose.AlertKind
import io.github.lilydesignsystem.compose.InternationalPatientSummarySection
import io.github.lilydesignsystem.compose.LilyAlert
import io.github.lilydesignsystem.core.IpsSectionStatus
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.internationalpatientsummary.app.R
import io.github.internationalpatientsummary.app.Relationship
import io.github.internationalpatientsummary.app.ShareFormat
import io.github.internationalpatientsummary.app.ips.AllergyAlert
import io.github.internationalpatientsummary.app.ips.Detail
import io.github.internationalpatientsummary.app.ips.DetailKind
import io.github.internationalpatientsummary.app.ips.DocumentInfo
import io.github.internationalpatientsummary.app.ips.Entry
import io.github.internationalpatientsummary.app.ips.Format
import io.github.internationalpatientsummary.app.ips.PatientInfo
import io.github.internationalpatientsummary.app.ips.Section
import io.github.internationalpatientsummary.app.ips.SectionState
import io.github.internationalpatientsummary.app.ips.Summary
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummaryScreen(
    summary: Summary,
    relationship: Relationship,
    onBack: (() -> Unit)?,
    /** M-SHARE-1: the file (FHIR JSON) or the one-page PDF (M-PDF-1). */
    onShare: (ShareFormat) -> Unit,
    onDelete: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        summary.listTitle ?: stringResource(R.string.list_untitled),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.semantics { heading() },
                    )
                },
                navigationIcon = {
                    // Beside the list (M-TAB-1) there is nothing to go back to.
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                        }
                    }
                },
                actions = {
                    ShareMenu(onShare)
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.action_delete_summary))
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (!summary.allergyAlert.isEmpty) item(key = "alert") { AlertBox(summary.allergyAlert) }
            item(key = "patient") { Banner(summary.patient, relationship) }
            item(key = "document") { DocumentCard(summary.document) }
            itemsIndexed(summary.sections, key = { index, _ -> "section-$index" }) { _, section ->
                SectionCard(section)
            }
        }
    }
}

/** Share offers two things (M-SHARE-1): the file as it was opened, or a PDF for people. */
@Composable
private fun ShareMenu(onShare: (ShareFormat) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(Icons.Filled.Share, contentDescription = stringResource(R.string.action_share))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            TrackPopupFocus()
            DropdownMenuItem(
                text = { Text(stringResource(R.string.share_file)) },
                onClick = {
                    open = false
                    onShare(ShareFormat.FILE)
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.share_pdf)) },
                onClick = {
                    open = false
                    onShare(ShareFormat.PDF)
                },
            )
        }
    }
}

@Composable
private fun Heading(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.semantics { heading() },
    )
}

/** M-VIEW-1: words, an icon, and colour only as reinforcement. */
@Composable
private fun AlertBox(alert: AllergyAlert) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(Icons.Filled.Warning, contentDescription = null)
            // Lily's alert: one TalkBack stop, announced when it appears (spec §8, "Lily Design System").
            LilyAlert(
                heading = stringResource(R.string.alert_heading),
                message = buildList {
                    if (alert.sectionMissing) add(stringResource(R.string.alert_allergies_missing))
                    alert.highCriticality.forEach { add(stringResource(R.string.alert_high_criticality, it)) }
                }.joinToString("\n"),
                kind = AlertKind.Error,
            )
        }
    }
}

@Composable
private fun Banner(patient: PatientInfo?, relationship: Relationship) {
    val locale = currentLocale()
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                stringResource(R.string.patient_heading),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            // M-PEOPLE-3: the app's note about this person, not part of the document.
            val relationshipLine: @Composable () -> Unit = {
                if (relationship != Relationship.NONE) {
                    Text(stringResource(R.string.patient_relationship, stringResource(relationshipText(relationship))))
                }
            }
            if (patient == null) {
                Text(stringResource(R.string.patient_not_in_document), style = MaterialTheme.typography.titleLarge)
                relationshipLine()
                return@Column
            }
            Text(
                patient.name ?: stringResource(R.string.patient_unnamed),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
            )
            relationshipLine()
            Format.date(patient.birthDate, locale)?.let { born ->
                val age = Format.ageInYears(patient.birthDate, LocalDate.now())
                Text(
                    if (age == null) {
                        stringResource(R.string.patient_born, born)
                    } else {
                        stringResource(R.string.patient_born_with_age, born, pluralStringResource(R.plurals.age_years, age, age))
                    },
                )
            }
            patient.gender?.let { Text(stringResource(R.string.patient_gender, genderText(it))) }
            patient.identifiers.forEach { identifier ->
                val system = identifier.type ?: identifier.system.ifEmpty { stringResource(R.string.identifier_no_system) }
                Text(stringResource(R.string.identifier_line, system, identifier.value), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun DocumentCard(document: DocumentInfo) {
    val locale = currentLocale()
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                stringResource(R.string.document_heading),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Text(document.title ?: stringResource(R.string.document_untitled), style = MaterialTheme.typography.titleMedium)
            Format.date(document.date, locale)?.let { Text(stringResource(R.string.document_date, it)) }
            if (document.authors.isNotEmpty()) {
                Text(stringResource(R.string.document_authors, document.authors.joinToString(", ")))
            }
        }
    }
}

@Composable
private fun SectionCard(section: Section) {
    // Allergies are never collapsed (M-VIEW-3); no section is. Only the narrative
    // beside entries is behind a toggle, since the entries already say it.
    var showNarrative by rememberSaveable { mutableStateOf(false) }
    val hasRows = section.entries.isNotEmpty()
    val heading = sectionTitleText(section)
    val state = stateText(section.state)?.let { stringResource(it) }
    Card(Modifier.fillMaxWidth()) {
        // Lily's section: the heading, the state in words, then the entries (spec §9.1).
        InternationalPatientSummarySection(
            section = section.key?.key ?: "other",
            heading = heading,
            modifier = Modifier.padding(vertical = 16.dp),
            status = lilyStatus(section.state),
            statusLabel = state,
        ) {
            // M-VIEW-3: the document's own title, as written, when it differs from the app's name.
            section.documentTitle?.takeIf { section.key != null && it != heading }?.let {
                Text(
                    it,
                    Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            section.entries.forEachIndexed { index, entry ->
                if (index > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                EntryRow(entry)
            }
            section.narrative?.let { narrative ->
                if (!hasRows) {
                    Text(narrative, Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium)
                } else {
                    TextButton(
                        onClick = { showNarrative = !showNarrative },
                        modifier = Modifier.padding(horizontal = 4.dp).heightIn(min = 48.dp),
                    ) {
                        Text(stringResource(if (showNarrative) R.string.narrative_hide else R.string.narrative_show))
                    }
                    if (showNarrative) {
                        Text(narrative, Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

private fun lilyStatus(state: SectionState): IpsSectionStatus = when (state) {
    SectionState.KNOWN -> IpsSectionStatus.Known
    SectionState.NONE_KNOWN -> IpsSectionStatus.NoneKnown
    SectionState.NOT_RECORDED -> IpsSectionStatus.NotRecorded
    SectionState.UNAVAILABLE -> IpsSectionStatus.Unavailable
    SectionState.MISSING -> IpsSectionStatus.Omitted
}

/** One entry, read by a screen reader as one sentence (M-A11Y-1). */
@Composable
private fun EntryRow(entry: Entry) {
    val locale = currentLocale()
    Column(
        Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {}
            .heightIn(min = 48.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        when (entry) {
            Entry.NotFound -> Text(
                stringResource(R.string.entry_not_found),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
            is Entry.Resolved -> {
                Text(
                    entry.text ?: stringResource(R.string.entry_no_concept, entry.resourceType),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                entry.details.forEach { detail ->
                    Text(
                        stringResource(R.string.detail_line, stringResource(detailLabel(detail.kind)), detailValue(detail, locale)),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun detailValue(detail: Detail, locale: java.util.Locale): String = when (detail.kind) {
    DetailKind.DATE -> Format.date(detail.value, locale) ?: detail.value
    DetailKind.STATUS, DetailKind.CRITICALITY ->
        detail.codes.map { codeText(it) }.reduce { first, second -> stringResource(R.string.list_pair, first, second) }
    else -> detail.value
}
