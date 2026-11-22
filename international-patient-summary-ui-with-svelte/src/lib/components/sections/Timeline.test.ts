import { render } from '@testing-library/svelte';
import { locale, waitLocale } from '@sveltia/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import Timeline from './Timeline.svelte';
import { setupI18n } from '../../i18n.ts';
import { exampleDoc } from '../../test-helpers.ts';

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

describe('Timeline', () => {
	it('lists an entry that is neither a procedure nor an immunization as not recorded', () => {
		const doc = exampleDoc('bundle-ips-all-sections');
		const section = doc.sections.find((s) => s.key === 'allergies')!;
		const { container } = render(Timeline, { section, doc, title: 'Allergies' });
		const items = container.querySelectorAll('.timeline-list-item');
		expect(items.length).toBe(section.entries.length);
		expect(items.length).toBeGreaterThan(0);
		expect(container.textContent).toContain('Date not recorded');
		expect(container.querySelector('.timeline-list-item > time[datetime]')).toBeNull();
	});
});
