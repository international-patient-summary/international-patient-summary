import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { EXAMPLES_DIR, FIXTURES, uploadFixture } from './helpers.ts';

async function download(page: import('@playwright/test').Page, format: string) {
	await page.getByRole('radio', { name: format, exact: true }).check();
	const pending = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	const file = await pending;
	const path = await file.path();
	return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

for (const name of FIXTURES) {
	test(`${name}: exports in all four formats, with no network requests`, async ({
		page,
		baseURL
	}) => {
		const requests: string[] = [];
		await uploadFixture(page, `${name}.json`);
		page.on('request', (r) => requests.push(r.url()));
		const source = JSON.parse(readFileSync(join(EXAMPLES_DIR, `${name}.json`), 'utf8'));

		const json = await download(page, 'JSON');
		expect(json.name).toMatch(/^international-patient-summary(-[\d-]+)?\.json$/);
		expect(JSON.parse(json.bytes.toString('utf8'))).toEqual(source);

		const yaml = await download(page, 'YAML');
		expect(parse(yaml.bytes.toString('utf8'), { schema: 'core' })).toEqual(source);

		const md = await download(page, 'Markdown');
		expect(md.bytes.toString('utf8')).toContain('## Allergies and intolerances');

		const pdf = await download(page, 'PDF (one page)');
		expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
		expect((pdf.bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
		await expect(page.locator('.export-announcement')).toContainText(pdf.name);

		// Only same-origin requests (the lazy PDF chunk and font files) — nothing leaves the browser.
		const origin = new URL(baseURL!).origin;
		expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('blob:'))).toEqual([]);
		expect(
			requests.filter((u) => u.startsWith(origin)).every((u) => /\/(_app|fonts)\//.test(u))
		).toBe(true);

		// Nothing but picker preferences in localStorage.
		const keys = await page.evaluate(() => Object.keys(localStorage));
		expect(
			keys.every((k) => k.startsWith('international-patient-summary-ui.') || k.startsWith('lily'))
		).toBe(true);
	});
}
