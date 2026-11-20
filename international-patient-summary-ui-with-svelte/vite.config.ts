import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Tests format dates in one timezone, so snapshots match on every machine and in
// CI. The test workers inherit it.
if (process.env.VITEST) process.env.TZ = 'UTC';

export default defineConfig({
	plugins: [
		sveltekit({
			// The Lily components are written in TypeScript.
			preprocess: vitePreprocess(),
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: '404.html',
				strict: true
			}),
			paths: {
				// Set BASE_PATH at build time to serve the app under a subpath, such as GitHub Pages.
				base: (process.env.BASE_PATH ?? '') as '' | `/${string}`
			},
			// A strict Content-Security-Policy (spec §7). SvelteKit hashes its own
			// bootstrap script, so no inline script runs without a hash. connect-src
			// allows https: for the URL loader and literal loopback HTTP only in
			// development, which the person explicitly asks it to fetch.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self', 'data:'],
					'connect-src':
						process.env.NODE_ENV === 'development'
							? ['self', 'https:', 'http://localhost:*', 'http://127.0.0.1:*']
							: ['self', 'https:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-src': ['none'],
					'worker-src': ['self', 'blob:']
				}
			},
			prerender: { handleHttpError: 'fail', handleMissingId: 'warn' }
		})
	],
	server: {
		fs: {
			// The locale files live at the project root (spec §4.3).
			allow: ['locales']
		}
	},
	test: {
		include: ['src/**/*.test.ts', 'locales/**/*.test.ts'],
		environment: 'jsdom',
		setupFiles: ['./vitest-setup.ts'],
		testTimeout: 30_000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/lib/**/*.{ts,svelte}'],
			exclude: ['src/**/*.test.ts', 'src/lib/test-helpers.ts', 'src/lib/**/*.d.ts'],
			thresholds: { lines: 95 }
		}
	},
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined
});
