// The IPS service API as the UI sees it (spec §6.8). It mirrors the backend,
// international-patient-summary-service-with-axum (its spec §4): ids are
// server-issued v4 UUIDs written into Bundle.id, a document must pass the same
// structural IPS check, and refusals carry the same codes and JSON pointers.
// TourService implements it in memory, so the tour needs no backend;
// HttpService (http-service.ts) implements it against the backend.
import type { HumanName } from 'fhir/r4';
import { formatHumanName } from '../fhir/format.ts';

/** A stored document: its id, and the Bundle with `id` set to it. */
export interface StoredSummary {
	id: string;
	bundle: Record<string, unknown>;
}

/**
 * What a list shows of a stored document. The backend's `GET /fhir/Bundle`
 * (its S-API-7) answers each as a SUBSETTED Bundle holding just these.
 */
export interface SummaryListing {
	id: string;
	title?: string;
	date?: string;
	/** The subject's name, so documents with the same title can be told apart. */
	patient?: string;
}

/** The backend's refusal codes (its spec S-API-2), in the order it checks them. */
export const REFUSALS = [
	['not_a_bundle', '#/resourceType'],
	['not_a_document', '#/type'],
	['no_composition', '#/entry/0/resource/resourceType'],
	['not_a_patient_summary', '#/entry/0/resource/type'],
	['no_subject', '#/entry/0/resource/subject/reference']
] as const;

export type RefusalCode = (typeof REFUSALS)[number][0];

/** A failed call, as the backend's RFC 9457 problem would state it. */
export class ServiceError extends Error {
	constructor(
		/** The HTTP status, or 0 when the service could not be reached. */
		readonly status: number,
		readonly code: string,
		readonly pointer?: string
	) {
		super(code);
		this.name = 'ServiceError';
	}
}

export interface IpsService {
	/** Check and store a document. Rejects with 422 and a RefusalCode. */
	create(bundle: unknown): Promise<StoredSummary>;
	/** A stored document. Rejects with 404 for an unknown or malformed id. */
	read(id: string): Promise<StoredSummary>;
	/** Delete a stored document. Rejects with 404 as read does. */
	remove(id: string): Promise<void>;
	/** Every stored document, newest first. */
	list(): Promise<SummaryListing[]>;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
	!!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The backend's structural IPS check (its src/ips.rs), answering the first
 * refusal that applies, or undefined when the document passes.
 */
export function checkIps(bundle: unknown): RefusalCode | undefined {
	if (!isObject(bundle) || bundle.resourceType !== 'Bundle') return 'not_a_bundle';
	if (bundle.type !== 'document') return 'not_a_document';
	const entry = Array.isArray(bundle.entry) ? bundle.entry[0] : undefined;
	const composition = isObject(entry) ? entry.resource : undefined;
	if (!isObject(composition) || composition.resourceType !== 'Composition') return 'no_composition';
	const type = composition.type;
	const codings = isObject(type) && Array.isArray(type.coding) ? type.coding : [];
	const isIps = codings.some(
		(c) => isObject(c) && c.system === 'http://loinc.org' && c.code === '60591-5'
	);
	if (!isIps) return 'not_a_patient_summary';
	const subject = composition.subject;
	const reference = isObject(subject) ? subject.reference : undefined;
	if (typeof reference !== 'string' || !reference.trim()) return 'no_subject';
	return undefined;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** An id the backend could have issued (its spec S-API-5). */
export function isServiceId(id: string): boolean {
	return UUID_V4.test(id);
}

type Entry = {
	fullUrl?: string;
	resource?: { resourceType?: string; id?: string; name?: HumanName[] };
};

/**
 * What a list shows of `bundle`: its Composition's title and date and its
 * subject's name. A whole document and the backend's SUBSETTED list entry
 * (its S-API-7) read the same way.
 */
export function listingOf(id: string, bundle: Record<string, unknown>): SummaryListing {
	const entries = Array.isArray(bundle.entry) ? (bundle.entry as Entry[]) : [];
	const composition = (entries[0] as { resource?: Record<string, unknown> } | undefined)?.resource;
	return {
		id,
		title: typeof composition?.title === 'string' ? composition.title : undefined,
		date: typeof composition?.date === 'string' ? composition.date : undefined,
		patient: subjectName(entries, composition)
	};
}

/** The Composition subject's name, resolved by fullUrl, Type/id, or a fullUrl ending /Type/id. */
function subjectName(
	entries: Entry[],
	composition: Record<string, unknown> | undefined
): string | undefined {
	const reference = (composition?.subject as { reference?: string } | undefined)?.reference;
	if (!reference) return undefined;
	const subject = entries.find(
		(e) =>
			e.fullUrl === reference ||
			`${e.resource?.resourceType}/${e.resource?.id}` === reference ||
			e.fullUrl?.endsWith(`/${reference}`)
	)?.resource;
	return formatHumanName(subject?.name);
}
