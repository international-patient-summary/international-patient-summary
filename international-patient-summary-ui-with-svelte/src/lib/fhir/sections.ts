// The section registry: LOINC code → key, level and accepted entry types
// (spec §2.1, verified against StructureDefinition-Composition-uv-ips 2.0.1).
// The UI title of each section is the i18n key `sections.<key>.title`.
import type { SectionKey, SectionLevel } from './types.ts';

export interface SectionDefinition {
	key: Exclude<SectionKey, 'generic'>;
	code: string;
	level: Exclude<SectionLevel, 'unknown'>;
	/** Resource types the IG expects as entries; others still render generically. */
	resourceTypes: string[];
	/** Rank on the one-page PDF; lower is printed first and trimmed last. */
	pdfPriority: number;
}

export const SECTIONS: readonly SectionDefinition[] = [
	{
		key: 'medications',
		code: '10160-0',
		level: 'required',
		resourceTypes: ['MedicationStatement', 'MedicationRequest'],
		pdfPriority: 2
	},
	{
		key: 'allergies',
		code: '48765-2',
		level: 'required',
		resourceTypes: ['AllergyIntolerance'],
		pdfPriority: 1
	},
	{
		key: 'problems',
		code: '11450-4',
		level: 'required',
		resourceTypes: ['Condition'],
		pdfPriority: 3
	},
	{
		key: 'immunizations',
		code: '11369-6',
		level: 'recommended',
		resourceTypes: ['Immunization'],
		pdfPriority: 4
	},
	{
		key: 'results',
		code: '30954-2',
		level: 'recommended',
		resourceTypes: ['Observation', 'DiagnosticReport'],
		pdfPriority: 5
	},
	{
		key: 'procedures',
		code: '47519-4',
		level: 'recommended',
		resourceTypes: ['Procedure'],
		pdfPriority: 6
	},
	{
		key: 'devices',
		code: '46264-8',
		level: 'recommended',
		resourceTypes: ['DeviceUseStatement'],
		pdfPriority: 7
	},
	{
		key: 'vitalSigns',
		code: '8716-3',
		level: 'optional',
		resourceTypes: ['Observation'],
		pdfPriority: 9
	},
	{
		key: 'pastIllness',
		code: '11348-0',
		level: 'optional',
		resourceTypes: ['Condition'],
		pdfPriority: 10
	},
	{
		key: 'functionalStatus',
		code: '47420-5',
		level: 'optional',
		resourceTypes: ['Condition', 'ClinicalImpression'],
		pdfPriority: 13
	},
	{
		key: 'planOfCare',
		code: '18776-5',
		level: 'optional',
		resourceTypes: ['CarePlan', 'ImmunizationRecommendation'],
		pdfPriority: 11
	},
	{
		key: 'socialHistory',
		code: '29762-2',
		level: 'optional',
		resourceTypes: ['Observation'],
		pdfPriority: 12
	},
	{
		key: 'pregnancy',
		code: '10162-6',
		level: 'optional',
		resourceTypes: ['Observation'],
		pdfPriority: 14
	},
	{
		key: 'advanceDirectives',
		code: '42348-3',
		level: 'optional',
		resourceTypes: ['Consent', 'DocumentReference'],
		pdfPriority: 8
	},
	{ key: 'alerts', code: '104605-1', level: 'optional', resourceTypes: ['Flag'], pdfPriority: 0 },
	{ key: 'patientStory', code: '81338-6', level: 'optional', resourceTypes: [], pdfPriority: 15 }
];

const BY_CODE = new Map(SECTIONS.map((s) => [s.code, s]));
const BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));

export const REQUIRED_SECTIONS = SECTIONS.filter((s) => s.level === 'required');

export const LOINC = 'http://loinc.org';

export function sectionByCode(code: string | undefined): SectionDefinition | undefined {
	return code ? BY_CODE.get(code) : undefined;
}

export function sectionByKey(key: SectionKey): SectionDefinition | undefined {
	return key === 'generic' ? undefined : BY_KEY.get(key);
}

/** The PDF priority of a section key; unknown sections go last. */
export function pdfPriority(key: SectionKey): number {
	return sectionByKey(key)?.pdfPriority ?? 99;
}
