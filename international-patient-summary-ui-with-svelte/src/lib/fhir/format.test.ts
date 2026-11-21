import { describe, expect, it } from 'vitest';
import {
	displayOf,
	formatAge,
	formatFhirDate,
	formatHumanName,
	formatPeriod,
	formatQuantityNumber,
	formatQuantityValue,
	formatRange,
	formatRatio,
	summariseDosage
} from './format.ts';
import { translator } from '../test-helpers.ts';

const t = translator('en-US');

describe('formatters', () => {
	it('prefers display, then text, then system|code', () => {
		expect(
			displayOf({
				coding: [{ system: 'http://snomed.info/sct', code: '1', display: 'Asthma' }],
				text: 'x'
			})
		).toBe('Asthma');
		expect(displayOf({ coding: [{ code: '1' }], text: 'Free text' })).toBe('Free text');
		expect(displayOf({ coding: [{ system: 'http://loinc.org', code: '1234-5' }] })).toBe(
			'LOINC|1234-5'
		);
		expect(displayOf(undefined)).toBeUndefined();
	});

	it('writes the month as text and keeps partial dates partial', () => {
		expect(formatFhirDate('2017-01-12', 'en-US')).toBe('Jan 12, 2017');
		expect(formatFhirDate('2017-01-12', 'en-GB')).toBe('12 Jan 2017');
		expect(formatFhirDate('2017-01', 'en-GB')).toBe('Jan 2017');
		expect(formatFhirDate('2017', 'en-GB')).toBe('2017');
		expect(formatFhirDate('not a date', 'en-GB')).toBe('not a date');
	});

	it('writes quantities the ISMP way and keeps the comparator', () => {
		expect(formatQuantityValue({ value: 5, unit: 'mg' }, 'en-US')).toBe('5 mg');
		expect(formatQuantityValue({ value: 0.5, unit: 'mg' }, 'en-US')).toBe('0.5 mg');
		expect(formatQuantityValue({ value: 5, unit: 'mmol/L', comparator: '<' }, 'en-US')).toBe(
			'<5 mmol/L'
		);
		expect(
			formatRange(
				{ low: { value: 3.5, unit: 'mmol/L' }, high: { value: 5.3, unit: 'mmol/L' } },
				'en-US',
				t
			)
		).toBe('3.5 mmol/L to 5.3 mmol/L');
	});

	it('picks the official name', () => {
		expect(
			formatHumanName([
				{ use: 'nickname', given: ['Bob'] },
				{ use: 'official', given: ['Robert', 'J'], family: 'Smith' }
			])
		).toBe('Robert J Smith');
		expect(formatHumanName([{ text: 'Dr Ann Lee' }])).toBe('Dr Ann Lee');
	});

	it('gives an age in words, never for a partial birth date', () => {
		expect(formatAge('1980-03-15', t, new Date('2026-11-15T00:00:00Z'))).toBe('46 years');
		expect(formatAge('2026-10-01', t, new Date('2026-11-15T00:00:00Z'))).toMatch(/weeks?/);
		expect(formatAge('1980', t)).toBeUndefined();
	});

	it('summarises a dosage from text or structure', () => {
		expect(summariseDosage([{ text: '1 tablet daily' }], 'en-US', t).text).toBe('1 tablet daily');
		const s = summariseDosage(
			[
				{
					route: { text: 'oral' },
					timing: { repeat: { frequency: 2, period: 1, periodUnit: 'd' } },
					doseAndRate: [{ doseQuantity: { value: 500, unit: 'mg' } }]
				}
			],
			'en-US',
			t
		);
		expect(s).toEqual({
			text: undefined,
			route: 'oral',
			frequency: '2 times every 1 day',
			dose: '500 mg'
		});
	});

	it('handles open periods, one-sided ranges, partial ratios and as-needed doses', () => {
		expect(displayOf({})).toBeUndefined();
		expect(formatPeriod({}, 'en-US', t)).toBeUndefined();
		expect(formatPeriod({ start: '2026-01-01' }, 'en-US', t)).toBe('From Jan 1, 2026');
		expect(formatPeriod({ end: '2026-12-31' }, 'en-US', t)).toBe('Until Dec 31, 2026');
		expect(formatQuantityNumber({ unit: 'mg' }, 'en-US')).toBeUndefined();
		expect(formatRange({ low: { value: 3, unit: 'mg' } }, 'en-US', t)).toBe('At least 3 mg');
		expect(formatRange({ high: { value: 5, unit: 'mg' } }, 'en-US', t)).toBe('At most 5 mg');
		expect(formatRange({}, 'en-US', t)).toBeUndefined();
		expect(formatRatio(undefined, 'en-US')).toBeUndefined();
		expect(formatRatio({ numerator: { value: 1 }, denominator: { value: 2 } }, 'en-US')).toBe(
			'1 / 2'
		);
		expect(formatRatio({ numerator: { value: 1 } }, 'en-US')).toBe('1');
		expect(formatRatio({ denominator: { value: 2 } }, 'en-US')).toBe('2');
		expect(
			summariseDosage(
				[
					{
						asNeededBoolean: true,
						doseAndRate: [{ doseRange: { low: { value: 1, unit: 'tablet' } } }]
					}
				],
				'en-US',
				t
			)
		).toMatchObject({ frequency: 'as needed', dose: 'At least 1 tablet' });
	});

	it('falls back to the raw value for a locale the platform cannot format', () => {
		expect(formatFhirDate('2020-03-04T10:00:00Z', 'not a locale!')).toBe('2020-03-04T10:00:00Z');
	});

	it('never guesses an age from a date that is not a date', () => {
		expect(formatAge('9999-99-99', t)).toBeUndefined();
	});
});
