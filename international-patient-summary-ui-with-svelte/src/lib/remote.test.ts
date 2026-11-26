// The backend session (spec §6.10) against a fake provider and a fake service.
import { beforeEach, describe, expect, it } from 'vitest';
import { errorKey, RemoteSession } from './remote.svelte.ts';
import { LoadError } from './fhir/parse.ts';
import { OidcError, PENDING_KEY, type OidcDeps } from './service/oidc.ts';
import { ServiceError } from './service/service.ts';
import { viewer } from './state.svelte.ts';
import { exampleJson } from './test-helpers.ts';

const ISSUER = 'https://id.example/realms/ips';
const SERVICE = 'https://ips.example';
const REDIRECT = 'https://viewer.example/service/';
const config = { serviceUrl: SERVICE, issuer: ISSUER, clientId: 'ips-viewer' };
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A provider and a service in one fetch; the service holds `rows` and wants `token`. */
function world() {
	const rows = new Map<string, Record<string, unknown>>();
	let next = 1;
	const state = { token: 'tok', revoked: false };
	const storage = new Map<string, string>();
	const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
		const url = new URL(String(input));
		if (url.pathname.endsWith('/.well-known/openid-configuration'))
			return json({
				issuer: ISSUER,
				authorization_endpoint: `${ISSUER}/auth`,
				token_endpoint: `${ISSUER}/token`
			});
		if (url.href === `${ISSUER}/token`) return json({ access_token: state.token, expires_in: 300 });
		if (url.origin !== SERVICE) return new Response(null, { status: 404 });
		const auth = new Headers(init.headers).get('authorization');
		if (state.revoked || auth !== `Bearer ${state.token}`)
			return json({ code: 'unauthorized' }, 401);
		const id = url.pathname.split('/')[3];
		const method = init.method ?? 'GET';
		if (method === 'POST') {
			const bundle = JSON.parse(String(init.body));
			if (bundle.type !== 'document')
				return json({ code: 'not_a_document', errors: [{ pointer: '#/type' }] }, 422);
			const newId = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
			rows.set(newId, { ...bundle, id: newId });
			return json(rows.get(newId), 201);
		}
		if (method === 'DELETE') return new Response(null, { status: rows.delete(id) ? 204 : 404 });
		if (id) return rows.has(id) ? json(rows.get(id)) : json({ code: 'not_found' }, 404);
		return json({
			resourceType: 'Bundle',
			type: 'searchset',
			entry: [...rows.values()].reverse().map((resource) => ({ resource }))
		});
	}) as typeof globalThis.fetch;
	const deps: OidcDeps = {
		fetch,
		storage: {
			getItem: (k) => storage.get(k) ?? null,
			setItem: (k, v) => void storage.set(k, v),
			removeItem: (k) => void storage.delete(k)
		},
		random: (bytes) => bytes.fill(7)
	};
	return { rows, state, storage, deps };
}

async function signedIn() {
	const w = world();
	const remote = new RemoteSession(
		config,
		() => REDIRECT,
		() => w.deps
	);
	const href = new URL((await remote.signInHref())!);
	const back = new URL(`${REDIRECT}?code=c&state=${href.searchParams.get('state')}`);
	await remote.completeSignIn(back);
	return { ...w, remote };
}

const file = (body: unknown, name = 'ips.json') =>
	new File([typeof body === 'string' ? body : JSON.stringify(body)], name, {
		type: 'application/json'
	});

beforeEach(() => viewer.clear());

describe('RemoteSession', () => {
	it('signs in through the provider and lists what the service holds', async () => {
		const { remote, storage } = await signedIn();
		expect(remote.signedIn).toBe(true);
		expect(remote.error).toBeUndefined();
		expect(remote.summaries).toEqual([]);
		expect(storage.has(PENDING_KEY)).toBe(false);
	});

	it('stores a file, opens it in the viewer, and deletes it', async () => {
		const { remote, rows } = await signedIn();
		await remote.store(file(exampleJson('bundle-minimal')));
		expect(remote.error).toBeUndefined();
		expect(remote.summaries).toHaveLength(1);
		await remote.open(remote.summaries[0]);
		expect(viewer.doc).toBeDefined();
		expect(viewer.loaded?.source.kind).toBe('service');
		await remote.remove(remote.summaries[0].id);
		expect(rows.size).toBe(0);
		expect(remote.summaries).toEqual([]);
	});

	it('says why a file was not stored', async () => {
		const { remote } = await signedIn();
		await remote.store(file({ resourceType: 'Bundle', type: 'collection' }));
		expect(remote.error).toBe('refused');
		await remote.store(file('{ not json', 'x.json'));
		expect(remote.error).toBe('unreadable');
	});

	it('ends the session when the service refuses the token', async () => {
		const { remote, state } = await signedIn();
		state.revoked = true;
		await remote.refresh();
		expect(remote.error).toBe('expired');
		expect(remote.signedIn).toBe(false);
	});

	it('reports a sign-in that returns with the wrong state, and needs a config', async () => {
		const w = world();
		const remote = new RemoteSession(
			config,
			() => REDIRECT,
			() => w.deps
		);
		await remote.signInHref();
		await remote.completeSignIn(new URL(`${REDIRECT}?code=c&state=forged`));
		expect(remote.signedIn).toBe(false);
		expect(remote.error).toBe('signInStale');
		const none = new RemoteSession(
			undefined,
			() => REDIRECT,
			() => w.deps
		);
		expect(await none.signInHref()).toBeUndefined();
		expect(none.error).toBe('signInFailed');
		await none.refresh();
		expect(none.error).toBe('expired');
	});

	it('saves the open document to the service, and confirms it', async () => {
		const { remote, rows } = await signedIn();
		await remote.save(exampleJson('bundle-minimal'));
		expect(remote.error).toBeUndefined();
		expect(remote.saved).toBe([...rows.keys()][0]);
		expect(remote.summaries).toHaveLength(1);
		await remote.save({ resourceType: 'Bundle', type: 'collection' });
		expect(remote.saved).toBeUndefined();
		expect(remote.error).toBe('refused');
		remote.signOut();
		expect(remote.saved).toBeUndefined();
	});

	it('signs out, forgetting the token, the list and the open document', async () => {
		const { remote } = await signedIn();
		await remote.store(file(exampleJson('bundle-minimal')));
		await remote.open(remote.summaries[0]);
		remote.signOut();
		expect(remote.signedIn).toBe(false);
		expect(remote.summaries).toEqual([]);
		expect(viewer.doc).toBeUndefined();
	});
});

describe('errorKey', () => {
	it.each([
		[new ServiceError(0, 'unreachable'), 'unreachable'],
		[new ServiceError(403, 'forbidden'), 'forbidden'],
		[new ServiceError(404, 'not_found'), 'notFound'],
		[new ServiceError(413, 'too_large'), 'refused'],
		[new ServiceError(500, 'x'), 'service'],
		[new OidcError('providerUnreachable'), 'providerUnreachable'],
		[new LoadError('empty'), 'unreadable'],
		[new Error('x'), 'service']
	])('maps %o to %s', (error, key) => {
		expect(errorKey(error)).toBe(key);
	});
});
