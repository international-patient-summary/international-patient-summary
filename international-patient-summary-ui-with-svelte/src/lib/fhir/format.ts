// Formatting FHIR datatypes for people (spec §6.3 F-VIEW-7, P2-T7).
//
// These decide how a value is written, never what it is: no unit conversion,
// no rounding, no terminology lookups. Quantities go through Lily's
// formatQuantity (no trailing zero, a leading zero, a no-break space before
// the unit, the comparator kept). Dates write the month as text so a date
// cannot be read two ways.
import {
	ageParts,
	formatQuantity,
	type QuantityComparator
} from '@lilydesignsystem/svelte-headless';
import type {
	CodeableConcept,
	Coding,
	Dosage,
	HumanName,
	Identifier,
	Period,
	Quantity,
	Range,
	Ratio
} from 'fhir/r4';
import type { Translate } from './types.ts';

const SYSTEM_LABELS: Record<string, string> = {
	'http://snomed.info/sct': 'SNOMED CT',
	'http://loinc.org': 'LOINC',
	'http://www.whocc.no/atc': 'ATC',
	'http://hl7.org/fhir/sid/icd-10': 'ICD-10',
	'http://hl7.org/fhir/sid/icd-10-cm': 'ICD-10-CM',
	'http://id.who.int/icd/release/11/mms': 'ICD-11',
	'http://hl7.org/fhir/sid/cvx': 'CVX',
	'http://www.nlm.nih.gov/research/umls/rxnorm': 'RxNorm',
	'http://unitsofmeasure.org': 'UCUM',
	'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips': 'IPS absent/unknown',
	'http://terminology.hl7.org/CodeSystem/list-empty-reason': 'List empty reason',
	'http://terminology.hl7.org/CodeSystem/data-absent-reason': 'Data absent reason',
	'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation':
		'v3 ObservationInterpretation',
	'http://terminology.hl7.org/CodeSystem/v3-ActCode': 'v3 ActCode',
	'http://terminology.hl7.org/CodeSystem/v3-Confidentiality': 'v3 Confidentiality',
	'http://standardterms.edqm.eu': 'EDQM',
	'urn:oid:1.2.36.1.2001.1005.17': 'AMT',
	'http://hl7.org/fhir/sid/ndc': 'NDC',
	'http://hl7.org/fhir/sid/us-ssn': 'US SSN',
	'https://fhir.nhs.uk/Id/nhs-number': 'NHS number'
};

/** A short name for a code system URI; the URI itself when it has none. */
export function systemLabel(system: string | undefined): string {
	if (!system) return '';
	return SYSTEM_LABELS[system] ?? system;
}

/**
 * The words for a coded value: Coding.display, then CodeableConcept.text,
 * then system|code. Never empty when the concept carries anything at all.
 */
export function displayOf(concept: CodeableConcept | undefined): string | undefined {
	if (!concept) return undefined;
	const coded = concept.coding?.find((c) => c.display?.trim());
	if (coded?.display) return coded.display.trim();
	if (concept.text?.trim()) return concept.text.trim();
	const any = concept.coding?.find((c) => c.code);
	if (any?.code) return any.system ? `${systemLabel(any.system)}|${any.code}` : any.code;
	return undefined;
}

/** The display of the first of several concepts that has one. */
export function displayOfAny(
	concepts: (CodeableConcept | undefined)[] | undefined
): string | undefined {
	for (const c of concepts ?? []) {
		const d = displayOf(c);
		if (d) return d;
	}
	return undefined;
}

/** First code of a concept, optionally limited to one system. */
export function codeOf(concept: CodeableConcept | undefined, system?: string): string | undefined {
	return concept?.coding?.find((c) => c.code && (!system || c.system === system))?.code;
}

export interface CodeLabel {
	system: string;
	code: string;
}

/** Every system and code in a concept, for the "Show codes" view. */
export function codesOf(concept: CodeableConcept | undefined): CodeLabel[] {
	return (concept?.coding ?? [])
		.filter((c: Coding) => c.code)
		.map((c) => ({ system: systemLabel(c.system), code: c.code as string }));
}

/** "SNOMED CT 373270004 · ATC J01CA04" */
export function codesText(codes: CodeLabel[]): string {
	return codes.map((c) => (c.system ? `${c.system} ${c.code}` : c.code)).join(' · ');
}

const DATE_ONLY = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** The 24-hour clock everywhere but where 12-hour is the norm; chosen on purpose. */
function hourCycleFor(locale: string): 'h12' | 'h23' {
	return /^en-(US|CA|AU|NZ|PH|IN)$/i.test(locale) ? 'h12' : 'h23';
}

/**
 * A FHIR date or dateTime in the UI locale: "2017", "Jan 2017",
 * "12 Jan 2017", or with a time. Partial dates stay partial; nothing is
 * invented. An unparseable value is returned as supplied.
 */
export function formatFhirDate(value: string | undefined, locale: string): string | undefined {
	if (!value) return undefined;
	const dateOnly = DATE_ONLY.exec(value);
	try {
		if (dateOnly) {
			const [, y, m, d] = dateOnly;
			const date = new Date(Date.UTC(Number(y), m ? Number(m) - 1 : 0, d ? Number(d) : 1));
			const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC', year: 'numeric' };
			if (m) options.month = 'short';
			if (d) options.day = 'numeric';
			return new Intl.DateTimeFormat(locale, options).format(date);
		}
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat(locale, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: hourCycleFor(locale)
		}).format(date);
	} catch {
		return value;
	}
}

/** The date part of a FHIR date/dateTime as YYYY[-MM[-DD]], for <time datetime>. */
export function isoDatePart(value: string | undefined): string | undefined {
	if (!value) return undefined;
	return /^\d{4}(-\d{2}(-\d{2})?)?/.exec(value)?.[0];
}

export function formatPeriod(
	period: Period | undefined,
	locale: string,
	t: Translate
): string | undefined {
	if (!period) return undefined;
	const start = formatFhirDate(period.start, locale);
	const end = formatFhirDate(period.end, locale);
	if (start && end) return t('format.periodRange', { start, end });
	if (start) return t('format.periodFrom', { start });
	if (end) return t('format.periodUntil', { end });
	return undefined;
}

const COMPARATORS = new Set(['<', '<=', '>=', '>']);

/** "5 mg", "<5 mmol/L"; falls back to the raw value when it is not a number. */
export function formatQuantityValue(
	quantity: Quantity | undefined,
	locale: string
): string | undefined {
	if (!quantity) return undefined;
	const unit = quantity.unit ?? quantity.code ?? '';
	if (typeof quantity.value !== 'number' || !Number.isFinite(quantity.value))
		return unit || undefined;
	const comparator = COMPARATORS.has(quantity.comparator ?? '')
		? (quantity.comparator as QuantityComparator)
		: undefined;
	return formatQuantity(quantity.value, unit, locale, comparator);
}

/** The number part only, for ObservationView's value prop (the unit goes separately). */
export function formatQuantityNumber(
	quantity: Quantity | undefined,
	locale: string
): string | undefined {
	if (!quantity || typeof quantity.value !== 'number' || !Number.isFinite(quantity.value))
		return undefined;
	const comparator = COMPARATORS.has(quantity.comparator ?? '')
		? (quantity.comparator as QuantityComparator)
		: undefined;
	return formatQuantity(quantity.value, '', locale, comparator);
}

export function formatRange(
	range: Range | undefined,
	locale: string,
	t: Translate
): string | undefined {
	if (!range) return undefined;
	const low = formatQuantityValue(range.low, locale);
	const high = formatQuantityValue(range.high, locale);
	if (low && high) return t('format.rangeBetween', { low, high });
	if (low) return t('format.rangeAtLeast', { low });
	if (high) return t('format.rangeAtMost', { high });
	return undefined;
}

export function formatRatio(ratio: Ratio | undefined, locale: string): string | undefined {
	if (!ratio) return undefined;
	const n = formatQuantityValue(ratio.numerator, locale);
	const d = formatQuantityValue(ratio.denominator, locale);
	if (n && d) return `${n} / ${d}`;
	return n ?? d;
}

/** The name to show: official first, then usual, then any; text, else parts. */
export function formatHumanName(names: HumanName[] | undefined): string | undefined {
	if (!names?.length) return undefined;
	const pick =
		names.find((n) => n.use === 'official') ??
		names.find((n) => n.use === 'usual') ??
		names.find((n) => n.use !== 'old' && n.use !== 'maiden') ??
		names[0];
	if (pick.text?.trim()) return pick.text.trim();
	const parts = [
		...(pick.prefix ?? []),
		...(pick.given ?? []),
		pick.family,
		...(pick.suffix ?? [])
	].filter((p): p is string => typeof p === 'string' && p.trim() !== '');
	return parts.length ? parts.join(' ') : undefined;
}

export interface IdentifierLabel {
	system: string;
	value: string;
	type?: string;
}

export function formatIdentifier(identifier: Identifier): IdentifierLabel | undefined {
	if (!identifier.value) return undefined;
	return {
		system: systemLabel(identifier.system),
		value: identifier.value,
		type: displayOf(identifier.type)
	};
}

/**
 * The age at `at` of someone born on `birthDate`, in the NHS Common User
 * Interface bands (Lily ageParts), in words. Undefined for a partial or
 * missing birth date: an age is never guessed.
 */
export function formatAge(
	birthDate: string | undefined,
	t: Translate,
	at: Date = new Date()
): string | undefined {
	if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return undefined;
	try {
		const parts = ageParts(`${birthDate}T00:00:00Z`, at);
		if (!parts.length) return undefined;
		return parts.map((p) => t(`format.age.${p.unit}`, { count: p.value })).join(' ');
	} catch {
		return undefined;
	}
}

export interface DosageSummary {
	text?: string;
	route?: string;
	frequency?: string;
	/** The dose per administration ("1 tablet", "500 mg"): not the product's strength. */
	dose?: string;
}

/** Dosage.text when supplied; otherwise the structured parts in words. */
export function summariseDosage(
	dosage: Dosage[] | undefined,
	locale: string,
	t: Translate
): DosageSummary {
	const first = dosage?.[0];
	if (!first) return {};
	const route = displayOf(first.route);
	const dose = first.doseAndRate?.[0];
	const doseText = dose?.doseQuantity
		? formatQuantityValue(dose.doseQuantity, locale)
		: dose?.doseRange
			? formatRange(dose.doseRange, locale, t)
			: undefined;
	let frequency: string | undefined;
	const repeat = first.timing?.repeat;
	if (first.timing?.code) frequency = displayOf(first.timing.code);
	else if (repeat?.frequency && repeat.period && repeat.periodUnit)
		frequency = t('format.frequency', {
			frequency: repeat.frequency,
			periodLabel: t(`format.timeUnit.${repeat.periodUnit}`, { count: repeat.period })
		});
	if (first.asNeededBoolean)
		frequency = [frequency, t('format.asNeeded')].filter(Boolean).join(', ');
	const texts = (dosage ?? []).map((d) => d.text?.trim()).filter((s): s is string => !!s);
	return { text: texts.length ? texts.join('; ') : undefined, route, frequency, dose: doseText };
}
