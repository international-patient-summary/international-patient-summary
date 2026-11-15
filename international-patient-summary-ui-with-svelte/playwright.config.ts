import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	webServer: {
		command: 'pnpm run build && pnpm run preview --port 4179 --strictPort',
		port: 4179,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	use: { baseURL: 'http://localhost:4179' }
});
