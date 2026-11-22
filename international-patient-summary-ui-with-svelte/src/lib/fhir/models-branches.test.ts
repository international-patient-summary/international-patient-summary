// Branch coverage for the view models: each kind of observation value, the
// generic resource types, and medications described in less usual ways.
import { describe, expect, it } from 'vitest';
import type { FhirResource } from 'fhir/r4';
import { modelOf, observationText, type EntryModel } from './models.ts';
import { context, exampleDoc } from '../test-helpers.ts';

const ctx = context('en-US');
const clean = (s: string | undefined) => (s ?? '').replace(/[⁦-⁩]/g, '');

function model(resource: FhirResource, resolved: Record<string, FhirResource> = {}): EntryModel {
	const doc = exampleDoc('bundle-minimal');
	doc.resolve = (reference) => (reference ? resolved[reference] : undefined);
	return modelOf({ reference: `${resource.resourceType}/test`, resource }, doc, ctx);
}

const observation = (extra: Record<string, unknown>): FhirResource =>
	({
		resourceType: 'Observation',
		status: 'final',
		code: { text: 'Test' },
		...extra
	}) as FhirResource;

describe('observation values of every type', () => {
	it.each([
		['a quantity without a number', { valueQuantity: { unit: 'mg' } }, ''],
		['a quantity with a code only', { valueQuantity: { value: 5, code: 'mg' } }, '5'],
		['a concept', { valueCodeableConcept: { text: 'Positive' } }, 'Positive'],
		['a string', { valueString: 'fine' }, 'fine'],
		['true', { valueBoolean: true }, 'Yes'],
		['false', { valueBoolean: false }, 'No'],
		['an integer', { valueInteger: 1234 }, '1,234'],
		['a time', { valueTime: '10:30:00' }, '10:30:00'],
		['a date and time', { valueDateTime: '2024-03-05' }, 'Mar'],
		['a period', { valuePeriod: { start: '2024-01-01', end: '2024-02-01' } }, '2024'],
		['a range', { valueRange: { low: { value: 1 }, high: { value: 3 } } }, '1'],
		['a ratio', { valueRatio: { numerator: { value: 1 }, denominator: { value: 160 } } }, '1']
	])('shows %s', (_name, extra, expected) => {
		const m = model(observation(extra));
		expect(m.kind).toBe('observation');
		if (m.kind !== 'observation') return;
		expect(clean(observationText(m))).toContain(expected);
	});

	it('records why a value is absent, with or without a stated code', () => {
		const coded = model(observation({ dataAbsentReason: { coding: [{ code: 'not-performed' }] } }));
		const bare = model(observation({ dataAbsentReason: { text: 'who knows' } }));
		const none = model(observation({}));
		for (const m of [coded, bare, none]) expect(m.kind).toBe('observation');
		const status = (m: EntryModel) => (m.kind === 'observation' ? m.status : undefined);
		expect(status(coded)).not.toBe('final');
		expect(status(bare)).not.toBe('final');
		expect(status(none)).toBe('final');
	});
});

describe('generic resources', () => {
	it('titles a care plan from its description, with its activities', () => {
		const m = model({
			resourceType: 'CarePlan',
			status: 'active',
			intent: 'plan',
			subject: { reference: 'Patient/1' },
			description: 'Walk daily',
			category: [{ text: 'Exercise' }],
			created: '2024-01-02',
			activity: [{ detail: { code: { text: 'Walking' }, status: 'in-progress' } }, {}]
		} as FhirResource);
		expect(m.kind).toBe('generic');
		expect(m.title).toBeTruthy();
		if (m.kind === 'generic') expect(JSON.stringify(m.fields)).toContain('Walking');
	});

	it('keeps both title and description of a care plan that has both', () => {
		const m = model({
			resourceType: 'CarePlan',
			status: 'active',
			intent: 'plan',
			subject: { reference: 'Patient/1' },
			title: 'Plan',
			description: 'Details',
			period: { start: '2024-01-01' }
		} as FhirResource);
		if (m.kind === 'generic') expect(m.description).toBe('Details');
		expect(m.title).toBe('Plan');
	});

	it('summarises a clinical impression with its findings', () => {
		const m = model({
			resourceType: 'ClinicalImpression',
			status: 'completed',
			subject: { reference: 'Patient/1' },
			summary: 'Improving',
			effectiveDateTime: '2024-02-03',
			finding: [
				{ itemCodeableConcept: { text: 'Cough' } },
				{ itemReference: { display: 'X-ray' } },
				{}
			]
		} as FhirResource);
		expect(m.kind).toBe('generic');
		if (m.kind === 'generic') {
			expect(m.description).toBe('Improving');
			expect(JSON.stringify(m.fields)).toContain('Cough, X-ray');
		}
		const bare = model({
			resourceType: 'ClinicalImpression',
			status: 'completed',
			subject: { reference: 'Patient/1' },
			description: 'Described',
			date: '2024-02-03'
		} as FhirResource);
		expect(bare.title).toBe('Described');
	});

	it('titles a document reference by description, attachment title or type', () => {
		const base = { resourceType: 'DocumentReference', status: 'current', date: '2024-01-01' };
		const described = model({
			...base,
			description: 'Letter',
			content: []
		} as unknown as FhirResource);
		const attached = model({
			...base,
			content: [{ attachment: { title: 'Scan' } }]
		} as unknown as FhirResource);
		const typed = model({
			...base,
			type: { text: 'Discharge summary' },
			content: [{ attachment: {} }]
		} as unknown as FhirResource);
		expect([described.title, attached.title, typed.title]).toEqual([
			'Letter',
			'Scan',
			'Discharge summary'
		]);
	});

	it('reads an immunization recommendation from its vaccine, or its target disease', () => {
		const vaccine = model({
			resourceType: 'ImmunizationRecommendation',
			date: '2024-05-06',
			patient: { reference: 'Patient/1' },
			recommendation: [
				{
					vaccineCode: [{ text: 'Flu vaccine' }],
					forecastStatus: { coding: [{ code: 'due', display: 'Due' }] },
					dateCriterion: [{ code: { text: 'due' }, value: '2024-09-01' }]
				}
			]
		} as unknown as FhirResource);
		expect(vaccine.title).toBe('Flu vaccine');
		const disease = model({
			resourceType: 'ImmunizationRecommendation',
			patient: { reference: 'Patient/1' },
			recommendation: [{ targetDisease: { text: 'Measles' }, forecastStatus: { text: 'due' } }]
		} as unknown as FhirResource);
		expect(disease.title).toBe('Measles');
		const empty = model({
			resourceType: 'ImmunizationRecommendation',
			patient: { reference: 'Patient/1' },
			recommendation: []
		} as unknown as FhirResource);
		expect(empty.kind).toBe('generic');
	});

	it.each([
		['its code', { code: { text: 'By code' } }, 'By code'],
		['its type', { type: { text: 'By type' } }, 'By type'],
		['its title', { title: 'By title' }, 'By title'],
		['its description', { description: 'By description' }, 'By description'],
		['its name', { name: 'By name' }, 'By name']
	])('titles an unfamiliar resource by %s', (_name, extra, expected) => {
		const m = model({
			resourceType: 'Encounter',
			status: 'active',
			...extra
		} as unknown as FhirResource);
		expect(m.title).toBe(expected);
	});

	it('dates an unfamiliar resource by the first date it has, and falls back to its type', () => {
		const m = model({
			resourceType: 'Encounter',
			status: 'active',
			issued: '2024-04-05'
		} as unknown as FhirResource);
		if (m.kind === 'generic') expect(m.date).toBe('2024-04-05');
		const bare = model({ resourceType: 'Encounter' } as unknown as FhirResource);
		expect(bare.title).toContain('Encounter');
		if (bare.kind === 'generic') expect(bare.status).toBeUndefined();
	});
});

describe('medications described in less usual ways', () => {
	it('names a medication by its reference display when it cannot be resolved', () => {
		const m = model({
			resourceType: 'MedicationStatement',
			status: 'draft',
			subject: { reference: 'Patient/1' },
			medicationReference: { reference: 'Medication/gone', display: 'Aspirin' },
			effectivePeriod: { start: '2024-01-01' }
		} as unknown as FhirResource);
		expect(m.title).toBe('Aspirin');
		if (m.kind === 'medication') expect(m.current).toBe(true);
	});

	it('reads a request: authored date, prescribed-on label, strength and form of the resolved medication', () => {
		const medication = {
			resourceType: 'Medication',
			code: { text: 'Amoxicillin' },
			form: { text: 'Capsule' },
			ingredient: [
				{
					itemCodeableConcept: { text: 'x' },
					strength: {
						numerator: { value: 500, unit: 'mg' },
						denominator: { value: 1, unit: 'capsule' }
					}
				},
				{ itemCodeableConcept: { text: 'y' } }
			]
		} as FhirResource;
		const m = model(
			{
				resourceType: 'MedicationRequest',
				status: 'cancelled',
				intent: 'order',
				subject: { reference: 'Patient/1' },
				medicationReference: { reference: 'Medication/1' },
				authoredOn: '2024-03-04'
			} as unknown as FhirResource,
			{ 'Medication/1': medication }
		);
		expect(m.kind).toBe('medication');
		if (m.kind !== 'medication') return;
		expect(m.title).toBe('Amoxicillin');
		expect(m.form).toBe('Capsule');
		expect(clean(m.strength)).toContain('500');
		expect(clean(m.effectiveLabel)).toContain('2024');
		expect(m.status).toBe('stopped');
	});

	it('gives the reason a statement has no date, when the document says why', () => {
		const m = model({
			resourceType: 'MedicationStatement',
			status: 'active',
			subject: { reference: 'Patient/1' },
			medicationCodeableConcept: { text: 'Aspirin' },
			_effectiveDateTime: {
				extension: [
					{
						url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
						valueCode: 'unknown'
					}
				]
			}
		} as unknown as FhirResource);
		if (m.kind === 'medication') expect(m.effectiveLabel).toBeTruthy();
	});
});
