<script lang="ts">
	// One observation's value through Lily ObservationView: value, unit, flag
	// in words, range and missing states. Panel components (blood pressure)
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
					status={part.status}
					statusLabel={part.status === 'final'
						? undefined
						: (part.statusLabel ?? t(`status.${part.status}`))}
				/>
			</li>
		{/each}
	</ul>
{/if}
