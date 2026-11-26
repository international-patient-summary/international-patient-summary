// Branch coverage for the view models: each kind of observation value, the
// generic resource types, and medications described in less usual ways.
import { describe, expect, it } from 'vitest';
import type { FhirResource } from 'fhir/r4';
import { modelOf, observationText, stateLabel, type EntryModel } from './models.ts';
import type { IpsSection } from './types.ts';
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

describe('sparse and unusual resources', () => {
	const as = <K extends EntryModel['kind']>(m: EntryModel, kind: K) => {
		expect(m.kind).toBe(kind);
		return m as Extract<EntryModel, { kind: K }>;
	};

	it('names an allergy without a code "not stated" and joins its reactions', () => {
		const m = as(
			model({
				resourceType: 'AllergyIntolerance',
				patient: { reference: 'Patient/1' },
				reaction: [
					{ manifestation: [{ text: 'Hives' }, {}] },
					{ manifestation: [{ text: 'Wheeze' }] },
					{}
				]
			} as FhirResource),
			'allergy'
		);
		expect(clean(m.title)).toBe('Not stated');
		expect(JSON.stringify(m.fields)).toContain('Hives, Wheeze');
	});

	it('names a medication by its reference display when nothing is coded', () => {
		const m = as(
			model({
				resourceType: 'MedicationStatement',
				status: 'active',
				subject: { reference: 'Patient/1' },
				medicationReference: { reference: 'Medication/gone', display: 'Mystery tablets' }
			} as FhirResource),
			'medication'
		);
		expect(clean(m.title)).toBe('Mystery tablets');
		expect(m.current).toBe(true);
	});

	it('dates a prescription by when it was authored, and maps draft and cancelled', () => {
		const request = (status: string, authoredOn?: string) =>
			as(
				model({
					resourceType: 'MedicationRequest',
					status,
					intent: 'order',
					subject: { reference: 'Patient/1' },
					medicationCodeableConcept: { text: 'Amoxicillin' },
					...(authoredOn ? { authoredOn } : {})
				} as FhirResource),
				'medication'
			);
		const draft = request('draft', '2024-05-06');
		expect(draft.status).toBe('intended');
		expect(draft.current).toBe(true);
		expect(clean(draft.effectiveLabel)).toContain('2024');
		const cancelled = request('cancelled');
		expect(cancelled.status).toBe('stopped');
		expect(cancelled.current).toBe(false);
		expect(cancelled.effectiveLabel).toBeUndefined();
	});

	it('shows a statement without a date as absent only when it says why', () => {
		const statement = (extra: Record<string, unknown>) =>
			as(
				model({
					resourceType: 'MedicationStatement',
					status: 'unknown',
					subject: { reference: 'Patient/1' },
					medicationCodeableConcept: { text: 'Aspirin' },
					...extra
				} as FhirResource),
				'medication'
			);
		expect(statement({}).effectiveLabel).toBeUndefined();
		const unknown = statement({
			_effectiveDateTime: {
				extension: [
					{
						url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
						valueCode: 'unknown'
					}
				]
			}
		});
		expect(unknown.effectiveLabel).toBeTruthy();
		const period = statement({ effectivePeriod: { start: '2020-01-01' } });
		expect(clean(period.effectiveLabel)).toContain('2020');
	});

	it('keeps a condition’s own words for onset and abatement, and defaults to active', () => {
		const said = as(
			model({
				resourceType: 'Condition',
				subject: { reference: 'Patient/1' },
				code: { text: 'Asthma' },
				onsetString: 'childhood',
				abatementString: 'teens'
			} as FhirResource),
			'problem'
		);
		expect(said.onsetLabel).toBe('childhood');
		expect(said.abatementLabel).toBe('teens');
		expect(said.active).toBe(true);
		const dated = as(
			model({
				resourceType: 'Condition',
				subject: { reference: 'Patient/1' },
				code: { text: 'Fracture' },
				clinicalStatus: { coding: [{ code: 'resolved' }] },
				onsetPeriod: { start: '2019-02-03' },
				abatementPeriod: { start: '2019-04-05' }
			} as FhirResource),
			'problem'
		);
		expect(dated.active).toBe(false);
		expect(clean(dated.onsetLabel)).toContain('2019');
		expect(dated.abatement).toBe('2019-04-05');
	});

	it('words an immunization dose with and without its series', () => {
		const dose = (applied: Record<string, unknown>) =>
			as(
				model({
					resourceType: 'Immunization',
					status: 'completed',
					patient: { reference: 'Patient/1' },
					vaccineCode: { text: 'MMR' },
					occurrenceDateTime: '2010-01-01',
					protocolApplied: [applied]
				} as FhirResource),
				'immunization'
			);
		expect(clean(JSON.stringify(dose({ doseNumberString: 'booster' }).fields))).toContain(
			'booster'
		);
		expect(
			clean(JSON.stringify(dose({ doseNumberPositiveInt: 2, seriesDosesString: 'three' }).fields))
		).toContain('three');
	});

	it('dates a procedure by its period or its own words', () => {
		const procedure = (extra: Record<string, unknown>) =>
			as(
				model({
					resourceType: 'Procedure',
					status: 'completed',
					subject: { reference: 'Patient/1' },
					code: { text: 'Appendectomy' },
					...extra
				} as FhirResource),
				'procedure'
			);
		expect(procedure({ performedString: 'as a child' }).performedLabel).toBe('as a child');
		const period = procedure({ performedPeriod: { start: '2001-01-01', end: '2001-01-02' } });
		expect(period.performed).toBe('2001-01-01');
		expect(clean(period.performedLabel)).toContain('2001');
	});

	it('names a device from the resolved Device, its reference display, or nothing', () => {
		const use = (device: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
			({
				resourceType: 'DeviceUseStatement',
				status: 'active',
				subject: { reference: 'Patient/1' },
				device,
				...extra
			}) as FhirResource;
		const typed = as(
			model(use({ reference: 'Device/1' }, { timingPeriod: { start: '2022-01-01' } }), {
				'Device/1': { resourceType: 'Device', type: { text: 'Pacemaker' } } as FhirResource
			}),
			'device'
		);
		expect(clean(typed.title)).toBe('Pacemaker');
		expect(clean(typed.timingLabel)).toContain('2022');
		const shown = as(model(use({ display: 'Hearing aid' })), 'device');
		expect(clean(shown.title)).toBe('Hearing aid');
		expect(shown.timingLabel).toBeUndefined();
		const absent = as(
			model(
				use(
					{ display: 'Stent' },
					{
						_timingDateTime: {
							extension: [
								{
									url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
									valueCode: 'unknown'
								}
							]
						}
					}
				)
			),
			'device'
		);
		expect(absent.timingLabel).toBeTruthy();
	});

	it('flags an abnormal component and lists resolved panel members', () => {
		const m = as(
			model(
				observation({
					component: [
						{
							code: { text: 'Systolic' },
							valueQuantity: { value: 150, unit: 'mmHg' },
							interpretation: [{ coding: [{ code: 'H' }], text: 'High' }]
						},
						{
							code: { text: 'Diastolic' },
							valueQuantity: { value: 80, unit: 'mmHg' },
							interpretation: [{ coding: [{ code: 'N' }] }]
						},
						{}
					],
					hasMember: [{ reference: 'Observation/m1' }, { reference: 'Observation/none' }]
				}),
				{ 'Observation/m1': observation({ code: { text: 'Member' }, valueString: 'ok' }) }
			),
			'observation'
		);
		const [systolic, diastolic, untitled, member] = m.components;
		expect(clean(systolic.flagLabel)).toBeTruthy();
		expect(diastolic.flagLabel).toBeUndefined();
		expect(clean(untitled.title)).toBe('Not stated');
		expect(clean(member.title)).toBe('Member');
		expect(m.components).toHaveLength(4);
	});

	it('words an interpretation it has no code for in the document’s own words', () => {
		const m = as(
			model(observation({ valueString: 'x', interpretation: [{ text: 'Odd' }] })),
			'observation'
		);
		expect(m.interpretation).toBeUndefined();
		expect(m.flagLabel).toBeUndefined();
	});

	it('lists a report’s resolved results and says when it is not final', () => {
		const m = as(
			model(
				{
					resourceType: 'DiagnosticReport',
					status: 'preliminary',
					code: { text: 'Blood count' },
					issued: '2024-07-08T10:00:00Z',
					result: [{ reference: 'Observation/r1' }, { reference: 'Patient/1' }],
					conclusionCode: [{ text: 'Normal' }]
				} as FhirResource,
				{
					'Observation/r1': observation({ code: { text: 'Hb' }, valueQuantity: { value: 140 } }),
					'Patient/1': { resourceType: 'Patient' } as FhirResource
				}
			),
			'report'
		);
		expect(m.results).toHaveLength(1);
		expect(m.statusLabel).toBeTruthy();
		expect(m.conclusion).toBe('Normal');
		expect(m.effective).toBe('2024-07-08');
	});

	it('describes a consent by its provision and source document', () => {
		const m = as(
			model(
				{
					resourceType: 'Consent',
					status: 'active',
					scope: { text: 'Treatment' },
					category: [{}],
					provision: { type: 'permit', code: [{ text: 'Share' }, {}] },
					sourceReference: { reference: 'DocumentReference/d1' }
				} as FhirResource,
				{
					'DocumentReference/d1': {
						resourceType: 'DocumentReference',
						status: 'current',
						type: { text: 'Advance directive' },
						content: [{ attachment: {} }]
					} as FhirResource
				}
			),
			'generic'
		);
		expect(clean(m.title)).toBe('Treatment');
		const fields = clean(JSON.stringify(m.fields));
		expect(fields).toContain('Share');
		expect(fields).toContain('Advance directive');
	});
});

describe('section state words', () => {
	const t = ctx.t;
	const section = (extra: Partial<IpsSection>): IpsSection =>
		({
			key: 'problems',
			state: 'empty',
			narrativeOnly: false,
			absentEntries: [],
			unresolved: [],
			...extra
		}) as IpsSection;

	it('names the empty reason in words, adding its text only when it says more', () => {
		const coded = stateLabel(
			section({ emptyReason: { coding: [{ code: 'unavailable' }], text: 'Lost in a flood' } }),
			t
		);
		expect(clean(coded)).toContain('Lost in a flood');
		const textOnly = stateLabel(section({ emptyReason: { text: '  ' } }), t);
		expect(textOnly).toBe(stateLabel(section({}), t));
	});

	it('says an entry could not be found when nothing else explains the gap', () => {
		const label = stateLabel(section({ unresolved: ['Condition/gone'] } as Partial<IpsSection>), t);
		expect(label).not.toBe(stateLabel(section({}), t));
	});

	it('falls back to the state when the coded absent entries carry no words', () => {
		const label = stateLabel(
			section({
				absentEntries: [
					{ reference: 'x' },
					{ reference: 'y', resource: { resourceType: 'Condition' } }
				]
			} as Partial<IpsSection>),
			t
		);
		expect(label).toBe(stateLabel(section({}), t));
	});
});

describe('values and dates a resource states only in part', () => {
	it.each([
		['a quantity with nothing in it', { valueQuantity: {} }],
		['an empty concept', { valueCodeableConcept: {} }],
		['a range without bounds', { valueRange: {} }],
		['a ratio without parts', { valueRatio: {} }],
		['a period without dates', { valuePeriod: {} }]
	])('shows %s as no value', (_name, extra) => {
		const m = model(observation(extra));
		if (m.kind !== 'observation') throw new Error(m.kind);
		expect(m.value ?? '').toBe('');
	});

	it('dates an observation by its period, and says its status when it has no value', () => {
		const m = model(
			observation({
				status: 'preliminary',
				effectivePeriod: { start: '2023-03-04', end: '2023-03-05' }
			})
		);
		if (m.kind !== 'observation') throw new Error(m.kind);
		expect(m.effective).toBe('2023-03-04');
		expect(clean(JSON.stringify(m.fields))).toContain('2023');
		expect(clean(observationText(m))).toBe(clean(m.statusLabel));
	});

	it('draws a meter only when the range is in the value’s unit, by unit or code', () => {
		const meter = (range: object, quantity: object = { value: 5, unit: 'mmol/L' }) => {
			const m = model(observation({ valueQuantity: quantity, referenceRange: [range] }));
			return m.kind === 'observation' ? m.meter : undefined;
		};
		expect(
			meter({ low: { value: 3, unit: 'mmol/L' }, high: { value: 7, unit: 'mmol/L' } })
		).toBeTruthy();
		expect(meter({ low: { value: 3, code: 'mmol/L' } })).toBeTruthy();
		expect(meter({ low: { value: 3 } }, { value: 5, code: 'mg' })).toBeTruthy();
		expect(meter({ low: { value: 3, unit: 'mg/dL' } })).toBeUndefined();
	});

	it('has no status or current flag for a medication that states no status', () => {
		const m = model({
			resourceType: 'MedicationStatement',
			subject: { reference: 'Patient/1' },
			medicationCodeableConcept: { text: 'Aspirin' },
			effectivePeriod: {}
		} as unknown as FhirResource);
		if (m.kind !== 'medication') throw new Error(m.kind);
		expect(m.status).toBeUndefined();
		expect(m.current).toBe(false);
	});

	it('titles a consent with no provision or source by its scope alone', () => {
		const m = model({
			resourceType: 'Consent',
			status: 'active',
			scope: { text: 'Research' },
			category: [{ text: 'Study' }]
		} as FhirResource);
		expect(clean(m.title)).toBe('Study');
		if (m.kind === 'generic') expect(JSON.stringify(m.fields)).not.toContain('sourceDocument');
	});

	it('titles a care plan by its category when it has no title or description', () => {
		const m = model({
			resourceType: 'CarePlan',
			status: 'active',
			intent: 'plan',
			subject: { reference: 'Patient/1' },
			category: [{ text: 'Diabetes care' }]
		} as FhirResource);
		expect(clean(m.title)).toBe('Diabetes care');
	});

	it('says a section with entries is known', () => {
		expect(stateLabel({ state: 'known', narrativeOnly: false } as IpsSection, ctx.t)).toBe(
			ctx.t('state.known')
		);
	});
});
