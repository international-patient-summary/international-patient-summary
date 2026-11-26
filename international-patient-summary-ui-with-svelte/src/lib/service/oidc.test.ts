// The OIDC authorization code flow with PKCE (spec §6.10, F-SIGN-1…3)
// against a fake provider.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	base64url,
	beginSignIn,
	challengeOf,
	currentToken,
	discover,
	finishSignIn,
	isSignInReturn,
	OidcError,
	PENDING_KEY,
	usernameOf,
	type OidcConfig,
	type OidcDeps
} from './oidc.ts';

const ISSUER = 'https://id.example/realms/ips';
const config: OidcConfig = {
	issuer: ISSUER,
	clientId: 'ips-viewer',
	redirectUri: 'https://viewer.example/service/'
};
const discovery = {
	issuer: ISSUER,
	authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
	token_endpoint: `${ISSUER}/protocol/openid-connect/token`
};

function memoryStorage() {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k)
	};
}

/** A provider that serves discovery and answers the token endpoint with `token`. */
function provider(
	token: (body: URLSearchParams) => Response = () => json({ access_token: 'a.b.c', expires_in: 60 })
) {
	const sent: { url: string; init?: RequestInit }[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		sent.push({ url, init });
		if (url.endsWith('/.well-known/openid-configuration')) return json(discovery);
		if (url === discovery.token_endpoint) return token(init?.body as URLSearchParams);
		return new Response(null, { status: 404 });
	}) as typeof globalThis.fetch;
	return { sent, fetch };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const counting = () => {
	let n = 0;
	return (bytes: Uint8Array) => bytes.map(() => n++ % 256);
};

function deps(
	fetch: typeof globalThis.fetch,
	storage = memoryStorage()
): OidcDeps & { storage: ReturnType<typeof memoryStorage> } {
	return { fetch, storage, random: counting() };
}

describe('PKCE', () => {
	it('derives the S256 challenge as SHA-256 in base64url (RFC 7636 §4.2)', async () => {
		// Checked against Node's own SHA-256 and base64url, an independent implementation.
		for (const verifier of ['dBjftJeZ4CVP-mJ92K9qXu7fW3vIh7ZoQrH4wQp3YyQ', 'a'.repeat(128)])
			expect(await challengeOf(verifier)).toBe(
				createHash('sha256').update(verifier).digest('base64url')
			);
	});

	it('encodes base64url without padding', () => {
		expect(base64url(new Uint8Array([251, 255]))).toBe('-_8');
	});
});

describe('discovery', () => {
	it('refuses a document for another issuer, and says when the provider cannot be reached', async () => {
		const other = (async () =>
			json({ ...discovery, issuer: 'https://evil.example' })) as typeof fetch;
		await expect(discover(ISSUER, other)).rejects.toMatchObject({ key: 'signInFailed' });
		const down = (async () => {
			throw new TypeError('offline');
		}) as typeof fetch;
		await expect(discover(ISSUER, down)).rejects.toMatchObject({ key: 'providerUnreachable' });
		const missing = (async () => new Response(null, { status: 404 })) as typeof fetch;
		await expect(discover(`${ISSUER}/`, missing)).rejects.toBeInstanceOf(OidcError);
	});
});

describe('the sign-in', () => {
	it('sends the browser to the provider with a fresh state and an S256 challenge', async () => {
		const { fetch } = provider();
		const d = deps(fetch);
		const href = new URL(await beginSignIn(config, d));
		expect(href.origin + href.pathname).toBe(discovery.authorization_endpoint);
		const pending = JSON.parse(d.storage.map.get(PENDING_KEY)!);
		expect(Object.fromEntries(href.searchParams)).toEqual({
			response_type: 'code',
			client_id: 'ips-viewer',
			redirect_uri: config.redirectUri,
			scope: 'openid',
			state: pending.state,
			code_challenge: await challengeOf(pending.verifier),
			code_challenge_method: 'S256'
		});
		expect(pending.verifier).toHaveLength(43);
	});

	it('exchanges the code once, with the verifier, and keeps only the token in memory', async () => {
		const payload = base64url(
			new TextEncoder().encode(JSON.stringify({ preferred_username: 'writer' }))
		);
		const { sent, fetch } = provider(() =>
			json({ access_token: `h.${payload}.s`, expires_in: 120 })
		);
		const d = deps(fetch);
		await beginSignIn(config, d);
		const { state, verifier } = JSON.parse(d.storage.map.get(PENDING_KEY)!);
		const back = new URL(`${config.redirectUri}?code=abc&state=${state}`);
		expect(isSignInReturn(back)).toBe(true);
		const session = await finishSignIn(config, back, d, () => 1_000);
		expect(session).toEqual({
			accessToken: `h.${payload}.s`,
			expiresAt: 121_000,
			username: 'writer'
		});
		expect(d.storage.map.size).toBe(0);
		const exchange = sent.find((r) => r.url === discovery.token_endpoint)!;
		expect(Object.fromEntries(exchange.init!.body as URLSearchParams)).toEqual({
			grant_type: 'authorization_code',
			code: 'abc',
			redirect_uri: config.redirectUri,
			client_id: 'ips-viewer',
			code_verifier: verifier
		});
		await expect(finishSignIn(config, back, d)).rejects.toMatchObject({ key: 'signInStale' });
	});

	it('refuses a return whose state is not the pending one, or that carries an error', async () => {
		const { fetch } = provider();
		const d = deps(fetch);
		await beginSignIn(config, d);
		await expect(
			finishSignIn(config, new URL(`${config.redirectUri}?code=abc&state=forged`), d)
		).rejects.toMatchObject({ key: 'signInStale' });
		await beginSignIn(config, d);
		const { state } = JSON.parse(d.storage.map.get(PENDING_KEY)!);
		await expect(
			finishSignIn(config, new URL(`${config.redirectUri}?error=access_denied&state=${state}`), d)
		).rejects.toMatchObject({ key: 'signInFailed' });
	});

	it('fails when the provider refuses the code or answers no token', async () => {
		for (const answer of [json({ error: 'invalid_grant' }, 400), json({ token_type: 'Bearer' })]) {
			const { fetch } = provider(() => answer);
			const d = deps(fetch);
			await beginSignIn(config, d);
			const { state } = JSON.parse(d.storage.map.get(PENDING_KEY)!);
			await expect(
				finishSignIn(config, new URL(`${config.redirectUri}?code=abc&state=${state}`), d)
			).rejects.toMatchObject({ key: 'signInFailed' });
		}
	});

	it('says the provider is unreachable when the exchange cannot be sent', async () => {
		const { fetch } = provider(() => {
			throw new TypeError('offline');
		});
		const d = deps(fetch);
		await beginSignIn(config, d);
		const { state } = JSON.parse(d.storage.map.get(PENDING_KEY)!);
		await expect(
			finishSignIn(config, new URL(`${config.redirectUri}?code=abc&state=${state}`), d)
		).rejects.toMatchObject({ key: 'providerUnreachable' });
	});
});

describe('tokens', () => {
	it('stops using a token half a minute before it expires', () => {
		const session = { accessToken: 't', expiresAt: 100_000 };
		expect(currentToken(session, 69_999)).toBe('t');
		expect(currentToken(session, 70_000)).toBeUndefined();
		expect(currentToken(undefined)).toBeUndefined();
	});

	it('reads a username for display, or none from a token it cannot read', () => {
		expect(usernameOf('only-one-part')).toBeUndefined();
		expect(usernameOf('a.%%%.c')).toBeUndefined();
		expect(usernameOf(`a.${btoa('{"sub":"x"}')}.c`)).toBeUndefined();
	});

	it('is not a sign-in return without a state', () => {
		expect(isSignInReturn(new URL('https://viewer.example/service/?code=abc'))).toBe(false);
	});
});
