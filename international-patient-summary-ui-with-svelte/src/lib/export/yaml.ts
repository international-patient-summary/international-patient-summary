// YAML export (spec F-EXP-1, tasks.md P6-T3). YAML 1.2 core schema, key
// order kept, and any string YAML would read as another type is quoted — the
// yaml library does this for the core schema, and the round-trip tests
// confirm it. The file starts with a comment: YAML is not an official FHIR
// format.
import { stringify } from 'yaml';

export const YAML_OPTIONS = {
	schema: 'core',
	lineWidth: 0,
	minContentWidth: 0,
	aliasDuplicateObjects: false,
	defaultStringType: 'PLAIN',
	defaultKeyType: 'PLAIN',
	indent: 2
} as const;

export function exportYaml(data: unknown, comment: string): string {
	const header = comment
		.split('\n')
		.map((line) => `# ${line}`.trimEnd())
		.join('\n');
	return `${header}\n${stringify(data, YAML_OPTIONS)}`;
}

export function yamlBlob(data: unknown, comment: string): Blob {
	return new Blob([exportYaml(data, comment)], { type: 'application/yaml' });
}
