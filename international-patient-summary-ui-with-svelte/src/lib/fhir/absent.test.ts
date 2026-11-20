import type { FhirResource } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import {
	absentKindOfConcept,
	absentKindOfResource,
	ABSENT_UNKNOWN_SYSTEM,
	emptyReasonCode,
	SNOMED,
	stateFromEmptyReason
} from './absent.ts';

describe('absent and unknown data', () => {
	it.each([
		['nilknown', 'none-known'],
		['notasked', 'not-recorded'],
		['notstarted', 'not-recorded'],
		['unavailable', 'unavailable'],
		['withheld', 'unavailable'],
		['closed', 'unavailable'],
		['future-code', 'unavailable']
	] as const)('maps emptyReason %s to %s', (code, expected) => {
		const reason = { coding: [{ code }] };
		expect(stateFromEmptyReason(reason)).toBe(expected);
		expect(emptyReasonCode(reason)).toBe(code);
	});

	it('does not invent an empty reason when none is present', () => {
		expect(stateFromEmptyReason(undefined)).toBeUndefined();
		expect(emptyReasonCode(undefined)).toBeUndefined();
	});

	it.each([
		['no-known-allergies', 'none-known'],
		['no-medication-info', 'not-recorded']
	] as const)('recognises the IPS absent code %s', (code, expected) => {
		expect(absentKindOfConcept({ coding: [{ system: ABSENT_UNKNOWN_SYSTEM, code }] })).toBe(
			expected
		);
	});

	it('recognises SNOMED negation without treating unrelated codes as absent', () => {
		expect(absentKindOfConcept({ coding: [{ system: SNOMED, code: '716186003' }] })).toBe(
			'none-known'
		);
		expect(
			absentKindOfConcept({ coding: [{ system: SNOMED, code: '195967001' }] })
		).toBeUndefined();
		expect(absentKindOfConcept(undefined)).toBeUndefined();
	});

	it.each([
		['AllergyIntolerance', 'code'],
		['Condition', 'code'],
		['Procedure', 'code'],
		['Immunization', 'vaccineCode']
	] as const)('reads an absent concept from %s', (resourceType, property) => {
		const resource = {
			resourceType,
			[property]: { coding: [{ system: ABSENT_UNKNOWN_SYSTEM, code: 'no-problem-info' }] }
		} as unknown as FhirResource;
		expect(absentKindOfResource(resource)).toBe('not-recorded');
	});

	it('reads inline and referenced medication codes', () => {
		const inline = {
			resourceType: 'MedicationStatement',
			status: 'active',
			medicationCodeableConcept: {
				coding: [{ system: ABSENT_UNKNOWN_SYSTEM, code: 'no-known-medications' }]
			},
			subject: {}
		} as FhirResource;
		expect(absentKindOfResource(inline)).toBe('none-known');

		const referenced = {
			resourceType: 'MedicationRequest',
			status: 'unknown',
			intent: 'order',
			medicationReference: { reference: 'Medication/none' },
			subject: {}
		} as FhirResource;
		expect(
			absentKindOfResource(referenced, (reference) =>
				reference === 'Medication/none'
					? ({
							resourceType: 'Medication',
							code: {
								coding: [{ system: ABSENT_UNKNOWN_SYSTEM, code: 'no-medication-info' }]
							}
						} as FhirResource)
					: undefined
			)
		).toBe('not-recorded');
	});

	it('reads a DeviceUseStatement code from its referenced Device', () => {
		const statement = {
			resourceType: 'DeviceUseStatement',
			status: 'active',
			subject: {},
			device: { reference: 'Device/none' }
		} as FhirResource;
		const absentDevice = {
			resourceType: 'Device',
			type: { coding: [{ system: ABSENT_UNKNOWN_SYSTEM, code: 'no-device-info' }] }
		} as FhirResource;

		expect(absentKindOfResource(statement, () => absentDevice)).toBe('not-recorded');
		expect(absentKindOfResource(statement, () => undefined)).toBeUndefined();
		expect(absentKindOfResource(statement)).toBeUndefined();
	});
});
