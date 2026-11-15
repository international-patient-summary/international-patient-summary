<script lang="ts">
	// Document metadata (spec F-VIEW-2, tasks.md P4-T2) in a Lily SummaryList.
	import { SummaryList, SummaryListItem } from '@lilydesignsystem/svelte-headless';
	import { documentSummary } from '#lib/fhir/summary.ts';
	import type { IpsDocument } from '#lib/fhir/types.ts';
	import { formatContext, t } from '#lib/i18n.ts';

	let { doc }: { doc: IpsDocument } = $props();
	const meta = $derived(documentSummary(doc, formatContext()));
</script>

<section class="document-meta" aria-labelledby="document-meta-heading">
	<h2 id="document-meta-heading">{t('document.heading')}</h2>
	<SummaryList label={t('document.label')}>
		{#if meta.title}
			<SummaryListItem term={t('document.title')}
				><span lang={doc.language}>{meta.title}</span></SummaryListItem
			>
		{/if}
		<SummaryListItem term={t('document.date')}>
			{#if meta.date}<time datetime={meta.date}>{meta.dateLabel}</time>{:else}{t(
					'values.notStated'
				)}{/if}
		</SummaryListItem>
		<SummaryListItem term={t('document.authors')}>
			<span lang={doc.language}
				>{meta.authors.length ? meta.authors.join('; ') : t('values.notStated')}</span
			>
		</SummaryListItem>
		{#if meta.custodian}
			<SummaryListItem term={t('document.custodian')}
				><span lang={doc.language}>{meta.custodian}</span></SummaryListItem
			>
		{/if}
		{#if meta.attesters.length}
			<SummaryListItem term={t('document.attesters')}
				><span lang={doc.language}>{meta.attesters.join('; ')}</span></SummaryListItem
			>
		{/if}
		{#if meta.statusLabel}
			<SummaryListItem term={t('document.status')}>{meta.statusLabel}</SummaryListItem>
		{/if}
		{#if meta.confidentialityLabel}
			<SummaryListItem term={t('document.confidentiality')}
				>{meta.confidentialityLabel}</SummaryListItem
			>
		{/if}
		<SummaryListItem term={t('document.language')}
			>{meta.languageLabel ?? t('values.notStated')}</SummaryListItem
		>
		<SummaryListItem term={t('document.version')}>{meta.versionLabel}</SummaryListItem>
		{#if meta.identifier}
			<SummaryListItem term={t('document.identifier')}
				><code>{meta.identifier}</code></SummaryListItem
			>
		{/if}
	</SummaryList>
</section>
