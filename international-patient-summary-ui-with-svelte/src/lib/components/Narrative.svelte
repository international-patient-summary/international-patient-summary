<script lang="ts">
	// A section's narrative, sanitised before display (spec F-VIEW-5, §7). It
	// carries the document's language so a screen reader pronounces it right.
	import { Details } from '@lilydesignsystem/svelte-headless';
	import { sanitizeNarrative } from '#lib/fhir/narrative.ts';
	import { t } from '#lib/i18n.ts';

	let { div, lang, open = false }: { div: string; lang?: string; open?: boolean } = $props();

	const html = $derived(sanitizeNarrative(div));
	let isOpen = $derived(open);
</script>

{#if html}
	<Details class="narrative" summary={t('viewer.narrative')} bind:open={isOpen}>
		<!-- Sanitised by DOMPurify with a FHIR narrative allowlist (narrative.ts). -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="narrative-body" {lang}>{@html html}</div>
	</Details>
{/if}
