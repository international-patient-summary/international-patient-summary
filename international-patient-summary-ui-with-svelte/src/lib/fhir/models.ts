// View models: one per kind of entry, holding exactly what the Lily medical
// components take (codes for data-* attributes, words for every status), plus
// ordered `fields` for the Markdown and PDF exports. Every UI word comes
// from `t`; clinical content is as supplied. Pure TypeScript, no Svelte.
import type {
	AllergyIntolerance,
	CarePlan,
	ClinicalImpression,
	CodeableConcept,
	Condition,
	Consent,
	DeviceUseStatement,
	DiagnosticReport,
	DocumentReference,
	Extension,
	FhirResource,
	Flag,
	Immunization,
	ImmunizationRecommendation,
	MedicationRequest,
	MedicationStatement,
	Observation,
	ObservationComponent,
	Procedure
} from 'fhir/r4';
import {
	codeOf,
	codesOf,
	displayOf,
	displayOfAny,
	formatFhirDate,
	formatPeriod,
	formatQuantityNumber,
	formatQuantityValue,
	formatRange,
	formatRatio,
	isoDatePart,
	summariseDosage,
	type CodeLabel
} from './format.ts';
import type { FormatContext, IpsDocument, IpsSection, ResolvedEntry, Translate } from './types.ts';

/** A label and value pair, for export tables. `label` is already in words. */
export interface Field {
	key: string;
	label: string;
	value: string;
}

interface BaseModel {
	/** Stable key for {#each}: the entry's fullUrl or reference. */
	id: string;
	resourceType: string;
	/** The main words: substance, medicine, condition, test… */
	title: string;
	codes: CodeLabel[];
	fields: Field[];
	resource: FhirResource;
	/** True for an entered-in-error record, which must never read as a plain one. */
	enteredInError: boolean;
}

export interface AllergyModel extends BaseModel {
	kind: 'allergy';
	reaction?: string;
	severity?: 'mild' | 'moderate' | 'severe';
	severityLabel?: string;
	criticality?: 'low' | 'high' | 'unable-to-assess';
	criticalityLabel?: string;
	clinicalStatus?: 'active' | 'inactive' | 'resolved';
	clinicalStatusLabel?: string;
	verificationStatus?: 'unconfirmed' | 'presumed' | 'confirmed' | 'refuted' | 'entered-in-error';
	verificationStatusLabel?: string;
	typeLabel?: string;
	categoryLabel?: string;
	onset?: string;
	onsetLabel?: string;
}

export type MedicationStatus =
	| 'active'
	| 'completed'
	| 'entered-in-error'
	| 'intended'
	| 'stopped'
	| 'on-hold'
	| 'unknown'
	| 'not-taken';

export interface MedicationModel extends BaseModel {
	kind: 'medication';
	strength?: string;
	form?: string;
	route?: string;
	frequency?: string;
	dosageText?: string;
	status?: MedicationStatus;
	statusLabel?: string;
	effective?: string;
	effectiveLabel?: string;
	/** True when the medicine is current (active, intended, on hold). */
	current: boolean;
}

export interface ProblemModel extends BaseModel {
	kind: 'problem';
	clinicalStatus?: 'active' | 'recurrence' | 'relapse' | 'inactive' | 'remission' | 'resolved';
	clinicalStatusLabel?: string;
	verificationStatus?:
		'unconfirmed' | 'provisional' | 'differential' | 'confirmed' | 'refuted' | 'entered-in-error';
	verificationStatusLabel?: string;
	severityLabel?: string;
	onset?: string;
	onsetLabel?: string;
	abatement?: string;
	abatementLabel?: string;
	active: boolean;
}

export interface ImmunizationModel extends BaseModel {
	kind: 'immunization';
	occurrence?: string;
	occurrenceLabel?: string;
	doseNumberLabel?: string;
	status?: 'completed' | 'entered-in-error' | 'not-done';
	statusLabel?: string;
	lotNumber?: string;
	performer?: string;
}

export interface ProcedureModel extends BaseModel {
	kind: 'procedure';
	status?:
		| 'preparation'
		| 'in-progress'
		| 'not-done'
		| 'on-hold'
		| 'stopped'
		| 'completed'
		| 'entered-in-error'
		| 'unknown';
	statusLabel?: string;
	performed?: string;
	performedLabel?: string;
}

export interface DeviceModel extends BaseModel {
	kind: 'device';
	status?: 'active' | 'completed' | 'entered-in-error' | 'intended' | 'stopped' | 'on-hold';
	statusLabel?: string;
	timing?: string;
	timingLabel?: string;
}

export type ObservationViewStatus =
	| 'final'
	| 'preliminary'
	| 'amended'
	| 'corrected'
	| 'entered-in-error'
	| 'cancelled'
	| 'masked'
	| 'not-recorded'
	| 'unavailable';

export interface ObservationMeter {
	value: number;
	min: number;
	max: number;
	low?: number;
	high?: number;
}

export interface ObservationModel extends BaseModel {
	kind: 'observation';
	value: string;
	unit?: string;
	interpretation?: string;
	flagLabel?: string;
	range?: string;
	/**
	 * Where a numeric value sits against a numeric reference range, for the
	 * picture beside the words (Lily ObservationView `meter*`, 0.12). Only when
	 * the value and the range are numbers in the same unit.
	 */
	meter?: ObservationMeter;
	status: ObservationViewStatus;
	statusLabel?: string;
	effective?: string;
	effectiveLabel?: string;
	components: ObservationModel[];
	/** The category in words ("Laboratory", "Vital signs"), when supplied. */
	categoryLabel?: string;
}

export interface ReportModel extends BaseModel {
	kind: 'report';
	statusLabel?: string;
	effective?: string;
	effectiveLabel?: string;
	results: ObservationModel[];
	conclusion?: string;
}

export interface AlertModel extends BaseModel {
	kind: 'alert';
	status?: string;
	statusLabel?: string;
	categoryLabel?: string;
	periodLabel?: string;
	active: boolean;
}

export interface GenericModel extends BaseModel {
	kind: 'generic';
	status?: string;
	statusLabel?: string;
	date?: string;
	dateLabel?: string;
	description?: string;
}

export type EntryModel =
	| AllergyModel
	| MedicationModel
	| ProblemModel
	| ImmunizationModel
	| ProcedureModel
	| DeviceModel
	| ObservationModel
	| ReportModel
	| AlertModel
	| GenericModel;

/** t(key), or `fallback` when the key has no message (t returns the key). */
export function wordOr(
	t: Translate,
	key: string,
	fallback: string | undefined
): string | undefined {
	const word = t(key);
	return word === key ? fallback : word;
}

function statusWord(
	t: Translate,
	code: string | undefined,
	concept?: CodeableConcept
): string | undefined {
	if (!code) return displayOf(concept);
	return wordOr(t, `status.${code}`, displayOf(concept) ?? code);
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
	return allowed.includes(value as T) ? (value as T) : undefined;
}

function field(t: Translate, key: string, value: string | undefined): Field[] {
	return value ? [{ key, label: t(`fields.${key}`), value }] : [];
}

/** "data-absent-reason" extension on a primitive's shadow element (`_timingDateTime`). */
function absentReasonOf(resource: object, element: string): string | undefined {
	const shadow = (resource as Record<string, { extension?: Extension[] } | undefined>)[
		`_${element}`
	];
	return shadow?.extension?.find(
		(e) => e.url === 'http://hl7.org/fhir/StructureDefinition/data-absent-reason'
	)?.valueCode;
}

function base(
	entry: ResolvedEntry,
	resource: FhirResource,
	title: string | undefined,
	t: Translate,
	concept?: CodeableConcept
) {
	return {
		id: entry.fullUrl ?? entry.reference,
		resourceType: resource.resourceType,
		title: title ?? t('values.notStated'),
		codes: codesOf(concept),
		resource,
		enteredInError: false
	};
}

function allergyModel(
	entry: ResolvedEntry,
	r: AllergyIntolerance,
	ctx: FormatContext
): AllergyModel {
	const { t, locale } = ctx;
	const reaction = r.reaction?.[0];
	const reactionText = (r.reaction ?? [])
		.flatMap((x) => (x.manifestation ?? []).map((m) => displayOf(m)))
		.filter((s): s is string => !!s)
		.join(', ');
	const severity = pick(
		reaction?.severity ?? (r.reaction ?? []).find((x) => x.severity)?.severity,
		['mild', 'moderate', 'severe'] as const
	);
	const criticality = pick(r.criticality, ['low', 'high', 'unable-to-assess'] as const);
	const clinical = codeOf(r.clinicalStatus);
	const verification = codeOf(r.verificationStatus);
	const onset = r.onsetDateTime ?? r.onsetPeriod?.start ?? r.onsetString;
	const m: AllergyModel = {
		...base(entry, r, displayOf(r.code), t, r.code),
		kind: 'allergy',
		reaction: reactionText || undefined,
		severity,
		severityLabel: severity ? t(`severity.${severity}`) : undefined,
		criticality,
		criticalityLabel: criticality ? t(`criticality.${criticality}`) : undefined,
		clinicalStatus: pick(clinical, ['active', 'inactive', 'resolved'] as const),
		clinicalStatusLabel: statusWord(t, clinical, r.clinicalStatus),
		verificationStatus: pick(verification, [
			'unconfirmed',
			'presumed',
			'confirmed',
			'refuted',
			'entered-in-error'
		] as const),
		verificationStatusLabel: statusWord(t, verification, r.verificationStatus),
		typeLabel: r.type ? wordOr(t, `allergyType.${r.type}`, r.type) : undefined,
		categoryLabel: r.category?.length
			? r.category.map((c) => wordOr(t, `allergyCategory.${c}`, c)).join(', ')
			: undefined,
		onset: isoDatePart(onset),
		onsetLabel: r.onsetString ?? formatFhirDate(onset, locale),
		fields: []
	};
	m.enteredInError = verification === 'entered-in-error';
	m.fields = [
		...field(t, 'substance', m.title),
		...field(t, 'reaction', m.reaction),
		...field(t, 'severity', m.severityLabel),
		...field(t, 'criticality', m.criticalityLabel),
		...field(t, 'clinicalStatus', m.clinicalStatusLabel),
		...field(t, 'verificationStatus', m.verificationStatusLabel),
		...field(t, 'type', m.typeLabel),
		...field(t, 'category', m.categoryLabel),
		...field(t, 'onset', m.onsetLabel)
	];
	return m;
}

function medicationModel(
	entry: ResolvedEntry,
	r: MedicationStatement | MedicationRequest,
	doc: IpsDocument,
	ctx: FormatContext
): MedicationModel {
	const { t, locale } = ctx;
	const medication = r.medicationReference
		? doc.resolve(r.medicationReference.reference)
		: undefined;
	const med = medication?.resourceType === 'Medication' ? medication : undefined;
	const concept = r.medicationCodeableConcept ?? med?.code;
	const name =
		displayOf(concept) ?? r.medicationReference?.display ?? (med ? undefined : undefined);
	const dosage = summariseDosage(
		r.resourceType === 'MedicationStatement' ? r.dosage : r.dosageInstruction,
		locale,
		t
	);
	const ingredientStrength = med?.ingredient
		?.map((i) => formatRatio(i.strength, locale))
		.filter((s): s is string => !!s)
		.join(' + ');
	const rawStatus = r.status;
	const statusMap: Record<string, MedicationStatus> = {
		active: 'active',
		completed: 'completed',
		'entered-in-error': 'entered-in-error',
		intended: 'intended',
		stopped: 'stopped',
		'on-hold': 'on-hold',
		unknown: 'unknown',
		'not-taken': 'not-taken',
		draft: 'intended',
		cancelled: 'stopped'
	};
	const effective =
		r.resourceType === 'MedicationStatement'
			? (r.effectiveDateTime ?? r.effectivePeriod?.start)
			: r.authoredOn;
	const effectiveLabel =
		r.resourceType === 'MedicationStatement'
			? r.effectivePeriod
				? formatPeriod(r.effectivePeriod, locale, t)
				: formatFhirDate(r.effectiveDateTime, locale)
			: r.authoredOn
				? t('format.prescribedOn', { date: formatFhirDate(r.authoredOn, locale) ?? '' })
				: undefined;
	const effectiveAbsent =
		r.resourceType === 'MedicationStatement' && !effectiveLabel
			? absentReasonOf(r, r.effectivePeriod ? 'effectivePeriod' : 'effectiveDateTime')
			: undefined;
	const m: MedicationModel = {
		...base(entry, r, name, t, concept),
		kind: 'medication',
		strength: ingredientStrength || undefined,
		form: displayOf(med?.form),
		route: dosage.route,
		frequency: dosage.frequency,
		dosageText: dosage.text ?? dosage.dose,
		status: rawStatus ? statusMap[rawStatus] : undefined,
		statusLabel: statusWord(t, rawStatus),
		effective: isoDatePart(effective),
		effectiveLabel:
			effectiveLabel ??
			(effectiveAbsent ? wordOr(t, `absentReason.${effectiveAbsent}`, effectiveAbsent) : undefined),
		current: ['active', 'intended', 'on-hold', 'draft'].includes(rawStatus ?? ''),
		fields: []
	};
	m.enteredInError = rawStatus === 'entered-in-error';
	m.fields = [
		...field(t, 'medication', m.title),
		...field(t, 'strength', m.strength),
		...field(t, 'form', m.form),
		...field(
			t,
			'dosage',
			[m.dosageText, m.route, m.frequency].filter(Boolean).join(', ') || undefined
		),
		...field(t, 'status', m.statusLabel),
		...field(t, 'effective', m.effectiveLabel)
	];
	return m;
}

function problemModel(entry: ResolvedEntry, r: Condition, ctx: FormatContext): ProblemModel {
	const { t, locale } = ctx;
	const clinical = codeOf(r.clinicalStatus);
	const verification = codeOf(r.verificationStatus);
	const onset = r.onsetDateTime ?? r.onsetPeriod?.start;
	const abatement = r.abatementDateTime ?? r.abatementPeriod?.end ?? r.abatementPeriod?.start;
	const m: ProblemModel = {
		...base(entry, r, displayOf(r.code), t, r.code),
		kind: 'problem',
		clinicalStatus: pick(clinical, [
			'active',
			'recurrence',
			'relapse',
			'inactive',
			'remission',
			'resolved'
		] as const),
		clinicalStatusLabel: statusWord(t, clinical, r.clinicalStatus),
		verificationStatus: pick(verification, [
			'unconfirmed',
			'provisional',
			'differential',
			'confirmed',
			'refuted',
			'entered-in-error'
		] as const),
		verificationStatusLabel: statusWord(t, verification, r.verificationStatus),
		severityLabel: displayOf(r.severity),
		onset: isoDatePart(onset),
		onsetLabel:
			r.onsetString ??
			(onset ? t('format.onset', { date: formatFhirDate(onset, locale) ?? onset }) : undefined),
		abatement: isoDatePart(abatement),
		abatementLabel:
			r.abatementString ??
			(abatement
				? t('format.abatement', { date: formatFhirDate(abatement, locale) ?? abatement })
				: undefined),
		active: ['active', 'recurrence', 'relapse'].includes(clinical ?? 'active'),
		fields: []
	};
	m.enteredInError = verification === 'entered-in-error';
	m.fields = [
		...field(t, 'condition', m.title),
		...field(t, 'clinicalStatus', m.clinicalStatusLabel),
		...field(t, 'verificationStatus', m.verificationStatusLabel),
		...field(t, 'severity', m.severityLabel),
		...field(t, 'onset', formatFhirDate(onset, locale) ?? r.onsetString),
		...field(t, 'abatement', formatFhirDate(abatement, locale) ?? r.abatementString)
	];
	return m;
}

function immunizationModel(
	entry: ResolvedEntry,
	r: Immunization,
	doc: IpsDocument,
	ctx: FormatContext
): ImmunizationModel {
	const { t, locale } = ctx;
	const dose = r.protocolApplied?.[0];
	const doseNumber = dose?.doseNumberPositiveInt ?? dose?.doseNumberString;
	const series = dose?.seriesDosesPositiveInt ?? dose?.seriesDosesString;
	const doseNumberLabel =
		doseNumber !== undefined
			? series !== undefined
				? t('format.doseOf', { dose: String(doseNumber), series: String(series) })
				: t('format.dose', { dose: String(doseNumber) })
			: undefined;
	const performerRef = r.performer?.[0]?.actor;
	const performerResource = doc.resolve(performerRef?.reference);
	const performer =
		performerRef?.display ??
		(performerResource && 'name' in performerResource && typeof performerResource.name === 'string'
			? performerResource.name
			: undefined);
	const occurrence = r.occurrenceDateTime;
	const m: ImmunizationModel = {
		...base(entry, r, displayOf(r.vaccineCode), t, r.vaccineCode),
		kind: 'immunization',
		occurrence: isoDatePart(occurrence),
		occurrenceLabel: r.occurrenceString ?? formatFhirDate(occurrence, locale),
		doseNumberLabel,
		status: pick(r.status, ['completed', 'entered-in-error', 'not-done'] as const),
		statusLabel: statusWord(t, r.status),
		lotNumber: r.lotNumber,
		performer,
		fields: []
	};
	m.enteredInError = r.status === 'entered-in-error';
	m.fields = [
		...field(t, 'vaccine', m.title),
		...field(t, 'date', m.occurrenceLabel),
		...field(t, 'dose', m.doseNumberLabel),
		...field(t, 'status', m.statusLabel),
		...field(t, 'lotNumber', m.lotNumber),
		...field(t, 'performer', m.performer)
	];
	return m;
}

function procedureModel(entry: ResolvedEntry, r: Procedure, ctx: FormatContext): ProcedureModel {
	const { t, locale } = ctx;
	const performed = r.performedDateTime ?? r.performedPeriod?.start;
	const m: ProcedureModel = {
		...base(entry, r, displayOf(r.code), t, r.code),
		kind: 'procedure',
		status: pick(r.status, [
			'preparation',
			'in-progress',
			'not-done',
			'on-hold',
			'stopped',
			'completed',
			'entered-in-error',
			'unknown'
		] as const),
		statusLabel: statusWord(t, r.status),
		performed: isoDatePart(performed),
		performedLabel:
			r.performedString ??
			(r.performedPeriod
				? formatPeriod(r.performedPeriod, locale, t)
				: formatFhirDate(performed, locale)),
		fields: []
	};
	m.enteredInError = r.status === 'entered-in-error';
	m.fields = [
		...field(t, 'procedure', m.title),
		...field(t, 'status', m.statusLabel),
		...field(t, 'performed', m.performedLabel)
	];
	return m;
}

function deviceModel(
	entry: ResolvedEntry,
	r: DeviceUseStatement,
	doc: IpsDocument,
	ctx: FormatContext
): DeviceModel {
	const { t, locale } = ctx;
	const device = doc.resolve(r.device?.reference);
	const concept = device?.resourceType === 'Device' ? device.type : undefined;
	const deviceName =
		(device?.resourceType === 'Device'
			? (device.deviceName?.[0]?.name ?? displayOf(device.type))
			: undefined) ?? r.device?.display;
	const timing = r.timingDateTime ?? r.timingPeriod?.start;
	const timingAbsent = timing ? undefined : absentReasonOf(r, 'timingDateTime');
	const m: DeviceModel = {
		...base(entry, r, deviceName, t, concept),
		kind: 'device',
		status: pick(r.status, [
			'active',
			'completed',
			'entered-in-error',
			'intended',
			'stopped',
			'on-hold'
		] as const),
		statusLabel: statusWord(t, r.status),
		timing: isoDatePart(timing),
		timingLabel: r.timingPeriod
			? formatPeriod(r.timingPeriod, locale, t)
			: (formatFhirDate(timing, locale) ??
				(timingAbsent
					? t('format.usedSince', {
							date: wordOr(t, `absentReason.${timingAbsent}`, timingAbsent) ?? ''
						})
					: undefined)),
		fields: []
	};
	m.enteredInError = r.status === 'entered-in-error';
	m.fields = [
		...field(t, 'device', m.title),
		...field(t, 'status', m.statusLabel),
		...field(t, 'timing', m.timingLabel)
	];
	return m;
}

const MISSING_FROM_ABSENT: Record<string, ObservationViewStatus> = {
	masked: 'masked',
	'asked-unknown': 'not-recorded',
	'not-asked': 'not-recorded',
	'not-performed': 'not-recorded',
	unknown: 'unavailable',
	'temp-unknown': 'unavailable',
	error: 'unavailable'
};

interface ValueParts {
	value: string;
	unit?: string;
	absent?: string;
}

function observationValue(o: Observation | ObservationComponent, ctx: FormatContext): ValueParts {
	const { locale, t } = ctx;
	if (o.valueQuantity) {
		const number = formatQuantityNumber(o.valueQuantity, locale);
		if (number) return { value: number, unit: o.valueQuantity.unit ?? o.valueQuantity.code };
		return { value: formatQuantityValue(o.valueQuantity, locale) ?? '' };
	}
	if (o.valueCodeableConcept) return { value: displayOf(o.valueCodeableConcept) ?? '' };
	if (typeof o.valueString === 'string') return { value: o.valueString };
	if (typeof o.valueBoolean === 'boolean')
		return { value: t(o.valueBoolean ? 'values.yes' : 'values.no') };
	if (typeof o.valueInteger === 'number')
		return { value: new Intl.NumberFormat(locale).format(o.valueInteger) };
	if (o.valueRange) return { value: formatRange(o.valueRange, locale, t) ?? '' };
	if (o.valueRatio) return { value: formatRatio(o.valueRatio, locale) ?? '' };
	if (o.valuePeriod) return { value: formatPeriod(o.valuePeriod, locale, t) ?? '' };
	if (o.valueDateTime) return { value: formatFhirDate(o.valueDateTime, locale) ?? o.valueDateTime };
	if (o.valueTime) return { value: o.valueTime };
	const absent = codeOf(o.dataAbsentReason);
	return { value: '', absent: absent ?? (o.dataAbsentReason ? 'unknown' : undefined) };
}

function interpretationOf(
	o: Observation | ObservationComponent,
	t: Translate
): { code?: string; label?: string } {
	const concept = o.interpretation?.[0];
	if (!concept) return {};
	const code =
		codeOf(concept, 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation') ??
		codeOf(concept);
	return {
		code,
		label: code ? wordOr(t, `interpretation.${code}`, displayOf(concept)) : displayOf(concept)
	};
}

/**
 * The meter for a number against its reference range: the scale runs half a
 * range beyond each end of a two-sided range (or from 0 to half as far again
 * past a one-sided one), and always holds the value.
 */
export function meterOf(o: Observation | ObservationComponent): ObservationMeter | undefined {
	const value = o.valueQuantity?.value;
	const range = o.referenceRange?.[0];
	if (typeof value !== 'number' || !Number.isFinite(value) || !range) return undefined;
	const number = (q: { value?: number; unit?: string; code?: string } | undefined) =>
		typeof q?.value === 'number' && Number.isFinite(q.value) ? q.value : undefined;
	const sameUnit = (q: { unit?: string; code?: string } | undefined) =>
		!q ||
		(q.unit ?? q.code ?? o.valueQuantity?.unit ?? o.valueQuantity?.code) ===
			(o.valueQuantity?.unit ?? o.valueQuantity?.code);
	if (!sameUnit(range.low) || !sameUnit(range.high)) return undefined;
	const low = number(range.low);
	const high = number(range.high);
	if (low === undefined && high === undefined) return undefined;
	if (low !== undefined && high !== undefined && low >= high) return undefined;
	let min: number;
	let max: number;
	if (low !== undefined && high !== undefined) {
		const pad = (high - low) / 2;
		min = low - pad;
		max = high + pad;
	} else if (high !== undefined) {
		min = Math.min(0, high);
		max = Math.max(high * 1.5, high + 1);
	} else {
		min = Math.min(0, low!);
		max = Math.max(low! * 2, low! + 1);
	}
	return { value, min: Math.min(min, value), max: Math.max(max, value), low, high };
}

function referenceRangeOf(
	o: Observation | ObservationComponent,
	ctx: FormatContext
): string | undefined {
	const range = o.referenceRange?.[0];
	if (!range) return undefined;
	if (range.text) return range.text;
	const low = formatQuantityValue(range.low, ctx.locale);
	const high = formatQuantityValue(range.high, ctx.locale);
	if (low && high) return ctx.t('format.rangeBetween', { low, high });
	if (low) return ctx.t('format.rangeAtLeast', { low });
	if (high) return ctx.t('format.rangeAtMost', { high });
	return undefined;
}

function observationStatus(
	status: string | undefined,
	absent: string | undefined,
	t: Translate
): { status: ObservationViewStatus; statusLabel?: string } {
	if (absent) {
		const mapped = MISSING_FROM_ABSENT[absent] ?? 'unavailable';
		return {
			status: mapped,
			statusLabel: wordOr(t, `absentReason.${absent}`, t(`state.${mapped}`))
		};
	}
	const allowed = [
		'final',
		'preliminary',
		'amended',
		'corrected',
		'entered-in-error',
		'cancelled'
	] as const;
	const picked = pick(status, allowed);
	if (picked === 'final' || !status) return { status: 'final' };
	// "registered" and "unknown" have no ObservationView state; they are shown
	// beside the value in words, as a provisional result.
	return { status: picked ?? 'preliminary', statusLabel: statusWord(t, status) };
}

function observationModel(
	entry: ResolvedEntry,
	o: Observation,
	doc: IpsDocument,
	ctx: FormatContext
): ObservationModel {
	const { t, locale } = ctx;
	const parts = observationValue(o, ctx);
	const interpretation = interpretationOf(o, t);
	const { status, statusLabel } = observationStatus(
		o.status,
		parts.value ? undefined : parts.absent,
		t
	);
	const effective =
		o.effectiveDateTime ?? o.effectivePeriod?.start ?? o.effectiveInstant ?? o.issued;
	const components: ObservationModel[] = (o.component ?? []).map((c, i) => {
		const cp = observationValue(c, ctx);
		const ci = interpretationOf(c, t);
		const cs = observationStatus(undefined, cp.value ? undefined : cp.absent, t);
		return {
			id: `${entry.fullUrl ?? entry.reference}#component-${i}`,
			resourceType: 'Observation',
			kind: 'observation',
			title: displayOf(c.code) ?? t('values.notStated'),
			codes: codesOf(c.code),
			resource: o,
			enteredInError: false,
			value: cp.value,
			unit: cp.unit,
			interpretation: ci.code,
			flagLabel: ci.code && ci.code !== 'N' ? ci.label : undefined,
			range: referenceRangeOf(c, ctx),
			meter: meterOf(c),
			status: cs.status,
			statusLabel: cs.statusLabel,
			components: [],
			fields: []
		} satisfies ObservationModel;
	});
	// Members (Observation.hasMember) are listed as components of a panel.
	for (const member of o.hasMember ?? []) {
		const hit = doc.resolve(member.reference);
		if (hit?.resourceType === 'Observation')
			components.push(
				observationModel({ reference: member.reference ?? '', resource: hit }, hit, doc, ctx)
			);
	}
	const value = parts.value;
	const m: ObservationModel = {
		...base(entry, o, displayOf(o.code), t, o.code),
		kind: 'observation',
		value,
		unit: parts.unit,
		interpretation: interpretation.code,
		flagLabel:
			interpretation.code && interpretation.code !== 'N' ? interpretation.label : undefined,
		range: referenceRangeOf(o, ctx),
		meter: meterOf(o),
		status: !value && components.length > 0 && status !== 'masked' ? 'final' : status,
		statusLabel: !value && components.length > 0 && status !== 'masked' ? undefined : statusLabel,
		effective: isoDatePart(effective),
		effectiveLabel: o.effectivePeriod
			? formatPeriod(o.effectivePeriod, locale, t)
			: formatFhirDate(effective, locale),
		categoryLabel: displayOfAny(o.category),
		components,
		fields: []
	};
	m.enteredInError = o.status === 'entered-in-error';
	const valueText = observationText(m);
	m.fields = [
		...field(t, 'observation', m.title),
		...field(t, 'result', valueText),
		...field(t, 'referenceRange', m.range),
		...field(t, 'date', m.effectiveLabel)
	];
	return m;
}

/** An observation's value, unit, flag and status as one line of text. */
export function observationText(m: ObservationModel): string {
	if (['cancelled', 'masked', 'not-recorded', 'unavailable'].includes(m.status) && !m.value)
		return m.statusLabel ?? '';
	const main = [
		m.value && m.unit ? `${m.value}\u00a0${m.unit}` : m.value,
		m.flagLabel,
		m.status !== 'final' ? m.statusLabel : undefined
	]
		.filter(Boolean)
		.join(' ');
	const parts = m.components.map((c) => `${c.title}: ${observationText(c)}`);
	return [main, ...parts].filter(Boolean).join('; ');
}

function reportModel(
	entry: ResolvedEntry,
	r: DiagnosticReport,
	doc: IpsDocument,
	ctx: FormatContext
): ReportModel {
	const { t, locale } = ctx;
	const effective = r.effectiveDateTime ?? r.effectivePeriod?.start ?? r.issued;
	const results: ObservationModel[] = [];
	for (const ref of r.result ?? []) {
		const hit = doc.resolve(ref.reference);
		if (hit?.resourceType === 'Observation')
			results.push(
				observationModel({ reference: ref.reference ?? '', resource: hit }, hit, doc, ctx)
			);
	}
	const m: ReportModel = {
		...base(entry, r, displayOf(r.code), t, r.code),
		kind: 'report',
		statusLabel: r.status && r.status !== 'final' ? statusWord(t, r.status) : undefined,
		effective: isoDatePart(effective),
		effectiveLabel: formatFhirDate(effective, locale),
		results,
		conclusion: r.conclusion ?? displayOfAny(r.conclusionCode),
		fields: []
	};
	m.enteredInError = r.status === 'entered-in-error';
	m.fields = [
		...field(t, 'report', m.title),
		...field(t, 'status', m.statusLabel),
		...field(t, 'date', m.effectiveLabel),
		...field(t, 'conclusion', m.conclusion)
	];
	return m;
}

function alertModel(entry: ResolvedEntry, r: Flag, ctx: FormatContext): AlertModel {
	const { t, locale } = ctx;
	const m: AlertModel = {
		...base(entry, r, displayOf(r.code), t, r.code),
		kind: 'alert',
		status: r.status,
		statusLabel: statusWord(t, r.status),
		categoryLabel: displayOfAny(r.category),
		periodLabel: formatPeriod(r.period, locale, t),
		active: r.status === 'active',
		fields: []
	};
	m.enteredInError = r.status === 'entered-in-error';
	m.fields = [
		...field(t, 'alert', m.title),
		...field(t, 'category', m.categoryLabel),
		...field(t, 'status', m.statusLabel),
		...field(t, 'period', m.periodLabel)
	];
	return m;
}

function genericModel(
	entry: ResolvedEntry,
	r: FhirResource,
	doc: IpsDocument,
	ctx: FormatContext
): GenericModel {
	const { t, locale } = ctx;
	let title: string | undefined;
	let concept: CodeableConcept | undefined;
	let status: string | undefined;
	let date: string | undefined;
	let dateLabel: string | undefined;
	let description: string | undefined;
	const extra: Field[] = [];
	switch (r.resourceType) {
		case 'Consent': {
			const c = r as Consent;
			concept = c.category?.[0];
			title = displayOfAny(c.category) ?? displayOf(c.scope);
			status = c.status;
			date = c.dateTime;
			const provision = c.provision?.code
				?.map((x) => displayOf(x))
				.filter(Boolean)
				.join(', ');
			const type = c.provision?.type
				? wordOr(t, `consentProvision.${c.provision.type}`, c.provision.type)
				: undefined;
			description = [type, provision].filter(Boolean).join(': ') || undefined;
			const source = c.sourceReference ? doc.resolve(c.sourceReference.reference) : undefined;
			if (source?.resourceType === 'DocumentReference') {
				const docRef = source as DocumentReference;
				extra.push(
					...field(
						t,
						'sourceDocument',
						docRef.content?.[0]?.attachment?.title ?? displayOf(docRef.type)
					)
				);
			}
			break;
		}
		case 'CarePlan': {
			const c = r as CarePlan;
			concept = c.category?.[0];
			title = c.title ?? c.description ?? displayOfAny(c.category);
			if (c.title && c.description) description = c.description;
			status = c.status;
			dateLabel = formatPeriod(c.period, locale, t);
			date = c.period?.start ?? c.period?.end ?? c.created;
			const activities = (c.activity ?? [])
				.map((a) => displayOf(a.detail?.code) ?? a.detail?.description)
				.filter((s): s is string => !!s);
			if (activities.length) extra.push(...field(t, 'activities', activities.join(', ')));
			break;
		}
		case 'ClinicalImpression': {
			const c = r as ClinicalImpression;
			concept = c.code;
			title = displayOf(c.code) ?? c.description ?? c.summary;
			description = c.summary;
			status = c.status;
			date = c.effectiveDateTime ?? c.date;
			const findings = (c.finding ?? [])
				.map((f) => displayOf(f.itemCodeableConcept) ?? f.itemReference?.display)
				.filter((s): s is string => !!s);
			if (findings.length) extra.push(...field(t, 'findings', findings.join(', ')));
			break;
		}
		case 'DocumentReference': {
			const d = r as DocumentReference;
			concept = d.type;
			title = d.description ?? d.content?.[0]?.attachment?.title ?? displayOf(d.type);
			status = d.status;
			date = d.date;
			break;
		}
		case 'ImmunizationRecommendation': {
			const ir = r as ImmunizationRecommendation;
			const rec = ir.recommendation?.[0];
			concept = rec?.vaccineCode?.[0] ?? rec?.targetDisease;
			title = displayOfAny(rec?.vaccineCode) ?? displayOf(rec?.targetDisease);
			status = codeOf(rec?.forecastStatus);
			description = displayOf(rec?.forecastStatus);
			date = rec?.dateCriterion?.[0]?.value ?? ir.date;
			break;
		}
		default: {
			const any = r as unknown as Record<string, unknown>;
			concept =
				(any.code as CodeableConcept | undefined) ?? (any.type as CodeableConcept | undefined);
			title =
				displayOf(concept) ??
				(typeof any.title === 'string' ? any.title : undefined) ??
				(typeof any.description === 'string' ? any.description : undefined) ??
				(typeof any.name === 'string' ? any.name : undefined);
			status = typeof any.status === 'string' ? any.status : undefined;
			date = (['date', 'effectiveDateTime', 'recordedDate', 'issued'] as const)
				.map((k) => any[k])
				.find((v): v is string => typeof v === 'string');
		}
	}
	const m: GenericModel = {
		...base(entry, r, title ?? t('values.resourceOfType', { type: r.resourceType }), t, concept),
		kind: 'generic',
		status,
		statusLabel: statusWord(t, status),
		date: isoDatePart(date),
		dateLabel: dateLabel ?? formatFhirDate(date, locale),
		description,
		fields: []
	};
	m.enteredInError = status === 'entered-in-error';
	m.fields = [
		...field(t, 'item', m.title),
		...field(t, 'description', m.description),
		...field(t, 'status', m.statusLabel),
		...field(t, 'date', m.dateLabel),
		...extra
	];
	return m;
}

/** The view model of one resolved entry. */
export function modelOf(entry: ResolvedEntry, doc: IpsDocument, ctx: FormatContext): EntryModel {
	const r = entry.resource as FhirResource;
	switch (r.resourceType) {
		case 'AllergyIntolerance':
			return allergyModel(entry, r, ctx);
		case 'MedicationStatement':
		case 'MedicationRequest':
			return medicationModel(entry, r, doc, ctx);
		case 'Condition':
			return problemModel(entry, r, ctx);
		case 'Immunization':
			return immunizationModel(entry, r, doc, ctx);
		case 'Procedure':
			return procedureModel(entry, r, ctx);
		case 'DeviceUseStatement':
			return deviceModel(entry, r, doc, ctx);
		case 'Observation':
			return observationModel(entry, r, doc, ctx);
		case 'DiagnosticReport':
			return reportModel(entry, r, doc, ctx);
		case 'Flag':
			return alertModel(entry, r, ctx);
		default:
			return genericModel(entry, r, doc, ctx);
	}
}

/** Models of every clinical entry in a section, in document order. */
export function sectionModels(
	section: IpsSection,
	doc: IpsDocument,
	ctx: FormatContext
): EntryModel[] {
	// An Observation that a DiagnosticReport in the same section groups is shown
	// under that report, not twice.
	const grouped = new Set<FhirResource>();
	for (const e of section.entries)
		if (e.resource?.resourceType === 'DiagnosticReport')
			for (const ref of e.resource.result ?? []) {
				const hit = doc.resolve(ref.reference);
				if (hit) grouped.add(hit);
			}
	return section.entries
		.filter((e) => e.resource && !grouped.has(e.resource))
		.map((e) => modelOf(e, doc, ctx));
}

/** Words for a section's state, used by every renderer and export alike. */
export function stateLabel(section: IpsSection, t: Translate): string {
	if (section.state === 'omitted') return t('state.omitted');
	if (section.narrativeOnly) return t('state.narrativeOnly');
	if (section.state === 'known') return t('state.known');
	if (section.absentEntries.length > 0) {
		// "No known allergies" as the document coded it, in the document's words.
		const words = section.absentEntries
			.map((e) => (e.resource ? displayOf(primaryConceptOf(e.resource)) : undefined))
			.filter((s): s is string => !!s);
		if (words.length) return `${t(`state.${section.state}`)}: ${[...new Set(words)].join(', ')}`;
	}
	const reason = section.emptyReason;
	if (reason) {
		const code = reason.coding?.find((c) => c.code)?.code;
		const base = code
			? wordOr(t, `emptyReason.${code}`, t(`state.${section.state}`))
			: t(`state.${section.state}`);
		const text = reason.text?.trim() || displayOf(reason);
		return text && text !== base
			? t('state.withReason', { state: base ?? '', reason: text })
			: (base ?? '');
	}
	if (section.unresolved.length > 0) return t('state.unresolved');
	return t(`state.${section.state}`);
}

function primaryConceptOf(r: FhirResource): CodeableConcept | undefined {
	switch (r.resourceType) {
		case 'AllergyIntolerance':
		case 'Condition':
		case 'Procedure':
			return r.code;
		case 'MedicationStatement':
		case 'MedicationRequest':
			return r.medicationCodeableConcept;
		case 'Immunization':
			return r.vaccineCode;
		default:
			return undefined;
	}
}
