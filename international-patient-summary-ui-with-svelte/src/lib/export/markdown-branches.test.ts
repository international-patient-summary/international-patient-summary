// Branch coverage for the Markdown export: a sparse or deceased patient,
// identifiers without a system, a document with attesters and an identifier,
// and a section whose entries have a single field.
import { describe, expect, it } from 'vitest';
import { lint } from 'markdownlint/sync';
import { exportMarkdown } from './markdown.ts';
import { buildDocument } from '../fhir/composition.ts';
import { context } from '../test-helpers.ts';

const ctx = context('en-US');
const NOW = new Date('2026-11-15T12:00:00Z');

function doc(patient: object, composition: object = {}, entries: object[] = []) {
	return buildDocument({
		resourceType: 'Bundle',
		type: 'document',
		identifier: { value: 'bundle-id' },
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

const markdown = (d: ReturnType<typeof doc>) => exportMarkdown(d, ctx, { now: NOW });

describe('the Markdown export', () => {
	it('says "not stated" for everything a sparse patient leaves out', () => {
		const text = markdown(doc({}));
		expect(text).toContain('**Name:** Not stated');
		expect(text).toContain('**Gender:** Not stated');
		expect(text).toContain('**Identifiers:** Not stated');
		// No document date: no source line.
		expect(text).not.toMatch(/Source document/);
	});

	it('gives a deceased patient’s birth date without an age', () => {
		const text = markdown(doc({ birthDate: '1950-03-04', deceasedBoolean: true }));
		expect(text).toMatch(/\*\*Date of birth:\*\* Mar 4, 1950\n/);
	});

	it('writes an identifier without a system as its value alone, and with one by its type', () => {
		const text = markdown(
			doc({
				identifier: [
					{ value: 'A1' },
					{ system: 'urn:x', value: 'B2', type: { text: 'MRN' } },
					{ system: 'urn:y', value: 'C3' }
				]
			})
		);
		expect(text).toContain('A1; B2 (MRN); C3 (urn:y)');
	});

	it('names the attesters and the source document by its identifier', () => {
		const text = markdown(
			doc(
				{},
				{
					date: '2024-01-02',
					attester: [{ mode: 'legal', party: { reference: 'urn:uuid:org' } }]
				},
				[{ fullUrl: 'urn:uuid:org', resource: { resourceType: 'Organization', name: 'Clinic' } }]
			)
		);
		expect(text).toContain('Clinic (');
		expect(text).toContain('bundle-id');
	});

	it('is valid Markdown however sparse', () => {
		const text = markdown(doc({}));
		const result = lint({ strings: { text } });
		expect(result.text).toEqual([]);
	});
});
