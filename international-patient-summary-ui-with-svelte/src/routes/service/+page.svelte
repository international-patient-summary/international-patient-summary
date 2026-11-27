<script lang="ts">
	// The backend service (spec §6.10, tasks.md P9-T8): sign in to its
	// identity provider with OIDC and PKCE, store a summary, list the ones the
	// account may see, open one in the viewer, delete one, and sign out.
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Button,
		DocumentList,
		DocumentListItem,
		FileUpload,
		InformationCallout,
		Loading
	} from '@lilydesignsystem/svelte-headless';
	import { onMount } from 'svelte';
	import Viewer from '#lib/components/Viewer.svelte';
	import { formatFhirDate } from '#lib/fhir/format.ts';
	import { currentLocale, t } from '#lib/i18n.ts';
	import { remote } from '#lib/remote.svelte.ts';
	import { isSignInReturn } from '#lib/service/oidc.ts';
	import { viewer } from '#lib/state.svelte.ts';

	onMount(async () => {
		const url = new URL(page.url.href);
		if (!remote.config || !isSignInReturn(url)) return;
		// The code is used once; take it out of the address and the history.
		replaceState(url.pathname, {});
		await remote.completeSignIn(url);
	});

	async function signOut() {
		const href = await remote.signOutEverywhere();
		if (href) location.assign(href);
	}

	async function signIn() {
		const href = await remote.signInHref();
		if (href) location.assign(href);
	}

	function store(files: FileList | null | undefined) {
		const file = files?.[0];
		if (file) void remote.store(file);
	}

	// Only a document this page opened: one open on Home stays Home's.
	const viewing = $derived(
		remote.signedIn && !!viewer.doc && viewer.loaded?.source.kind === 'service'
	);
</script>

<svelte:head>
	<title>{t('service.heading')} — {t('app.title')}</title>
</svelte:head>

<div class="tour-page service-page">
	{#if !viewing}
		<h1>{t('service.heading')}</h1>
		<p>{t('service.intro')}</p>
		<InformationCallout class="tour-callout" label={t('service.calloutLabel')}>
			<p>{remote.config ? t('service.privacy') : t('service.notConfigured')}</p>
		</InformationCallout>
	{/if}

	{#if remote.busy}
		<Loading class="loader-busy" label={t('service.loading')}>
			<span class="loading-spinner" aria-hidden="true"></span>
			<span>{t('service.loading')}</span>
		</Loading>
	{/if}

	{#if remote.error}
		<p class="tour-error" role="alert">{t(`service.errors.${remote.error}`)}</p>
	{/if}

	{#if remote.config && !remote.signedIn}
		<Button disabled={remote.busy} onclick={signIn}>{t('service.signIn')}</Button>
	{:else if remote.signedIn}
		<div class="tour-account">
			<p>
				{remote.session?.username
					? t('service.signedInAs', { name: remote.session.username })
					: t('service.signedIn')}
			</p>
			{#if viewing}
				<Button onclick={() => viewer.clear()}>{t('service.view.back')}</Button>
			{/if}
			<Button onclick={signOut}>{t('service.signOut')}</Button>
		</div>

		{#if viewing && viewer.doc}
			<Viewer doc={viewer.doc} />
		{:else}
			<section class="service-store" aria-labelledby="service-store-heading">
				<h2 id="service-store-heading">{t('service.store.heading')}</h2>
				<FileUpload
					class="loader-file"
					label={t('service.store.label')}
					accept=".json,.yaml,.yml,application/json,application/fhir+json,application/yaml"
					onchange={store}
					selectedLabel={(count: number) => t('loader.fileSelected', { count })}
				/>
			</section>

			<section class="tour-summaries" aria-labelledby="service-summaries-heading">
				<h2 id="service-summaries-heading">{t('service.summaries.heading')}</h2>
				{#if remote.summaries.length}
					<DocumentList class="example-cards" label={t('service.summaries.list')}>
						{#each remote.summaries as summary (summary.id)}
							{@const title = summary.title ?? t('service.summaries.untitled')}
							{@const name = summary.patient ?? title}
							<DocumentListItem class="example-card">
								<h3>{name}</h3>
								{#if summary.patient}<p>{title}</p>{/if}
								{#if summary.date}
									<p>
										{t('service.summaries.date', {
											date: formatFhirDate(summary.date, currentLocale()) ?? summary.date
										})}
									</p>
								{/if}
								<div class="tour-actions">
									<Button
										label={t('service.summaries.openNamed', { title: name })}
										disabled={remote.busy}
										onclick={() => remote.open(summary)}
									>
										{t('service.summaries.open')}
									</Button>
									<Button
										class="tour-delete"
										label={t('service.summaries.deleteNamed', { title: name })}
										disabled={remote.busy}
										onclick={() => remote.remove(summary.id)}
									>
										{t('service.summaries.delete')}
									</Button>
								</div>
							</DocumentListItem>
						{/each}
					</DocumentList>
				{:else if !remote.busy}
					<p>{t('service.summaries.empty')}</p>
				{/if}
				<Button disabled={remote.busy} onclick={() => remote.refresh()}>
					{t('service.summaries.refresh')}
				</Button>
			</section>
		{/if}
	{/if}
</div>
