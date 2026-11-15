<script lang="ts">
	// The bundled IG example fixtures (tasks.md P3-T3). Choosing one opens it
	// in the viewer.
	import { resolve } from '$app/paths';
	import { EXAMPLES } from '#lib/examples.ts';
	import { t } from '#lib/i18n.ts';
</script>

<svelte:head>
	<title>{t('examples.heading')} — {t('app.title')}</title>
</svelte:head>

<section class="examples" aria-labelledby="examples-heading">
	<h1 id="examples-heading">{t('examples.heading')}</h1>
	<p>{t('examples.intro')}</p>
	<ul class="example-cards">
		{#each EXAMPLES as id (id)}
			<li class="example-card">
				<h2>{t(`examples.${id}.name`)}</h2>
				<p>{t(`examples.${id}.description`)}</p>
				<a
					class="button"
					href="{resolve('/')}?example={id}"
					aria-label={t('loader.openExample', { name: t(`examples.${id}.name`) })}
					>{t('examples.open')}</a
				>
			</li>
		{/each}
	</ul>
</section>
