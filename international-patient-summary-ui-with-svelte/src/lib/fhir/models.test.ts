import { describe, expect, it } from 'vitest';
import type { FhirResource } from 'fhir/r4';
import {
	meterOf,
	modelOf,
	observationText,
	sectionModels,
	stateLabel,
	type EntryModel,
	type ObservationModel,
	type ReportModel
} from './models.ts';
import { context, exampleDoc, fixtureDoc } from '../test-helpers.ts';
import type { IpsSection } from './types.ts';

const ctx = context('en-US');
function models(name: string, key: string): EntryModel[] {
	const doc = exampleDoc(name);
	return sectionModels(
		doc.sections.find((s) => s.key === key)!,
		doc,
		ctx
	);
}

function model(resource: FhirResource, resolved: Record<string, FhirResource> = {}): EntryModel {
	const doc = exampleDoc('bundle-minimal');
	doc.resolve = (reference) => (reference ? resolved[reference] : undefined);
	return modelOf({ reference: `${resource.resourceType}/test`, resource }, doc, ctx);
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

	it('groups a DiagnosticReport result instead of showing its Observation twice', () => {
		const observation = {
			resourceType: 'Observation',
			id: 'result',
			status: 'final',
			code: { text: 'Blood glucose' },
			valueInteger: 7
		} as FhirResource;
		const report = {
			resourceType: 'DiagnosticReport',
			id: 'report',
			status: 'amended',
			code: { text: 'Laboratory report' },
			effectiveDateTime: '2026-11-15',
			result: [{ reference: 'Observation/result' }],
			conclusion: 'Reviewed'
		} as FhirResource;
		const doc = exampleDoc('bundle-minimal');
		doc.resolve = (reference) => (reference === 'Observation/result' ? observation : undefined);
		const section: IpsSection = {
			...doc.sections[0],
			entries: [
				{ reference: 'DiagnosticReport/report', resource: report },
				{ reference: 'Observation/result', resource: observation }
			]
		};
		const grouped = sectionModels(section, doc, ctx);
		expect(grouped).toHaveLength(1);
		expect(grouped[0].kind).toBe('report');
		const result = grouped[0] as ReportModel;
		expect(result.results[0].value).toBe('7');
		expect(result).toMatchObject({
			statusLabel: 'Amended',
			effectiveLabel: 'Nov 15, 2026',
			conclusion: 'Reviewed'
		});
	});

	it('maps uncommon Observation value and reference-range forms', () => {
		const observation = (fields: Record<string, unknown>) =>
			model({
				resourceType: 'Observation',
				status: 'registered',
				code: { text: 'Test' },
				...fields
			} as unknown as FhirResource) as ObservationModel;

		expect(observation({ valueBoolean: false }).value).toBe('No');
		expect(observation({ valueInteger: 1234 }).value).toMatch(/1,234/);
		expect(observation({ valueQuantity: { unit: 'mg' } }).value).toBe('mg');
		expect(
			observation({
				valueString: 'high',
				interpretation: [{ coding: [{ code: 'HH', display: 'Critical high' }] }],
				referenceRange: [{ low: { value: 3, unit: 'mg' }, high: { value: 5, unit: 'mg' } }]
			})
		).toMatchObject({ range: '3 mg to 5 mg', interpretation: 'HH', flagLabel: 'Critically high' });
		expect(
			observation({ valueString: 'low', referenceRange: [{ low: { value: 3, unit: 'mg' } }] }).range
		).toBe('At least 3 mg');
		expect(
			observation({ valueString: 'high', referenceRange: [{ high: { value: 5, unit: 'mg' } }] })
				.range
		).toBe('At most 5 mg');
		expect(observation({ valueString: 'x', referenceRange: [{}] }).range).toBeUndefined();
	});

	it('maps ClinicalImpression, DocumentReference and ImmunizationRecommendation generically', () => {
		const impression = model({
			resourceType: 'ClinicalImpression',
			status: 'completed',
			code: { text: 'Clinical assessment' },
			summary: 'Stable',
			effectiveDateTime: '2026-11-15',
			finding: [{ itemCodeableConcept: { text: 'Finding one' } }]
		} as FhirResource);
		expect(impression).toMatchObject({
			kind: 'generic',
			title: 'Clinical assessment',
			description: 'Stable',
			date: '2026-11-15'
		});
		expect(impression.fields.some((field) => field.value === 'Finding one')).toBe(true);

		const document = model({
			resourceType: 'DocumentReference',
			status: 'current',
			description: 'Advance directive',
			date: '2026-10-01',
			content: [{ attachment: { title: 'Directive PDF' } }]
		} as FhirResource);
		expect(document).toMatchObject({ title: 'Advance directive', date: '2026-10-01' });

		const recommendation = model({
			resourceType: 'ImmunizationRecommendation',
			date: '2026-09-01',
			patient: {},
			recommendation: [
				{
					vaccineCode: [{ text: 'Influenza vaccine' }],
					forecastStatus: { coding: [{ code: 'due', display: 'Due' }] },
					dateCriterion: [{ code: {}, value: '2026-10-01' }]
				}
			]
		} as FhirResource);
		expect(recommendation).toMatchObject({
			title: 'Influenza vaccine',
			status: 'due',
			description: 'Due',
			date: '2026-10-01'
		});
	});

	it('falls back safely for an otherwise unknown resource shape', () => {
		const fallback = model({
			resourceType: 'Basic',
			code: { text: 'Basic record' },
			subject: {},
			status: 'entered-in-error',
			effectiveDateTime: '2026-08-20'
		} as unknown as FhirResource);
		expect(fallback).toMatchObject({
			kind: 'generic',
			title: 'Basic record',
			status: 'entered-in-error',
			date: '2026-08-20',
			enteredInError: true
		});
	});

	it('uses absent-entry clinical words and unresolved-reference wording', () => {
		const doc = exampleDoc('bundle-minimal');
		const base = doc.sections.find((section) => section.key === 'allergies')!;
		const absent = {
			...base,
			state: 'none-known' as const,
			absentEntries: [
				{
					reference: 'MedicationStatement/none',
					resource: {
						resourceType: 'MedicationStatement',
						status: 'unknown',
						medicationCodeableConcept: { text: 'No known medicines' },
						subject: {}
					} as FhirResource
				}
			]
		};
		expect(stateLabel(absent, ctx.t)).toBe('None known: No known medicines');
		expect(
			stateLabel({ ...base, state: 'unavailable', absentEntries: [], unresolved: ['x'] }, ctx.t)
		).toBe('The entries could not be found in the document.');
	});
});

describe('model fallbacks', () => {
	const doc = fixtureDoc('edge-models.json');
	const ctx = context('en-US');
	const modelsOf = (key: string) =>
		sectionModels(
			doc.sections.find((s) => s.key === key)!,
			doc,
			ctx
		);

	it('finds the severity on a later reaction when the first has none', () => {
		const [allergy] = modelsOf('allergies');
		expect(JSON.stringify(allergy)).toContain('severe');
	});

	it('writes each ingredient strength of a referenced medication, joined', () => {
		const [medication] = modelsOf('medications');
		expect(JSON.stringify(medication)).toContain('Compound cream');
		expect(JSON.stringify(medication)).toMatch(/1.*g.*\+.*5.*g/s);
	});

	it('words a masked result and an unknown reason as unavailable', () => {
		const [masked, other] = modelsOf('results');
		expect(masked).toMatchObject({ kind: 'observation', status: 'masked' });
		expect(other).toMatchObject({ kind: 'observation', status: 'unavailable' });
		expect(observationText(masked as never)).toBe((masked as { statusLabel?: string }).statusLabel);
	});

	it('names an absent entry by the concept of its resource, whatever its type', () => {
		const t = ctx.t;
		const entry = (resource: unknown) => ({ resource }) as never;
		const section = (resources: unknown[]) =>
			({
				key: 'problems',
				state: 'none-known',
				narrativeOnly: false,
				absentEntries: resources.map(entry),
				unresolved: []
			}) as unknown as IpsSection;
		const label = stateLabel(
			section([
				{ resourceType: 'Condition', code: { text: 'No known problems' } },
				{
					resourceType: 'MedicationRequest',
					medicationCodeableConcept: { text: 'No known medication' }
				},
				{ resourceType: 'Immunization', vaccineCode: { text: 'No known vaccines' } },
				{ resourceType: 'Device', type: { text: 'ignored' } }
			]),
			t
		);
		expect(label).toContain('No known problems');
		expect(label).toContain('No known medication');
		expect(label).toContain('No known vaccines');
		expect(label).not.toContain('ignored');
	});
});

describe('meterOf', () => {
	const obs = (value: unknown, range: unknown) =>
		({
			resourceType: 'Observation',
			valueQuantity: value,
			referenceRange: range ? [range] : undefined
		}) as never;

	it('scales a two-sided range with half a range either side, and always holds the value', () => {
		expect(
			meterOf(
				obs(
					{ value: 5, unit: 'mmol/L' },
					{ low: { value: 4, unit: 'mmol/L' }, high: { value: 6, unit: 'mmol/L' } }
				)
			)
		).toEqual({ value: 5, min: 3, max: 7, low: 4, high: 6 });
		expect(
			meterOf(
				obs(
					{ value: 20, unit: 'g' },
					{ low: { value: 4, unit: 'g' }, high: { value: 6, unit: 'g' } }
				)
			)?.max
		).toBe(20);
		expect(
			meterOf(
				obs(
					{ value: -5, unit: 'g' },
					{ low: { value: 4, unit: 'g' }, high: { value: 6, unit: 'g' } }
				)
			)?.min
		).toBe(-5);
	});

	it('scales a one-sided range from zero', () => {
		expect(meterOf(obs({ value: 2, unit: 'g' }, { high: { value: 4, unit: 'g' } }))).toEqual({
			value: 2,
			min: 0,
			max: 6,
			low: undefined,
			high: 4
		});
		expect(meterOf(obs({ value: 9, unit: 'g' }, { low: { value: 4, unit: 'g' } }))).toMatchObject({
			min: 0,
			max: 9,
			low: 4
		});
		expect(
			meterOf(obs({ value: 0, unit: 'g' }, { high: { value: 0.1, unit: 'g' } }))
		).toMatchObject({ max: 1.1 });
	});

	it('draws nothing without a number, a numeric range, or the same unit', () => {
		expect(meterOf(obs({ value: 5, unit: 'g' }, undefined))).toBeUndefined();
		expect(meterOf(obs(undefined, { low: { value: 1 } }))).toBeUndefined();
		expect(meterOf(obs({ value: Number.NaN }, { low: { value: 1 } }))).toBeUndefined();
		expect(meterOf(obs({ value: 5, unit: 'g' }, { text: 'normal' }))).toBeUndefined();
		expect(
			meterOf(obs({ value: 5, unit: 'g' }, { low: { value: 6 }, high: { value: 4 } }))
		).toBeUndefined();
		expect(
			meterOf(obs({ value: 5, unit: 'g' }, { low: { value: 1, unit: 'mg' } }))
		).toBeUndefined();
		expect(meterOf(obs({ value: 5, unit: 'g' }, { high: { value: 9, code: 'g' } }))).toBeDefined();
	});
});
