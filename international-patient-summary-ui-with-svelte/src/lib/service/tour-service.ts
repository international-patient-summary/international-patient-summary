// The backendless IPS service used by the public tour (spec §6.8): the
// backend's API, held in memory only. Nothing is stored in the browser or sent
// anywhere, and everything is gone on sign-out or reload.
import { formatHumanName } from '../fhir/format.ts';
import type { HumanName } from 'fhir/r4';
import {
	checkIps,
	isServiceId,
	REFUSALS,
	ServiceError,
	type IpsService,
	type StoredSummary,
	type SummaryListing
} from './service.ts';

interface Row {
	bundle: Record<string, unknown>;
	created: number;
}

export class TourService implements IpsService {
	#rows = new Map<string, Row>();
	#clock = 0;

	constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}

	async create(bundle: unknown): Promise<StoredSummary> {
		const refusal = checkIps(bundle);
		if (refusal) {
			const pointer = REFUSALS.find(([code]) => code === refusal)?.[1];
			throw new ServiceError(422, refusal, pointer);
		}
		const id = this.newId();
		// A deep copy, so later changes to the caller's object never reach the store.
		const stored = { ...structuredClone(bundle as Record<string, unknown>), id };
		this.#rows.set(id, { bundle: stored, created: this.#clock++ });
		return { id, bundle: structuredClone(stored) };
	}

	async read(id: string): Promise<StoredSummary> {
		const row = isServiceId(id) ? this.#rows.get(id) : undefined;
		if (!row) throw new ServiceError(404, 'not_found');
		return { id, bundle: structuredClone(row.bundle) };
	}

	async remove(id: string): Promise<void> {
		if (!isServiceId(id) || !this.#rows.delete(id)) throw new ServiceError(404, 'not_found');
	}

	async list(): Promise<SummaryListing[]> {
		return [...this.#rows.entries()]
			.sort(([, a], [, b]) => b.created - a.created)
			.map(([id, { bundle }]) => {
				const composition = (bundle.entry as { resource?: Record<string, unknown> }[])[0]?.resource;
				return {
					id,
					title: typeof composition?.title === 'string' ? composition.title : undefined,
					date: typeof composition?.date === 'string' ? composition.date : undefined,
					patient: subjectName(bundle, composition)
				};
			});
	}
}

type Entry = {
	fullUrl?: string;
	resource?: { resourceType?: string; id?: string; name?: HumanName[] };
};

/** The Composition subject's name, resolved by fullUrl or Type/id. */
function subjectName(
	bundle: Record<string, unknown>,
	composition: Record<string, unknown> | undefined
): string | undefined {
	const reference = (composition?.subject as { reference?: string } | undefined)?.reference;
	if (!reference) return undefined;
	const subject = (bundle.entry as Entry[]).find(
		(e) =>
			e.fullUrl === reference ||
			`${e.resource?.resourceType}/${e.resource?.id}` === reference ||
			e.fullUrl?.endsWith(`/${reference}`)
	)?.resource;
	return formatHumanName(subject?.name);
}
