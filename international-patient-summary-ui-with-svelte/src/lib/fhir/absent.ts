// Absent and unknown data (spec §6.4), mapped to the Lily record-list statuses
// as the Lily healthcare pattern ("From FHIR to Lily") recommends:
//
//   emptyReason nilknown                    → none-known
//   emptyReason notasked, notstarted        → not-recorded
//   emptyReason unavailable, withheld, closed → unavailable
//   IPS absent/unknown "no-known-…"         → none-known
//   IPS absent/unknown "no-…-info"          → not-recorded
//
// Words are never chosen here; the UI says each state in its own words.
import type { CodeableConcept, FhirResource } from 'fhir/r4';
import type { SectionState } from './types.ts';

export const ABSENT_UNKNOWN_SYSTEM = 'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips';
export const LIST_EMPTY_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/list-empty-reason';
export const DATA_ABSENT_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/data-absent-reason';
export const SNOMED = 'http://snomed.info/sct';

/** SNOMED CT concepts that state an explicit negation ("none known"). */
const SNOMED_NONE_KNOWN = new Set([
	'716186003', // No known allergy
	'409137002', // No known history of drug allergy
	'428607008', // No known environmental allergy
	'429625007', // No known food allergy
	'428197003', // No known insect allergy
	'160245001' // No current problems or disability
]);

export type AbsentKind = Exclude<SectionState, 'known' | 'omitted'>;

/** The state an emptyReason code names; unknown codes read as "unavailable". */
export function stateFromEmptyReason(reason: CodeableConcept | undefined): AbsentKind | undefined {
	if (!reason) return undefined;
	const code = reason.coding?.find((c) => c.code)?.code;
	switch (code) {
		case 'nilknown':
			return 'none-known';
		case 'notasked':
		case 'notstarted':
			return 'not-recorded';
		case 'unavailable':
		case 'withheld':
		case 'closed':
			return 'unavailable';
		default:
			return 'unavailable';
	}
}

/** The emptyReason code, for choosing words; undefined when there is none. */
export function emptyReasonCode(reason: CodeableConcept | undefined): string | undefined {
	return reason?.coding?.find((c) => c.code)?.code;
}

/** What an IPS absent/unknown or SNOMED negation code states, if anything. */
export function absentKindOfConcept(concept: CodeableConcept | undefined): AbsentKind | undefined {
	for (const coding of concept?.coding ?? []) {
		if (coding.system === ABSENT_UNKNOWN_SYSTEM && coding.code) {
			if (coding.code.startsWith('no-known-')) return 'none-known';
			if (coding.code.endsWith('-info')) return 'not-recorded';
		}
		if (coding.system === SNOMED && coding.code && SNOMED_NONE_KNOWN.has(coding.code))
			return 'none-known';
	}
	return undefined;
}

/** The concept on a resource that may carry an absent/unknown code. */
function primaryConcept(resource: FhirResource): CodeableConcept | undefined {
	switch (resource.resourceType) {
		case 'AllergyIntolerance':
		case 'Condition':
		case 'Procedure':
			return resource.code;
		case 'MedicationStatement':
		case 'MedicationRequest':
			return resource.medicationCodeableConcept;
		case 'Immunization':
			return resource.vaccineCode;
		case 'DeviceUseStatement':
			return undefined;
		case 'Device':
			return resource.type;
		default:
			return undefined;
	}
}

/**
 * Whether a resource is an explicit statement of absence, such as an
 * AllergyIntolerance coded "no-known-allergies". Device use statements carry
 * the code on the referenced Device, so a resolver is passed in.
 */
export function absentKindOfResource(
	resource: FhirResource,
	resolve?: (reference: string | undefined) => FhirResource | undefined
): AbsentKind | undefined {
	if (resource.resourceType === 'DeviceUseStatement' && resolve) {
		const device = resolve(resource.device?.reference);
		if (device?.resourceType === 'Device') return absentKindOfConcept(device.type);
		return undefined;
	}
	if (
		(resource.resourceType === 'MedicationStatement' ||
			resource.resourceType === 'MedicationRequest') &&
		resolve &&
		resource.medicationReference
	) {
		const medication = resolve(resource.medicationReference.reference);
		if (medication?.resourceType === 'Medication') return absentKindOfConcept(medication.code);
	}
	return absentKindOfConcept(primaryConcept(resource));
}
