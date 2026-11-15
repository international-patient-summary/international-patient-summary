// Build an IpsDocument from parsed data: validate the Bundle, locate the
// Composition and Patient, map sections through the registry, classify each
// section's state, and collect the structural checks of spec §6.2.
import type { Bundle, Composition, CompositionSection, FhirResource, Patient } from 'fhir/r4';
import { absentKindOfResource, stateFromEmptyReason } from './absent.ts';
import { indexBundle } from './bundle.ts';
import { REQUIRED_SECTIONS, sectionByCode } from './sections.ts';
import type {
	Check,
	IpsDocument,
	IpsSection,
	ResolvedEntry,
	SectionKey,
	SectionState
} from './types.ts';

export const IPS_CANONICAL = 'http://hl7.org/fhir/uv/ips';
export const IPS_DOCUMENT_TYPE = '60591-5';

/** Thrown when the input cannot be shown at all; carries the error checks. */
export class DocumentError extends Error {
	checks: Check[];
	constructor(checks: Check[]) {
		super(checks.map((c) => c.key).join(', '));
		this.name = 'DocumentError';
		this.checks = checks;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The IPS IG version a set of profile URLs names, e.g. "…/Composition-uv-ips|2.0.1" → "2.0.1". */
export function ipsVersionFromProfiles(profiles: string[]): {
	declaresIps: boolean;
	version?: string;
} {
	let declaresIps = false;
	let version: string | undefined;
	for (const profile of profiles) {
		if (!profile.startsWith(`${IPS_CANONICAL}/`)) continue;
		declaresIps = true;
		const bar = profile.indexOf('|');
		if (bar > -1 && !version) version = profile.slice(bar + 1);
	}
	return { declaresIps, version };
}

function sectionCode(section: CompositionSection): string {
	return (
		section.code?.coding?.find((c) => c.system === 'http://loinc.org' && c.code)?.code ??
		section.code?.coding?.find((c) => c.code)?.code ??
		''
	);
}

function slug(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Turn parsed JSON or YAML into an IpsDocument. Throws DocumentError when the
 * input is not something the viewer can render (not a document Bundle, no
 * Composition first, no resolvable subject).
 */
export function buildDocument(data: unknown): IpsDocument {
	const errors: Check[] = [];
	if (!isObject(data) || data.resourceType !== 'Bundle') {
		const found = isObject(data) && typeof data.resourceType === 'string' ? data.resourceType : '';
		throw new DocumentError([
			{ severity: 'error', key: found ? 'notBundle' : 'notFhir', values: { found } }
		]);
	}
	const bundle = data as unknown as Bundle;
	if (bundle.type !== 'document')
		errors.push({
			severity: 'error',
			key: 'notDocument',
			values: { found: String(bundle.type ?? '') }
		});

	const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
	const first = entries[0]?.resource;
	if (!first || first.resourceType !== 'Composition') {
		errors.push({
			severity: 'error',
			key: 'firstNotComposition',
			values: { found: first?.resourceType ?? '' }
		});
		throw new DocumentError(errors);
	}
	const composition = first as Composition;
	const index = indexBundle(bundle);
	const resolve = (reference: string | undefined): FhirResource | undefined =>
		index.resolve(reference)?.resource;

	const subject = resolve(composition.subject?.reference);
	if (!composition.subject?.reference) errors.push({ severity: 'error', key: 'noSubject' });
	else if (!subject || subject.resourceType !== 'Patient')
		errors.push({
			severity: 'error',
			key: 'subjectUnresolved',
			values: { reference: composition.subject.reference }
		});
	if (errors.length > 0) throw new DocumentError(errors);
	const patient = subject as Patient;

	const checks: Check[] = [];
	const profiles = [
		...(bundle.meta?.profile ?? []),
		...(composition.meta?.profile ?? []),
		...(patient.meta?.profile ?? [])
	].filter((p): p is string => typeof p === 'string');
	const { declaresIps, version } = ipsVersionFromProfiles(profiles);
	if (!declaresIps) checks.push({ severity: 'info', key: 'noIpsProfile' });
	else if (version && !/^(1\.[01]\.\d+|2\.0\.\d+)$/.test(version))
		checks.push({ severity: 'info', key: 'unknownVersion', values: { version } });
	const docType = composition.type?.coding?.find((c) => c.system === 'http://loinc.org')?.code;
	if (docType && docType !== IPS_DOCUMENT_TYPE)
		checks.push({ severity: 'info', key: 'notPatientSummaryType', values: { code: docType } });

	const usedIds = new Set<string>();
	const sections: IpsSection[] = [];
	const rawSections = Array.isArray(composition.section) ? composition.section : [];

	for (const section of rawSections) {
		if (!section || typeof section !== 'object') continue;
		const code = sectionCode(section);
		const definition = sectionByCode(code);
		const key: SectionKey = definition?.key ?? 'generic';
		if (!definition)
			checks.push({
				severity: 'info',
				key: 'unknownSection',
				values: { code: code || '—', title: section.title ?? '' },
				section: key
			});
		let id = `section-${definition ? slug(definition.key) : `loinc-${slug(code || 'unknown')}`}`;
		while (usedIds.has(id)) id = `${id}-x`;
		usedIds.add(id);

		const resolved: ResolvedEntry[] = [];
		const absent: ResolvedEntry[] = [];
		const unresolved: string[] = [];
		const absentKinds = new Set<string>();
		for (const ref of Array.isArray(section.entry) ? section.entry : []) {
			const reference = ref?.reference;
			const hit = index.resolve(reference);
			if (!reference || !hit) {
				unresolved.push(reference ?? ref?.display ?? '');
				continue;
			}
			const entry: ResolvedEntry = { reference, resource: hit.resource, fullUrl: hit.fullUrl };
			const kind = absentKindOfResource(hit.resource, resolve);
			if (kind) {
				absent.push(entry);
				absentKinds.add(kind);
			} else resolved.push(entry);
		}
		for (const reference of unresolved)
			checks.push({
				severity: 'warning',
				key: 'unresolvedReference',
				values: { reference },
				section: id
			});

		const hasNarrative = typeof section.text?.div === 'string' && section.text.div.trim() !== '';
		// A section whose IG definition takes no entries (Patient story, or a code
		// this registry does not know) carries its content in the narrative.
		const narrativeIsContent = !definition || definition.resourceTypes.length === 0;
		let state: SectionState;
		let narrativeOnly = false;
		if (resolved.length > 0) state = 'known';
		else if (absentKinds.has('none-known')) state = 'none-known';
		else if (absentKinds.has('not-recorded')) state = 'not-recorded';
		else if (section.emptyReason)
			state = stateFromEmptyReason(section.emptyReason) ?? 'unavailable';
		else if (unresolved.length > 0) state = 'unavailable';
		else if (hasNarrative && narrativeIsContent) state = 'known';
		else {
			state = 'not-recorded';
			narrativeOnly = hasNarrative;
		}

		sections.push({
			key,
			id,
			code,
			level: definition?.level ?? 'unknown',
			documentTitle: typeof section.title === 'string' ? section.title : undefined,
			present: true,
			section,
			entries: resolved,
			absentEntries: absent,
			unresolved,
			state,
			narrativeOnly,
			emptyReason: section.emptyReason,
			narrative: hasNarrative ? section.text?.div : undefined
		});
	}

	for (const required of REQUIRED_SECTIONS) {
		if (sections.some((s) => s.key === required.key)) continue;
		checks.push({
			severity: 'warning',
			key: 'requiredSectionMissing',
			values: { code: required.code },
			section: required.key
		});
		sections.push({
			key: required.key,
			id: `section-${slug(required.key)}`,
			code: required.code,
			level: 'required',
			present: false,
			entries: [],
			absentEntries: [],
			unresolved: [],
			state: 'omitted',
			narrativeOnly: false
		});
	}

	return {
		bundle,
		composition,
		patient,
		sections,
		checks,
		version,
		declaresIps,
		language: composition.language ?? bundle.language,
		resolve
	};
}
