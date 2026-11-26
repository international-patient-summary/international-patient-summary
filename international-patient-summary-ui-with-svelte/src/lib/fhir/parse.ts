// JSON or YAML text → a plain object (spec §6.1 F-LOAD-5…7).
//
// FHIR has no official YAML format. YAML here is an alternative spelling of
// FHIR JSON, so a YAML document must parse to exactly the object its JSON
// equivalent would: YAML 1.2 core schema only (no YAML 1.1 coercions such as
// `no` → false), unique keys, a low alias budget, no custom tags, one document.
import { parseAllDocuments } from 'yaml';

export type InputFormat = 'json' | 'yaml';

/** Default maximum input size, in bytes (spec F-LOAD-5). */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/** Aliases a YAML document may expand; real FHIR YAML needs none. */
export const MAX_ALIAS_COUNT = 50;

/**
 * A load or parse failure. `key` is an i18n message key under `load.errors.`;
 * `line` and `column` are 1-based when the parser reported them.
 */
export class LoadError extends Error {
	key: string;
	values: Record<string, string | number>;
	line?: number;
	column?: number;

	constructor(
		key: string,
		values: Record<string, string | number> = {},
		position?: { line?: number; column?: number },
		detail?: string
	) {
		super(detail ?? key);
		this.name = 'LoadError';
		this.key = key;
		this.values = values;
		this.line = position?.line;
		this.column = position?.column;
	}
}

export interface ParseHint {
	filename?: string;
	mimeType?: string;
}

export interface ParseResult {
	data: unknown;
	format: InputFormat;
}

/** The format a filename or MIME type names, or undefined when it names none. */
export function formatFromHint(hint: ParseHint = {}): InputFormat | undefined {
	const name = hint.filename?.toLowerCase() ?? '';
	if (name.endsWith('.json')) return 'json';
	if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
	const mime = hint.mimeType?.toLowerCase().split(';')[0].trim() ?? '';
	if (mime === 'application/json' || mime === 'application/fhir+json' || mime.endsWith('+json'))
		return 'json';
	if (
		mime === 'application/yaml' ||
		mime === 'application/x-yaml' ||
		mime === 'text/yaml' ||
		mime === 'text/x-yaml'
	)
		return 'yaml';
	return undefined;
}

/** 1-based line and column of a 0-based character offset in text. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
	let line = 1;
	let column = 1;
	for (let i = 0; i < offset && i < text.length; i++) {
		if (text[i] === '\n') {
			line++;
			column = 1;
		} else column++;
	}
	return { line, column };
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// V8 writes either "(line 3 column 5)" or "at position 42".
		const lineColumn = /line (\d+) column (\d+)/.exec(message);
		if (lineColumn)
			throw new LoadError(
				'invalidJson',
				{},
				{ line: Number(lineColumn[1]), column: Number(lineColumn[2]) },
				message
			);
		const position = /position (\d+)/.exec(message);
		throw new LoadError(
			'invalidJson',
			{},
			position ? positionAt(text, Number(position[1])) : undefined,
			message
		);
	}
}

/** Throw if a parsed YAML value holds something FHIR JSON cannot (∞, NaN). */
function assertJsonCompatible(value: unknown, path = ''): void {
	if (typeof value === 'number' && !Number.isFinite(value))
		throw new LoadError('yamlNonFinite', { path: path || '/' });
	if (typeof value === 'bigint') throw new LoadError('yamlNonFinite', { path: path || '/' });
	if (value instanceof Date || value instanceof Map || value instanceof Set)
		throw new LoadError('yamlUnsupportedType', { path: path || '/' });
	if (Array.isArray(value)) value.forEach((v, i) => assertJsonCompatible(v, `${path}/${i}`));
	else if (value && typeof value === 'object')
		for (const [k, v] of Object.entries(value)) assertJsonCompatible(v, `${path}/${k}`);
}

function parseYaml(text: string): unknown {
	const docs = parseAllDocuments(text, {
		schema: 'core',
		uniqueKeys: true,
		merge: false,
		strict: true,
		prettyErrors: true,
		customTags: [],
		resolveKnownTags: false,
		keepSourceTokens: false
	});
	// parseAllDocuments returns an EmptyStream (an array) when there is nothing.
	const list = Array.isArray(docs) ? docs : [docs];
	if (list.length === 0) throw new LoadError('empty');
	if (list.length > 1) throw new LoadError('yamlMultiDocument', { count: list.length });
	const doc = list[0];
	const problem = doc.errors[0];
	if (problem) {
		const pos = problem.linePos?.[0];
		const key = problem.code === 'DUPLICATE_KEY' ? 'yamlDuplicateKey' : 'invalidYaml';
		throw new LoadError(
			key,
			{},
			pos ? { line: pos.line, column: pos.col } : undefined,
			problem.message
		);
	}
	// A tag the core schema does not define (`!!binary`, `!foo`) is a warning in
	// the yaml library; here it is an error, because FHIR JSON has no tags.
	const tagWarning = doc.warnings.find((w) => w.code === 'TAG_RESOLVE_FAILED');
	if (tagWarning) {
		const pos = tagWarning.linePos?.[0];
		throw new LoadError(
			'yamlCustomTag',
			{},
			pos ? { line: pos.line, column: pos.col } : undefined,
			tagWarning.message
		);
	}
	let data: unknown;
	try {
		data = doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
	} catch (error) {
		// The yaml library throws a ReferenceError (an Error) past the alias limit.
		if (error instanceof Error)
			throw new LoadError('yamlAliasLimit', { max: MAX_ALIAS_COUNT }, undefined, error.message);
		throw error;
	}
	assertJsonCompatible(data);
	return data;
}

/**
 * Parse JSON or YAML text. The filename or MIME type decides the format when
 * it names one; otherwise JSON is tried first, then YAML.
 */
export function parseText(text: string, hint: ParseHint = {}): ParseResult {
	const bytes = new TextEncoder().encode(text).length;
	if (bytes > MAX_INPUT_BYTES)
		throw new LoadError('tooLarge', { size: bytes, max: MAX_INPUT_BYTES });
	// A UTF-8 byte order mark is not part of either format.
	const source = text.replace(/^\ufeff/, '');
	if (source.trim() === '') throw new LoadError('empty');

	const hinted = formatFromHint(hint);
	if (hinted === 'json') return { data: parseJson(source), format: 'json' };
	if (hinted === 'yaml') return { data: parseYaml(source), format: 'yaml' };

	const trimmed = source.trimStart();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			return { data: parseJson(source), format: 'json' };
		} catch (jsonError) {
			// Flow-style YAML can also start with "{"; if it parses as YAML, accept it.
			try {
				return { data: parseYaml(source), format: 'yaml' };
			} catch {
				throw jsonError;
			}
		}
	}
	try {
		return { data: parseYaml(source), format: 'yaml' };
	} catch (yamlError) {
		if (yamlError instanceof LoadError && yamlError.key !== 'invalidYaml') throw yamlError;
		throw new LoadError(
			'notJsonOrYaml',
			{},
			yamlError instanceof LoadError
				? { line: yamlError.line, column: yamlError.column }
				: undefined,
			yamlError instanceof Error ? yamlError.message : undefined
		);
	}
}
