// Index a Bundle's entries and resolve references within it (spec §5).
//
// A reference resolves, in order, by: exact fullUrl ("urn:uuid:…" or an
// absolute URL); "Type/id" against each resource's own type and id; and an
// absolute URL whose path ends in "Type/id" (FHIR's rule that a relative
// reference is resolved against the referring entry's base URL).
import type { Bundle, FhirResource } from 'fhir/r4';

export interface BundleIndex {
	byFullUrl: Map<string, { resource: FhirResource; fullUrl: string }>;
	byTypeId: Map<string, { resource: FhirResource; fullUrl?: string }>;
	resolve: (
		reference: string | undefined
	) => { resource: FhirResource; fullUrl?: string } | undefined;
}

const TYPE_ID = /(?:^|\/)([A-Z][A-Za-z]+)\/([A-Za-z0-9\-.]{1,64})(?:\/_history\/[^/]+)?$/;

/** "Type/id" from a reference or fullUrl, or undefined when it has none. */
export function typeIdOf(reference: string): string | undefined {
	const match = TYPE_ID.exec(reference);
	return match ? `${match[1]}/${match[2]}` : undefined;
}

export function indexBundle(bundle: Bundle): BundleIndex {
	const byFullUrl = new Map<string, { resource: FhirResource; fullUrl: string }>();
	const byTypeId = new Map<string, { resource: FhirResource; fullUrl?: string }>();

	for (const entry of bundle.entry ?? []) {
		const resource = entry?.resource as FhirResource | undefined;
		if (!resource || typeof resource !== 'object') continue;
		const fullUrl = typeof entry.fullUrl === 'string' ? entry.fullUrl : undefined;
		if (fullUrl) byFullUrl.set(fullUrl, { resource, fullUrl });
		if (resource.resourceType && resource.id) {
			const key = `${resource.resourceType}/${resource.id}`;
			if (!byTypeId.has(key)) byTypeId.set(key, { resource, fullUrl });
		}
		if (fullUrl) {
			const key = typeIdOf(fullUrl);
			if (key && !byTypeId.has(key)) byTypeId.set(key, { resource, fullUrl });
		}
	}

	function resolve(reference: string | undefined) {
		if (!reference || typeof reference !== 'string') return undefined;
		const exact = byFullUrl.get(reference);
		if (exact) return exact;
		const key = typeIdOf(reference);
		return key ? byTypeId.get(key) : undefined;
	}

	return { byFullUrl, byTypeId, resolve };
}
