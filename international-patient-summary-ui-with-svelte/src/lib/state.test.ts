import { describe, expect, it } from 'vitest';
import { viewer } from './state.svelte.ts';
import { LoadError } from './fhir/parse.ts';
import { exampleJson } from './test-helpers.ts';

describe('viewer state', () => {
	it('opens and clears a valid document', () => {
		expect(
			viewer.open({ data: exampleJson('bundle-minimal'), format: 'json', source: { kind: 'text' } })
		).toBe(true);
		expect(viewer.doc).toBeDefined();
		expect(viewer.errors).toEqual([]);
		viewer.clear();
		expect(viewer.doc).toBeUndefined();
		expect(viewer.loaded).toBeUndefined();
	});

	it('turns document, load and unexpected failures into displayable errors', () => {
		expect(
			viewer.open({ data: { resourceType: 'Patient' }, format: 'json', source: { kind: 'text' } })
		).toBe(false);
		expect(viewer.errors[0].key).toBe('checks.notBundle');

		viewer.fail(new LoadError('invalidYaml', {}, { line: 3, column: 5 }, 'parser detail'));
		expect(viewer.errors[0]).toMatchObject({
			key: 'load.errors.invalidYaml',
			line: 3,
			column: 5,
			detail: 'parser detail'
		});

		viewer.fail(new Error('unexpected detail'));
		expect(viewer.errors[0]).toMatchObject({
			key: 'load.errors.notJsonOrYaml',
			detail: 'unexpected detail'
		});

		viewer.fail('a thrown string');
		expect(viewer.errors[0]).toMatchObject({
			key: 'load.errors.notJsonOrYaml',
			detail: 'a thrown string'
		});

		viewer.fail(new LoadError('invalidJson'));
		expect(viewer.errors[0].detail).toBeUndefined();
	});
});
