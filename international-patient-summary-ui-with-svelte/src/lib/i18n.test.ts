import { locale, waitLocale } from '@sveltia/i18n';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_LOCALES, currentLocale, formatContext, parseMessages, setupI18n, t } from './i18n.ts';

beforeAll(() => setupI18n());
afterAll(async () => {
	await locale.set('en-US');
	await waitLocale();
});

describe('i18n', () => {
	it.each(APP_LOCALES)('loads the %s messages and speaks them', async (tag) => {
		await locale.set(tag);
		await waitLocale();
		expect(currentLocale()).toBe(tag);
		expect(formatContext().locale).toBe(tag);
		expect(t('loader.heading')).not.toBe('loader.heading');
	});

	it('sets up once, and parses the YAML 1.2 core schema', () => {
		setupI18n();
		expect(parseMessages('a: yes\nb: 1')).toEqual({ a: 'yes', b: 1 });
	});
});
