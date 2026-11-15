// Patient identity and document metadata, in words (spec F-VIEW-1, F-VIEW-2).
import type { FhirResource, Reference } from 'fhir/r4';
import {
	displayOf,
	formatAge,
	formatFhirDate,
	formatHumanName,
	formatIdentifier,
	type IdentifierLabel
} from './format.ts';
import { wordOr } from './models.ts';
import type { FormatContext, IpsDocument } from './types.ts';

export interface PatientSummary {
	name?: string;
	birthDate?: string;
	birthDateLabel?: string;
	ageLabel?: string;
	genderLabel?: string;
	identifiers: IdentifierLabel[];
	deceased: boolean;
	deceasedLabel?: string;
	contacts: string[];
	address?: string;
}

export function patientSummary(
	doc: IpsDocument,
	ctx: FormatContext,
	at: Date = new Date()
): PatientSummary {
	const { t, locale } = ctx;
	const p = doc.patient;
	if (!p) return { identifiers: [], deceased: false, contacts: [] };
	const deceased = p.deceasedBoolean === true || typeof p.deceasedDateTime === 'string';
	const contacts = [
		...(p.telecom ?? []).map((c) => c.value).filter((v): v is string => !!v),
		...(p.contact ?? [])
			.map((c) => {
				const name = formatHumanName(c.name ? [c.name] : undefined);
				const relation = c.relationship
					?.map((r) => displayOf(r))
					.filter(Boolean)
					.join(', ');
				const phone = c.telecom
					?.map((x) => x.value)
					.filter(Boolean)
					.join(', ');
				return [name, relation ? `(${relation})` : undefined, phone].filter(Boolean).join(' ');
			})
			.filter(Boolean)
	];
	const address = p.address?.[0];
	return {
		name: formatHumanName(p.name),
		birthDate: p.birthDate,
		birthDateLabel: formatFhirDate(p.birthDate, locale),
		ageLabel: deceased ? undefined : formatAge(p.birthDate, t, at),
		genderLabel: p.gender ? wordOr(t, `gender.${p.gender}`, p.gender) : undefined,
		identifiers: (p.identifier ?? [])
			.map((i) => formatIdentifier(i))
			.filter((i): i is IdentifierLabel => !!i),
		deceased,
		deceasedLabel: deceased
			? p.deceasedDateTime
				? t('patient.deceasedOn', {
						date: formatFhirDate(p.deceasedDateTime, locale) ?? p.deceasedDateTime
					})
				: t('patient.deceased')
			: undefined,
		contacts,
		address: address
			? (address.text ??
				([...(address.line ?? []), address.city, address.postalCode, address.country]
					.filter(Boolean)
					.join(', ') ||
					undefined))
			: undefined
	};
}

function nameOfResource(resource: FhirResource | undefined, doc: IpsDocument): string | undefined {
	if (!resource) return undefined;
	switch (resource.resourceType) {
		case 'Practitioner':
		case 'Patient':
		case 'RelatedPerson':
			return formatHumanName(resource.name);
		case 'Organization':
			return resource.name;
		case 'Device':
			return resource.deviceName?.[0]?.name ?? displayOf(resource.type);
		case 'PractitionerRole': {
			const who = nameOfResource(doc.resolve(resource.practitioner?.reference), doc);
			const org = nameOfResource(doc.resolve(resource.organization?.reference), doc);
			const role = resource.code
				?.map((c) => displayOf(c))
				.filter(Boolean)
				.join(', ');
			return (
				[who, role ? `(${role})` : undefined, org ? `— ${org}` : undefined]
					.filter(Boolean)
					.join(' ') || undefined
			);
		}
		default:
			return undefined;
	}
}

export function referenceName(ref: Reference | undefined, doc: IpsDocument): string | undefined {
	if (!ref) return undefined;
	return nameOfResource(doc.resolve(ref.reference), doc) ?? ref.display ?? ref.reference;
}

export interface DocumentSummary {
	title?: string;
	date?: string;
	dateLabel?: string;
	authors: string[];
	custodian?: string;
	attesters: string[];
	confidentialityLabel?: string;
	language?: string;
	languageLabel?: string;
	versionLabel: string;
	statusLabel?: string;
	identifier?: string;
}

const CONFIDENTIALITY = new Set(['U', 'L', 'M', 'N', 'R', 'V']);

export function documentSummary(doc: IpsDocument, ctx: FormatContext): DocumentSummary {
	const { t, locale } = ctx;
	const c = doc.composition;
	let languageLabel: string | undefined;
	if (doc.language) {
		try {
			languageLabel = new Intl.DisplayNames([locale], { type: 'language' }).of(doc.language);
		} catch {
			languageLabel = doc.language;
		}
	}
	const identifier = c.identifier?.value ?? doc.bundle.identifier?.value;
	return {
		title: c.title,
		date: c.date,
		dateLabel: formatFhirDate(c.date, locale),
		authors: (c.author ?? []).map((a) => referenceName(a, doc)).filter((s): s is string => !!s),
		custodian: referenceName(c.custodian, doc),
		attesters: (c.attester ?? [])
			.map((a) => {
				const who = referenceName(a.party, doc);
				const mode = a.mode ? wordOr(t, `attestationMode.${a.mode}`, a.mode) : undefined;
				const when = formatFhirDate(a.time, locale);
				return [who, mode ? `(${mode})` : undefined, when].filter(Boolean).join(' ');
			})
			.filter(Boolean),
		confidentialityLabel: c.confidentiality
			? CONFIDENTIALITY.has(c.confidentiality)
				? t(`confidentiality.${c.confidentiality}`)
				: c.confidentiality
			: undefined,
		language: doc.language,
		languageLabel: languageLabel && doc.language ? `${languageLabel} (${doc.language})` : undefined,
		versionLabel: doc.version
			? t('document.versionStated', { version: doc.version })
			: doc.declaresIps
				? t('document.versionNotStated')
				: t('document.versionNoProfile'),
		statusLabel: c.status ? wordOr(t, `status.${c.status}`, c.status) : undefined,
		identifier
	};
}
