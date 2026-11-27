// The session with the backend service (spec §6.10): who is signed in, the
// stored summaries, and the one open in the viewer. Like the tour's, it lives
// only in memory: the access token is never stored, and a reload signs out.
// Only the pending sign-in survives the provider's redirect (oidc.ts).
import { LoadError } from './fhir/parse.ts';
import { loadFile } from './fhir/load.ts';
import type { ServiceConfig } from './service/config.ts';
import { HttpService } from './service/http-service.ts';
import {
	beginSignIn,
	currentToken,
	finishSignIn,
	refreshSession,
	signOutHref,
	OidcError,
	type OidcConfig,
	type OidcDeps,
	type OidcSession
} from './service/oidc.ts';
import { ServiceError, type SummaryListing } from './service/service.ts';
import { viewer } from './state.svelte.ts';
import { dev } from '$app/env';
import { resolve } from '$app/paths';
import { serviceConfig } from './service/config.ts';

/** What went wrong, as an i18n key under `service.errors.`. */
export type RemoteError =
	| OidcError['key']
	| 'expired'
	| 'forbidden'
	| 'notFound'
	| 'refused'
	| 'unreachable'
	| 'unreadable'
	| 'service';

export function errorKey(error: unknown): RemoteError {
	if (error instanceof OidcError) return error.key;
	if (error instanceof LoadError) return 'unreadable';
	if (!(error instanceof ServiceError)) return 'service';
	switch (error.status) {
		case 0:
			return 'unreachable';
		case 401:
			return 'expired';
		case 403:
			return 'forbidden';
		case 404:
			return 'notFound';
		case 413:
		case 415:
		case 422:
			return 'refused';
		default:
			return 'service';
	}
}

export class RemoteSession {
	session = $state.raw<OidcSession | undefined>(undefined);
	summaries = $state.raw<SummaryListing[]>([]);
	busy = $state(false);
	error = $state<RemoteError | undefined>(undefined);
	/** The id of the document "Save to service" last stored, for its confirmation. */
	saved = $state<string | undefined>(undefined);
	#service: HttpService | undefined;
	/** The one renewal in flight, so concurrent calls share it. */
	#renewing: Promise<string | undefined> | undefined;

	constructor(
		readonly config: ServiceConfig | undefined,
		readonly redirectUri: () => string,
		private readonly deps: () => OidcDeps,
		private readonly allowHttpLoopback = false
	) {}

	get signedIn(): boolean {
		return !!this.session;
	}

	#oidc(): OidcConfig {
		if (!this.config) throw new OidcError('signInFailed');
		return {
			issuer: this.config.issuer,
			clientId: this.config.clientId,
			redirectUri: this.redirectUri()
		};
	}

	/** The provider's sign-in address to send the browser to, or undefined on failure. */
	async signInHref(): Promise<string | undefined> {
		this.busy = true;
		try {
			this.error = undefined;
			return await beginSignIn(this.#oidc(), this.deps());
		} catch (error) {
			this.error = errorKey(error);
			return undefined;
		} finally {
			this.busy = false;
		}
	}

	/** Finish the sign-in the provider has sent the browser back from, then list. */
	async completeSignIn(url: URL, now: () => number = Date.now): Promise<void> {
		this.busy = true;
		try {
			const session = await finishSignIn(this.#oidc(), url, this.deps(), now);
			this.session = session;
			this.#service = new HttpService({
				base: this.config!.serviceUrl,
				token: () => this.#token(now),
				allowHttpLoopback: this.allowHttpLoopback,
				fetch: this.deps().fetch
			});
			this.error = undefined;
		} catch (error) {
			this.error = errorKey(error);
		} finally {
			this.busy = false;
		}
		if (this.session) await this.refresh();
	}

	refresh(): Promise<void> {
		return this.#run(async () => {
			this.summaries = await this.#require().list();
		});
	}

	open(listing: SummaryListing): Promise<void> {
		return this.#run(async () => {
			const { bundle } = await this.#require().read(listing.id);
			viewer.open({
				data: bundle,
				format: 'json',
				source: { kind: 'service', name: listing.patient ?? listing.title ?? listing.id }
			});
		}, false);
	}

	remove(id: string): Promise<void> {
		return this.#run(async () => {
			await this.#require().remove(id);
			this.summaries = await this.#require().list();
		});
	}

	/** Read `file` as JSON or YAML and store it; the service checks it is an IPS. */
	store(file: File): Promise<void> {
		return this.#run(async () => {
			const { data } = await loadFile(file);
			await this.#require().create(data);
			this.summaries = await this.#require().list();
		});
	}

	/** "Save to service" (F-SIGN-7): store the document open in the viewer, as loaded. */
	save(data: unknown): Promise<void> {
		this.saved = undefined;
		return this.#run(async () => {
			const { id } = await this.#require().create(data);
			this.saved = id;
			this.summaries = await this.#require().list();
		});
	}

	/**
	 * Sign out here and at the provider (F-SIGN-9): end this session, and answer
	 * the provider's sign-out address to send the browser to, if it has one.
	 */
	async signOutEverywhere(): Promise<string | undefined> {
		const session = this.session;
		this.signOut();
		if (!this.config || !session) return undefined;
		return signOutHref(this.#oidc(), session, this.deps().fetch);
	}

	signOut(): void {
		this.saved = undefined;
		this.session = undefined;
		this.#service = undefined;
		this.summaries = [];
		this.error = undefined;
		viewer.clear();
	}

	/**
	 * The access token while it is good; else one renewed with the refresh token
	 * (F-SIGN-8); else undefined, so the service answers 401 and the session ends.
	 */
	async #token(now: () => number): Promise<string | undefined> {
		const token = currentToken(this.session, now());
		if (token || !this.session?.refreshToken) return token;
		this.#renewing ??= (async () => {
			const session = this.session;
			try {
				if (!session) return undefined;
				this.session = await refreshSession(this.#oidc(), session, this.deps(), now);
				return this.session.accessToken;
			} catch {
				return undefined;
			} finally {
				this.#renewing = undefined;
			}
		})();
		return this.#renewing;
	}

	#require(): HttpService {
		if (!this.#service) throw new ServiceError(401, 'signed_out');
		return this.#service;
	}

	async #run(task: () => Promise<unknown>, clearError = true): Promise<void> {
		this.busy = true;
		try {
			if (clearError) this.error = undefined;
			await task();
			this.error = undefined;
		} catch (error) {
			this.error = errorKey(error);
			// An expired or refused token ends the session: the person signs in again.
			if (this.error === 'expired') {
				this.session = undefined;
				this.#service = undefined;
				this.summaries = [];
			}
		} finally {
			this.busy = false;
		}
	}
}

/**
 * The tab's one session, shared by `/service/` and the viewer's "Save to
 * service", and kept across navigation within the app (never stored).
 */
export const remote = new RemoteSession(
	serviceConfig(),
	// The page with a trailing slash, as it is served (trailingSlash 'always').
	() => `${location.origin}${resolve('/service').replace(/\/$/, '')}/`,
	() => ({
		fetch: globalThis.fetch.bind(globalThis),
		storage: sessionStorage,
		random: (bytes) => crypto.getRandomValues(bytes)
	}),
	dev
);
