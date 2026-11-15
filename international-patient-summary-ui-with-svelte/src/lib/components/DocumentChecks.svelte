<script lang="ts">
	// Warnings and information about the document's structure (spec §6.2), in
	// a collapsible "Document checks" panel. Errors never reach here: they
	// block rendering and show in the ErrorSummary instead.
	import { Details } from '@lilydesignsystem/svelte-headless';
	import type { Check } from '#lib/fhir/types.ts';
	import { t } from '#lib/i18n.ts';

	let { checks }: { checks: Check[] } = $props();
</script>

{#if checks.length > 0}
	<Details class="document-checks" summary={t('checks.summary', { count: checks.length })}>
		<p>{t('checks.intro')}</p>
		<ul class="document-checks-list">
			{#each checks as check, i (i)}
				<li data-severity={check.severity}>
					<strong>{t(`checks.severity.${check.severity}`)}:</strong>
					{t(`checks.${check.key}`, check.values)}
				</li>
			{/each}
		</ul>
	</Details>
{/if}
