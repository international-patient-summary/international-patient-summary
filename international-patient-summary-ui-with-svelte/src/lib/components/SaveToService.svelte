<script lang="ts">
	// "Save to service" (spec §6.10, F-SIGN-7): when this tab is signed in to
	// the service, store the document open in the viewer, exactly as it was
	// loaded. Shown only for a document that did not come from the service; its
	// confirmation or error is only ever this document's.
	import { Button } from '@lilydesignsystem/svelte-headless';
	import { t } from '#lib/i18n.ts';
	import { remote } from '#lib/remote.svelte.ts';
	import { viewer } from '#lib/state.svelte.ts';

	const offered = $derived(
		remote.signedIn && !!viewer.loaded && viewer.loaded.source.kind !== 'service'
	);
	const result = $derived(
		remote.saveResult && remote.saveResult.for === viewer.loaded ? remote.saveResult : undefined
	);
</script>

{#if offered && viewer.loaded}
	{@const loaded = viewer.loaded}
	<div class="save-to-service">
		<Button disabled={remote.busy} onclick={() => remote.save(loaded)}>
			{t('service.save.button')}
		</Button>
		<p class="hint" role="status">
			{#if result?.id}{t('service.save.done')}{/if}
		</p>
		{#if result?.error}
			<p class="tour-error" role="alert">{t(`service.errors.${result.error}`)}</p>
		{/if}
	</div>
{/if}
