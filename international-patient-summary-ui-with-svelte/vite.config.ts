import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

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
			// allows https: only for the URL loader, which the person asks for.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:'],
					'font-src': ['self', 'data:'],
					'connect-src': ['self', 'https:'],
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
		testTimeout: 30_000
	},
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined
});
