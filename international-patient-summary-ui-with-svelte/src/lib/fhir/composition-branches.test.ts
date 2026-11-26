// Branch coverage for buildDocument: unusual Bundles and sections, each state a
// section can reach, and the checks the viewer notes without refusing.
import { describe, expect, it } from 'vitest';
import { buildDocument, DocumentError } from './composition.ts';

const ABSENT = 'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips';
const patient = () => ({ fullUrl: 'urn:uuid:p', resource: { resourceType: 'Patient', id: 'p' } });

/** A document Bundle whose Composition has `sections`, with `entries` after the Patient. */
function bundle(sections: unknown, entries: unknown[] = [], composition: object = {}) {
	return {
		resourceType: 'Bundle',
		type: 'document',
		entry: [
			{
				fullUrl: 'urn:uuid:c',
				resource: {
					resourceType: 'Composition',
					type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] },
					subject: { reference: 'urn:uuid:p' },
					section: sections,
					...composition
				}
			},
			patient(),
			...entries
		]
	};
}

const problems = (extra: object = {}) => ({
	code: { coding: [{ system: 'http://loinc.org', code: '11450-4' }] },
	...extra
});

function refusal(data: unknown): string[] {
	try {
		buildDocument(data);
	} catch (e) {
		if (e instanceof DocumentError) return e.checks.map((c) => c.key);
		throw e;
	}
	throw new Error('expected a DocumentError');
}

describe('what buildDocument refuses', () => {
	it('names a missing type and a missing first resource', () => {
		expect(refusal({ resourceType: 'Bundle' })).toEqual(['notDocument', 'firstNotComposition']);
		expect(refusal({ resourceType: 'Bundle', type: 'document', entry: 'none' })).toEqual([
			'firstNotComposition'
		]);
	});

	it('refuses a subject that is not a Patient', () => {
		const data = bundle([]);
		data.entry[1] = { fullUrl: 'urn:uuid:p', resource: { resourceType: 'Group', id: 'p' } };
		expect(refusal(data)).toEqual(['subjectUnresolved']);
	});
});

describe('the checks buildDocument notes', () => {
	const keys = (data: unknown) => buildDocument(data).checks.map((c) => c.key);

	it('notes a document that declares no IPS profile, or another document type', () => {
		expect(keys(bundle([]))).toContain('noIpsProfile');
		const other = bundle([], [], {
			type: { coding: [{ system: 'http://loinc.org', code: '34133-9' }] },
			meta: { profile: ['http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips|9.9.9'] }
		});
		expect(keys(other)).toContain('unknownVersion');
		expect(keys(other)).toContain('notPatientSummaryType');
		expect(keys(other)).not.toContain('noIpsProfile');
	});

	it('notes an unknown section, coded with another system or not at all', () => {
		const doc = buildDocument(
			bundle([
				{ code: { coding: [{ system: 'urn:local', code: 'X1' }] }, title: 'Local' },
				{ code: {} },
				{ code: {} },
				null,
				'not a section'
			])
		);
		// Required sections the document leaves out are listed too, as not present.
		expect(doc.sections.filter((s) => s.present).map((s) => s.id)).toEqual([
			'section-loinc-x1',
			'section-loinc-unknown',
			'section-loinc-unknown-x'
		]);
		const unknown = doc.checks.filter((c) => c.key === 'unknownSection');
		expect(unknown.map((c) => c.values)).toEqual([
			{ code: 'X1', title: 'Local' },
			{ code: '—', title: '' },
			{ code: '—', title: '' }
		]);
		expect(doc.sections[1].documentTitle).toBeUndefined();
	});

	it('takes the composition’s sections only when they are a list', () => {
		expect(buildDocument(bundle('none')).sections.filter((s) => s.present)).toEqual([]);
	});
});

describe('the state of a section', () => {
	const state = (section: object, entries: unknown[] = []) =>
		buildDocument(bundle([problems(section)], entries)).sections[0];
	const condition = (id: string, code: string) => ({
		fullUrl: `urn:uuid:${id}`,
		resource: { resourceType: 'Condition', id, code: { coding: [{ system: ABSENT, code }] } }
	});

	it('is not recorded when an entry codes "no information"', () => {
		const section = state({ entry: [{ reference: 'urn:uuid:a' }] }, [
			condition('a', 'no-problem-info')
		]);
		expect(section.state).toBe('not-recorded');
		expect(section.absentEntries).toHaveLength(1);
	});

	it('is none known when any entry codes "none known"', () => {
		const section = state({ entry: [{ reference: 'urn:uuid:a' }, { reference: 'urn:uuid:b' }] }, [
			condition('a', 'no-problem-info'),
			condition('b', 'no-known-problems')
		]);
		expect(section.state).toBe('none-known');
	});

	it('follows the empty reason, or is unavailable when the reason is not one it knows', () => {
		expect(state({ emptyReason: { coding: [{ code: 'nilknown' }] } }).state).toBe('none-known');
		expect(state({ emptyReason: { coding: [{ code: 'withheld' }] } }).state).toBe('unavailable');
	});

	it('is unavailable when its only entries cannot be found, each named in a warning', () => {
		const doc = buildDocument(
			bundle([problems({ entry: [{ reference: 'urn:uuid:gone' }, { display: 'Shown only' }, {}] })])
		);
		const [section] = doc.sections;
		expect(section.state).toBe('unavailable');
		expect(section.unresolved).toEqual(['urn:uuid:gone', 'Shown only', '']);
		expect(doc.checks.filter((c) => c.key === 'unresolvedReference')).toHaveLength(3);
	});

	it('is not recorded, with its narrative, when it takes entries but has none', () => {
		const section = state({ text: { status: 'generated', div: '<div>Seen</div>' } });
		expect(section.state).toBe('not-recorded');
		expect(section.narrativeOnly).toBe(true);
		const blank = state({ text: { status: 'generated', div: '   ' } });
		expect(blank.narrativeOnly).toBe(false);
	});
});
