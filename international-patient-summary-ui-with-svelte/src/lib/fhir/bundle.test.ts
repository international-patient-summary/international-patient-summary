import { describe, expect, it } from 'vitest';
import { indexBundle, typeIdOf } from './bundle.ts';
import type { Bundle } from 'fhir/r4';

describe('indexBundle', () => {
	const bundle = {
		resourceType: 'Bundle',
		entry: [
			null,
			{ resource: 'not an object' },
			{ fullUrl: 'urn:uuid:1', resource: { resourceType: 'Patient', id: 'p1' } },
			// A second resource of the same type and id never replaces the first.
			{ fullUrl: 'urn:uuid:2', resource: { resourceType: 'Patient', id: 'p1', active: true } },
			// No id, found by an absolute URL naming its type and id.
			{
				fullUrl: 'https://example.org/fhir/Condition/c9',
				resource: { resourceType: 'Condition' }
			},
			{ fullUrl: 7, resource: { resourceType: 'Observation', id: 'o1' } }
		]
	} as unknown as Bundle;

	it('finds resources by full URL, type and id, and by a URL that names them', () => {
		const index = indexBundle(bundle);
		expect(index.resolve('urn:uuid:1')?.resource).toMatchObject({ id: 'p1' });
		expect(index.resolve('Patient/p1')?.fullUrl).toBe('urn:uuid:1');
		expect(index.resolve('Condition/c9')?.resource).toMatchObject({ resourceType: 'Condition' });
		expect(index.resolve('Observation/o1')?.fullUrl).toBeUndefined();
		expect(index.resolve('Patient/none')).toBeUndefined();
		expect(index.resolve(undefined)).toBeUndefined();
		expect(index.resolve(42 as unknown as string)).toBeUndefined();
	});

	it('reads a type and id from a reference', () => {
		expect(typeIdOf('https://x.org/fhir/Patient/1/_history/2')).toBe('Patient/1');
		expect(typeIdOf('urn:uuid:1')).toBeUndefined();
	});
});
