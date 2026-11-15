<script lang="ts">
	// Load and structural errors (tasks.md P3-T2), in a Lily ErrorSummary that
	// takes focus when it appears, so a screen reader announces it.
	import { ErrorSummary } from '@lilydesignsystem/svelte-headless';
	import { t } from '#lib/i18n.ts';
	import type { ViewerError } from '#lib/state.svelte.ts';

	let { errors }: { errors: ViewerError[] } = $props();
	// Focus the summary whenever a new set of errors appears.
	function focusSummary(node: HTMLElement) {
		void errors;
		node.querySelector<HTMLElement>('.error-summary')?.focus();
	}
</script>

{#if errors.length > 0}
	<div {@attach focusSummary}>
		<ErrorSummary title={t('loader.errorTitle')}>
			<ul class="error-summary-list">
				{#each errors as error, i (i)}
					<li>
						<span>{t(error.key, error.values)}</span>
						{#if error.line}
							<span
								>{t('loader.errorPosition', { line: error.line, column: error.column ?? 1 })}</span
							>
						{/if}
						{#if error.detail}
							<span class="error-detail">{t('loader.errorDetail', { detail: error.detail })}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</ErrorSummary>
	</div>
{/if}
