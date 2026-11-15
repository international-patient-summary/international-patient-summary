// Sveltia I18n setup (spec §4.3): four locales, lazily loaded from
// ./locales/<dir>/messages.yaml, en-US as the fallback. Locale detection is
// client-side only; Sveltia's singleton is not safe under SSR.
import { _, init, locale, register } from '@sveltia/i18n';
import { parse } from 'yaml';
import type { FormatContext, Translate } from './fhir/types.ts';

export const FALLBACK_LOCALE = 'en-US';

/** Registered BCP 47 tag → locale directory (lowercase) under ./locales/. */
export const LOCALE_DIRECTORIES = {
	'cy-001': 'cy-001',
	'en-US': 'en-us',
	'en-GB': 'en-gb',
	'zh-CN': 'zh-cn'
} as const;

export type AppLocale = keyof typeof LOCALE_DIRECTORIES;

export const APP_LOCALES = Object.keys(LOCALE_DIRECTORIES) as AppLocale[];

/** Endonyms for the locale picker; never translated. */
export const LOCALE_LABELS: Record<AppLocale, string> = {
	'cy-001': 'Cymraeg',
	'en-US': 'English (US)',
	'en-GB': 'English (UK)',
	'zh-CN': '简体中文'
};

export const STORAGE_PREFIX = 'international-patient-summary-ui';
export const LOCALE_STORAGE_KEY = `${STORAGE_PREFIX}.locale`;

const loaders: Record<AppLocale, () => Promise<{ default: string }>> = {
	'cy-001': () => import('../../locales/cy-001/messages.yaml?raw'),
	'en-US': () => import('../../locales/en-us/messages.yaml?raw'),
	'en-GB': () => import('../../locales/en-gb/messages.yaml?raw'),
	'zh-CN': () => import('../../locales/zh-cn/messages.yaml?raw')
};

/** Parse a locale file with the YAML 1.2 core schema. */
export function parseMessages(text: string): Record<string, unknown> {
	return parse(text, { schema: 'core', uniqueKeys: true }) as Record<string, unknown>;
}

let initialised = false;

export function setupI18n(): void {
	if (initialised) return;
	initialised = true;
	for (const tag of APP_LOCALES)
		register(tag, () =>
			loaders[tag]().then((m) => parseMessages(m.default) as Record<string, string>)
		);
	init({ fallbackLocale: FALLBACK_LOCALE });
}

/** The active UI locale, or the fallback before one is set. */
export function currentLocale(): string {
	return locale.current || FALLBACK_LOCALE;
}

/** The app's Translate function over Sveltia's `_`. Reactive in templates. */
export const t: Translate = (key, values) =>
	values ? _(key, { values: values as Record<string, unknown> }) : _(key);

/** A FormatContext for the active locale; read it inside $derived to stay reactive. */
export function formatContext(): FormatContext {
	return { locale: currentLocale(), t };
}
