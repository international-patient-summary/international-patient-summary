// JSON export (spec F-EXP-1): the Bundle exactly as loaded, 2-space indent.
import type { Bundle } from 'fhir/r4';

export function exportJson(bundle: Bundle): string {
	return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function jsonBlob(bundle: Bundle): Blob {
	return new Blob([exportJson(bundle)], { type: 'application/fhir+json' });
}
