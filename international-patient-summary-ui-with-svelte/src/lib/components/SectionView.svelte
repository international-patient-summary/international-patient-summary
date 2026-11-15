<script lang="ts">
	// One section (tasks.md P4-T3): an h2, its level, the entries, the state in
	// words when there are none, unresolved references inline, and the
	// author's narrative — open when it is the only content (F-VIEW-5).
	import {
		MedicalBannerBoxForAdvice,
		ToggleButton,
		WarningText
	} from '@lilydesignsystem/svelte-headless';
	import EntryList from './sections/EntryList.svelte';
	import Timeline from './sections/Timeline.svelte';
	import Narrative from './Narrative.svelte';
	import type { IpsDocument, IpsSection } from '#lib/fhir/types.ts';
	import { t } from '#lib/i18n.ts';
	import { viewer } from '#lib/state.svelte.ts';

	let { section, doc }: { section: IpsSection; doc: IpsDocument } = $props();

	const title = $derived(t(`sections.${section.key}.title`));
	const openNarrative = $derived(section.entries.length === 0);
	const advice = $derived(section.key === 'advanceDirectives' && section.state === 'known');
	// Procedures and immunizations can also be read as a timeline (P5-T3).
	const canTimeline = $derived(
		(section.key === 'procedures' || section.key === 'immunizations') &&
			section.state === 'known' &&
			section.entries.length > 1
	);
	let timeline = $state(false);
</script>

<section
	class="ips-section"
	id={section.id}
	aria-labelledby="{section.id}-heading"
	data-section={section.key}
	data-state={section.state}
	data-level={section.level}
>
	<h2 id="{section.id}-heading">{title}</h2>
	<p class="ips-section-meta">
		<span class="ips-section-level">{t(`level.${section.level}`)}</span>
		{#if section.documentTitle && section.documentTitle !== title}
			<span class="ips-section-document-title" lang={doc.language}>“{section.documentTitle}”</span>
		{/if}
		{#if section.code}<code class="ips-section-code" hidden={!viewer.showCodes}
				>LOINC {section.code}</code
			>{/if}
	</p>

	{#if section.unresolved.length > 0}
		<WarningText class="ips-section-warning">
			{#snippet icon()}!{/snippet}
			<span class="screen-reader-span">{t('checks.severity.warning')}: </span>
			{t('viewer.unresolvedInline', { count: section.unresolved.length })}
		</WarningText>
	{/if}

	{#if canTimeline}
		<ToggleButton class="ips-section-view" label={t('viewer.timeline')} bind:pressed={timeline}
			>{t('viewer.timeline')}</ToggleButton
		>
	{/if}

	{#if canTimeline && timeline}
		<Timeline {section} {doc} {title} />
	{:else if advice}
		<MedicalBannerBoxForAdvice class="ips-section-advice" label={title}>
			<EntryList {section} {doc} {title} />
		</MedicalBannerBoxForAdvice>
	{:else}
		<EntryList {section} {doc} {title} />
	{/if}

	{#if section.narrative}
		<Narrative div={section.narrative} lang={doc.language} open={openNarrative} />
	{/if}
</section>
