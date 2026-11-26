// Branch coverage for the formatters: missing parts, names with no usable
// use, unknown comparators, and dosages described by a timing code.
import { describe, expect, it } from 'vitest';
import {
	codesText,
	formatAge,
	formatHumanName,
	formatIdentifier,
	identifierText,
	formatQuantityNumber,
	formatQuantityValue,
	formatRange,
	summariseDosage,
	systemLabel
} from './format.ts';
import { translator } from '../test-helpers.ts';

const t = translator('en-US');

describe('codes and systems', () => {
	it('labels a known system, keeps an unknown one, and has nothing for none', () => {
		expect(systemLabel('http://hl7.org/fhir/sid/ndc')).toBe('NDC');
		expect(systemLabel('urn:local')).toBe('urn:local');
		expect(systemLabel(undefined)).toBe('');
	});

	it('writes a code without a system on its own', () => {
		expect(
			codesText([
				{ system: '', code: 'X' },
				{ system: 'NDC', code: '1' }
			])
		).toBe('X · NDC 1');
	});
});

describe('quantities', () => {
	it('shows only the unit, or nothing, for a quantity without a number', () => {
		expect(formatQuantityValue({ unit: 'mg' }, 'en-US')).toBe('mg');
		expect(formatQuantityValue({}, 'en-US')).toBeUndefined();
		expect(formatQuantityValue({ value: Number.NaN, code: 'mg' }, 'en-US')).toBe('mg');
	});

	it('keeps a comparator FHIR defines and drops one it does not', () => {
		expect(formatQuantityValue({ value: 5, comparator: '<', unit: 'mg' }, 'en-US')).toContain('<');
		const ad = formatQuantityValue({ value: 5, comparator: 'ad' as '<', unit: 'mg' }, 'en-US');
		expect(ad).not.toContain('ad');
		expect(formatQuantityNumber({ value: 5, comparator: '>=' }, 'en-US')).toContain('≥');
	});

	it('has no range without one, or without any bound', () => {
		expect(formatRange(undefined, 'en-US', t)).toBeUndefined();
		expect(formatRange({ low: {}, high: {} }, 'en-US', t)).toBeUndefined();
	});
});

describe('names and identifiers', () => {
	it('falls back to the first name when every name is old or maiden', () => {
		expect(
			formatHumanName([
				{ use: 'old', family: 'First' },
				{ use: 'maiden', family: 'Second' }
			])
		).toBe('First');
	});

	it('builds a name from its parts, skipping blanks, or has none', () => {
		expect(formatHumanName([{ prefix: ['Dr'], family: 'Who', suffix: ['', 'PhD'] }])).toBe(
			'Dr Who PhD'
		);
		expect(formatHumanName([{ text: '  ', given: ['  '] }])).toBeUndefined();
		expect(formatHumanName([])).toBeUndefined();
	});

	it('writes an identifier by its type, else its system, else its value alone', () => {
		expect(identifierText({ system: '', value: 'A1' })).toBe('A1');
		expect(identifierText({ system: 'urn:x', value: 'B2', type: 'MRN' })).toBe('B2 (MRN)');
		expect(identifierText({ system: 'NHS number', value: 'C3' })).toBe('C3 (NHS number)');
	});

	it('has no identifier without a value', () => {
		expect(formatIdentifier({ system: 'urn:x' })).toBeUndefined();
		expect(formatIdentifier({ value: '42', type: { text: 'MRN' } })).toEqual({
			system: '',
			value: '42',
			type: 'MRN'
		});
	});
});

describe('ages', () => {
	it('gives no age for a birth date after the day it is asked', () => {
		expect(formatAge('2030-01-01', t, new Date('2026-01-01T00:00:00Z'))).toBeUndefined();
	});
});

describe('dosages', () => {
	it('takes the frequency from a timing code, and joins every text', () => {
		const s = summariseDosage(
			[
				{ text: ' Once daily ', timing: { code: { text: 'Every morning' } } },
				{ text: 'With food' },
				{}
			],
			'en-US',
			t
		);
		expect(s.frequency).toBe('Every morning');
		expect(s.text).toBe('Once daily; With food');
	});

	it('words a dose given as a range, and says when it is as needed', () => {
		const s = summariseDosage(
			[
				{
					asNeededBoolean: true,
					doseAndRate: [{ doseRange: { low: { value: 1 }, high: { value: 2 } } }]
				}
			],
			'en-US',
			t
		);
		expect(s.dose).toBeTruthy();
		expect(s.frequency).toBeTruthy();
		expect(s.text).toBeUndefined();
	});

	it('has nothing to say about no dosage', () => {
		expect(summariseDosage(undefined, 'en-US', t)).toEqual({});
		expect(summariseDosage([], 'en-US', t)).toEqual({});
	});
});
