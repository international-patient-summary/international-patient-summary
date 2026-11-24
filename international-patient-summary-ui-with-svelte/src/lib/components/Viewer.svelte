<script lang="ts">
	// The loaded summary: patient banner, contents, document details, checks,
	// every section in Composition order, and export. Clinical content keeps
	// the document's own language (spec §4.3).
	import {
		Button,
		ContentsLink,
		ContentsList,
		ContentsListItem,
		ContentsNav,
		ToggleButton
	} from '@lilydesignsystem/svelte-headless';
	import DocumentChecks from './DocumentChecks.svelte';
	import DocumentMeta from './DocumentMeta.svelte';
	import ExportMenu from './ExportMenu.svelte';
	import PatientBanner from './PatientBanner.svelte';
	import SectionView from './SectionView.svelte';
	import { formatHumanName, formatFhirDate } from '#lib/fhir/format.ts';
	import type { IpsDocument } from '#lib/fhir/types.ts';
	import { currentLocale, t } from '#lib/i18n.ts';
	import { viewer } from '#lib/state.svelte.ts';

	let { doc }: { doc: IpsDocument } = $props();

	const source = $derived(
		viewer.loaded?.source.kind === 'text'
			? t('loader.sourceText')
			: (viewer.loaded?.source.name ?? '')
	);
	const printHeader = $derived(
		[formatHumanName(doc.patient?.name), formatFhirDate(doc.patient?.birthDate, currentLocale())]
			.filter(Boolean)
			.join(' · ')
	);

	// Printing expands every disclosure (spec §6.6), then restores them.
	let reopened: HTMLDetailsElement[] = [];
	function beforeprint() {
		reopened = Array.from(document.querySelectorAll<HTMLDetailsElement>('details:not([open])'));
		for (const d of reopened) d.open = true;
	}
	function afterprint() {
		for (const d of reopened) d.open = false;
		reopened = [];
	}

	// Move focus to the summary heading when a document opens, so it is announced.
	function focusOnOpen(node: HTMLElement) {
		void doc;
		node.focus();
	}
</script>

<svelte:window onbeforeprint={beforeprint} onafterprint={afterprint} />

<div class="print-header" aria-hidden="true">{printHeader}</div>

<article class="viewer" aria-labelledby="viewer-heading">
	<div class="viewer-toolbar">
		<h1 id="viewer-heading" tabindex="-1" {@attach focusOnOpen}>{t('viewer.documentHeading')}</h1>
		<Button class="viewer-close" onclick={() => viewer.clear()}>{t('viewer.loadAnother')}</Button>
	</div>
	{#if viewer.loaded}
		<p class="hint viewer-loaded" role="status">
			{t('loader.loadedAs', { format: viewer.loaded.format.toUpperCase(), source })}
		</p>
	{/if}

	<PatientBanner {doc} />

	<div class="viewer-layout">
		<aside class="viewer-aside">
			<ContentsNav class="viewer-contents" label={t('viewer.contents')}>
				<ContentsList>
					{#each doc.sections as section (section.id)}
						<ContentsListItem data-state={section.state}>
							<ContentsLink href="#{section.id}">{t(`sections.${section.key}.title`)}</ContentsLink>
						</ContentsListItem>
					{/each}
				</ContentsList>
			</ContentsNav>
			<ToggleButton
				class="viewer-codes"
				label={t('viewer.showCodes')}
				bind:pressed={viewer.showCodes}
			>
				{t('viewer.showCodes')}
			</ToggleButton>
		</aside>

		<div class="viewer-main">
			<p class="hint">{t('viewer.documentLanguage')}</p>
			<DocumentChecks checks={doc.checks} />
			{#each doc.sections as section (section.id)}
				<SectionView {section} {doc} />
			{/each}
			<DocumentMeta {doc} />
			<ExportMenu {doc} />
		</div>
	</div>
</article>
