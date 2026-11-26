// HttpService against a fake of the backend's HTTP API (its spec §4): the
// requests it sends, how it reads answers and problems, and how it pages a list.
import { describe, expect, it } from 'vitest';
import { FHIR_JSON, HttpService, MAX_PAGES, serviceRoot } from './http-service.ts';
import { ServiceError } from './service.ts';

const ID = '2b39610e-a2d8-4548-9e5f-eaa9ecd0fc08';
const BASE = 'https://ips.example/api/';

interface Sent {
	url: string;
	init: RequestInit;
}

/** A fetch that records each request and answers with `respond`. */
function fake(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
	const sent: Sent[] = [];
	const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
		sent.push({ url: String(input), init });
		return respond(new URL(String(input)), init);
	}) as typeof globalThis.fetch;
	return { sent, fetch };
}

const json = (status: number, body: unknown, type = FHIR_JSON) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

const service = (fetch: typeof globalThis.fetch, token = 'tok') =>
	new HttpService({ base: BASE, token: async () => token || undefined, fetch });

/** A SUBSETTED list entry, as the backend writes one (its S-API-7). */
const listed = (id: string, title: string, family: string) => ({
	fullUrl: `/fhir/Bundle/${id}`,
	resource: {
		resourceType: 'Bundle',
		id,
		type: 'document',
		meta: { tag: [{ code: 'SUBSETTED' }] },
		entry: [
			{
				resource: {
					resourceType: 'Composition',
					title,
					date: '2024-01-02',
					subject: { reference: 'Patient/p' }
				}
			},
			{ fullUrl: 'urn:uuid:p', resource: { resourceType: 'Patient', id: 'p', name: [{ family }] } }
		]
	},
	search: { mode: 'match' }
});

describe('HttpService requests', () => {
	it('stores with a bearer token, as FHIR JSON, uncached and without cookies', async () => {
		const { sent, fetch } = fake(() => json(201, { resourceType: 'Bundle', id: ID }));
		const stored = await service(fetch).create({ resourceType: 'Bundle' });
		expect(stored.id).toBe(ID);
		const [{ url, init }] = sent;
		expect(url).toBe('https://ips.example/api/fhir/Bundle');
		expect(init.method).toBe('POST');
		const headers = new Headers(init.headers);
		expect(headers.get('authorization')).toBe('Bearer tok');
		expect(headers.get('content-type')).toBe(FHIR_JSON);
		expect(init.cache).toBe('no-store');
		expect(init.credentials).toBe('omit');
		expect(init.redirect).toBe('error');
	});

	it('sends no Authorization header when signed out', async () => {
		const { sent, fetch } = fake(() =>
			json(401, { code: 'unauthorized' }, 'application/problem+json')
		);
		const error = await service(fetch, '')
			.read(ID)
			.catch((e) => e);
		expect(error).toBeInstanceOf(ServiceError);
		expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
		expect(new Headers(sent[0].init.headers).has('authorization')).toBe(false);
	});

	it('reads and deletes by id, and refuses an id it never issued without asking', async () => {
		const { sent, fetch } = fake((_url, init) =>
			init.method === 'DELETE' ? new Response(null, { status: 204 }) : json(200, { id: ID })
		);
		const s = service(fetch);
		expect((await s.read(ID)).id).toBe(ID);
		await s.remove(ID);
		expect(sent.map((r) => [r.init.method ?? 'GET', r.url])).toEqual([
			['GET', `${BASE}fhir/Bundle/${ID}`],
			['DELETE', `${BASE}fhir/Bundle/${ID}`]
		]);
		for (const call of [() => s.read('nope'), () => s.remove('../admin')])
			await expect(call()).rejects.toMatchObject({ status: 404, code: 'not_found' });
		expect(sent).toHaveLength(2);
	});
});

describe('HttpService answers', () => {
	it('carries the refusal code and pointer of a 422', async () => {
		const { fetch } = fake(() =>
			json(
				422,
				{ code: 'no_subject', errors: [{ pointer: '#/entry/0/resource/subject/reference' }] },
				'application/problem+json'
			)
		);
		await expect(service(fetch).create({})).rejects.toMatchObject({
			status: 422,
			code: 'no_subject',
			pointer: '#/entry/0/resource/subject/reference'
		});
	});

	it('keeps the status of an answer that is not a problem', async () => {
		const { fetch } = fake(() => new Response('<html>busy</html>', { status: 503 }));
		await expect(service(fetch).read(ID)).rejects.toMatchObject({
			status: 503,
			code: 'http_error'
		});
	});

	it('says the service is unreachable when the request fails', async () => {
		const fetch = (async () => {
			throw new TypeError('Failed to fetch');
		}) as typeof globalThis.fetch;
		await expect(service(fetch).list()).rejects.toMatchObject({ status: 0, code: 'unreachable' });
	});

	it('refuses an answer that is not a stored Bundle', async () => {
		const { fetch } = fake(() => json(200, { resourceType: 'OperationOutcome' }));
		await expect(service(fetch).read(ID)).rejects.toMatchObject({ status: 502 });
	});
});

describe('HttpService lists', () => {
	it('follows next links and reads each subsetted entry as a listing', async () => {
		const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
		const { sent, fetch } = fake((url) =>
			url.searchParams.has('_cursor')
				? json(200, {
						resourceType: 'Bundle',
						type: 'searchset',
						entry: [listed(ids[1], 'Second', 'Two')]
					})
				: json(200, {
						resourceType: 'Bundle',
						type: 'searchset',
						link: [{ relation: 'next', url: '/api/fhir/Bundle?_count=100&_cursor=5_x' }],
						entry: [listed(ids[0], 'First', 'One'), { search: { mode: 'match' } }]
					})
		);
		expect(await service(fetch).list()).toEqual([
			{ id: ids[0], title: 'First', date: '2024-01-02', patient: 'One' },
			{ id: ids[1], title: 'Second', date: '2024-01-02', patient: 'Two' }
		]);
		expect(sent.map((r) => r.url)).toEqual([
			`${BASE}fhir/Bundle?_count=100`,
			`${BASE}fhir/Bundle?_count=100&_cursor=5_x`
		]);
	});

	it('never follows a next link off the service', async () => {
		for (const url of [
			'https://elsewhere.example/api/fhir/Bundle',
			'https://ips.example/other/fhir/Bundle'
		]) {
			const { sent, fetch } = fake(() =>
				json(200, { resourceType: 'Bundle', link: [{ relation: 'next', url }], entry: [] })
			);
			expect(await service(fetch).list()).toEqual([]);
			expect(sent).toHaveLength(1);
		}
	});

	it('stops after the most pages it follows', async () => {
		const { sent, fetch } = fake(() =>
			json(200, {
				resourceType: 'Bundle',
				link: [{ relation: 'next', url: '/api/fhir/Bundle?_cursor=1_a' }]
			})
		);
		await service(fetch).list();
		expect(sent).toHaveLength(MAX_PAGES);
	});
});

describe('serviceRoot', () => {
	it('takes HTTPS, ending the path with a slash', () => {
		expect(serviceRoot('https://ips.example/api').href).toBe('https://ips.example/api/');
	});

	it('takes loopback HTTP only when development allows it', () => {
		expect(serviceRoot('http://localhost:1241', true).href).toBe('http://localhost:1241/');
		expect(serviceRoot('http://127.0.0.1:1241', true).host).toBe('127.0.0.1:1241');
		for (const [base, dev] of [
			['http://localhost:1241', false],
			['http://ips.example', true],
			['ftp://ips.example', true]
		] as const)
			expect(() => serviceRoot(base, dev)).toThrow(ServiceError);
	});
});
