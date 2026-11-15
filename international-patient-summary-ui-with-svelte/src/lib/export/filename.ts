// Non-identifying download names and the Blob download helper (spec F-EXP-5,
// F-EXP-6). A filename never holds the patient's name or identifiers:
// download folders and browser history are often visible on shared
// clinical workstations.
import type { IpsDocument } from '../fhir/types.ts';

export type ExportFormat = 'json' | 'yaml' | 'markdown' | 'pdf';

export const EXTENSIONS: Record<ExportFormat, string> = {
	json: 'json',
	yaml: 'yaml',
	markdown: 'md',
	pdf: 'pdf'
};

export const MIME_TYPES: Record<ExportFormat, string> = {
	json: 'application/fhir+json',
	yaml: 'application/yaml',
	markdown: 'text/markdown',
	pdf: 'application/pdf'
};

/** "international-patient-summary-2026-09-30.pdf", from the Composition date only. */
export function exportFilename(
	doc: Pick<IpsDocument, 'composition'>,
	format: ExportFormat
): string {
	const date = /^\d{4}(-\d{2}(-\d{2})?)?/.exec(doc.composition.date ?? '')?.[0];
	const stem = date ? `international-patient-summary-${date}` : 'international-patient-summary';
	return `${stem}.${EXTENSIONS[format]}`;
}

/** Save a Blob through a temporary object URL, revoked right after the click. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	try {
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.rel = 'noopener';
		a.style.display = 'none';
		document.body.append(a);
		a.click();
		a.remove();
	} finally {
		// Revoke on the next task so the browser has started the download.
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
}
