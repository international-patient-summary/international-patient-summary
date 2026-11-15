// Fully prerendered, client-rendered app (spec §4): no server runtime, and the
// Sveltia I18n singleton only ever runs in the browser (spec §4.3).
import { browser } from '$app/env';
import {
	getLocaleFromNavigator,
	getLocaleFromQueryString,
	locale,
	waitLocale
} from '@sveltia/i18n';
import { FALLBACK_LOCALE, LOCALE_STORAGE_KEY, setupI18n } from '#lib/i18n.ts';

export const prerender = true;
export const ssr = false;
export const trailingSlash = 'always';

function storedLocale(): string | undefined {
	try {
		return localStorage.getItem(LOCALE_STORAGE_KEY) ?? undefined;
	} catch {
		return undefined;
	}
}

export const load = async () => {
	setupI18n();
	if (browser) {
		// Priority: ?lang= query, then the stored preference, then the browser.
		const detected =
			getLocaleFromQueryString('lang') ??
			storedLocale() ??
			getLocaleFromNavigator() ??
			FALLBACK_LOCALE;
		await locale.set(detected);
	}
	await waitLocale();
	return {};
};
