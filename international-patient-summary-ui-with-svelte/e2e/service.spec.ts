// The backend service page (spec §6.10): OIDC sign-in with PKCE, store, list,
// open, delete and sign out, against a stand-in identity provider and service
// (the build's VITE_IPS_* settings point at them; playwright.config.ts).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { join } from 'node:path';
import { EXAMPLES_DIR, family, watchErrors } from './helpers.ts';

const ISSUER = 'https://id.test/realms/ips';
const SERVICE = 'https://ips.test';
const TOKEN = `h.${Buffer.from(JSON.stringify({ preferred_username: 'writer' })).toString('base64url')}.s`;

const cors = (origin: string) => ({
	'access-control-allow-origin': origin,
	'access-control-allow-headers': 'authorization, content-type, accept',
	'access-control-allow-methods': 'GET, POST, DELETE'
});

/** Stand in for Keycloak and the service; answer what the tab asks, and record it. */
async function standIns(page: Page) {
	const rows = new Map<string, Record<string, unknown>>();
	const seen = { exchanges: [] as URLSearchParams[], authorizations: [] as (string | null)[] };
	let next = 1;
	await page.route(`${ISSUER}/**`, async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());
		const origin = request.headers().origin ?? '*';
		if (url.pathname.endsWith('/.well-known/openid-configuration'))
			return route.fulfill({
				json: {
					issuer: ISSUER,
					authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
					token_endpoint: `${ISSUER}/protocol/openid-connect/token`
				},
				headers: cors(origin)
			});
		if (url.pathname.endsWith('/auth')) {
			// Signed in at once: send the browser back with a code and the same state.
			const back = new URL(url.searchParams.get('redirect_uri')!);
			back.search = new URLSearchParams({
				code: 'code-1',
				state: url.searchParams.get('state')!
			}).toString();
			return route.fulfill({ status: 302, headers: { location: back.href } });
		}
		seen.exchanges.push(new URLSearchParams(request.postData() ?? ''));
		return route.fulfill({ json: { access_token: TOKEN, expires_in: 300 }, headers: cors(origin) });
	});
	await page.route(`${SERVICE}/**`, async (route: Route) => {
		const request = route.request();
		const origin = request.headers().origin ?? '*';
		if (request.method() === 'OPTIONS')
			return route.fulfill({ status: 204, headers: cors(origin) });
		seen.authorizations.push(request.headers().authorization ?? null);
		const url = new URL(request.url());
		const id = url.pathname.split('/')[3];
		const headers = cors(origin);
		if (request.method() === 'POST') {
			const newId = `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
			rows.set(newId, { ...request.postDataJSON(), id: newId });
			return route.fulfill({ status: 201, json: rows.get(newId), headers });
		}
		if (request.method() === 'DELETE') {
			rows.delete(id);
			return route.fulfill({ status: 204, headers });
		}
		if (id) return route.fulfill({ json: rows.get(id), headers });
		return route.fulfill({
			json: {
				resourceType: 'Bundle',
				type: 'searchset',
				entry: [...rows.values()].reverse().map((resource) => ({ resource }))
			},
			headers
		});
	});
	return { rows, seen };
}

test.describe('service', () => {
	test('signs in with PKCE, stores, lists, opens, deletes and signs out', async ({ page }) => {
		const errors = watchErrors(page);
		const { rows, seen } = await standIns(page);
		const allowed = new Set(['http://localhost:4179', new URL(ISSUER).origin, SERVICE]);
		const offsite: string[] = [];
		page.on('request', (r) => {
			if (!allowed.has(new URL(r.url()).origin)) offsite.push(r.url());
		});

		await page.goto('/?lang=en-US');
		await page.locator('.site-nav').getByRole('link', { name: 'Service' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Service' })).toBeVisible();
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByText(/Signed in as \W?writer/)).toBeVisible();
		// The code and state are gone from the address, and so is the pending sign-in.
		expect(new URL(page.url()).search).toBe('');
		expect(
			await page.evaluate(() =>
				Object.keys(sessionStorage).filter((k) => !k.startsWith('sveltekit:'))
			)
		).toEqual([]);
		const [exchange] = seen.exchanges;
		expect(exchange.get('grant_type')).toBe('authorization_code');
		expect(exchange.get('code')).toBe('code-1');
		expect(exchange.get('code_verifier')).toMatch(/^[\w-]{43}$/);

		await page
			.locator('.service-store input[type="file"]')
			.setInputFiles(join(EXAMPLES_DIR, 'IPS-examples-Bundle-01.json'));
		const name = family('IPS-examples-Bundle-01');
		const item = page.locator('.tour-summaries .document-list-item').filter({ hasText: name });
		await expect(item).toBeVisible();
		expect(rows.size).toBe(1);
		expect(seen.authorizations.every((a) => a === `Bearer ${TOKEN}`)).toBe(true);

		await item.getByRole('button', { name: 'Open' }).click();
		await expect(page.locator('.patient-banner')).toContainText(name);
		await page.getByRole('button', { name: 'Back to the stored summaries' }).click();
		await item.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByText('The service holds no summaries you may see.')).toBeVisible();
		expect(rows.size).toBe(0);

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
		const stored = await page.evaluate(() => ({
			local: Object.keys(localStorage).filter((k) => !/\.(locale|theme|text-size)$/.test(k)),
			session: Object.keys(sessionStorage).filter((k) => !k.startsWith('sveltekit:')),
			cookies: document.cookie
		}));
		expect(stored).toEqual({ local: [], session: [], cookies: '' });
		expect(offsite).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('saves a document opened in the viewer to the service', async ({ page }) => {
		const { rows } = await standIns(page);
		await page.goto('/service/?lang=en-US');
		await page.getByRole('button', { name: 'Sign in' }).click();
		await expect(page.getByText(/Signed in as \W?writer/)).toBeVisible();
		// Within the app, so the session (in memory) is kept.
		await page.locator('.site-nav').getByRole('link', { name: 'Home' }).click();
		const chooser = page.waitForEvent('filechooser');
		await page.locator('.file-upload button').click();
		await (await chooser).setFiles(join(EXAMPLES_DIR, 'bundle-minimal.json'));
		await page.locator('.patient-banner').waitFor();
		await page.getByRole('button', { name: 'Save to service' }).click();
		await expect(
			page.getByRole('status').filter({ hasText: 'Saved to the service.' })
		).toBeVisible();
		expect(rows.size).toBe(1);
		await page.locator('.site-nav').getByRole('link', { name: 'Service' }).click();
		await expect(
			page
				.locator('.tour-summaries .document-list-item')
				.filter({ hasText: family('bundle-minimal') })
		).toBeVisible();
		// A document opened from the service is not offered for saving again.
		await page
			.locator('.tour-summaries .document-list-item')
			.getByRole('button', { name: 'Open' })
			.click();
		await expect(page.locator('.patient-banner')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Save to service' })).toHaveCount(0);
	});

	test('offers no saving when signed out', async ({ page }) => {
		await page.goto('/?lang=en-US');
		const chooser = page.waitForEvent('filechooser');
		await page.locator('.file-upload button').click();
		await (await chooser).setFiles(join(EXAMPLES_DIR, 'bundle-minimal.json'));
		await page.locator('.patient-banner').waitFor();
		await expect(page.getByRole('button', { name: 'Save to service' })).toHaveCount(0);
	});

	test('says a forged return is stale, and has no axe violations', async ({ page }) => {
		await standIns(page);
		await page.goto('/service/?lang=en-US&code=x&state=forged');
		await expect(page.getByRole('alert')).toContainText('expired or was started in another tab');
		const results = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
			.analyze();
		expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
	});
});
