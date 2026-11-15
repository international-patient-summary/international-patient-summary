// Component tests (spec §9): the banner, the section renderers, the three
// absent states, and the loader's error paths, against the IG fixtures.
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { locale, waitLocale } from '@sveltia/i18n';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ErrorList from './ErrorList.svelte';
import PatientBanner from './PatientBanner.svelte';
import SectionView from './SectionView.svelte';
import Viewer from './Viewer.svelte';
import { setupI18n } from '../i18n.ts';
import { viewer } from '../state.svelte.ts';
import { exampleDoc, fixtureDoc } from '../test-helpers.ts';

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

beforeEach(async () => {
	await locale.set('en-US');
	viewer.showCodes = false;
});

const text = (el: Element) => (el.textContent ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ');

describe('PatientBanner', () => {
	it('shows identity and puts allergies in the danger box, never collapsed', () => {
		const doc = exampleDoc('IPS-examples-Bundle-01');
		const { container } = render(PatientBanner, { doc });
		expect(text(container.querySelector('.patient-name')!)).toBe('Martha DeLarosa');
		expect(text(container)).toContain('574687583');
		const danger = container.querySelector('.medical-banner-box-for-danger')!;
		expect(danger.closest('details')).toBeNull();
		const item = danger.querySelector('.allergy-record-list-item')!;
		expect(item.getAttribute('data-criticality')).toBe('high');
		expect(text(item)).toContain('High risk');
	});

	it('says why allergies are not listed when the section is unavailable', () => {
		const { container } = render(PatientBanner, {
			doc: exampleDoc('bundle-no-info-required-sections')
		});
		const list = container.querySelector('.allergy-record-list')!;
		expect(list.getAttribute('data-status')).toBe('unavailable');
		expect(text(list)).toContain('Information unavailable');
	});

	it('shows active alerts from the Alerts section', () => {
		const { container } = render(PatientBanner, { doc: exampleDoc('bundle-ips-all-sections') });
		expect(text(container.querySelector('.patient-danger')!)).toContain('Shellfish free diet');
	});
});

describe('SectionView and the absent states', () => {
	it.each([
		['bundle-no-info-required-sections', 'allergies', 'unavailable', 'Information unavailable'],
		['bundle-minimal', 'allergies', null, null]
	])('%s %s', (name, key, state, words) => {
		const doc = exampleDoc(name);
		const section = doc.sections.find((s) => s.key === key)!;
		const { container } = render(SectionView, { section, doc });
		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
			'Allergies and intolerances'
		);
		if (state) {
			expect(container.querySelector(`[data-status="${state}"]`)).not.toBeNull();
			expect(text(container)).toContain(words!);
		}
	});

	it('labels an omitted required section in words', () => {
		const doc = fixtureDoc('missing-allergies.json');
		const section = doc.sections.find((s) => s.key === 'allergies')!;
		const { container } = render(SectionView, { section, doc });
		expect(container.querySelector('[data-status="omitted"]')).not.toBeNull();
		expect(text(container)).toContain('Section missing from document');
	});

	it('renders each section of bundle-ips-all-sections with its Lily component', () => {
		const doc = exampleDoc('bundle-ips-all-sections');
		const expected: Record<string, string> = {
			medications: '.medication-record-list-item .medication-view',
			allergies: '.allergy-record-list-item',
			problems: '.problem-record-list-item',
			immunizations: '.immunization-record-list-item',
			results: 'table .observation-view',
			procedures: '.procedure-record-list-item',
			devices: '.device-record-list-item',
			vitalSigns: 'table .observation-view',
			pastIllness: '.problem-record-list-item',
			functionalStatus: '.problem-record-list-item',
			planOfCare: '.record-list-item',
			socialHistory: 'table .observation-view',
			pregnancy: 'table .observation-view',
			advanceDirectives: '.medical-banner-box-for-advice .record-list-item',
			alerts: '.record-list-item',
			patientStory: '.record-list-item'
		};
		for (const section of doc.sections) {
			const { container, unmount } = render(SectionView, { section, doc });
			expect(container.querySelector(expected[section.key]), section.key).not.toBeNull();
			unmount();
		}
	});

	it('warns inline about an entry that is not in the document', () => {
		const doc = fixtureDoc('broken-reference.json');
		const section = doc.sections.find((s) => s.unresolved.length > 0)!;
		const { container } = render(SectionView, { section, doc });
		expect(text(container.querySelector('.warning-text')!)).toContain('could not be found');
	});

	it('sanitises narrative before display', () => {
		const doc = fixtureDoc('hostile-narrative.json');
		const { container } = render(SectionView, { section: doc.sections[0], doc });
		const narrative = container.querySelector('.narrative-body')!;
		expect(narrative.querySelector('script')).toBeNull();
		expect(narrative.innerHTML).not.toMatch(/onclick|javascript:/);
	});
});

describe('Timeline view', () => {
	it('lists immunizations newest first as a Lily TimelineList', async () => {
		const user = userEvent.setup();
		const doc = exampleDoc('bundle-ips-all-sections');
		const section = doc.sections.find((s) => s.key === 'immunizations')!;
		const { container } = render(SectionView, { section, doc });
		expect(container.querySelector('.timeline-list')).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Show as timeline' }));
		const times = [...container.querySelectorAll('.timeline-list-item > time')].map(
			(t) => t.getAttribute('datetime') ?? ''
		);
		expect(times.length).toBe(section.entries.length);
		expect([...times].sort().reverse()).toEqual(times);
	});
});

describe('Viewer', () => {
	it('reveals codes only when Show codes is pressed', async () => {
		const user = userEvent.setup();
		const { container } = render(Viewer, { doc: exampleDoc('IPS-examples-Bundle-01') });
		const codes = container.querySelector<HTMLElement>('.entry-codes')!;
		expect(codes.hidden).toBe(true);
		await user.click(screen.getByRole('button', { name: 'Show codes' }));
		expect(codes.hidden).toBe(false);
	});

	it('lists every section in the contents, in document order', () => {
		const doc = exampleDoc('bundle-ips-all-sections');
		render(Viewer, { doc });
		const nav = screen.getByRole('navigation', { name: 'Contents' });
		expect(within(nav).getAllByRole('link').length).toBe(doc.sections.length);
	});
});

describe('ErrorList', () => {
	it.each([
		['en-US', 'There is a problem', 'not valid JSON'],
		['cy-001', null, null]
	])('focuses the summary and words it in %s', async (tag, title, message) => {
		await locale.set(tag);
		await waitLocale();
		const { container } = render(ErrorList, {
			errors: [{ key: 'load.errors.invalidJson', line: 3, column: 5 }]
		});
		const summary = container.querySelector<HTMLElement>('.error-summary')!;
		expect(document.activeElement).toBe(summary);
		if (title) expect(text(summary)).toContain(title);
		if (message) expect(text(summary)).toContain(message);
		if (tag === 'cy-001') expect(text(summary)).not.toContain('There is a problem');
		expect(text(summary)).toMatch(/3/);
	});
});
