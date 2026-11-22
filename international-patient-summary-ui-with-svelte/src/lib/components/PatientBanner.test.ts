import { render } from '@testing-library/svelte';
import { locale, waitLocale } from '@sveltia/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import PatientBanner from './PatientBanner.svelte';
import type { IpsDocument, SectionKey, SectionState } from '../fhir/types.ts';
import { setupI18n } from '../i18n.ts';
import { exampleDoc } from '../test-helpers.ts';

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

const text = (el: Element) => (el.textContent ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ');

/** The all-sections example with one section changed. */
function withSection(
	key: SectionKey,
	change: { state?: SectionState; entries?: [] } | 'remove'
): IpsDocument {
	const doc = exampleDoc('bundle-ips-all-sections');
	const sections =
		change === 'remove'
			? doc.sections.filter((s) => s.key !== key)
			: doc.sections.map((s) => (s.key === key ? { ...s, ...change } : s));
	return { ...doc, sections };
}

describe('PatientBanner danger box states', () => {
	it('says there are no active alerts when the section is known but none is active', () => {
		const { container } = render(PatientBanner, {
			doc: withSection('alerts', { state: 'known', entries: [] })
		});
		const list = container.querySelectorAll('.patient-danger-group')[1];
		expect(list.querySelector('.record-list')?.getAttribute('data-status')).toBe('none-known');
		expect(text(list)).toContain('No active alerts');
	});

	it('gives the reason when the alerts section is not recorded or unavailable', () => {
		for (const state of ['not-recorded', 'unavailable'] as const) {
			const { container, unmount } = render(PatientBanner, {
				doc: withSection('alerts', { state, entries: [] })
			});
			const list = container.querySelectorAll('.patient-danger-group')[1];
			expect(list.querySelector('.record-list')?.getAttribute('data-status')).toBe(state);
			unmount();
		}
	});

	it('shows no alerts group when the document has no alerts section', () => {
		const { container } = render(PatientBanner, { doc: withSection('alerts', 'remove') });
		expect(container.querySelectorAll('.patient-danger-group').length).toBe(1);
	});

	it('says allergies are omitted when the document has no allergies section', () => {
		const { container } = render(PatientBanner, { doc: withSection('allergies', 'remove') });
		const list = container.querySelector('.allergy-record-list')!;
		expect(list.getAttribute('data-status')).toBe('omitted');
		expect(text(list)).toContain('Section missing from document');
	});

	it('says none are known when a known allergies section has no active allergy', () => {
		const { container } = render(PatientBanner, {
			doc: withSection('allergies', { state: 'known', entries: [] })
		});
		expect(container.querySelector('.allergy-record-list')?.getAttribute('data-status')).toBe(
			'none-known'
		);
	});
});
