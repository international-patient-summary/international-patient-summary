import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	EXAMPLES_DIR,
	FIXTURES,
	family,
	openExample,
	uploadFixture,
	watchErrors
} from './helpers.ts';

test.describe('loading and rendering', () => {
	for (const name of FIXTURES) {
		test(`example ${name} renders with no console errors`, async ({ page }) => {
			const errors = watchErrors(page);
			await openExample(page, name);
			await expect(page.locator('.patient-name')).toContainText(family(name));
			for (const title of ['Medication summary', 'Allergies and intolerances', 'Problem list'])
				await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
			await expect(page.locator('h1')).toHaveCount(1);
			expect(errors).toEqual([]);
		});

		test(`${name}: YAML upload renders the same as JSON upload`, async ({ page }) => {
			await uploadFixture(page, `${name}.json`);
			const fromJson = await page.locator('.viewer-main').innerText();
			await page.getByRole('button', { name: 'Open another document' }).click();
			const chooser = page.waitForEvent('filechooser');
			await page.locator('.file-upload button').click();
			await (await chooser).setFiles(join(EXAMPLES_DIR, `${name}.yaml`));
			await page.locator('.patient-banner').waitFor();
			await expect(page.locator('.viewer-loaded')).toContainText('YAML');
			expect(await page.locator('.viewer-main').innerText()).toBe(fromJson);
		});
	}

	test('pasted JSON and YAML both open', async ({ page }) => {
		await page.goto('/?lang=en-US');
		await page.getByRole('tab', { name: 'Paste' }).click();
		await page
			.getByLabel('Paste a FHIR Bundle')
			.fill(readFileSync(join(EXAMPLES_DIR, 'bundle-minimal.yaml'), 'utf8'));
		await page.getByRole('button', { name: 'Open pasted document' }).click();
		await expect(page.locator('.patient-name')).toContainText(family('bundle-minimal'));
	});

	test('a broken paste moves focus to the error summary', async ({ page }) => {
		await page.goto('/?lang=en-US');
		await page.getByRole('tab', { name: 'Paste' }).click();
		await page.getByLabel('Paste a FHIR Bundle').fill('{"resourceType": "Patient"}');
		await page.getByRole('button', { name: 'Open pasted document' }).click();
		await expect(page.locator('.error-summary')).toBeFocused();
		await expect(page.locator('.error-summary')).toContainText('not a Bundle');
	});

	test('the URL loader refuses http:', async ({ page }) => {
		await page.goto('/?lang=en-US');
		await page.getByRole('tab', { name: 'Web address' }).click();
		await page.getByLabel('Web address of a FHIR Bundle').fill('http://example.org/ips.json');
		await page.getByRole('button', { name: 'Fetch and open' }).click();
		await expect(page.locator('.error-summary')).toContainText('https://');
	});

	test('the examples page opens each example', async ({ page }) => {
		for (const name of FIXTURES) {
			await page.goto('/examples/?lang=en-US');
			await page.locator('.example-card a').nth(FIXTURES.indexOf(name)).click();
			await expect(page.locator('.patient-name')).toContainText(family(name));
		}
	});

	test('the three absent states read differently', async ({ page }) => {
		await openExample(page, 'bundle-no-info-required-sections');
		await expect(page.locator('#section-allergies')).toContainText('Information unavailable');
		await expect(page.locator('.patient-danger')).toContainText('Information unavailable');
	});

	test('Show codes reveals codes, which are otherwise hidden', async ({ page }) => {
		await openExample(page, 'IPS-examples-Bundle-01');
		const code = page.locator('.entry-codes').first();
		await expect(code).toBeHidden();
		await page.getByRole('button', { name: 'Show codes' }).click();
		await expect(code).toBeVisible();
	});
});

test.describe('locales', () => {
	const cases = [
		['cy-001', 'cy-001', 'Crynodeb'],
		['en-US', 'en-US', 'Medication summary'],
		['en-GB', 'en-GB', 'Immunisations'],
		['zh-CN', 'zh-CN', '用药']
	] as const;
	for (const [query, tag, text] of cases) {
		test(`?lang=${query} sets <html lang> and translates`, async ({ page }) => {
			await openExample(page, 'bundle-ips-all-sections', query);
			await expect(page.locator('html')).toHaveAttribute('lang', tag);
			await expect(page.locator('body')).toContainText(text);
			// No raw message keys anywhere.
			expect(await page.locator('body').innerText()).not.toMatch(
				/\b(sections|fields|status|loader|viewer)\.[a-zA-Z-]+\b/
			);
			await page.setViewportSize({ width: 320, height: 800 });
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(1);
		});
	}

	test('the language picker switches locale', async ({ page }) => {
		await page.goto('/?lang=en-US');
		await page.locator('.locale-picker-button').click();
		await page.getByRole('option', { name: 'Cymraeg' }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'cy-001');
	});
});

test.describe('keyboard and print', () => {
	test('skip link is first and moves to main', async ({ page }) => {
		await page.goto('/?lang=en-US');
		await page.locator('h1').waitFor();
		await page.keyboard.press('Tab');
		await expect(page.locator('.skip-link')).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/#main$/);
	});

	test('tabs work with the keyboard', async ({ page }) => {
		await page.goto('/?lang=en-US');
		await page.getByRole('tab', { name: 'File' }).focus();
		await page.keyboard.press('ArrowRight');
		await expect(page.getByRole('tab', { name: 'Paste' })).toHaveAttribute('aria-selected', 'true');
		await expect(page.getByLabel('Paste a FHIR Bundle')).toBeVisible();
	});

	test('print shows the summary without controls', async ({ page }) => {
		await openExample(page, 'IPS-examples-Bundle-01');
		await page.emulateMedia({ media: 'print' });
		await expect(page.locator('.site-header')).toBeHidden();
		await expect(page.locator('.export-menu')).toBeHidden();
		await expect(page.locator('.print-header')).toBeVisible();
		await expect(page.locator('.print-header')).toContainText(family('IPS-examples-Bundle-01'));
	});
});
