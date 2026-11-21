import { describe, expect, it } from 'vitest';
import { LoadError, MAX_INPUT_BYTES, formatFromHint, parseText, positionAt } from './parse.ts';
import { exampleText, fixtureText, IG_FIXTURES } from '../test-helpers.ts';

function error(fn: () => unknown): LoadError {
	try {
		fn();
	} catch (e) {
		if (e instanceof LoadError) return e;
		throw e;
	}
	throw new Error('expected a LoadError');
}

describe('parseText', () => {
	it.each(IG_FIXTURES)('reads %s as JSON and its YAML twin to a deep-equal object', (name) => {
		const json = parseText(exampleText(name), { filename: `${name}.json` });
		const yaml = parseText(exampleText(name, 'yaml'), { filename: `${name}.yaml` });
		expect(json.format).toBe('json');
		expect(yaml.format).toBe('yaml');
		expect(yaml.data).toEqual(json.data);
	});

	it('detects JSON then YAML when there is no hint', () => {
		expect(parseText('{"resourceType":"Bundle"}').format).toBe('json');
		expect(parseText('resourceType: Bundle\n').format).toBe('yaml');
	});

	it('uses the MIME type when there is no filename', () => {
		expect(formatFromHint({ mimeType: 'application/fhir+json; charset=utf-8' })).toBe('json');
		expect(formatFromHint({ mimeType: 'application/yaml' })).toBe('yaml');
	});

	it('reports a JSON syntax error with its line and column', () => {
		const e = error(() => parseText('{\n  "a": 1,\n  oops\n}', { filename: 'x.json' }));
		expect(e.key).toBe('invalidJson');
		expect(e.line).toBe(3);
	});

	it('keeps YAML 1.2 core schema values as FHIR JSON would', () => {
		const { data } = parseText(fixtureText('yaml-edge/coercions.yaml'), { filename: 'x.yaml' });
		expect(data).toEqual({
			resourceType: 'Bundle',
			flag: 'no',
			other: 'on',
			code: 123,
			version: 1.1,
			date: '2024-01-01'
		});
	});

	it.each([
		['yaml-edge/infinity.yaml', 'yamlNonFinite'],
		['yaml-edge/duplicate-key.yaml', 'yamlDuplicateKey'],
		['yaml-edge/multi-document.yaml', 'yamlMultiDocument'],
		['yaml-edge/alias-bomb.yaml', 'yamlAliasLimit'],
		['yaml-edge/custom-tag.yaml', 'yamlCustomTag']
	])('rejects %s (%s)', (file, key) => {
		expect(error(() => parseText(fixtureText(file), { filename: file })).key).toBe(key);
	});

	it('rejects empty and oversized input', () => {
		expect(error(() => parseText('   ')).key).toBe('empty');
		expect(error(() => parseText('x'.repeat(MAX_INPUT_BYTES + 1))).key).toBe('tooLarge');
	});

	it('rejects text that is neither JSON nor YAML', () => {
		expect(error(() => parseText('key: [unclosed')).key).toBe('notJsonOrYaml');
	});
});

describe('positionAt', () => {
	it('counts lines and columns from 1, and stops at the end of the text', () => {
		expect(positionAt('abc', 0)).toEqual({ line: 1, column: 1 });
		expect(positionAt('abc', 2)).toEqual({ line: 1, column: 3 });
		expect(positionAt('a\nbc\nd', 4)).toEqual({ line: 2, column: 3 });
		expect(positionAt('a\nbc\nd', 5)).toEqual({ line: 3, column: 1 });
		expect(positionAt('a\nbc\nd', 6)).toEqual({ line: 3, column: 2 });
		expect(positionAt('ab', 99)).toEqual({ line: 1, column: 3 });
	});
});

describe('parseText errors', () => {
	it('names JSON that ends too soon, with no position', () => {
		const e = error(() => parseText('{"a":', { filename: 'x.json' }));
		expect(e.key).toBe('invalidJson');
	});

	it('refuses YAML a FHIR document cannot hold', () => {
		expect(error(() => parseText('a: .inf\n', { filename: 'x.yaml' })).key).toBe('yamlNonFinite');
		expect(error(() => parseText('a: -.inf\n', { filename: 'x.yaml' })).key).toBe('yamlNonFinite');
		expect(error(() => parseText('a: .nan\n', { filename: 'x.yaml' })).key).toBe('yamlNonFinite');
	});

	it('refuses more aliases than the limit', () => {
		const anchors = Array.from({ length: 60 }, () => '*a').join(', ');
		const e = error(() => parseText(`base: &a [1]\nlist: [${anchors}]\n`, { filename: 'x.yaml' }));
		expect(e.key).toBe('yamlAliasLimit');
	});
});
