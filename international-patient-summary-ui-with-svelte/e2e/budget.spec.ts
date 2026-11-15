// Performance and size budgets (spec §7, tasks.md P7-T7).
import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { uploadFixture } from './helpers.ts';

test('initial JavaScript is at most 250 KB gzipped (PDF chunk excluded)', async ({ page }) => {
	const scripts = new Map<string, Buffer>();
	page.on('response', async (r) => {
		if (r.url().endsWith('.js')) scripts.set(r.url(), await r.body());
	});
	await page.goto('/?lang=en-US');
	await page.locator('h1').waitFor();
	await page.waitForLoadState('networkidle');
	const total = [...scripts.values()].reduce((n, b) => n + gzipSync(b).length, 0);
	console.log(`initial JS: ${(total / 1024).toFixed(1)} KB gzipped in ${scripts.size} files`);
	expect(total).toBeLessThanOrEqual(250 * 1024);
});

test('bundle-ips-all-sections renders in under 200 ms; its PDF in under 3 s', async ({ page }) => {
	await page.goto('/?lang=en-US');
	await page.locator('h1').waitFor();
	const text = await (await page.request.get('/examples/bundle-ips-all-sections.json')).text();
	await page.getByRole('tab', { name: 'Paste' }).click();
	await page.getByLabel('Paste a FHIR Bundle').fill(text);
	const ms = await page.evaluate(async () => {
		const button = [...document.querySelectorAll('button')].find((b) =>
			b.textContent?.includes('Open pasted')
		)!;
		const start = performance.now();
		button.click();
		while (!document.querySelector('.export-menu'))
			await new Promise((r) => requestAnimationFrame(r));
		return performance.now() - start;
	});
	console.log(`render: ${ms.toFixed(0)} ms`);
	expect(ms).toBeLessThan(200);

	await page.getByRole('radio', { name: 'PDF (one page)' }).check();
	const started = Date.now();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	await download;
	const pdfMs = Date.now() - started;
	console.log(`PDF: ${pdfMs} ms`);
	expect(pdfMs).toBeLessThan(3000);
	void uploadFixture;
});
