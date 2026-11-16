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

/** FHIR codes the app puts in words (M-VIEW-7), the same set as the iOS app's `code.*`. */
val CODE_WORDS: Map<String, Int> = mapOf(
    "active" to R.string.code_active,
    "allergy" to R.string.code_allergy,
    "amended" to R.string.code_amended,
    "cancelled" to R.string.code_cancelled,
    "completed" to R.string.code_completed,
    "confirmed" to R.string.code_confirmed,
    "corrected" to R.string.code_corrected,
    "differential" to R.string.code_differential,
    "draft" to R.string.code_draft,
    "entered-in-error" to R.string.code_entered_in_error,
    "final" to R.string.code_final,
    "high" to R.string.code_high,
    "in-progress" to R.string.code_in_progress,
    "inactive" to R.string.code_inactive,
    "intended" to R.string.code_intended,
    "intolerance" to R.string.code_intolerance,
    "low" to R.string.code_low,
    "not-done" to R.string.code_not_done,
    "not-taken" to R.string.code_not_taken,
    "on-hold" to R.string.code_on_hold,
    "preliminary" to R.string.code_preliminary,
    "preparation" to R.string.code_preparation,
    "presumed" to R.string.code_presumed,
    "provisional" to R.string.code_provisional,
    "recurrence" to R.string.code_recurrence,
    "refuted" to R.string.code_refuted,
    "registered" to R.string.code_registered,
    "relapse" to R.string.code_relapse,
    "remission" to R.string.code_remission,
    "resolved" to R.string.code_resolved,
    "stopped" to R.string.code_stopped,
    "unable-to-assess" to R.string.code_unable_to_assess,
    "unconfirmed" to R.string.code_unconfirmed,
    "unknown" to R.string.code_unknown,
)

/** A FHIR code in the interface's words ("active" -> "Active"); an unknown code as written. */
@Composable
fun codeText(code: String): String = CODE_WORDS[code]?.let { stringResource(it) } ?: code

@Composable
fun genderText(code: String): String = when (code) {
    "male" -> stringResource(R.string.gender_male)
    "female" -> stringResource(R.string.gender_female)
    "other" -> stringResource(R.string.gender_other)
    "unknown" -> stringResource(R.string.gender_unknown)
    else -> code
}
