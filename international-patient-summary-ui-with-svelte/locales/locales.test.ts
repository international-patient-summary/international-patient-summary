// Locale parity and MF2 checks (tasks.md P1-T5, spec §4.3).
// Every locale has exactly the en-us key set; every message compiles as
// Unicode MessageFormat 2; Welsh plural messages cover all six CLDR forms.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MessageFormat } from 'messageformat';
import { describe, expect, it } from 'vitest';
import { parseMessages } from '../src/lib/i18n.ts';

const DIRS = { 'cy-001': 'cy-001', 'en-US': 'en-us', 'en-GB': 'en-gb', 'zh-CN': 'zh-cn' } as const;

function flatten(object: Record<string, unknown>, prefix = ''): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(object)) {
		if (value && typeof value === 'object')
			Object.assign(out, flatten(value as Record<string, unknown>, `${prefix}${key}.`));
		else out[`${prefix}${key}`] = String(value);
	}
	return out;
}

function load(dir: string): Record<string, string> {
	const text = readFileSync(join(import.meta.dirname, dir, 'messages.yaml'), 'utf8');
	return flatten(parseMessages(text));
}

const source = load('en-us');
const SAMPLE = {
	count: 3,
	name: 'X',
	format: 'JSON',
	source: 's',
	size: 1,
	max: 2,
	path: '/',
	host: 'h',
	status: 404,
	line: 1,
	column: 2,
	detail: 'd',
	version: '2.0.1',
	found: 'F',
	reference: 'r',
	code: 'c',
	title: 't',
	state: 's',
	reason: 'r',
	start: 'a',
	end: 'b',
	low: 'l',
	high: 'h',
	frequency: 2,
	periodLabel: 'p',
	date: 'd',
	dose: '1',
	series: '2',
	type: 'T',
	filename: 'f',
	identifier: 'i',
	sections: 's',
	page: 1,
	email: 'e',
	step: 1,
	total: 3
};

describe.each(Object.entries(DIRS))('locale %s', (tag, dir) => {
	const messages = load(dir);

	it('has exactly the en-us keys', () => {
		const missing = Object.keys(source).filter((k) => !(k in messages));
		const extra = Object.keys(messages).filter((k) => !(k in source));
		expect(missing).toEqual([]);
		expect(extra).toEqual([]);
	});

	it('compiles and formats every message as MF2', () => {
		const failures: string[] = [];
		for (const [key, text] of Object.entries(messages)) {
			try {
				const mf = new MessageFormat(tag, text);
				const errors: unknown[] = [];
				mf.format(SAMPLE, (e) => errors.push(e));
				if (errors.length) failures.push(`${key}: ${String(errors[0])}`);
			} catch (error) {
				failures.push(`${key}: ${(error as Error).message}`);
			}
		}
		expect(failures).toEqual([]);
	});

	it('uses the same placeholders as en-us', () => {
		const vars = (s: string) => [...new Set(s.match(/\$[A-Za-z]+/g) ?? [])].sort();
		const mismatched = Object.entries(messages)
			.filter(([k, v]) => k in source && vars(v).join() !== vars(source[k]).join())
			.map(([k]) => k);
		expect(mismatched).toEqual([]);
	});
});

describe('Welsh plurals', () => {
	const cy = load('cy-001');
	const plurals = Object.entries(cy).filter(([, v]) => /\.match \$count/.test(v));

	it('cover zero, one, two, few, many and other', () => {
		expect(plurals.length).toBeGreaterThan(0);
		for (const [key, text] of plurals)
			for (const form of ['zero', 'one', 'two', 'few', 'many', '*'])
				expect(
					new RegExp(`^\\s*${form.replace('*', '\\*')}\\s`, 'm').test(text),
					`${key} lacks ${form}`
				).toBe(true);
	});

	it('select the CLDR form for 0, 1, 2, 3, 6 and 7', () => {
		const mf = new MessageFormat('cy-001', cy['format.age.years']);
		const outputs = [0, 1, 2, 3, 6, 7].map((count) => mf.format({ count }));
		// Welsh has six forms; 0, 1, 2, 3 and 6 each have their own, and 7 is "other".
		expect(new Set(outputs).size).toBeGreaterThanOrEqual(5);
	});
});
