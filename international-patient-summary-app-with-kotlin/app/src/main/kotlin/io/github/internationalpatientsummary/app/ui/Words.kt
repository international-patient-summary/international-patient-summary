// Model values in the interface's words (spec M-I18N-1). Clinical text passes
// through untouched; only the app's own words come from string resources.
package io.github.internationalpatientsummary.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.internationalpatientsummary.app.Problem
import io.github.internationalpatientsummary.app.R
import io.github.internationalpatientsummary.app.ips.DetailKind
import io.github.internationalpatientsummary.app.ips.Refusal
import io.github.internationalpatientsummary.app.ips.Section
import io.github.internationalpatientsummary.app.ips.SectionKey
import io.github.internationalpatientsummary.app.ips.SectionState

fun refusalText(refusal: Refusal): Int = when (refusal) {
    Refusal.TOO_LARGE -> R.string.refusal_too_large
    Refusal.NOT_JSON -> R.string.refusal_not_json
    Refusal.NOT_A_BUNDLE -> R.string.refusal_not_a_bundle
    Refusal.NOT_A_DOCUMENT -> R.string.refusal_not_a_document
    Refusal.NO_COMPOSITION -> R.string.refusal_no_composition
    Refusal.NOT_A_PATIENT_SUMMARY -> R.string.refusal_not_a_patient_summary
    Refusal.NO_SUBJECT -> R.string.refusal_no_subject
}

fun problemText(problem: Problem): Int = when (problem) {
    is Problem.Refused -> refusalText(problem.refusal)
    Problem.Unreadable -> R.string.problem_unreadable
    Problem.EmptyClipboard -> R.string.problem_empty_clipboard
}

fun sectionTitle(key: SectionKey): Int = when (key) {
    SectionKey.ALLERGIES -> R.string.section_allergies
    SectionKey.MEDICATIONS -> R.string.section_medications
    SectionKey.PROBLEMS -> R.string.section_problems
    SectionKey.IMMUNIZATIONS -> R.string.section_immunizations
    SectionKey.RESULTS -> R.string.section_results
    SectionKey.PROCEDURES -> R.string.section_procedures
    SectionKey.DEVICES -> R.string.section_devices
    SectionKey.VITAL_SIGNS -> R.string.section_vital_signs
    SectionKey.PAST_ILLNESS -> R.string.section_past_illness
    SectionKey.FUNCTIONAL -> R.string.section_functional
    SectionKey.PLAN_OF_CARE -> R.string.section_plan_of_care
    SectionKey.SOCIAL_HISTORY -> R.string.section_social_history
    SectionKey.PREGNANCY -> R.string.section_pregnancy
    SectionKey.ADVANCE_DIRECTIVES -> R.string.section_advance_directives
    SectionKey.ALERTS -> R.string.section_alerts
    SectionKey.PATIENT_STORY -> R.string.section_patient_story
}

@Composable
fun sectionTitleText(section: Section): String = when (val key = section.key) {
    null -> section.documentTitle ?: stringResource(R.string.section_untitled)
    else -> stringResource(sectionTitle(key))
}

fun stateText(state: SectionState): Int? = when (state) {
    SectionState.KNOWN -> null
    SectionState.NONE_KNOWN -> R.string.state_none_known
    SectionState.NOT_RECORDED -> R.string.state_not_recorded
    SectionState.UNAVAILABLE -> R.string.state_unavailable
    SectionState.MISSING -> R.string.state_missing
}

fun detailLabel(kind: DetailKind): Int = when (kind) {
    DetailKind.STATUS -> R.string.detail_status
    DetailKind.CRITICALITY -> R.string.detail_criticality
    DetailKind.REACTIONS -> R.string.detail_reactions
    DetailKind.DOSAGE -> R.string.detail_dosage
    DetailKind.DATE -> R.string.detail_date
    DetailKind.VALUE -> R.string.detail_value
    DetailKind.INTERPRETATION -> R.string.detail_interpretation
}

@Composable
fun criticalityText(code: String): String = when (code) {
    "high" -> stringResource(R.string.criticality_high)
    "low" -> stringResource(R.string.criticality_low)
    "unable-to-assess" -> stringResource(R.string.criticality_unable_to_assess)
    else -> code
}

@Composable
fun genderText(code: String): String = when (code) {
    "male" -> stringResource(R.string.gender_male)
    "female" -> stringResource(R.string.gender_female)
    "other" -> stringResource(R.string.gender_other)
    "unknown" -> stringResource(R.string.gender_unknown)
    else -> code
}
