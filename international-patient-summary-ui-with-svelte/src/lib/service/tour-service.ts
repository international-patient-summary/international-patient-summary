// The backendless IPS service used by the public tour (spec §6.8): the
// backend's API, held in memory only. Nothing is stored in the browser or sent
// anywhere, and everything is gone on sign-out or reload.
import {
	checkIps,
	isServiceId,
	listingOf,
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
			.map(([id, { bundle }]) => listingOf(id, bundle));
	}
}
