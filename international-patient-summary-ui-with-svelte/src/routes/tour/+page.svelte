<script lang="ts">
	// The public tour (spec §6.8, tasks.md P9): sign in as example@example.com,
	// browse the summaries an in-memory IPS service holds, open one in the
	// viewer, and sign out. It is backendless: TourService stands in for
	// international-patient-summary-service-with-axum, and nothing leaves the browser.
	import { asset } from '$app/paths';
	import {
		Button,
		DocumentList,
		DocumentListItem,
		EmailInput,
		Field,
		Form,
		InformationCallout,
		Loading,
		PasswordInput,
		StepList,
		StepListItem,
		Tour,
		TourList,
		TourListItem
	} from '@lilydesignsystem/svelte-headless';
	import Viewer from '#lib/components/Viewer.svelte';
	import type { ExampleId } from '#lib/examples.ts';
	import { formatFhirDate } from '#lib/fhir/format.ts';
	import { currentLocale, t } from '#lib/i18n.ts';
	import { viewer } from '#lib/state.svelte.ts';
	import { tour, TOUR_EMAIL, TOUR_PASSWORD, TOUR_STEPS, type TourStep } from '#lib/tour.svelte.ts';

	// Filled in for the visitor: the tour account is public.
	let email = $state(TOUR_EMAIL);
	let password = $state(TOUR_PASSWORD);
	let guideOpen = $state(true);

	const exampleHref = (id: ExampleId) => asset(`examples/${id}.json`);
	const stepIndex = $derived(TOUR_STEPS.indexOf(tour.step));

	function status(index: number): 'finished' | 'in-progress' | 'waiting' {
		if (index < stepIndex) return 'finished';
		return index === stepIndex ? 'in-progress' : 'waiting';
	}

	function stepLabel(step: TourStep, index: number): string {
		return t('tour.stepOf', {
			name: t(`tour.${step}.heading`),
			step: index + 1,
			total: TOUR_STEPS.length
		});
	}

	async function signIn() {
		await tour.signIn(email, password, exampleHref);
	}

	function signOut() {
		tour.signOut();
		email = TOUR_EMAIL;
		password = TOUR_PASSWORD;
		guideOpen = true;
	}
</script>

<svelte:head>
	<title>{t('tour.heading')} — {t('app.title')}</title>
</svelte:head>

<div class="tour-page">
	{#if tour.step !== 'view'}
		<h1>{t('tour.heading')}</h1>
		<p>{t('tour.intro')}</p>
		<InformationCallout class="tour-callout" label={t('tour.calloutLabel')}>
			<p>{t('tour.backendless')}</p>
		</InformationCallout>
	{/if}

	<StepList class="tour-steps" label={t('tour.steps')} current={stepIndex}>
		{#each TOUR_STEPS as step, index (step)}
			<StepListItem
				status={status(index)}
				current={index === stepIndex}
				label={stepLabel(step, index)}
			>
				{t(`tour.${step}.heading`)}
			</StepListItem>
		{/each}
	</StepList>

	<Tour class="tour-guide" label={t('tour.guide')} bind:active={guideOpen}>
		<TourList label={t('tour.steps')} active={guideOpen}>
			{#each TOUR_STEPS as step, index (step)}
				<TourListItem label={stepLabel(step, index)} current={index === stepIndex}>
					<p><strong>{stepLabel(step, index)}</strong></p>
					<p>{t(`tour.${step}.guide`)}</p>
					<Button onclick={() => (guideOpen = false)}>{t('tour.hideGuide')}</Button>
				</TourListItem>
			{/each}
		</TourList>
	</Tour>
	{#if !guideOpen}
		<Button class="tour-show-guide" onclick={() => (guideOpen = true)}>
			{t('tour.showGuide')}
		</Button>
	{/if}

	{#if tour.busy}
		<Loading class="loader-busy" label={t('tour.loading')}>
			<span class="loading-spinner" aria-hidden="true"></span>
			<span>{t('tour.loading')}</span>
		</Loading>
	{/if}

	{#if tour.step === 'signIn'}
		<section class="tour-sign-in" aria-labelledby="tour-sign-in-heading">
			<h2 id="tour-sign-in-heading">{t('tour.signIn.heading')}</h2>
			<Form class="loader-form" label={t('tour.signIn.form')} onsubmit={signIn}>
				<Field
					label={t('tour.signIn.email')}
					inputId="tour-email"
					description={t('tour.signIn.hint', { email: TOUR_EMAIL })}
					error={tour.error === 'signIn' ? t('tour.errors.signIn') : undefined}
				>
					<EmailInput
						id="tour-email"
						label={t('tour.signIn.email')}
						bind:value={email}
						required
						autocomplete="username"
					/>
				</Field>
				<Field label={t('tour.signIn.password')} inputId="tour-password">
					<PasswordInput
						id="tour-password"
						label={t('tour.signIn.password')}
						bind:value={password}
						required
						autocomplete="off"
					/>
				</Field>
				<Button type="submit" disabled={tour.busy}>{t('tour.signIn.submit')}</Button>
			</Form>
		</section>
	{:else}
		<div class="tour-account">
			<p>{t('tour.summaries.signedInAs', { email: tour.email ?? '' })}</p>
			{#if tour.step === 'view'}
				<Button onclick={() => viewer.clear()}>{t('tour.view.back')}</Button>
			{/if}
			<Button onclick={signOut}>{t('tour.signOut')}</Button>
		</div>

		{#if tour.error && tour.error !== 'signIn'}
			<p class="tour-error" role="alert">{t(`tour.errors.${tour.error}`)}</p>
		{/if}

		{#if tour.step === 'view' && viewer.doc}
			<Viewer doc={viewer.doc} />
		{:else}
			<section class="tour-summaries" aria-labelledby="tour-summaries-heading">
				<h2 id="tour-summaries-heading">{t('tour.summaries.heading')}</h2>
				{#if tour.summaries.length}
					<DocumentList class="example-cards" label={t('tour.summaries.list')}>
						{#each tour.summaries as summary (summary.id)}
							{@const title = summary.title ?? t('tour.summaries.untitled')}
							{@const name = summary.patient ?? title}
							<DocumentListItem class="example-card">
								<h3>{name}</h3>
								{#if summary.patient}<p>{title}</p>{/if}
								{#if summary.date}
									<p>
										{t('tour.summaries.date', {
											date: formatFhirDate(summary.date, currentLocale()) ?? summary.date
										})}
									</p>
								{/if}
								<div class="tour-actions">
									<Button
										label={t('tour.summaries.openNamed', { title: name })}
										disabled={tour.busy}
										onclick={() => tour.open(summary)}
									>
										{t('tour.summaries.open')}
									</Button>
									<Button
										class="tour-delete"
										label={t('tour.summaries.deleteNamed', { title: name })}
										disabled={tour.busy}
										onclick={() => tour.remove(summary.id)}
									>
										{t('tour.summaries.delete')}
									</Button>
								</div>
							</DocumentListItem>
						{/each}
					</DocumentList>
				{:else if !tour.busy}
					<p>{t('tour.summaries.empty')}</p>
				{/if}
				<Button disabled={tour.busy} onclick={() => tour.reset(exampleHref)}>
					{t('tour.summaries.reset')}
				</Button>
			</section>
		{/if}
	{/if}
</div>
