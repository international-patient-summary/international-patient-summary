<script lang="ts">
	// The patient banner (spec F-VIEW-1, tasks.md P4-T1), composed as the Lily
	// healthcare pattern describes: two identifiers (name with date of birth,
	// and the identifiers with their systems), age beside the date of birth,
	// and allergies and active alerts in a danger box that is never collapsed
	// (spec §8). Allergies go through AllergyRecordList, so "none known", "not
	// recorded" and "unavailable" never look alike.
	import {
		AddressographBox,
		AgeView,
		AllergyRecordList,
		AllergyRecordListItem,
		MedicalBanner,
		MedicalBannerBoxForDanger,
		RecordList,
		RecordListItem
	} from '@lilydesignsystem/svelte-headless';
	import {
		sectionModels,
		stateLabel,
		type AlertModel,
		type AllergyModel
	} from '#lib/fhir/models.ts';
	import { patientSummary } from '#lib/fhir/summary.ts';
	import type { IpsDocument } from '#lib/fhir/types.ts';
	import { formatContext, t } from '#lib/i18n.ts';

	let { doc }: { doc: IpsDocument } = $props();

	const ctx = $derived(formatContext());
	const patient = $derived(patientSummary(doc, ctx));
	const allergySection = $derived(doc.sections.find((s) => s.key === 'allergies'));
	const allergies = $derived(
		allergySection
			? (sectionModels(allergySection, doc, ctx).filter(
					(m): m is AllergyModel => m.kind === 'allergy'
				) as AllergyModel[])
			: []
	);
	// Active and unrefuted allergies, highest criticality first. Every one is
	// listed; inactive, resolved and refuted ones stay in the section below.
	const bannerAllergies = $derived(
		allergies
			.filter(
				(a) =>
					a.clinicalStatus !== 'inactive' &&
					a.clinicalStatus !== 'resolved' &&
					a.verificationStatus !== 'refuted' &&
					!a.enteredInError
			)
			.sort((a, b) => Number(b.criticality === 'high') - Number(a.criticality === 'high'))
	);
	const alertSection = $derived(doc.sections.find((s) => s.key === 'alerts'));
	const alerts = $derived(
		alertSection
			? (sectionModels(alertSection, doc, ctx).filter(
					(m): m is AlertModel => m.kind === 'alert' && m.active
				) as AlertModel[])
			: []
	);
	const allergyStatus = $derived(
		!allergySection
			? 'omitted'
			: allergySection.state === 'known' && bannerAllergies.length === 0
				? 'none-known'
				: allergySection.state
	);
	const allergyStatusLabel = $derived(
		allergySection
			? allergySection.state === 'known'
				? bannerAllergies.length === 0
					? t('state.none-known')
					: t('patient.allergies')
				: stateLabel(allergySection, t)
			: t('state.omitted')
	);
</script>

<MedicalBanner
	class="patient-banner"
	label={t('patient.bannerLabel')}
	data-deceased={patient.deceased || undefined}
>
	<AddressographBox class="patient-identity" label={t('patient.identityLabel')}>
		<p class="patient-name" lang={doc.language}>{patient.name ?? t('patient.notStated')}</p>
		{#if patient.deceasedLabel}
			<p class="patient-deceased"><strong>{patient.deceasedLabel}</strong></p>
		{/if}
		<dl class="patient-facts">
			<div>
				<dt>{t('patient.birthDate')}</dt>
				<dd>
					{#if patient.birthDate}
						<time datetime={patient.birthDate}>{patient.birthDateLabel}</time>
						{#if patient.ageLabel}
							<span class="patient-age">
								(<AgeView label={t('patient.age')} value={patient.ageLabel} />)
							</span>
						{/if}
					{:else}
						{t('patient.notStated')}
					{/if}
				</dd>
			</div>
			<div>
				<dt>{t('patient.gender')}</dt>
				<dd>{patient.genderLabel ?? t('patient.notStated')}</dd>
			</div>
			<div>
				<dt>{t('patient.identifiers')}</dt>
				<dd>
					{#if patient.identifiers.length > 0}
						<ul class="patient-identifiers">
							{#each patient.identifiers as id, i (i)}
								<li>
									<span class="patient-identifier-value">{id.value}</span>
									{#if id.system || id.type}
										<span class="patient-identifier-system">{id.type ?? id.system}</span>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						{t('patient.notStated')}
					{/if}
				</dd>
			</div>
			{#if patient.contacts.length > 0}
				<div>
					<dt>{t('patient.contact')}</dt>
					<dd lang={doc.language}>{patient.contacts.join('; ')}</dd>
				</div>
			{/if}
		</dl>
	</AddressographBox>

	<MedicalBannerBoxForDanger class="patient-danger" label={t('patient.dangerLabel')}>
		<div class="patient-danger-group">
			<p class="patient-danger-heading"><strong>{t('patient.allergies')}</strong></p>
			<AllergyRecordList
				status={allergyStatus}
				statusLabel={allergyStatusLabel}
				label={t('patient.allergies')}
				lang={doc.language}
			>
				{#each bannerAllergies as a (a.id)}
					<AllergyRecordListItem
						substance={a.title}
						reaction={a.reaction}
						severity={a.severity}
						severityLabel={a.severityLabel}
						criticality={a.criticality}
						criticalityLabel={a.criticalityLabel}
						verificationStatus={a.verificationStatus}
						verificationStatusLabel={a.verificationStatus === 'confirmed'
							? undefined
							: a.verificationStatusLabel}
					/>
				{/each}
			</AllergyRecordList>
		</div>
		{#if alertSection}
			<div class="patient-danger-group">
				<p class="patient-danger-heading"><strong>{t('patient.alerts')}</strong></p>
				<RecordList
					status={alerts.length > 0
						? 'known'
						: alertSection.state === 'known'
							? 'none-known'
							: alertSection.state}
					statusLabel={alerts.length > 0
						? t('patient.alerts')
						: alertSection.state === 'known'
							? t('patient.noActiveAlerts')
							: stateLabel(alertSection, t)}
					label={t('patient.alerts')}
					lang={doc.language}
				>
					{#each alerts as alert (alert.id)}
						<RecordListItem status="active" statusLabel={alert.categoryLabel ?? alert.statusLabel}>
							<span class="record-title">{alert.title}</span>
						</RecordListItem>
					{/each}
				</RecordList>
			</div>
		{/if}
	</MedicalBannerBoxForDanger>
</MedicalBanner>
