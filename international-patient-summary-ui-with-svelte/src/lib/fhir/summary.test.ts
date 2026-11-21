import type { FhirResource } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { context, exampleDoc } from '../test-helpers.ts';
import { documentSummary, patientSummary, referenceName } from './summary.ts';

const ctx = context('en-US');

describe('patient summary', () => {
	it('returns an empty, living summary when the document has no patient', () => {
		const doc = exampleDoc('bundle-minimal');
		doc.patient = undefined;
		expect(patientSummary(doc, ctx)).toEqual({
			identifiers: [],
			deceased: false,
			contacts: []
		});
	});

	it('formats identity, contacts, address and age', () => {
		const doc = exampleDoc('bundle-minimal');
		doc.patient = {
			resourceType: 'Patient',
			name: [{ use: 'official', given: ['Ada'], family: 'Lovelace' }],
			birthDate: '1980-03-15',
			gender: 'female',
			identifier: [{ system: 'https://example.test/mrn', value: '123' }],
			telecom: [{ system: 'email', value: 'ada@example.test' }],
			contact: [
				{
					name: { given: ['Charles'], family: 'Babbage' },
					relationship: [{ text: 'Emergency contact' }],
					telecom: [{ system: 'phone', value: '+44 20 0000 0000' }]
				}
			],
			address: [{ line: ['1 Computing Lane'], city: 'London', postalCode: 'N1', country: 'GB' }]
		};

		expect(patientSummary(doc, ctx, new Date('2026-11-15T00:00:00Z'))).toEqual({
			name: 'Ada Lovelace',
			birthDate: '1980-03-15',
			birthDateLabel: 'Mar 15, 1980',
			ageLabel: '46 years',
			genderLabel: 'Female',
			identifiers: [{ system: 'https://example.test/mrn', value: '123', type: undefined }],
			deceased: false,
			deceasedLabel: undefined,
			contacts: ['ada@example.test', 'Charles Babbage (Emergency contact) +44 20 0000 0000'],
			address: '1 Computing Lane, London, N1, GB'
		});
	});

	it('does not show a current age for deceased patients', () => {
		const doc = exampleDoc('bundle-minimal');
		doc.patient = {
			resourceType: 'Patient',
			birthDate: '1980-03-15',
			deceasedDateTime: '2020-04-01',
			address: [{ text: 'Address as supplied' }]
		};
		const dated = patientSummary(doc, ctx);
		expect(dated.ageLabel).toBeUndefined();
		expect(dated.deceasedLabel).toBe('Deceased Apr 1, 2020');
		expect(dated.address).toBe('Address as supplied');

		doc.patient = { resourceType: 'Patient', deceasedBoolean: true };
		expect(patientSummary(doc, ctx).deceasedLabel).toBe('Deceased');
	});
});

describe('reference names', () => {
	it('resolves people, organizations, devices and practitioner roles', () => {
		const doc = exampleDoc('bundle-minimal');
		const resources: Record<string, FhirResource> = {
			'Practitioner/1': {
				resourceType: 'Practitioner',
				name: [{ prefix: ['Dr'], given: ['Amal'], family: 'Singh' }]
			},
			'Organization/1': { resourceType: 'Organization', name: 'IPS Clinic' },
			'Device/1': {
				resourceType: 'Device',
				deviceName: [{ name: 'Summary generator', type: 'manufacturer-name' }]
			},
			'PractitionerRole/1': {
				resourceType: 'PractitionerRole',
				practitioner: { reference: 'Practitioner/1' },
				organization: { reference: 'Organization/1' },
				code: [{ text: 'General practitioner' }]
			}
		};
		doc.resolve = (reference) => (reference ? resources[reference] : undefined);

		expect(referenceName({ reference: 'Practitioner/1' }, doc)).toBe('Dr Amal Singh');
		expect(referenceName({ reference: 'Organization/1' }, doc)).toBe('IPS Clinic');
		expect(referenceName({ reference: 'Device/1' }, doc)).toBe('Summary generator');
		expect(referenceName({ reference: 'PractitionerRole/1' }, doc)).toBe(
			'Dr Amal Singh (General practitioner) — IPS Clinic'
		);
	});

	it('falls back to display, then the unresolved reference', () => {
		const doc = exampleDoc('bundle-minimal');
		doc.resolve = () => undefined;
		expect(referenceName({ reference: 'Practitioner/missing', display: 'Dr Display' }, doc)).toBe(
			'Dr Display'
		);
		expect(referenceName({ reference: 'Practitioner/missing' }, doc)).toBe('Practitioner/missing');
		expect(referenceName(undefined, doc)).toBeUndefined();
	});
});

describe('document summary', () => {
	it('formats authors, attesters, codes, language, version and identifiers', () => {
		const doc = exampleDoc('bundle-minimal');
		const author: FhirResource = {
			resourceType: 'Practitioner',
			name: [{ given: ['Grace'], family: 'Hopper' }]
		};
		const custodian: FhirResource = { resourceType: 'Organization', name: 'Naval Hospital' };
		doc.resolve = (reference) =>
			reference === 'Practitioner/author'
				? author
				: reference === 'Organization/custodian'
					? custodian
					: undefined;
		doc.composition.title = 'Patient summary';
		doc.composition.date = '2026-11-15T09:30:00Z';
		doc.composition.author = [{ reference: 'Practitioner/author' }];
		doc.composition.custodian = { reference: 'Organization/custodian' };
		doc.composition.attester = [
			{
				mode: 'professional',
				time: '2026-11-16',
				party: { reference: 'Practitioner/author' }
			}
		];
		doc.composition.confidentiality = 'R';
		doc.composition.status = 'final';
		doc.composition.identifier = { system: 'https://example.test/doc', value: 'DOC-1' };
		doc.language = 'cy';
		doc.version = '2.0.1';
		doc.declaresIps = true;

		const summary = documentSummary(doc, ctx);
		expect(summary).toMatchObject({
			title: 'Patient summary',
			date: '2026-11-15T09:30:00Z',
			authors: ['Grace Hopper'],
			custodian: 'Naval Hospital',
			attesters: ['Grace Hopper (professional) Nov 16, 2026'],
			confidentialityLabel: 'Restricted',
			language: 'cy',
			versionLabel: 'IPS 2.0.1',
			statusLabel: 'Final',
			identifier: 'DOC-1'
		});
		expect(summary.languageLabel).toMatch(/Welsh \(cy\)/);
	});

	it('uses safe fallbacks for unknown codes and unstated versions', () => {
		const doc = exampleDoc('bundle-minimal');
		doc.composition.confidentiality = 'X' as never;
		doc.composition.identifier = undefined;
		doc.bundle.identifier = { system: 'https://example.test/bundle', value: 'BUNDLE-1' };
		doc.language = undefined;
		doc.version = undefined;
		doc.declaresIps = true;
		const declared = documentSummary(doc, ctx);
		expect(declared.confidentialityLabel).toBe('X');
		expect(declared.languageLabel).toBeUndefined();
		expect(declared.versionLabel).toBe('IPS (version not stated)');
		expect(declared.identifier).toBe('BUNDLE-1');

		doc.declaresIps = false;
		expect(documentSummary(doc, ctx).versionLabel).toBe('Not stated');

		// A language tag the platform cannot name is shown as written.
		doc.language = 'not a tag!';
		expect(documentSummary(doc, ctx).languageLabel).toBe('not a tag! (not a tag!)');
	});
});
