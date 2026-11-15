<script lang="ts">
	// Export (spec §6.7, tasks.md P6-T8): choose a format, adjust its options,
	// download. Everything is made in the browser; nothing is uploaded. The
	// result is announced in a polite live region.
	import { asset } from '$app/paths';
	import {
		Alert,
		Button,
		Details,
		Loading,
		RadioGroup,
		RadioInput
	} from '@lilydesignsystem/svelte-headless';
	import { downloadBlob, exportFilename, type ExportFormat } from '#lib/export/filename.ts';
	import { jsonBlob } from '#lib/export/json.ts';
	import { markdownBlob } from '#lib/export/markdown.ts';
	import type { PaperSize } from '#lib/export/pdf.ts';
	import { yamlBlob } from '#lib/export/yaml.ts';
	import type { IpsDocument } from '#lib/fhir/types.ts';
	import { formatContext, t } from '#lib/i18n.ts';

	let { doc }: { doc: IpsDocument } = $props();

	const FORMATS: ExportFormat[] = ['json', 'yaml', 'markdown', 'pdf'];
	const PAPERS: { value: PaperSize; key: string }[] = [
		{ value: 'auto', key: 'export.paperAuto' },
		{ value: 'A4', key: 'export.paperA4' },
		{ value: 'LETTER', key: 'export.paperLetter' }
	];

	let format = $state<ExportFormat>('pdf');
	let includeNarrative = $state(false);
	let includeCodes = $state(false);
	let paper = $state<PaperSize>('auto');
	let busy = $state(false);
	let failed = $state(false);
	let warning = $state(false);
	let announcement = $state('');
	/** A PDF that overflowed one page, held until the person confirms (F-EXP-3). */
	let pending = $state.raw<{ blob: Blob; filename: string } | undefined>(undefined);

	function save(blob: Blob, filename: string) {
		downloadBlob(blob, filename);
		pending = undefined;
		announcement = t('export.downloaded', { filename });
	}

	const plain = (s: string) => s.replace(/[\u2066-\u2069]/g, '');

	async function download() {
		busy = true;
		failed = false;
		warning = false;
		pending = undefined;
		announcement = '';
		const filename = exportFilename(doc, format);
		try {
			let blob: Blob;
			const ctx = formatContext();
			if (format === 'json') blob = jsonBlob(doc.bundle);
			else if (format === 'yaml') blob = yamlBlob(doc.bundle, plain(t('export.yamlComment')));
			else if (format === 'markdown')
				blob = markdownBlob(doc, ctx, { includeNarrative, includeCodes });
			else {
				// pdfmake and the fonts load only now, on the first PDF (spec F-EXP-6).
				const { browserPdfDeps, exportPdf } = await import('#lib/export/pdf.ts');
				const deps = await browserPdfDeps(asset('fonts/OFL.txt').replace(/OFL\.txt$/, ''));
				const result = await exportPdf(doc, ctx, { title: filename, paper }, deps);
				blob = new Blob([result.bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
				if (result.overflow) {
					warning = true;
					pending = { blob, filename };
					return;
				}
			}
			save(blob, filename);
		} catch (error) {
			console.error(error);
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<section class="export-menu" aria-labelledby="export-heading">
	<h2 id="export-heading">{t('export.heading')}</h2>
	<p>{t('export.intro')}</p>

	<RadioGroup class="export-formats" label={t('export.formatLabel')}>
		<legend>{t('export.formatLabel')}</legend>
		{#each FORMATS as value (value)}
			<label class="export-format">
				<RadioInput
					name="export-format"
					{value}
					label={t(`export.${value}`)}
					checked={format === value}
					onchange={() => (format = value)}
					aria-describedby="export-{value}-description"
				/>
				<span class="export-format-name">{t(`export.${value}`)}</span>
				<span class="hint" id="export-{value}-description">{t(`export.${value}Description`)}</span>
			</label>
		{/each}
	</RadioGroup>

	{#if format === 'markdown' || format === 'pdf'}
		<Details class="export-options" summary={t('export.options')}>
			{#if format === 'markdown'}
				<label class="checkbox"
					><input type="checkbox" bind:checked={includeNarrative} />
					{t('export.includeNarrative')}</label
				>
				<label class="checkbox"
					><input type="checkbox" bind:checked={includeCodes} /> {t('export.includeCodes')}</label
				>
			{:else}
				<RadioGroup class="export-papers" label={t('export.paperSize')}>
					<legend>{t('export.paperSize')}</legend>
					{#each PAPERS as p (p.value)}
						<label class="export-format">
							<RadioInput
								name="export-paper"
								value={p.value}
								label={t(p.key)}
								checked={paper === p.value}
								onchange={() => (paper = p.value)}
							/>
							<span>{t(p.key)}</span>
						</label>
					{/each}
				</RadioGroup>
			{/if}
		</Details>
	{/if}

	<Button class="export-download" onclick={download} disabled={busy}>{t('export.download')}</Button>

	{#if busy}
		<Loading label={t('export.generating')}>
			<span class="loading-spinner" aria-hidden="true"></span>
			<span>{t('export.generating')}</span>
		</Loading>
	{/if}
	{#if failed}
		<Alert type="error">{t('export.failed')}</Alert>
	{/if}
	{#if warning}
		<Alert type="warning" role="alert">
			<p>{t('export.overflowWarning')}</p>
			{#if pending}
				<Button onclick={() => pending && save(pending.blob, pending.filename)}
					>{t('export.downloadAnyway')}</Button
				>
			{/if}
		</Alert>
	{/if}
	<p class="export-announcement" role="status" aria-live="polite">{announcement}</p>
</section>
