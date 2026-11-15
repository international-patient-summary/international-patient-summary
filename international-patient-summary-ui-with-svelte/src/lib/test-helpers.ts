// Test helpers: IG fixtures from static/examples/, hand-made fixtures, and a
// Translate built straight from the locale files with messageformat, so
// unit tests need no Sveltia singleton.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MessageFormat } from 'messageformat';
import { buildDocument } from './fhir/composition.ts';
import type { FormatContext, IpsDocument, Translate } from './fhir/types.ts';
import { parseMessages } from './i18n.ts';

const ROOT = join(import.meta.dirname, '..', '..');

export const IG_FIXTURES = [
	'bundle-minimal',
	'bundle-no-info-required-sections',
	'bundle-ips-all-sections',
	'IPS-examples-Bundle-01',
	'IPS-examples-Bundle-with-immunization'
] as const;

export function exampleText(name: string, ext: 'json' | 'yaml' = 'json'): string {
	return readFileSync(join(ROOT, 'static', 'examples', `${name}.${ext}`), 'utf8');
}

export function exampleJson(name: string): unknown {
	return JSON.parse(exampleText(name));
}

export function fixtureText(name: string): string {
	return readFileSync(join(ROOT, 'src', 'lib', 'fhir', 'fixtures', name), 'utf8');
}

export function exampleDoc(name: string): IpsDocument {
	return buildDocument(exampleJson(name));
}

export function fixtureDoc(name: string): IpsDocument {
	return buildDocument(JSON.parse(fixtureText(name)));
}

const DIRS: Record<string, string> = {
	'en-US': 'en-us',
	'en-GB': 'en-gb',
	'cy-001': 'cy-001',
	'zh-CN': 'zh-cn'
};

function flatten(o: Record<string, unknown>, p = '', out: Record<string, string> = {}) {
	for (const [k, v] of Object.entries(o))
		if (v && typeof v === 'object') flatten(v as Record<string, unknown>, `${p}${k}.`, out);
		else out[`${p}${k}`] = String(v);
	return out;
}

/** A Translate for one locale, without bidi isolates so assertions read plainly. */
export function translator(locale = 'en-US'): Translate {
	const messages = flatten(
		parseMessages(readFileSync(join(ROOT, 'locales', DIRS[locale], 'messages.yaml'), 'utf8'))
	);
	const cache = new Map<string, MessageFormat>();
	return (key, values) => {
		const source = messages[key];
		if (source === undefined) return key;
		let mf = cache.get(key);
		if (!mf) cache.set(key, (mf = new MessageFormat(locale, source, { bidiIsolation: 'none' })));
		return mf.format(values as Record<string, unknown>);
	};
}

export function context(locale = 'en-US'): FormatContext {
	return { locale, t: translator(locale) };
}
