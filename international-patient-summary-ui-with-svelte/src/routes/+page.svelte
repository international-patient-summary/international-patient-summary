<script lang="ts">
	// The viewer page: the loader until a document is open, then the summary.
	// `/?example=<id>` opens a bundled example (used by the Examples page).
	import { goto } from '$app/navigation';
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import Loader from '#lib/components/Loader.svelte';
	import Viewer from '#lib/components/Viewer.svelte';
	import { isExampleId } from '#lib/examples.ts';
	import { loadExample } from '#lib/fhir/load.ts';
	import { t } from '#lib/i18n.ts';
	import { viewer } from '#lib/state.svelte.ts';

	$effect(() => {
		const id = page.url.searchParams.get('example');
		if (!isExampleId(id)) return;
		// Only the ?example= parameter starts a load; nothing else is tracked.
		untrack(() => {
			viewer.busy = true;
			loadExample(asset(`examples/${id}.json`), t(`examples.${id}.name`))
				.then((result) => viewer.open(result))
				.catch((error) => viewer.fail(error))
				.finally(() => {
					viewer.busy = false;
					// The example id is not patient data, but the address stays plain.
					goto('?', { replace: true, reset: false });
				});
		});
	});
</script>

{#if viewer.doc}
	<Viewer doc={viewer.doc} />
{:else}
	<Loader />
{/if}
