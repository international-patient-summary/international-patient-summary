// Load an IPS from a file, pasted text, or an https: URL (spec §6.1).
// Every path ends in parseText, so size limits and format rules are shared.
import { LoadError, MAX_INPUT_BYTES, parseText, type ParseResult } from './parse.ts';

export interface LoadResult extends ParseResult {
	/** Where it came from, for display only: a filename, "pasted text", or the URL. */
	source: { kind: 'file' | 'text' | 'url' | 'example'; name?: string };
}

/** Load a File chosen by the picker or dropped on the page. */
export async function loadFile(file: File, maxBytes = MAX_INPUT_BYTES): Promise<LoadResult> {
	if (file.size > maxBytes) throw new LoadError('tooLarge', { size: file.size, max: maxBytes });
	const text = await file.text();
	return {
		...parseText(text, { filename: file.name, mimeType: file.type }),
		source: { kind: 'file', name: file.name }
	};
}

/** Load pasted text: JSON first, then YAML. */
export function loadText(text: string): LoadResult {
	return { ...parseText(text), source: { kind: 'text' } };
}

/**
 * Fetch an https: URL in the browser and parse it. Only https: is allowed
 * (spec §7). CORS and network failures become a plain-language error.
 */
export async function loadUrl(
	input: string,
	fetchImpl: typeof fetch = fetch,
	maxBytes = MAX_INPUT_BYTES
): Promise<LoadResult> {
	let url: URL;
	try {
		url = new URL(input.trim());
	} catch {
		throw new LoadError('urlInvalid');
	}
	if (url.protocol !== 'https:') throw new LoadError('urlNotHttps');

	let response: Response;
	try {
		response = await fetchImpl(url.href, {
			headers: { accept: 'application/fhir+json, application/json, application/yaml;q=0.9' },
			credentials: 'omit',
			referrerPolicy: 'no-referrer'
		});
	} catch (error) {
		throw new LoadError(
			'urlNetwork',
			{ host: url.host },
			undefined,
			error instanceof Error ? error.message : undefined
		);
	}
	if (!response.ok) throw new LoadError('urlStatus', { status: response.status });
	const length = Number(response.headers.get('content-length') ?? '0');
	if (length > maxBytes) throw new LoadError('tooLarge', { size: length, max: maxBytes });
	const text = await response.text();
	return {
		...parseText(text, {
			filename: url.pathname,
			mimeType: response.headers.get('content-type') ?? undefined
		}),
		source: { kind: 'url', name: url.href }
	};
}

/** Load one of the bundled example fixtures from the app's own origin. */
export async function loadExample(
	href: string,
	name: string,
	fetchImpl: typeof fetch = fetch
): Promise<LoadResult> {
	const response = await fetchImpl(href);
	if (!response.ok) throw new LoadError('urlStatus', { status: response.status });
	const text = await response.text();
	return { ...parseText(text, { filename: href }), source: { kind: 'example', name } };
}
