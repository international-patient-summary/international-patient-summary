<script lang="ts">
	// Code systems and codes beside a value (spec F-VIEW-7). Hidden codes stay
	// out of the reading order (`hidden`), not merely visually hidden.
	import type { CodeLabel } from '#lib/fhir/format.ts';
	import { t } from '#lib/i18n.ts';
	import { viewer } from '#lib/state.svelte.ts';

	let { codes }: { codes: CodeLabel[] } = $props();
</script>

{#if codes.length > 0}
	<span class="entry-codes" hidden={!viewer.showCodes}>
		<span class="screen-reader-span">{t('viewer.codes')}: </span>
		{#each codes as code, i (i)}<code
				>{code.system ? `${code.system} ${code.code}` : code.code}</code
			>{/each}
	</span>
{/if}
