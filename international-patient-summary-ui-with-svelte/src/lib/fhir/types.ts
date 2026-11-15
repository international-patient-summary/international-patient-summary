// Types for the IPS viewer's FHIR layer. FHIR R4 resource types come from
// @types/fhir; the rest describe what this app derives from a loaded Bundle.
import type {
	Bundle,
	BundleEntry,
	CodeableConcept,
	Composition,
	CompositionSection,
	FhirResource,
	Patient
} from 'fhir/r4';

export type {
	Bundle,
	BundleEntry,
	CodeableConcept,
	Composition,
	CompositionSection,
	FhirResource,
	Patient
};

/** A function that turns a message key and values into words in the UI locale. */
export type Translate = (key: string, values?: Record<string, unknown>) => string;

/** What a formatter needs: the UI locale for dates and numbers, and the words. */
export interface FormatContext {
	locale: string;
	t: Translate;
}

/** Severity of a structural check (spec §6.2). Errors block rendering. */
export type CheckSeverity = 'error' | 'warning' | 'info';

/** One structural finding. `key` is an i18n message key under `checks.`. */
export interface Check {
	severity: CheckSeverity;
	key: string;
	values?: Record<string, string | number>;
	/** The section key the finding belongs to, when it belongs to one. */
	section?: string;
}

/** Requirement level of a section in the IPS Composition (spec §2.1). */
export type SectionLevel = 'required' | 'recommended' | 'optional' | 'unknown';

/** Registry key of a section; `generic` is any code the registry does not know. */
export type SectionKey =
	| 'medications'
	| 'allergies'
	| 'problems'
	| 'immunizations'
	| 'results'
	| 'procedures'
	| 'devices'
	| 'vitalSigns'
	| 'pastIllness'
	| 'functionalStatus'
	| 'planOfCare'
	| 'socialHistory'
	| 'pregnancy'
	| 'advanceDirectives'
	| 'alerts'
	| 'patientStory'
	| 'generic';

/**
 * The state of a section's data (spec §6.4), using the Lily record-list
 * statuses. "none-known", "not-recorded", "unavailable" and "omitted" are
 * different clinical facts and are always shown in different words.
 */
export type SectionState = 'known' | 'none-known' | 'not-recorded' | 'unavailable' | 'omitted';

/** A section entry reference and what it resolved to within the Bundle. */
export interface ResolvedEntry {
	reference: string;
	resource?: FhirResource;
	/** The entry's fullUrl in the Bundle, when it resolved. */
	fullUrl?: string;
}

export interface IpsSection {
	key: SectionKey;
	/** Stable DOM id for the section heading and contents link. */
	id: string;
	/** LOINC code from section.code, or '' when the section is omitted and has none. */
	code: string;
	level: SectionLevel;
	/** The title the document gives the section, if any (clinical content). */
	documentTitle?: string;
	/** False when a required section is missing from the Composition. */
	present: boolean;
	section?: CompositionSection;
	/** Resolved entries that carry clinical data. */
	entries: ResolvedEntry[];
	/** Entries that state an absence ("no known allergies", "no information"). */
	absentEntries: ResolvedEntry[];
	/** Entry references that did not resolve within the Bundle. */
	unresolved: string[];
	state: SectionState;
	/** True when a section that takes entries has none, but has a narrative. */
	narrativeOnly: boolean;
	/** Composition.section.emptyReason, when present. */
	emptyReason?: CodeableConcept;
	/** The sanitised-on-display narrative XHTML, as supplied. */
	narrative?: string;
}

/** Everything the viewer derives from a loaded IPS Bundle. */
export interface IpsDocument {
	bundle: Bundle;
	composition: Composition;
	patient?: Patient;
	sections: IpsSection[];
	checks: Check[];
	/** IPS IG version from meta.profile ("2.0.1"), or undefined when not stated. */
	version?: string;
	/** True when any meta.profile names the IPS IG. */
	declaresIps: boolean;
	/** The document's language (Composition.language, then Bundle.language). */
	language?: string;
	resolve: (reference: string | undefined) => FhirResource | undefined;
}
