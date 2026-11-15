import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { exportFilename } from './filename.ts';
import { exportJson } from './json.ts';
import { escapeMarkdown, exportMarkdown } from './markdown.ts';
import { exportYaml } from './yaml.ts';
import { parseText } from '../fhir/parse.ts';
import {
	context,
	exampleDoc,
	exampleJson,
	fixtureDoc,
	fixtureText,
	IG_FIXTURES
} from '../test-helpers.ts';

const NOW = new Date('2026-11-15T12:00:00Z');

describe('filenames', () => {
	it.each(IG_FIXTURES)('names %s by its Composition date only', (name) => {
		const doc = exampleDoc(name);
		const filename = exportFilename(doc, 'pdf');
		expect(filename).toMatch(/^international-patient-summary(-\d{4}(-\d{2}(-\d{2})?)?)?\.pdf$/);
		const patientText = JSON.stringify([doc.patient?.name, doc.patient?.identifier]);
		for (const word of patientText.match(/[A-Za-z0-9]{3,}/g) ?? [])
			if (
				![
					'use',
					'official',
					'system',
					'value',
					'given',
					'family',
					'text',
					'http',
					'https',
					'www',
					'org'
				].includes(word)
			)
				expect(filename.includes(word), word).toBe(false);
	});
});

describe('JSON and YAML exports', () => {
	it.each(IG_FIXTURES)('round-trips %s through JSON', (name) => {
		const source = exampleJson(name);
		expect(JSON.parse(exportJson(source as never))).toEqual(source);
	});

	it.each(IG_FIXTURES)('round-trips %s through YAML, through the app parser', (name) => {
		const source = exampleJson(name);
		const yaml = exportYaml(source, 'Comment line one\nline two');
		expect(yaml.startsWith('# Comment line one\n# line two\n')).toBe(true);
		expect(parseText(yaml, { filename: 'x.yaml' }).data).toEqual(source);
	});

	it('quotes strings YAML would read as another type, and keeps key order', () => {
		const source = {
			b: 'no',
			a: '0123',
			c: '1.10',
			d: 'true',
			e: '2024-01-01',
			f: 'null',
			g: '.inf',
			h: '~',
			i: ''
		};
		const yaml = exportYaml(source, 'c');
		expect(parse(yaml, { schema: 'core' })).toEqual(source);
		expect(Object.keys(parse(yaml))).toEqual(Object.keys(source));
	});

	it('regenerated YAML twins equal their JSON fixtures', () => {
		for (const name of IG_FIXTURES) {
			const yaml = readFileSync(
				join(import.meta.dirname, '..', '..', '..', 'static', 'examples', `${name}.yaml`),
				'utf8'
			);
			expect(parse(yaml, { schema: 'core' })).toEqual(exampleJson(name));
		}
	});
});

describe('Markdown export', () => {
	it.each(['en-US', 'en-GB', 'cy-001', 'zh-CN'])(
		'matches the snapshot for every fixture in %s',
		(locale) => {
			const ctx = context(locale);
			for (const name of IG_FIXTURES)
				expect(
					exportMarkdown(exampleDoc(name), ctx, {
						now: NOW,
						includeCodes: true,
						includeNarrative: true
					})
				).toMatchSnapshot(`${name}`);
		}
	);

	it('always has the three required sections and every section heading', () => {
		const ctx = context('en-US');
		const md = exportMarkdown(exampleDoc('bundle-no-info-required-sections'), ctx, { now: NOW });
		for (const title of [
			'Medication summary',
			'Allergies and intolerances',
			'Problem list',
			'Immunizations'
		])
			expect(md).toContain(`## ${title}`);
		expect(md).toContain('*Information unavailable — No information available*');
		expect(md).toContain('Not a medical device');
	});

	it('is well-formed Markdown for every fixture and locale', () => {
		for (const locale of ['en-US', 'en-GB', 'cy-001', 'zh-CN'])
			for (const name of IG_FIXTURES) {
				const md = exportMarkdown(exampleDoc(name), context(locale), {
					now: NOW,
					includeCodes: true,
					includeNarrative: true
				});
				const lines = md.split('\n');
				const where = `${locale} ${name}`;
				expect(lines.filter((l) => /^# /.test(l)).length, where).toBe(1);
				expect(md.endsWith('\n'), where).toBe(true);
				expect(
					lines.some((l) => /\s$/.test(l)),
					`${where}: trailing space`
				).toBe(false);
				lines.forEach((line, i) => {
					if (/^#{1,6} /.test(line)) {
						if (i > 0) expect(lines[i - 1], `${where}: blank before heading ${i}`).toBe('');
						expect(lines[i + 1], `${where}: blank after heading ${i}`).toBe('');
					}
				});
				// Every table row has the header's column count (escaped pipes excluded).
				const cells = (l: string) => l.replace(/\\\|/g, '').split('|').length;
				for (let i = 0; i < lines.length; i++) {
					if (!lines[i].startsWith('| ') || !lines[i + 1]?.startsWith('| ---')) continue;
					expect(lines[i - 1], `${where}: blank before table ${i}`).toBe('');
					const n = cells(lines[i]);
					let j = i + 1;
					for (; lines[j]?.startsWith('|'); j++)
						expect(cells(lines[j]), `${where}: row ${j}`).toBe(n);
					expect(lines[j], `${where}: blank after table ${j}`).toBe('');
				}
			}
	});

	it('keeps clinical text inert', () => {
		const md = exportMarkdown(fixtureDoc('injection.json'), context('en-US'), { now: NOW });
		expect(md).not.toContain('<script>');
		expect(md).toContain(
			'Pipe \\| star \\* under\\_score \\# &lt;script\\>alert(1)&lt;/script\\> \\`tick\\`'
		);
		expect(escapeMarkdown('a|b')).toBe('a\\|b');
	});

	it('writes narrative as plain text only when asked', () => {
		const doc = fixtureDoc('hostile-narrative.json');
		const ctx = context('en-US');
		expect(exportMarkdown(doc, ctx, { now: NOW })).not.toContain('Narrative');
		const md = exportMarkdown(doc, ctx, { now: NOW, includeNarrative: true });
		expect(md).toContain('> Heading');
		expect(md).not.toMatch(/<p|<a /);
		void fixtureText;
	});
});
