import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CONFIG, serviceConfig } from './config.ts';

describe('serviceConfig', () => {
	it('takes the service and issuer from the build, defaulting the client', () => {
		expect(
			serviceConfig({
				VITE_IPS_SERVICE_URL: ' https://ips.example ',
				VITE_IPS_OIDC_ISSUER: 'https://id.example/realms/ips'
			})
		).toEqual({
			serviceUrl: 'https://ips.example',
			issuer: 'https://id.example/realms/ips',
			clientId: 'ips-viewer'
		});
		expect(
			serviceConfig({
				VITE_IPS_SERVICE_URL: 'https://a',
				VITE_IPS_OIDC_ISSUER: 'https://b',
				VITE_IPS_OIDC_CLIENT_ID: 'mine'
			})?.clientId
		).toBe('mine');
	});

	it('falls back to the local backend in development, and to none in production', () => {
		expect(serviceConfig({ DEV: true })).toEqual(DEVELOPMENT_CONFIG);
		expect(serviceConfig({ VITE_IPS_SERVICE_URL: 'https://a' })).toBeUndefined();
		expect(serviceConfig({})).toBeUndefined();
	});
});
