// Branch coverage for the section and banner components: entries marked in
// error, immunizations with a lot and performer, generic entries with extra
// fields, a section titled differently by its document, and a sparse banner.
import { render } from '@testing-library/svelte';
import { locale, waitLocale } from '@sveltia/i18n';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import PatientBanner from './PatientBanner.svelte';
import SectionView from './SectionView.svelte';
import { buildDocument } from '../fhir/composition.ts';
import { setupI18n } from '../i18n.ts';
import { viewer } from '../state.svelte.ts';

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

beforeEach(() => {
	viewer.clear();
	viewer.showCodes = false;
});

const text = (el: Element) => (el.textContent ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ');

/** A document with one section (`loinc`, `title`) listing `resources`, and `patient`. */
function doc(loinc: string, resources: object[], patient: object = {}, title = 'Section') {
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
					section: [
						{
							title,
							code: { coding: [{ system: 'http://loinc.org', code: loinc }] },
							entry: resources.map((_, i) => ({ reference: `urn:uuid:r${i}` }))
						}
					]
				}
			},
			{ fullUrl: 'urn:uuid:p', resource: { resourceType: 'Patient', ...patient } },
			...resources.map((resource, i) => ({ fullUrl: `urn:uuid:r${i}`, resource }))
		]
	});
}

function renderSection(d: ReturnType<typeof doc>) {
	const section = d.sections.find((s) => s.present)!;
	return render(SectionView, { section, doc: d }).container;
}

describe('EntryList', () => {
	it('marks a problem entered in error', () => {
		const container = renderSection(
			doc('11450-4', [
				{
					resourceType: 'Condition',
					code: { text: 'Mistake' },
					verificationStatus: { coding: [{ code: 'entered-in-error' }] }
				}
			])
		);
		expect(container.querySelector('.entered-in-error')).not.toBeNull();
	});

	it('shows an immunization’s lot number and performer', () => {
		const container = renderSection(
			doc('11369-6', [
				{
					resourceType: 'Immunization',
					status: 'completed',
					vaccineCode: { text: 'MMR' },
					occurrenceDateTime: '2010-01-01',
					lotNumber: 'LOT-9',
					performer: [{ actor: { display: 'Nurse Example' } }]
				}
			])
		);
		expect(text(container)).toContain('LOT-9');
		expect(text(container)).toContain('Nurse Example');
	});

	it('lists a generic entry’s extra fields', () => {
		const container = renderSection(
			doc('18776-5', [
				{
					resourceType: 'CarePlan',
					status: 'active',
					intent: 'plan',
					subject: { reference: 'urn:uuid:p' },
					title: 'Plan',
					activity: [{ detail: { code: { text: 'Walking' } } }]
				}
			])
		);
		expect(text(container)).toContain('Walking');
	});
});

describe('SectionView', () => {
	it('shows the document’s own section title when it differs, and its code when asked', async () => {
		viewer.showCodes = true;
		const container = renderSection(doc('11450-4', [], {}, 'My problems'));
		expect(text(container)).toContain('“My problems”');
		const code = container.querySelector('.ips-section-code')!;
		expect(code.hasAttribute('hidden')).toBe(false);
		expect(text(code)).toContain('11450-4');
	});
});

describe('PatientBanner', () => {
	it('says the name is not stated, and shows an identifier without a system plainly', () => {
		const { container } = render(PatientBanner, {
			doc: doc('11450-4', [], { identifier: [{ value: 'A1' }] })
		});
		expect(text(container.querySelector('.patient-name')!)).toBe('Not stated');
		expect(container.querySelector('.patient-identifier-system')).toBeNull();
		expect(text(container)).toContain('A1');
	});
});
