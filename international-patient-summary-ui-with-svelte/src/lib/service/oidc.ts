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
	/** Renews the access token without signing in again (F-SIGN-8); in memory only. */
	refreshToken?: string;
	/** The hint for signing out at the provider (F-SIGN-9); in memory only. */
	idToken?: string;
}

interface Discovery {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	/** RP-initiated logout (OpenID Connect RP-Initiated Logout 1.0), when offered. */
	end_session_endpoint?: string;
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
	return tokenRequest(
		config,
		{
			grant_type: 'authorization_code',
			code,
			redirect_uri: config.redirectUri,
			client_id: config.clientId,
			code_verifier: pending.verifier
		},
		deps,
		now
	);
}

/**
 * A new access token from the session's refresh token (F-SIGN-8). The provider
 * may rotate the refresh token; without a new one, the old one is kept.
 */
export async function refreshSession(
	config: OidcConfig,
	session: OidcSession,
	deps: OidcDeps,
	now: () => number = Date.now
): Promise<OidcSession> {
	if (!session.refreshToken) throw new OidcError('signInFailed');
	const renewed = await tokenRequest(
		config,
		{
			grant_type: 'refresh_token',
			refresh_token: session.refreshToken,
			client_id: config.clientId
		},
		deps,
		now
	);
	return {
		...renewed,
		refreshToken: renewed.refreshToken ?? session.refreshToken,
		idToken: renewed.idToken ?? session.idToken
	};
}

/** POST to the token endpoint; the answer as a session, or an OidcError. */
async function tokenRequest(
	config: OidcConfig,
	form: Record<string, string>,
	deps: OidcDeps,
	now: () => number
): Promise<OidcSession> {
	const { token_endpoint } = await discover(config.issuer, deps.fetch);
	let body: {
		access_token?: unknown;
		expires_in?: unknown;
		refresh_token?: unknown;
		id_token?: unknown;
	};
	try {
		const response = await deps.fetch(token_endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(form),
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
		username: usernameOf(body.access_token),
		refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
		idToken: typeof body.id_token === 'string' ? body.id_token : undefined
	};
}

/**
 * Where to send the browser to sign out at the provider too (F-SIGN-9), coming
 * back to the page; undefined when the provider offers no such endpoint or
 * cannot be reached, so only the local session ends.
 */
export async function signOutHref(
	config: OidcConfig,
	session: OidcSession | undefined,
	fetchImpl: typeof fetch
): Promise<string | undefined> {
	let endpoint: string | undefined;
	try {
		endpoint = (await discover(config.issuer, fetchImpl)).end_session_endpoint;
	} catch {
		return undefined;
	}
	if (!endpoint) return undefined;
	const url = new URL(endpoint);
	const params = new URLSearchParams({
		client_id: config.clientId,
		post_logout_redirect_uri: config.redirectUri
	});
	if (session?.idToken) params.set('id_token_hint', session.idToken);
	url.search = params.toString();
	return url.href;
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
