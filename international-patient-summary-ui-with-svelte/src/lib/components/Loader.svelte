<script lang="ts">
	// The loader (spec §6.1, tasks.md P3-T1): File / Paste / Web address /
	// Examples tabs. A file can also be dropped anywhere on the page. The
	// document is held in memory only (state.svelte.ts).
	import { asset } from '$app/paths';
	import { dev } from '$app/env';
	import {
		Button,
		FileUpload,
		Loading,
		TabBar,
		TabBarButton,
		TabPanel
	} from '@lilydesignsystem/svelte-headless';
	import ErrorList from './ErrorList.svelte';
	import { EXAMPLES, type ExampleId } from '#lib/examples.ts';
	import { loadExample, loadFile, loadText, loadUrl, type LoadResult } from '#lib/fhir/load.ts';
	import { t } from '#lib/i18n.ts';
	import { viewer } from '#lib/state.svelte.ts';

	type Tab = 'file' | 'paste' | 'url' | 'examples';
	const TABS: Tab[] = ['file', 'paste', 'url', 'examples'];
	const TAB_LABEL: Record<Tab, string> = {
		file: 'loader.tabFile',
		paste: 'loader.tabPaste',
		url: 'loader.tabUrl',
		examples: 'loader.tabExamples'
	};

	let tab = $state<Tab>('file');
	let pasted = $state('');
	let url = $state('');
	let dragging = $state(false);

	const ACCEPT = '.json,.yaml,.yml,application/json,application/fhir+json,application/yaml';

	async function run(task: () => Promise<LoadResult> | LoadResult) {
		viewer.busy = true;
		try {
			viewer.open(await task());
		} catch (error) {
			viewer.fail(error);
		} finally {
			viewer.busy = false;
		}
	}

	function openFiles(files: FileList | null | undefined) {
		const file = files?.[0];
		if (file) run(() => loadFile(file));
	}

	export function openExample(id: ExampleId) {
		run(() => loadExample(asset(`examples/${id}.json`), t(`examples.${id}.name`)));
	}

	function ondragover(event: DragEvent) {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragging = true;
	}
	function ondragleave(event: DragEvent) {
		if (event.relatedTarget === null) dragging = false;
	}
	function ondrop(event: DragEvent) {
		if (!event.dataTransfer?.files.length) return;
		event.preventDefault();
		dragging = false;
		openFiles(event.dataTransfer.files);
	}
</script>

<svelte:document {ondragover} {ondragleave} {ondrop} />

<section class="loader" aria-labelledby="loader-heading" data-dragging={dragging || undefined}>
	<h1 id="loader-heading">{t('loader.heading')}</h1>
	<p>{t('loader.intro')}</p>

	<ErrorList errors={viewer.errors} />

	{#if viewer.busy}
		<Loading class="loader-busy" label={t('loader.loading')}>
			<span class="loading-spinner" aria-hidden="true"></span>
			<span>{t('loader.loading')}</span>
		</Loading>
	{/if}

	<TabBar class="loader-tabs" label={t('loader.tabsLabel')}>
		{#each TABS as id (id)}
			<TabBarButton
				id="loader-tab-{id}"
				controls="loader-panel-{id}"
				selected={tab === id}
				onclick={() => (tab = id)}
				onfocus={() => (tab = id)}
			>
				{t(TAB_LABEL[id])}
			</TabBarButton>
		{/each}
	</TabBar>

	<TabPanel
		id="loader-panel-file"
		label={t('loader.tabFile')}
		labelledBy="loader-tab-file"
		selected={tab === 'file'}
	>
		<FileUpload
			class="loader-file"
			label={t('loader.fileLabel')}
			accept={ACCEPT}
			onchange={openFiles}
			selectedLabel={(count: number) => t('loader.fileSelected', { count })}
		/>
		<p class="hint">{t('loader.fileHint')}</p>
		<p class="hint">{t('loader.dropHint')}</p>
	</TabPanel>

	<TabPanel
		id="loader-panel-paste"
		label={t('loader.tabPaste')}
		labelledBy="loader-tab-paste"
		selected={tab === 'paste'}
	>
		<form
			class="loader-form"
			onsubmit={(event) => {
				event.preventDefault();
				run(() => loadText(pasted));
			}}
		>
			<label for="loader-paste">{t('loader.pasteLabel')}</label>
			<textarea
				id="loader-paste"
				bind:value={pasted}
				rows="12"
				spellcheck="false"
				autocomplete="off"
				autocapitalize="off"></textarea>
			<Button type="submit" disabled={pasted.trim() === ''}>{t('loader.pasteButton')}</Button>
		</form>
	</TabPanel>

	<TabPanel
		id="loader-panel-url"
		label={t('loader.tabUrl')}
		labelledBy="loader-tab-url"
		selected={tab === 'url'}
	>
		<form
			class="loader-form"
			onsubmit={(event) => {
				event.preventDefault();
				run(() => loadUrl(url, fetch, undefined, dev));
			}}
		>
			<label for="loader-url">{t('loader.urlLabel')}</label>
			<p class="hint" id="loader-url-hint">{t('loader.urlHint')}</p>
			<input
				id="loader-url"
				type="url"
				inputmode="url"
				placeholder="https://"
				aria-describedby="loader-url-hint"
				bind:value={url}
				autocomplete="url"
			/>
			<Button type="submit" disabled={url.trim() === ''}>{t('loader.urlButton')}</Button>
		</form>
	</TabPanel>

	<TabPanel
		id="loader-panel-examples"
		label={t('loader.tabExamples')}
		labelledBy="loader-tab-examples"
		selected={tab === 'examples'}
	>
		<p>{t('loader.examplesIntro')}</p>
		<ul class="example-list">
			{#each EXAMPLES as id (id)}
				<li>
					<Button
						class="example-button"
						onclick={() => openExample(id)}
						label={t('loader.openExample', { name: t(`examples.${id}.name`) })}
					>
						{t(`examples.${id}.name`)}
					</Button>
					<span class="hint">{t(`examples.${id}.description`)}</span>
				</li>
			{/each}
		</ul>
	</TabPanel>

	{#if dragging}
		<div class="drop-overlay" aria-hidden="true">{t('loader.dropActive')}</div>
	{/if}
</section>
