// Sign-in to the backend's identity provider (spec §6.10): OpenID Connect's
// authorization code flow with PKCE (RFC 7636, S256), for a public client.
// No library: discovery, the PKCE pair, the redirect and the code exchange are
// a few standard requests. Only the pending sign-in (state and verifier) is kept
// across the redirect, in sessionStorage, and it is removed on return; the
// access token is never stored.

export interface OidcConfig {
	/** The issuer, e.g. `https://id.example/realms/ips`. */
	issuer: string;
	clientId: string;
	/** Where the provider sends the browser back, exactly as registered. */
	redirectUri: string;
	scope?: string;
}

export interface OidcDeps {
	fetch: typeof fetch;
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
	/** Fills the array with cryptographically strong random bytes. */
	random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}

export interface OidcSession {
	accessToken: string;
	/** Milliseconds since the epoch after which the token is not used. */
	expiresAt: number;
	/** The token's `preferred_username`, for display only (it is not verified here). */
	username?: string;
}

interface Discovery {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
}

interface Pending {
	state: string;
	verifier: string;
}

/** The sessionStorage key of the one pending sign-in. */
export const PENDING_KEY = 'ips-oidc-pending';

/** Why a sign-in failed, as an i18n key under `service.errors.`. */
export class OidcError extends Error {
	constructor(readonly key: 'signInFailed' | 'signInStale' | 'providerUnreachable') {
		super(key);
		this.name = 'OidcError';
	}
}

export function base64url(bytes: Uint8Array): string {
	let text = '';
	for (const byte of bytes) text += String.fromCharCode(byte);
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The S256 challenge of a PKCE verifier (RFC 7636 §4.2). */
export async function challengeOf(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(digest));
}

/** The provider's endpoints, from its discovery document, for exactly this issuer. */
export async function discover(issuer: string, fetchImpl: typeof fetch): Promise<Discovery> {
	const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
	let body: Partial<Discovery>;
	try {
		const response = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
		if (!response.ok) throw new Error(String(response.status));
		body = (await response.json()) as Partial<Discovery>;
	} catch {
		throw new OidcError('providerUnreachable');
	}
	if (
		body.issuer !== issuer.replace(/\/$/, '') ||
		typeof body.authorization_endpoint !== 'string' ||
		typeof body.token_endpoint !== 'string'
	)
		throw new OidcError('signInFailed');
	return body as Discovery;
}

/**
 * Start a sign-in: remember a fresh state and PKCE verifier for this tab, and
 * answer the provider's authorization URL to send the browser to.
 */
export async function beginSignIn(config: OidcConfig, deps: OidcDeps): Promise<string> {
	const { authorization_endpoint } = await discover(config.issuer, deps.fetch);
	const pending: Pending = {
		state: base64url(deps.random(new Uint8Array(16))),
		verifier: base64url(deps.random(new Uint8Array(32)))
	};
	deps.storage.setItem(PENDING_KEY, JSON.stringify(pending));
	const url = new URL(authorization_endpoint);
	url.search = new URLSearchParams({
		response_type: 'code',
		client_id: config.clientId,
		redirect_uri: config.redirectUri,
		scope: config.scope ?? 'openid',
		state: pending.state,
		code_challenge: await challengeOf(pending.verifier),
		code_challenge_method: 'S256'
	}).toString();
	return url.href;
}

/** Whether `url` is the provider sending the browser back (a code or an error, and a state). */
export function isSignInReturn(url: URL): boolean {
	return (
		url.searchParams.has('state') && (url.searchParams.has('code') || url.searchParams.has('error'))
	);
}

/**
 * Finish a sign-in from the URL the provider sent the browser back to. The
 * pending sign-in is removed whatever happens, so a code is exchanged once.
 */
export async function finishSignIn(
	config: OidcConfig,
	url: URL,
	deps: OidcDeps,
	now: () => number = Date.now
): Promise<OidcSession> {
	const raw = deps.storage.getItem(PENDING_KEY);
	deps.storage.removeItem(PENDING_KEY);
	const pending = raw ? (JSON.parse(raw) as Partial<Pending>) : undefined;
	const state = url.searchParams.get('state');
	if (!pending?.state || !pending.verifier || state !== pending.state)
		throw new OidcError('signInStale');
	const code = url.searchParams.get('code');
	if (!code || url.searchParams.has('error')) throw new OidcError('signInFailed');
	const { token_endpoint } = await discover(config.issuer, deps.fetch);
	let body: { access_token?: unknown; expires_in?: unknown };
	try {
		const response = await deps.fetch(token_endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: config.redirectUri,
				client_id: config.clientId,
				code_verifier: pending.verifier
			}),
			cache: 'no-store',
			credentials: 'omit'
		});
		if (!response.ok) throw new OidcError('signInFailed');
		body = await response.json();
	} catch (error) {
		throw error instanceof OidcError ? error : new OidcError('providerUnreachable');
	}
	if (typeof body.access_token !== 'string') throw new OidcError('signInFailed');
	const lifetime = typeof body.expires_in === 'number' ? body.expires_in : 300;
	return {
		accessToken: body.access_token,
		expiresAt: now() + lifetime * 1000,
		username: usernameOf(body.access_token)
	};
}

/** The token's `preferred_username`, read without checking it: for display only. */
export function usernameOf(token: string): string | undefined {
	try {
		const payload = token.split('.')[1];
		if (!payload) return undefined;
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const name = (JSON.parse(json) as { preferred_username?: unknown }).preferred_username;
		return typeof name === 'string' ? name : undefined;
	} catch {
		return undefined;
	}
}

/** The token while it is still good (with half a minute to spare), else undefined. */
export function currentToken(session: OidcSession | undefined, now: number = Date.now()) {
	return session && now < session.expiresAt - 30_000 ? session.accessToken : undefined;
}
