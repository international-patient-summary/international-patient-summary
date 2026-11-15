import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURES = [
	'bundle-minimal',
	'bundle-no-info-required-sections',
	'bundle-ips-all-sections',
	'IPS-examples-Bundle-01',
	'IPS-examples-Bundle-with-immunization'
] as const;

export const EXAMPLES_DIR = join(import.meta.dirname, '..', 'static', 'examples');

export function family(name: string): string {
	const bundle = JSON.parse(readFileSync(join(EXAMPLES_DIR, `${name}.json`), 'utf8'));
	const ref = bundle.entry[0].resource.subject.reference as string;
	const patient = bundle.entry.find(
		(e: { fullUrl?: string; resource: { resourceType: string; id: string } }) =>
			e.fullUrl === ref ||
			`${e.resource.resourceType}/${e.resource.id}` === ref ||
			e.fullUrl?.endsWith(ref)
	).resource;
	return patient.name[0].family;
}

/** Collect console errors and page errors. */
export function watchErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(e.message));
	return errors;
}

export async function openExample(page: Page, name: string, lang = 'en-US') {
	await page.goto(`/?lang=${lang}&example=${name}`);
	await page.locator('.patient-banner').waitFor();
}

export async function uploadFixture(page: Page, file: string) {
	await page.goto('/?lang=en-US');
	const chooser = page.waitForEvent('filechooser');
	await page.locator('.file-upload button').click();
	await (await chooser).setFiles(join(EXAMPLES_DIR, file));
	await page.locator('.patient-banner').waitFor();
}
