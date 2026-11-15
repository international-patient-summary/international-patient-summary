<script lang="ts">
	// Results, vital signs, social history and pregnancy observations
	// (spec F-VIEW-4, tasks.md P5-T2): a Lily DataTable of ObservationViews.
	// A DiagnosticReport is a group of rows under its own header row. On a
	// narrow screen the table collapses to cards (style.css, P5-T16).
	import {
		DataTable,
		DataTableBody,
		DataTableHead,
		DataTableRow,
		DataTableTD,
		DataTableTH
	} from '@lilydesignsystem/svelte-headless';
	import Codes from '../Codes.svelte';
	import EntrySource from '../EntrySource.svelte';
	import ObservationValue from './ObservationValue.svelte';
	import type { ObservationModel, ReportModel } from '#lib/fhir/models.ts';
	import { t } from '#lib/i18n.ts';

	let {
		models,
		label,
		lang
	}: { models: (ObservationModel | ReportModel)[]; label: string; lang?: string } = $props();
</script>

{#snippet row(m: ObservationModel)}
	<DataTableRow data-entered-in-error={m.enteredInError || undefined}>
		<DataTableTH scope="row" data-label={t('results.observation')}>
			<span {lang}>{m.title}</span>
			{#if m.categoryLabel}<span class="hint" {lang}>{m.categoryLabel}</span>{/if}
			<Codes codes={m.codes} />
		</DataTableTH>
		<DataTableTD data-label={t('results.result')}>
			<span {lang}><ObservationValue model={m} /></span>
		</DataTableTD>
		<DataTableTD data-label={t('results.date')}>
			{#if m.effectiveLabel}<time datetime={m.effective}>{m.effectiveLabel}</time>{/if}
			<EntrySource resource={m.resource} />
		</DataTableTD>
	</DataTableRow>
{/snippet}

<div class="results-table">
	<DataTable {label}>
		<DataTableHead>
			<DataTableRow>
				<DataTableTH scope="col">{t('results.observation')}</DataTableTH>
				<DataTableTH scope="col">{t('results.result')}</DataTableTH>
				<DataTableTH scope="col">{t('results.date')}</DataTableTH>
			</DataTableRow>
		</DataTableHead>
		<DataTableBody>
			{#each models as m (m.id)}
				{#if m.kind === 'report'}
					<DataTableRow class="results-group">
						<DataTableTH scope="rowgroup" colspan={3}>
							<span {lang}>{t('results.group', { name: m.title })}</span>
							{#if m.effectiveLabel}<time datetime={m.effective}>{m.effectiveLabel}</time>{/if}
							{#if m.statusLabel}<span class="status-text">{m.statusLabel}</span>{/if}
							{#if m.conclusion}<span class="hint" {lang}>{m.conclusion}</span>{/if}
							<Codes codes={m.codes} />
						</DataTableTH>
					</DataTableRow>
					{#each m.results as r (r.id)}
						{@render row(r)}
					{/each}
				{:else}
					{@render row(m)}
				{/if}
			{/each}
		</DataTableBody>
	</DataTable>
</div>
