<script lang="ts">
	// A section's entries through the Lily medical record lists (spec F-VIEW-4,
	// tasks.md P4-T4…P5-T14). The list's status is never blank: "none known",
	// "not recorded", "unavailable" and "omitted" are its one item when there
	// is nothing to list. Each item is the Lily component for its resource
	// type; anything else is a RecordListItem (the generic fallback).
	import {
		AllergyRecordList,
		AllergyRecordListItem,
		DeviceRecordList,
		DeviceRecordListItem,
		ImmunizationRecordList,
		ImmunizationRecordListItem,
		MedicationRecordList,
		MedicationRecordListItem,
		MedicationView,
		ProblemRecordList,
		ProblemRecordListItem,
		ProcedureRecordList,
		ProcedureRecordListItem,
		RecordList,
		RecordListItem
	} from '@lilydesignsystem/svelte-headless';
	import type { Component } from 'svelte';
	import Codes from '../Codes.svelte';
	import EntrySource from '../EntrySource.svelte';
	import ObservationValue from './ObservationValue.svelte';
	import ResultsTable from './ResultsTable.svelte';
	import { sectionModels, stateLabel, type EntryModel } from '#lib/fhir/models.ts';
	import type { IpsDocument, IpsSection, SectionKey } from '#lib/fhir/types.ts';
	import { formatContext, t } from '#lib/i18n.ts';

	let { section, doc, title }: { section: IpsSection; doc: IpsDocument; title: string } = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const LISTS: Partial<Record<SectionKey, Component<any>>> = {
		allergies: AllergyRecordList,
		medications: MedicationRecordList,
		problems: ProblemRecordList,
		pastIllness: ProblemRecordList,
		functionalStatus: ProblemRecordList,
		immunizations: ImmunizationRecordList,
		procedures: ProcedureRecordList,
		devices: DeviceRecordList
	};
	const models = $derived(sectionModels(section, doc, formatContext()));
	const List = $derived(LISTS[section.key] ?? RecordList);
	// A section of observations (Results, Vital signs, Social history,
	// Pregnancy, or any other made only of them) is a results table.
	const asTable = $derived(
		section.state === 'known' &&
			models.length > 0 &&
			models.every((m) => m.kind === 'observation' || m.kind === 'report')
	);
	const status = $derived(
		section.state === 'known' && models.length === 0 ? 'not-recorded' : section.state
	);
	const lang = $derived(doc.language);
</script>

{#snippet extras(m: EntryModel)}
	{#if m.enteredInError}<strong class="entered-in-error">{t('viewer.enteredInError')}</strong>{/if}
	<Codes codes={m.codes} />
	<EntrySource resource={m.resource} />
{/snippet}

{#if asTable}
	<ResultsTable
		models={models.filter((m) => m.kind === 'observation' || m.kind === 'report')}
		label={title}
		{lang}
	/>
{:else if section.state !== 'known' || models.length > 0}
	<List
		{status}
		statusLabel={section.state === 'known' ? title : stateLabel(section, t)}
		label={title}
		{lang}
		data-empty-reason={section.emptyReason?.coding?.[0]?.code}
	>
		{#each models as m (m.id)}
			{#if m.kind === 'allergy'}
				<AllergyRecordListItem
					substance={m.title}
					reaction={m.reaction}
					severity={m.severity}
					severityLabel={m.severityLabel}
					criticality={m.criticality}
					criticalityLabel={m.criticalityLabel}
					clinicalStatus={m.clinicalStatus}
					clinicalStatusLabel={m.clinicalStatusLabel}
					verificationStatus={m.verificationStatus}
					verificationStatusLabel={m.verificationStatusLabel}
					typeLabel={m.typeLabel}
					categoryLabel={m.categoryLabel}
					updated={m.onset}
					updatedLabel={m.onsetLabel ? `${t('fields.onset')}: ${m.onsetLabel}` : undefined}
				>
					{@render extras(m)}
				</AllergyRecordListItem>
			{:else if m.kind === 'medication'}
				<MedicationRecordListItem
					status={m.status}
					statusLabel={m.statusLabel}
					effective={m.effective}
					effectiveLabel={m.effectiveLabel}
				>
					<MedicationView
						name={m.title}
						strength={m.strength}
						form={m.form}
						route={m.route}
						frequency={m.frequency}
						dosageText={m.dosageText}
					/>
					{@render extras(m)}
				</MedicationRecordListItem>
			{:else if m.kind === 'problem'}
				<ProblemRecordListItem
					condition={m.title}
					clinicalStatus={m.clinicalStatus}
					clinicalStatusLabel={m.clinicalStatusLabel}
					verificationStatus={m.verificationStatus}
					verificationStatusLabel={m.verificationStatusLabel}
					severityLabel={m.severityLabel}
					onset={m.onset}
					onsetLabel={m.onsetLabel}
					abatement={m.abatement}
					abatementLabel={m.abatementLabel}
				>
					{@render extras(m)}
				</ProblemRecordListItem>
			{:else if m.kind === 'immunization'}
				<ImmunizationRecordListItem
					vaccine={m.title}
					occurrence={m.occurrence}
					occurrenceLabel={m.occurrenceLabel}
					doseNumberLabel={m.doseNumberLabel}
					status={m.status}
					statusLabel={m.statusLabel}
					lotNumber={m.lotNumber ? `${t('fields.lotNumber')}: ${m.lotNumber}` : undefined}
				>
					{#if m.performer}<span class="record-detail">{t('fields.performer')}: {m.performer}</span
						>{/if}
					{@render extras(m)}
				</ImmunizationRecordListItem>
			{:else if m.kind === 'procedure'}
				<ProcedureRecordListItem
					procedure={m.title}
					status={m.status}
					statusLabel={m.statusLabel}
					performed={m.performed}
					performedLabel={m.performedLabel}
				>
					{@render extras(m)}
				</ProcedureRecordListItem>
			{:else if m.kind === 'device'}
				<DeviceRecordListItem
					device={m.title}
					status={m.status}
					statusLabel={m.statusLabel}
					timing={m.timing}
					timingLabel={m.timingLabel}
				>
					{@render extras(m)}
				</DeviceRecordListItem>
			{:else if m.kind === 'observation'}
				<RecordListItem
					status={m.status}
					statusLabel={m.statusLabel}
					updated={m.effective}
					updatedLabel={m.effectiveLabel}
				>
					<span class="record-title">{m.title}</span>
					<ObservationValue model={m} />
					{@render extras(m)}
				</RecordListItem>
			{:else if m.kind === 'report'}
				<RecordListItem updated={m.effective} updatedLabel={m.effectiveLabel}>
					<span class="record-title">{m.title}</span>
					<ul class="observation-components">
						{#each m.results as r (r.id)}
							<li>
								<span class="observation-component-name">{r.title}</span>
								<ObservationValue model={r} />
							</li>
						{/each}
					</ul>
					{@render extras(m)}
				</RecordListItem>
			{:else if m.kind === 'alert'}
				<RecordListItem status={m.status} statusLabel={m.statusLabel}>
					<span class="record-title">{m.title}</span>
					{#if m.categoryLabel}<span class="record-detail">{m.categoryLabel}</span>{/if}
					{#if m.periodLabel}<span class="record-detail">{m.periodLabel}</span>{/if}
					{@render extras(m)}
				</RecordListItem>
			{:else}
				<RecordListItem
					status={m.status}
					statusLabel={m.statusLabel}
					updated={m.date}
					updatedLabel={m.dateLabel}
				>
					<span class="record-title">{m.title}</span>
					{#if m.description}<span class="record-detail">{m.description}</span>{/if}
					{#each m.fields.filter((f) => !['item', 'description', 'status', 'date'].includes(f.key)) as f (f.key)}
						<span class="record-detail">{f.label}: {f.value}</span>
					{/each}
					{@render extras(m)}
				</RecordListItem>
			{/if}
		{/each}
	</List>
{/if}
