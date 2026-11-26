// IpsService against the backend, international-patient-summary-service-with-axum
// (its spec §4), for spec §6.9. Every call carries the bearer token the caller
// supplies (its §6.1), asks for no caching, and sends no cookies. Patient data
// goes only to the service the person signed in to, and is kept in memory only.
import {
	isServiceId,
	listingOf,
	ServiceError,
	type IpsService,
	type StoredSummary,
	type SummaryListing
} from './service.ts';

/** The backend's FHIR media type (its S-API-4). */
export const FHIR_JSON = 'application/fhir+json';

/** The page size a list asks for: the backend's most (its S-API-8). */
export const PAGE_SIZE = 100;

/** The most pages a list follows, so a misbehaving service cannot loop it forever. */
export const MAX_PAGES = 100;

export interface HttpServiceOptions {
	/** The service root, `https://…` (or loopback `http://` in development). */
	base: string;
	/** The current access token, or undefined when signed out (the call is then a 401). */
	token: () => Promise<string | undefined>;
	/** Allow `http://localhost` and `http://127.0.0.1` (development only, F-LOAD-3). */
	allowHttpLoopback?: boolean;
	fetch?: typeof fetch;
}

type Json = Record<string, unknown>;

/** The root as a URL, refused unless it is HTTPS or (when allowed) loopback HTTP. */
export function serviceRoot(base: string, allowHttpLoopback = false): URL {
	const url = new URL(base);
	const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
	if (url.protocol !== 'https:' && !(allowHttpLoopback && url.protocol === 'http:' && loopback))
		throw new ServiceError(0, 'insecure_service_url');
	if (!url.pathname.endsWith('/')) url.pathname += '/';
	return url;
}

export class HttpService implements IpsService {
	readonly #root: URL;
	readonly #token: () => Promise<string | undefined>;
	readonly #fetch: typeof fetch;

	constructor(options: HttpServiceOptions) {
		this.#root = serviceRoot(options.base, options.allowHttpLoopback);
		this.#token = options.token;
		this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	}

	async create(bundle: unknown): Promise<StoredSummary> {
		const response = await this.#call('fhir/Bundle', {
			method: 'POST',
			body: JSON.stringify(bundle),
			headers: { 'content-type': FHIR_JSON }
		});
		return stored(await response.json());
	}

	async read(id: string): Promise<StoredSummary> {
		// The service answers any id it never issued with a 404 (its S-API-5); so does this,
		// without sending anything.
		if (!isServiceId(id)) throw new ServiceError(404, 'not_found');
		return stored(await (await this.#call(`fhir/Bundle/${id}`)).json());
	}

	async remove(id: string): Promise<void> {
		if (!isServiceId(id)) throw new ServiceError(404, 'not_found');
		await this.#call(`fhir/Bundle/${id}`, { method: 'DELETE' });
	}

	/** Every stored document, newest first, following the service's `next` links. */
	async list(): Promise<SummaryListing[]> {
		const out: SummaryListing[] = [];
		let path: string | undefined = `fhir/Bundle?_count=${PAGE_SIZE}`;
		for (let page = 0; path && page < MAX_PAGES; page++) {
			const bundle = (await (await this.#call(path)).json()) as Json;
			for (const entry of Array.isArray(bundle.entry) ? (bundle.entry as Json[]) : []) {
				const resource = entry.resource as Json | undefined;
				if (resource && typeof resource.id === 'string') out.push(listingOf(resource.id, resource));
			}
			path = nextPath(bundle, this.#root);
		}
		return out;
	}

	/** One request, answered or turned into the service's problem as a ServiceError. */
	async #call(path: string, init: RequestInit = {}): Promise<Response> {
		const token = await this.#token();
		const headers = new Headers(init.headers);
		headers.set('accept', `${FHIR_JSON}, application/problem+json`);
		if (token) headers.set('authorization', `Bearer ${token}`);
		let response: Response;
		try {
			response = await this.#fetch(new URL(path, this.#root), {
				...init,
				headers,
				cache: 'no-store',
				credentials: 'omit',
				redirect: 'error'
			});
		} catch {
			throw new ServiceError(0, 'unreachable');
		}
		if (!response.ok) throw await problem(response);
		return response;
	}
}

function stored(body: unknown): StoredSummary {
	const bundle = body as Json;
	if (typeof bundle?.id !== 'string') throw new ServiceError(502, 'not_a_bundle');
	return { id: bundle.id, bundle };
}

/** The `next` link of a searchset, as a path under the root, or undefined. */
function nextPath(bundle: Json, root: URL): string | undefined {
	const links = Array.isArray(bundle.link) ? (bundle.link as Json[]) : [];
	const url = links.find((l) => l.relation === 'next')?.url;
	if (typeof url !== 'string') return undefined;
	const next = new URL(url, root);
	// Never follow a link off the service the person signed in to.
	if (next.origin !== root.origin || !next.pathname.startsWith(root.pathname)) return undefined;
	return next.pathname.slice(root.pathname.length) + next.search;
}

/** The service's RFC 9457 problem (`code`, `errors[0].pointer`), or the status alone. */
async function problem(response: Response): Promise<ServiceError> {
	let code = 'http_error';
	let pointer: string | undefined;
	try {
		const body = (await response.json()) as { code?: unknown; errors?: { pointer?: unknown }[] };
		if (typeof body.code === 'string') code = body.code;
		const first = body.errors?.[0]?.pointer;
		if (typeof first === 'string') pointer = first;
	} catch {
		// Not JSON: the status says enough.
	}
	return new ServiceError(response.status, code, pointer);
}
