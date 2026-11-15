<script lang="ts">
	// Procedures and immunizations as a Lily TimelineList (tasks.md P5-T3), an
	// alternative to the record list: newest first, undated entries last and
	// said so in words.
	import { TimelineList, TimelineListItem } from '@lilydesignsystem/svelte-headless';
	import Codes from '../Codes.svelte';
	import { sectionModels, type EntryModel } from '#lib/fhir/models.ts';
	import type { IpsDocument, IpsSection } from '#lib/fhir/types.ts';
	import { formatContext, t } from '#lib/i18n.ts';

	let { section, doc, title }: { section: IpsSection; doc: IpsDocument; title: string } = $props();

	interface Dated {
		model: EntryModel;
		date?: string;
		label?: string;
		status?: string;
	}

	function dated(m: EntryModel): Dated {
		if (m.kind === 'procedure')
			return { model: m, date: m.performed, label: m.performedLabel, status: m.statusLabel };
		if (m.kind === 'immunization')
			return {
				model: m,
				date: m.occurrence,
				label: m.occurrenceLabel,
				status: [m.doseNumberLabel, m.statusLabel].filter(Boolean).join(' · ')
			};
		return { model: m };
	}

	const items = $derived(
		sectionModels(section, doc, formatContext())
			.map(dated)
			.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
	);
</script>

<TimelineList class="ips-timeline" label={t('viewer.timelineLabel', { title })} lang={doc.language}>
	{#each items as item (item.model.id)}
		<TimelineListItem datetime={item.date} heading={item.label ?? t('viewer.undated')}>
			<span class="record-title">{item.model.title}</span>
			{#if item.status}<span class="status-text">{item.status}</span>{/if}
			<Codes codes={item.model.codes} />
		</TimelineListItem>
	{/each}
</TimelineList>
