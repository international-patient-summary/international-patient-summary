// Branch coverage for the one-page PDF's header and footer: a sparse
// patient, a deceased one, identifiers with and without a system, and a
// document without a date.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportPdf, type PdfDeps } from './pdf.ts';
import { buildDocument } from '../fhir/composition.ts';
import { context } from '../test-helpers.ts';

const FONTS = join(import.meta.dirname, '..', '..', '..', 'static', 'fonts');
const NOW = new Date('2026-11-15T12:00:00Z');

async function deps(): Promise<PdfDeps> {
	const module = await import('pdfmake/build/pdfmake.js');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pdfMake = ((module as any).default ?? module) as PdfDeps['pdfMake'];
	return { pdfMake, loadFont: async (file) => readFileSync(join(FONTS, file)).toString('base64') };
}

async function textOf(patient: object, composition: object = {}): Promise<string> {
	const doc = buildDocument({
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
			{ fullUrl: 'urn:uuid:p', resource: { resourceType: 'Patient', ...patient } }
		]
	});
	const result = await exportPdf(doc, context('en-US'), { title: 'x.pdf', now: NOW }, await deps());
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const pdf = await pdfjs.getDocument({ data: result.bytes.slice(), useSystemFonts: false })
		.promise;
	const content = await (await pdf.getPage(1)).getTextContent();
	return content.items
		.map((item) => ('str' in item ? item.str : ''))
		.join(' ')
		.replace(/\s+/g, ' ');
}

describe('the PDF header and footer', () => {
	it('says "not stated" for a sparse patient, and gives no source date without one', async () => {
		const text = await textOf({});
		expect(text.match(/Not stated/g)?.length).toBeGreaterThanOrEqual(4);
		expect(text).not.toContain('Source document');
	});

	it('marks a deceased patient and gives the birth date without an age', async () => {
		const text = await textOf({
			name: [{ given: ['Pat'], family: 'Example' }],
			birthDate: '1950-03-04',
			deceasedBoolean: true,
			identifier: [{ value: 'A1' }]
		});
		expect(text).toContain('Pat Example');
		expect(text).toContain('Mar 4, 1950');
		expect(text).not.toMatch(/Mar 4, 1950 \(/);
		expect(text).toContain('Deceased');
		expect(text).toContain('A1');
		expect(text).not.toContain('A1 (');
	});

	it('names the first identifier by its type', async () => {
		const text = await textOf({
			identifier: [{ system: 'urn:x', value: 'B2', type: { text: 'MRN' } }]
		});
		expect(text).toContain('B2 (MRN)');
	});
});
