import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIXTURES, openExample } from './helpers.ts';

const THEMES = ['light', 'dark'];

for (const theme of THEMES) {
	test.describe(`axe, ${theme} theme`, () => {
		test.beforeEach(async ({ page }) => {
			await page.addInitScript(
				(t) => localStorage.setItem('international-patient-summary-ui.theme', t),
				theme
			);
		});

		for (const path of ['/?lang=en-US', '/examples/?lang=en-US', '/tour/?lang=en-US'])
			test(`route ${path}`, async ({ page }) => {
				await page.goto(path);
				await page.locator('h1').waitFor();
				const results = await new AxeBuilder({ page })
					.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
					.analyze();
				expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
			});

		for (const name of FIXTURES)
			test(`fixture ${name}`, async ({ page }) => {
				await openExample(page, name);
				const results = await new AxeBuilder({ page })
					.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
					.analyze();
				expect(
					results.violations.map(
						(v) => `${v.id}: ${v.nodes[0]?.target} ${v.nodes[0]?.failureSummary?.slice(0, 160)}`
					)
				).toEqual([]);
			});
	});
}

test.describe('axe, every locale', () => {
	for (const lang of ['cy-001', 'en-US', 'en-GB', 'zh-CN'])
		for (const name of FIXTURES)
			test(`${lang} ${name}`, async ({ page }) => {
				await openExample(page, name, lang);
				const results = await new AxeBuilder({ page })
					.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
					.analyze();
				expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
			});
});
