// Branch coverage for the banner and document summaries: sparse patients,
// contacts, addresses, people named through roles, and attesters.
import { describe, expect, it } from 'vitest';
import { buildDocument } from './composition.ts';
import { documentSummary, patientSummary, referenceName } from './summary.ts';
import { context } from '../test-helpers.ts';

const ctx = context('en-US');
const clean = (s: string | undefined) => (s ?? '').replace(/[⁦-⁩]/g, '');

/** A document whose Patient is `patient`, with `composition` fields and `entries` added. */
function doc(patient: object, composition: object = {}, entries: object[] = []) {
	return buildDocument({
		resourceType: 'Bundle',
		type: 'document',
		entry: [
			{
				fullUrl: 'urn:uuid:c',
				resource: {
					resourceType: 'Composition',
					type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] },
					subject: { reference: 'urn:uuid:p' },
					...composition
				}
			},
			{ fullUrl: 'urn:uuid:p', resource: { resourceType: 'Patient', ...patient } },
			...entries
		]
	});
}

describe('patientSummary', () => {
	it('lists contacts with their relationship and phone, skipping empty ones', () => {
		const s = patientSummary(
			doc({
				telecom: [{ value: '555-0100' }, {}],
				contact: [
					{
						name: { given: ['Sam'], family: 'Example' },
						relationship: [{ text: 'Sister' }, {}],
						telecom: [{ value: '555-0101' }, {}]
					},
					{ telecom: [{ value: '555-0102' }] },
					{ relationship: [{}] },
					{}
				]
			}),
			ctx
		);
		expect(s.contacts.map(clean)).toEqual([
			'555-0100',
			'Sam Example (Sister) 555-0101',
			'555-0102'
		]);
	});

	it('writes an address from its parts when it has no text, or leaves it out', () => {
		const parts = patientSummary(
			doc({ address: [{ line: ['1 Main St'], city: 'Town', country: 'NZ' }] }),
			ctx
		);
		expect(parts.address).toBe('1 Main St, Town, NZ');
		expect(patientSummary(doc({ address: [{ use: 'home' }] }), ctx).address).toBeUndefined();
		expect(patientSummary(doc({ address: [{ text: 'Somewhere' }] }), ctx).address).toBe(
			'Somewhere'
		);
	});

	it('says when a patient died, with the date when it is known, and gives no age', () => {
		const dated = patientSummary(
			doc({ birthDate: '1950-01-01', deceasedDateTime: '2020-02-03' }),
			ctx
		);
		expect(dated.deceased).toBe(true);
		expect(dated.ageLabel).toBeUndefined();
		expect(clean(dated.deceasedLabel)).toContain('2020');
		const undated = patientSummary(doc({ deceasedBoolean: true }), ctx);
		expect(undated.deceasedLabel).toBeTruthy();
		expect(clean(undated.deceasedLabel)).not.toContain('2020');
	});

	it('keeps a gender it has no word for as the document wrote it', () => {
		expect(patientSummary(doc({ gender: 'x-local' }), ctx).genderLabel).toBe('x-local');
		expect(patientSummary(doc({}), ctx).genderLabel).toBeUndefined();
	});
});

describe('names of the people and bodies a document refers to', () => {
	const people = [
		{
			fullUrl: 'urn:uuid:dr',
			resource: { resourceType: 'Practitioner', name: [{ given: ['Ada'], family: 'Doctor' }] }
		},
		{ fullUrl: 'urn:uuid:org', resource: { resourceType: 'Organization', name: 'Clinic' } },
		{
			fullUrl: 'urn:uuid:role',
			resource: {
				resourceType: 'PractitionerRole',
				practitioner: { reference: 'urn:uuid:dr' },
				organization: { reference: 'urn:uuid:org' },
				code: [{ text: 'GP' }, {}]
			}
		},
		{ fullUrl: 'urn:uuid:empty-role', resource: { resourceType: 'PractitionerRole' } },
		{ fullUrl: 'urn:uuid:dev', resource: { resourceType: 'Device', type: { text: 'EHR' } } },
		{ fullUrl: 'urn:uuid:loc', resource: { resourceType: 'Location', name: 'Ward' } }
	];
	const d = doc({}, {}, people);
	const name = (reference?: string, display?: string) =>
		clean(referenceName({ reference, display }, d));

	it('names a role by who, what and where', () => {
		expect(name('urn:uuid:role')).toBe('Ada Doctor (GP) — Clinic');
	});

	it('falls back to the display, then the reference, when the resource has no name', () => {
		expect(name('urn:uuid:empty-role', 'Someone')).toBe('Someone');
		expect(name('urn:uuid:loc')).toBe('urn:uuid:loc');
		expect(name('urn:uuid:dev')).toBe('EHR');
		expect(referenceName(undefined, d)).toBeUndefined();
	});

	it('words each attester with their mode and time', () => {
		const s = documentSummary(
			doc(
				{},
				{
					attester: [
						{ mode: 'legal', party: { reference: 'urn:uuid:dr' }, time: '2024-01-02' },
						{ mode: 'x-local' },
						{}
					]
				},
				people
			),
			ctx
		);
		expect(s.attesters.map(clean)).toHaveLength(2);
		expect(clean(s.attesters[0])).toContain('Ada Doctor');
		expect(clean(s.attesters[1])).toBe('(x-local)');
	});
});
