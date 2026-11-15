<script lang="ts">
	// The entry's source JSON, for implementers (spec F-VIEW-6). Rendered as
	// text, never as HTML.
	import { Details } from '@lilydesignsystem/svelte-headless';
	import type { FhirResource } from 'fhir/r4';
	import { t } from '#lib/i18n.ts';

	let { resource }: { resource: FhirResource } = $props();
	let open = $state(false);
</script>

<Details class="entry-source" summary={t('viewer.source')} bind:open>
	{#if open}
		<pre class="entry-source-json" lang="en"><code>{JSON.stringify(resource, null, 2)}</code></pre>
	{/if}
</Details>
