#!/usr/bin/env node
// Write a YAML twin of each IG example (static/examples/*.json → *.yaml),
// with the same options as the app's YAML exporter (src/lib/export/yaml.ts).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'static', 'examples');
const OPTIONS = {
	schema: 'core',
	lineWidth: 0,
	minContentWidth: 0,
	aliasDuplicateObjects: false,
	indent: 2
};
const COMMENT =
	'# YAML form of an HL7 FHIR Bundle, exported by the International Patient Summary viewer.\n' +
	'# YAML is not an official FHIR format; it maps one to one to FHIR JSON.\n';
for (const name of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
	const data = JSON.parse(await readFile(join(dir, name), 'utf8'));
	await writeFile(join(dir, name.replace(/\.json$/, '.yaml')), COMMENT + stringify(data, OPTIONS));
	console.log(`wrote ${name.replace(/\.json$/, '.yaml')}`);
}
