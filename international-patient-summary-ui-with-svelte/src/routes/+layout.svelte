<script lang="ts">
	// Layout shell (tasks.md P1-T6): SkipLink → Header (title + PickerBar) →
	// main → Footer with the "not a medical device" notice. Every accessible
	// name comes from the locale files; Sveltia owns <html lang dir>.
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Footer, Header, SkipLink } from '@lilydesignsystem/svelte-headless';
	import PickerBar from '@lilydesignsystem/svelte-picker-bar';
	import { locale } from '@sveltia/i18n';
	import { APP_LOCALES, LOCALE_LABELS, LOCALE_STORAGE_KEY, STORAGE_PREFIX, t } from '#lib/i18n.ts';

	let { children } = $props();

	const themesUrl = asset('assets/themes/light.css').replace(/light\.css$/, '');
	const homeHref = resolve('/');
	const examplesHref = resolve('/examples');

	const links = $derived([
		{
			id: 'home',
			label: t('header.home'),
			href: homeHref,
			current: page.url.pathname === homeHref
		},
		{
			id: 'examples',
			label: t('header.examples'),
			href: examplesHref,
			current: page.url.pathname === examplesHref
		}
	]);

	// Share sends the app's own address only — never a document (spec §6.5).
	function appUrl(): string {
		return new URL(homeHref, page.url.origin).href;
	}
	const shareTargets = $derived([
		{
			id: 'email',
			label: t('picker.shareEmail'),
			href: (_url: string, title: string) =>
				`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(appUrl())}`
		}
	]);

	async function changeLocale(code: string) {
		await locale.set(code);
		try {
			localStorage.setItem(LOCALE_STORAGE_KEY, code);
		} catch {
			// Storage can be unavailable (private mode); the choice still applies now.
		}
	}
</script>

<svelte:head>
	<title>{t('app.title')}</title>
	<meta name="description" content={t('app.tagline')} />
</svelte:head>

<SkipLink class="skip-link" href="#main" label={t('skipLink')} />

<Header class="site-header" label={t('header.label')}>
	<div class="site-header-inner">
		<a class="site-brand" href={homeHref}>
			<span class="site-brand-mark" aria-hidden="true">⚕</span>
			<span class="site-brand-name">{t('app.title')}</span>
		</a>
		<nav class="site-nav" aria-label={t('nav.pages')}>
			{#each links as link (link.id)}
				<a href={link.href} aria-current={link.current ? 'page' : undefined}>{link.label}</a>
			{/each}
		</nav>
		<PickerBar
			class="site-controls"
			{links}
			linkProps={{ navigate: (href: string) => goto(href) }}
			labels={{
				link: t('picker.links'),
				theme: t('picker.theme'),
				locale: t('picker.locale'),
				textSize: t('picker.textSize'),
				share: t('picker.share')
			}}
			{themesUrl}
			themeProps={{
				defaultValue: 'light',
				detectFromSystem: true,
				storageKey: `${STORAGE_PREFIX}.theme`
			}}
			locales={APP_LOCALES}
			localeProps={{
				value: locale.current,
				applyDir: false,
				localeLabels: LOCALE_LABELS,
				onChange: changeLocale
			}}
			textSizeProps={{ defaultValue: 'normal', storageKey: `${STORAGE_PREFIX}.text-size` }}
			{shareTargets}
			shareProps={{
				title: t('app.title'),
				url: appUrl(),
				copyLabel: t('picker.copyLink'),
				copiedLabel: t('picker.copied'),
				copyFailedLabel: t('picker.copyFailed')
			}}
		/>
	</div>
</Header>

<main id="main" class="site-main" tabindex="-1">
	{@render children()}
</main>

<Footer class="site-footer" label={t('footer.label')}>
	<div class="site-footer-inner">
		<p class="site-footer-safety"><strong>{t('footer.notMedicalDevice')}</strong></p>
		<p>{t('footer.privacy')}</p>
		<p class="site-footer-note">{t('footer.standards', { version: '2.0.1' })}</p>
	</div>
</Footer>
