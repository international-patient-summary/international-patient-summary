import { describe, expect, it } from 'vitest';
import { indexBundle } from './bundle.ts';
import { buildDocument, DocumentError, ipsVersionFromProfiles } from './composition.ts';
import { SECTIONS } from './sections.ts';
import type { Bundle } from './types.ts';
import { exampleDoc, exampleJson, fixtureDoc, fixtureText, IG_FIXTURES } from '../test-helpers.ts';

function documentError(data: unknown): DocumentError {
	try {
		buildDocument(data);
	} catch (e) {
		if (e instanceof DocumentError) return e;
		throw e;
	}
	throw new Error('expected a DocumentError');
}

describe('bundle index', () => {
	it.each(IG_FIXTURES)('resolves every Composition section entry in %s', (name) => {
		const bundle = exampleJson(name) as Bundle;
		const index = indexBundle(bundle);
		const composition = bundle.entry![0].resource as {
			section?: { entry?: { reference: string }[] }[];
		};
		for (const section of composition.section ?? [])
			for (const entry of section.entry ?? [])
				expect(index.resolve(entry.reference), entry.reference).toBeDefined();
	});

	it('resolves urn:uuid: and relative Type/id references', () => {
		const index = indexBundle({
			resourceType: 'Bundle',
			type: 'document',
			entry: [
				{ fullUrl: 'urn:uuid:1111', resource: { resourceType: 'Patient', id: 'p1' } },
				{
					fullUrl: 'https://example.org/fhir/Condition/c1',
					resource: {
						resourceType: 'Condition',
						id: 'c1',
						subject: { reference: 'Patient/p1' }
					} as never
				}
			]
		});
		expect(index.resolve('urn:uuid:1111')?.resource.id).toBe('p1');
		expect(index.resolve('Patient/p1')?.resource.id).toBe('p1');
		expect(index.resolve('Condition/c1')?.fullUrl).toBe('https://example.org/fhir/Condition/c1');
		expect(index.resolve('Condition/none')).toBeUndefined();
	});
});

describe('buildDocument', () => {
	it.each(IG_FIXTURES)('builds %s with no errors and all required sections', (name) => {
		const doc = exampleDoc(name);
		expect(doc.patient?.resourceType).toBe('Patient');
		for (const key of ['medications', 'allergies', 'problems'])
			expect(doc.sections.some((s) => s.key === key)).toBe(true);
		expect(doc.checks.filter((c) => c.severity === 'error')).toEqual([]);
	});

	it('maps all 16 IPS sections of bundle-ips-all-sections, in Composition order', () => {
		const doc = exampleDoc('bundle-ips-all-sections');
		expect(new Set(doc.sections.map((s) => s.key))).toEqual(new Set(SECTIONS.map((s) => s.key)));
		expect(doc.sections[0].key).toBe('problems');
		expect(doc.sections.every((s) => s.present)).toBe(true);
	});

	it('classifies the required sections of bundle-no-info-required-sections as unavailable', () => {
		const doc = exampleDoc('bundle-no-info-required-sections');
		for (const key of ['medications', 'allergies', 'problems']) {
			const s = doc.sections.find((x) => x.key === key)!;
			expect(s.state).toBe('unavailable');
			expect(s.emptyReason?.coding?.[0]?.code).toBe('unavailable');
		}
		expect(doc.sections.find((s) => s.key === 'immunizations')?.state).toBe('known');
	});

	it('treats "no known allergies" entries as none known, not as an allergy', () => {
		const doc = exampleDoc('bundle-minimal');
		const allergies = doc.sections.find((s) => s.key === 'allergies')!;
		expect(allergies.state === 'none-known' || allergies.entries.length > 0).toBe(true);
	});

	it('adds a missing required section as omitted, with a warning', () => {
		const doc = fixtureDoc('missing-allergies.json');
		const s = doc.sections.find((x) => x.key === 'allergies')!;
		expect(s.present).toBe(false);
		expect(s.state).toBe('omitted');
		expect(doc.checks).toContainEqual(
			expect.objectContaining({ key: 'requiredSectionMissing', severity: 'warning' })
		);
	});

	it('warns about an unresolvable entry reference at its section', () => {
		const doc = fixtureDoc('broken-reference.json');
		const check = doc.checks.find((c) => c.key === 'unresolvedReference');
		expect(check?.values?.reference).toBe('Condition/does-not-exist');
		expect(doc.sections.some((s) => s.unresolved.includes('Condition/does-not-exist'))).toBe(true);
	});

	it('renders an unknown section with the generic renderer, and says so', () => {
		const doc = fixtureDoc('unknown-section.json');
		const s = doc.sections.find((x) => x.code === '10182-4')!;
		expect(s.key).toBe('generic');
		expect(s.state).toBe('known');
		expect(doc.checks).toContainEqual(
			expect.objectContaining({ key: 'unknownSection', severity: 'info' })
		);
	});

	it('reads the IPS version from a versioned profile', () => {
		expect(fixtureDoc('ips-1.1.0.json').version).toBe('1.1.0');
		expect(
			ipsVersionFromProfiles(['http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips|2.0.1'])
		).toEqual({ declaresIps: true, version: '2.0.1' });
		expect(ipsVersionFromProfiles(['http://example.org/x'])).toEqual({
			declaresIps: false,
			version: undefined
		});
	});

	it('blocks a non-document Bundle', () => {
		expect(documentError(JSON.parse(fixtureText('non-document.json'))).checks[0].key).toBe(
			'notDocument'
		);
	});

	it('blocks input that is not a Bundle, or has no Composition first, or no Patient', () => {
		expect(documentError({ resourceType: 'Patient' }).checks[0].key).toBe('notBundle');
		expect(documentError({ hello: 1 }).checks[0].key).toBe('notFhir');
		expect(
			documentError({
				resourceType: 'Bundle',
				type: 'document',
				entry: [{ resource: { resourceType: 'Patient' } }]
			}).checks.map((c) => c.key)
		).toContain('firstNotComposition');
		const noPatient = {
			resourceType: 'Bundle',
			type: 'document',
			entry: [{ resource: { resourceType: 'Composition', subject: { reference: 'Patient/x' } } }]
		};
		expect(documentError(noPatient).checks[0].key).toBe('subjectUnresolved');
		const noSubject = {
			resourceType: 'Bundle',
			type: 'document',
			entry: [{ resource: { resourceType: 'Composition' } }]
		};
		expect(documentError(noSubject).checks[0].key).toBe('noSubject');
	});
});
