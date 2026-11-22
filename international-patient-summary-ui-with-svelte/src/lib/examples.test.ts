import { describe, expect, it } from 'vitest';
import { EXAMPLES, isExampleId } from './examples.ts';

describe('isExampleId', () => {
	it('accepts exactly the bundled examples', () => {
		for (const id of EXAMPLES) expect(isExampleId(id)).toBe(true);
		for (const other of ['', 'bundle', 'bundle-minimal.json', null, undefined]) {
			expect(isExampleId(other)).toBe(false);
		}
	});
});
