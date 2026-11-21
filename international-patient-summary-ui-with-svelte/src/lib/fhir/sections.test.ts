// The viewer's section registry against Lily's (`ips-sections`, svelte-headless
// 0.10): the same sixteen IPS 2.0.1 sections, codes and levels, in the same order.
// Lily names the keys in kebab-case; the viewer's are camelCase.
import {
	IPS_REQUIRED_SECTIONS,
	IPS_SECTIONS,
	ipsMissingRequired
} from '@lilydesignsystem/svelte-headless';
import { describe, expect, it } from 'vitest';
import { SECTIONS } from './sections.ts';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('the section registry', () => {
	it('is the registry Lily publishes: same sections, codes, levels and order', () => {
		expect(SECTIONS.map((s) => ({ key: kebab(s.key), code: s.code, level: s.level }))).toEqual(
			IPS_SECTIONS.map((s) => ({ key: s.key, code: s.code, level: s.level }))
		);
	});

	it('requires the same three sections', () => {
		expect(SECTIONS.filter((s) => s.level === 'required').map((s) => kebab(s.key))).toEqual(
			IPS_REQUIRED_SECTIONS
		);
		expect(ipsMissingRequired([{ key: 'allergies' }])).toEqual(['medications', 'problems']);
	});
});
