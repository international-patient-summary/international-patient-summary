// The loaded document lives only here, in memory (spec §5): never in the URL,
// localStorage, IndexedDB or cookies, and never sent anywhere.
import { buildDocument, DocumentError } from './fhir/composition.ts';
import type { LoadResult } from './fhir/load.ts';
import { LoadError } from './fhir/parse.ts';
import type { IpsDocument } from './fhir/types.ts';

/** A problem to show in the ErrorSummary, as an i18n key and its values. */
export interface ViewerError {
	key: string;
	values?: Record<string, string | number>;
	line?: number;
	column?: number;
	detail?: string;
}

class ViewerState {
	doc = $state.raw<IpsDocument | undefined>(undefined);
	loaded = $state.raw<LoadResult | undefined>(undefined);
	errors = $state.raw<ViewerError[]>([]);
	busy = $state(false);
	/** Reveal code systems and codes beside each value (F-VIEW-7). */
	showCodes = $state(false);

	/** Build and show a parsed document, or record why it cannot be shown. */
	open(result: LoadResult): boolean {
		try {
			const doc = buildDocument(result.data);
			this.doc = doc;
			this.loaded = result;
			this.errors = [];
			return true;
		} catch (error) {
			this.fail(error);
			return false;
		}
	}

	fail(error: unknown): void {
		this.doc = undefined;
		this.loaded = undefined;
		if (error instanceof DocumentError)
			this.errors = error.checks.map((c) => ({ key: `checks.${c.key}`, values: c.values }));
		else if (error instanceof LoadError)
			this.errors = [
				{
					key: `load.errors.${error.key}`,
					values: error.values,
					line: error.line,
					column: error.column,
					detail: error.message !== error.key ? error.message : undefined
				}
			];
		else
			this.errors = [
				{
					key: 'load.errors.notJsonOrYaml',
					detail: error instanceof Error ? error.message : String(error)
				}
			];
	}

	clear(): void {
		this.doc = undefined;
		this.loaded = undefined;
		this.errors = [];
	}
}

export const viewer = new ViewerState();
