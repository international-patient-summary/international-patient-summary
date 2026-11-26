// Where the backend service and its identity provider are (spec §6.10, F-SIGN-4),
// fixed at build time: VITE_IPS_SERVICE_URL, VITE_IPS_OIDC_ISSUER and
// VITE_IPS_OIDC_CLIENT_ID. The development server falls back to the
// backend's local defaults (its README: the service on :1241, Keycloak's
// `ips` realm on :8080, the public `ips-viewer` client). A production build
// without them has no service, and says so.

export interface ServiceConfig {
	serviceUrl: string;
	issuer: string;
	clientId: string;
}

export interface ServiceEnv {
	VITE_IPS_SERVICE_URL?: string;
	VITE_IPS_OIDC_ISSUER?: string;
	VITE_IPS_OIDC_CLIENT_ID?: string;
	DEV?: boolean;
}

export const DEVELOPMENT_CONFIG: ServiceConfig = {
	serviceUrl: 'http://localhost:1241',
	issuer: 'http://localhost:8080/realms/ips',
	clientId: 'ips-viewer'
};

/** The configured service, or undefined when this build has none. */
export function serviceConfig(env: ServiceEnv = import.meta.env): ServiceConfig | undefined {
	const serviceUrl = env.VITE_IPS_SERVICE_URL?.trim();
	const issuer = env.VITE_IPS_OIDC_ISSUER?.trim();
	if (serviceUrl && issuer)
		return { serviceUrl, issuer, clientId: env.VITE_IPS_OIDC_CLIENT_ID?.trim() || 'ips-viewer' };
	return env.DEV ? DEVELOPMENT_CONFIG : undefined;
}
