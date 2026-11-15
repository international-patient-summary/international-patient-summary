import { describe, expect, it } from 'vitest';
import { sectionModels, stateLabel, type EntryModel } from './models.ts';
import { context, exampleDoc, fixtureDoc } from '../test-helpers.ts';

const ctx = context('en-US');
function models(name: string, key: string): EntryModel[] {
	const doc = exampleDoc(name);
	return sectionModels(
		doc.sections.find((s) => s.key === key)!,
		doc,
		ctx
	);
}

describe('view models', () => {
	it('maps an allergy with words for every status', () => {
		const [a] = models('IPS-examples-Bundle-01', 'allergies');
		expect(a.kind).toBe('allergy');
		if (a.kind !== 'allergy') return;
		expect(a.title).toBeTruthy();
		if (a.criticality) expect(a.criticalityLabel).toBeTruthy();
		if (a.clinicalStatus) expect(a.clinicalStatusLabel).toBeTruthy();
	});

	it('resolves a referenced Medication for its name', () => {
		const meds = models('IPS-examples-Bundle-01', 'medications');
		expect(meds.length).toBeGreaterThan(0);
		for (const m of meds) expect(m.title).not.toBe('Not stated');
	});

	it('maps every entry of every section in bundle-ips-all-sections', () => {
		const doc = exampleDoc('bundle-ips-all-sections');
		for (const s of doc.sections) {
			for (const m of sectionModels(s, doc, ctx)) {
				expect(m.title, `${s.key} ${m.id}`).toBeTruthy();
				expect(m.fields.length, `${s.key} ${m.id}`).toBeGreaterThan(0);
			}
		}
	});

	it('reads a blood pressure panel as components', () => {
		const vitals = models('bundle-ips-all-sections', 'vitalSigns');
		const bp = vitals.find((m) => m.kind === 'observation' && m.components.length === 2);
		expect(bp).toBeDefined();
	});

	it('finds the device through DeviceUseStatement.device', () => {
		const [d] = models('bundle-ips-all-sections', 'devices');
		expect(d.kind).toBe('device');
		expect(d.title).toMatch(/Hip prosthesis/);
	});

	it('says each empty state in distinct words', () => {
		const doc = exampleDoc('bundle-no-info-required-sections');
		const allergies = doc.sections.find((s) => s.key === 'allergies')!;
		expect(stateLabel(allergies, ctx.t)).toBe('Information unavailable — No information available');
		const omitted = fixtureDoc('missing-allergies.json').sections.find(
			(s) => s.key === 'allergies'
		)!;
		expect(stateLabel(omitted, ctx.t)).toBe('Section missing from document');
	});
});
