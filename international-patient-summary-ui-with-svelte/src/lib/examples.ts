// The bundled example fixtures (spec §2.2), served from static/examples/.
// Names and descriptions are i18n keys under `examples.<id>.`.
export const EXAMPLES = [
	'bundle-minimal',
	'bundle-no-info-required-sections',
	'bundle-ips-all-sections',
	'IPS-examples-Bundle-01',
	'IPS-examples-Bundle-with-immunization'
] as const;

export type ExampleId = (typeof EXAMPLES)[number];

export function isExampleId(value: string | null | undefined): value is ExampleId {
	return !!value && (EXAMPLES as readonly string[]).includes(value);
}
