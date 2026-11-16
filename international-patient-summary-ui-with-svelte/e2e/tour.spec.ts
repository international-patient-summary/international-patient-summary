// The public tour (spec §6.8): backendless sign-in as example@example.com,
// an in-memory store of the bundled examples, the viewer, and sign-out.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURES, family, watchErrors } from './helpers.ts';

async function signIn(page: Page, lang = 'en-US') {
	await page.goto(`/tour/?lang=${lang}`);
	await page.locator('.tour-sign-in button[type="submit"]').click();
	await page.locator('.tour-summaries .document-list-item').first().waitFor();
}

test.describe('tour', () => {
	test('is linked from the header and fills in the tour account', async ({ page }) => {
		await page.goto('/?lang=en-US');
		await page.locator('.site-nav').getByRole('link', { name: 'Tour' }).click();
		await expect(page.getByRole('heading', { level: 1, name: 'Tour' })).toBeVisible();
		await expect(page.locator('.site-nav').getByRole('link', { name: 'Tour' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.locator('#tour-email')).toHaveValue('example@example.com');
		await expect(page.locator('#tour-password')).toHaveValue('example');
		await expect(page.locator('.tour-guide')).toContainText('step 1 of 3');
	});

	test('refuses another account', async ({ page }) => {
		await page.goto('/tour/?lang=en-US');
		await page.locator('#tour-email').fill('someone@example.org');
		await page.locator('.tour-sign-in button[type="submit"]').click();
		await expect(page.locator('.tour-sign-in [role="alert"]')).toContainText(
			'not the tour account'
		);
	});

	test('signs in, lists every example, opens, deletes, resets and signs out, with no backend', async ({
		page
	}) => {
		const errors = watchErrors(page);
		const requests: string[] = [];
		page.on('request', (r) => requests.push(r.url()));

		await signIn(page);
		await expect(page.locator('.tour-account')).toContainText(
			/Signed in as \W?example@example\.com/
		);
		const items = page.locator('.tour-summaries .document-list-item');
		await expect(items).toHaveCount(FIXTURES.length);
		await expect(page.locator('.tour-guide')).toContainText('step 2 of 3');

		// Open the oldest stored summary (listed last): IPS example Bundle 01's first sibling.
		await items
			.last()
			.getByRole('button', { name: new RegExp(`^Open .*${family(FIXTURES[0])}`) })
			.click();
		await expect(page.locator('.patient-name')).toContainText(family(FIXTURES[0]));
		await expect(page.locator('.tour-guide')).toContainText('step 3 of 3');
		await page.getByRole('button', { name: 'Back to your summaries' }).click();

		await items
			.first()
			.getByRole('button', { name: /^Delete \W*\w/ })
			.click();
		await expect(items).toHaveCount(FIXTURES.length - 1);
		await page.getByRole('button', { name: 'Reset the tour' }).click();
		await expect(items).toHaveCount(FIXTURES.length);

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.locator('#tour-email')).toBeVisible();

		// Backendless: only the app's own files and examples, never a service.
		const origin = new URL(page.url()).origin;
		expect(requests.filter((u) => !u.startsWith(origin))).toEqual([]);
		expect(requests.filter((u) => u.includes('/fhir/'))).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('stores nothing in the browser', async ({ page }) => {
		await signIn(page);
		const stored = await page.evaluate(() => ({
			local: Object.keys(localStorage).filter((k) => !/\.(locale|theme|text-size)$/.test(k)),
			session: Object.keys(sessionStorage),
			cookies: document.cookie
		}));
		expect(stored).toEqual({ local: [], session: [], cookies: '' });
		await page.reload();
		await expect(page.locator('#tour-email')).toBeVisible();
	});

	for (const lang of ['cy-001', 'zh-CN'])
		test(`works in ${lang}, with no axe violations`, async ({ page }) => {
			await signIn(page, lang);
			const results = await new AxeBuilder({ page })
				.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
				.analyze();
			expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
		});
});
