<script lang="ts">
	// One observation's value through Lily ObservationView: value, unit, flag
	// in words, range and missing states, and (0.12) a meter beside a number
	// that has a numeric reference range. Panel components (blood pressure)
	// are listed under it.
	import { ObservationView } from '@lilydesignsystem/svelte-headless';
	import type { ObservationModel } from '#lib/fhir/models.ts';
	import { t } from '#lib/i18n.ts';

	let { model, label }: { model: ObservationModel; label?: string } = $props();
	const showMain = $derived(
		model.value !== '' || model.status !== 'final' || model.components.length === 0
	);
</script>

{#if showMain}
	<ObservationView
		{label}
		value={model.value}
		unit={model.unit}
		interpretation={model.interpretation}
		flagLabel={model.flagLabel}
		range={model.range ? `(${t('fields.referenceRange')}: ${model.range})` : undefined}
		meterValue={model.meter?.value}
		meterMin={model.meter?.min}
		meterMax={model.meter?.max}
		meterLow={model.meter?.low}
		meterHigh={model.meter?.high}
		status={model.status}
		statusLabel={model.status === 'final'
			? undefined
			: (model.statusLabel ?? t(`status.${model.status}`))}
	/>
{/if}
{#if model.components.length > 0}
	<ul class="observation-components">
		{#each model.components as part (part.id)}
			<li>
				<span class="observation-component-name">{part.title}</span>
				<ObservationView
					value={part.value}
					unit={part.unit}
					interpretation={part.interpretation}
					flagLabel={part.flagLabel}
					range={part.range ? `(${t('fields.referenceRange')}: ${part.range})` : undefined}
					meterValue={part.meter?.value}
					meterMin={part.meter?.min}
					meterMax={part.meter?.max}
					meterLow={part.meter?.low}
					meterHigh={part.meter?.high}
					status={part.status}
					statusLabel={part.status === 'final'
						? undefined
						: (part.statusLabel ?? t(`status.${part.status}`))}
				/>
			</li>
		{/each}
	</ul>
{/if}
