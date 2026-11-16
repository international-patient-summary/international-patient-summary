// The public tour's session (spec §6.8): a demonstration sign-in as
// example@example.com and a backendless, in-memory IPS service seeded with the
// bundled examples. Like the viewer state, it lives only in memory: nothing is
// written to storage or sent anywhere, and a reload ends the session.
import { EXAMPLES, type ExampleId } from './examples.ts';
import { ServiceError, type SummaryListing } from './service/service.ts';
import { TourService } from './service/tour-service.ts';
import { viewer } from './state.svelte.ts';

/** The tour's one account. It is public: anyone may use it, and it guards nothing. */
export const TOUR_EMAIL = 'example@example.com';
export const TOUR_PASSWORD = 'example';

export type TourStep = 'signIn' | 'summaries' | 'view';
export const TOUR_STEPS: readonly TourStep[] = ['signIn', 'summaries', 'view'];

class TourSession {
	email = $state<string | undefined>(undefined);
	summaries = $state.raw<SummaryListing[]>([]);
	busy = $state(false);
	/** An i18n key under `tour.errors.` for the last failure, if any. */
	error = $state<string | undefined>(undefined);
	#service: TourService | undefined;

	get step(): TourStep {
		if (!this.email) return 'signIn';
		return viewer.doc ? 'view' : 'summaries';
	}

	/**
	 * Sign in to the tour. Only the tour account is accepted; the check is a
	 * demonstration, not security. `exampleHref` maps an example id to its URL.
	 */
	async signIn(
		email: string,
		password: string,
		exampleHref: (id: ExampleId) => string,
		fetchImpl: typeof fetch = fetch
	): Promise<boolean> {
		if (email.trim().toLowerCase() !== TOUR_EMAIL || password !== TOUR_PASSWORD) {
			this.error = 'signIn';
			return false;
		}
		this.error = undefined;
		this.email = TOUR_EMAIL;
		await this.reset(exampleHref, fetchImpl);
		return true;
	}

	/** Start the in-memory service again, holding only the bundled examples. */
	async reset(exampleHref: (id: ExampleId) => string, fetchImpl: typeof fetch = fetch) {
		const service = new TourService();
		this.#service = service;
		viewer.clear();
		await this.#run(async () => {
			for (const id of EXAMPLES) {
				const response = await fetchImpl(exampleHref(id));
				if (!response.ok) throw new Error(`example ${id}: ${response.status}`);
				await service.create(await response.json());
			}
		});
	}

	async open(listing: SummaryListing): Promise<void> {
		await this.#run(async () => {
			const { bundle } = await this.#require().read(listing.id);
			viewer.open({
				data: bundle,
				format: 'json',
				source: { kind: 'service', name: listing.title ?? listing.id }
			});
		});
	}

	async remove(id: string): Promise<void> {
		await this.#run(() => this.#require().remove(id));
	}

	signOut(): void {
		this.#service = undefined;
		this.email = undefined;
		this.summaries = [];
		this.error = undefined;
		viewer.clear();
	}

	#require(): TourService {
		if (!this.#service) throw new ServiceError(401, 'signed_out');
		return this.#service;
	}

	async #run(task: () => Promise<unknown>): Promise<void> {
		this.busy = true;
		try {
			await task();
			this.error = undefined;
		} catch (error) {
			this.error = error instanceof ServiceError && error.status === 404 ? 'notFound' : 'service';
		} finally {
			if (this.#service) this.summaries = await this.#service.list();
			this.busy = false;
		}
	}
}

export const tour = new TourSession();
