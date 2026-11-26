import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	webServer: {
		command: 'pnpm run build && pnpm run preview --port 4179 --strictPort',
		port: 4179,
		reuseExistingServer: !process.env.CI,
		// A service and identity provider that e2e/service.spec.ts stands in for (spec §6.10).
		env: {
			VITE_IPS_SERVICE_URL: 'https://ips.test',
			VITE_IPS_OIDC_ISSUER: 'https://id.test/realms/ips'
		},
		timeout: 180_000
	},
	use: { baseURL: 'http://localhost:4179' }
});
