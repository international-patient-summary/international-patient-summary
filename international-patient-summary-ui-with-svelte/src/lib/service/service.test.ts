// The backendless tour service (spec §6.8) keeps the backend's contract
// (international-patient-summary-service-with-axum spec §4).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../examples.ts';
import { checkIps, isServiceId, REFUSALS, ServiceError } from './service.ts';
import { TourService } from './tour-service.ts';

const EXAMPLES_DIR = join(import.meta.dirname, '..', '..', '..', 'static', 'examples');
const example = (id: string) =>
	JSON.parse(readFileSync(join(EXAMPLES_DIR, `${id}.json`), 'utf8')) as Record<string, unknown>;

function minimal(): Record<string, unknown> {
	return {
		resourceType: 'Bundle',
		type: 'document',
		entry: [
			{
				resource: {
					resourceType: 'Composition',
					type: { coding: [{ system: 'http://loinc.org', code: '60591-5' }] },
					subject: { reference: 'urn:uuid:2' }
				}
			}
		]
	};
}

describe('checkIps mirrors the backend check', () => {
	it('accepts every bundled example', () => {
		for (const id of EXAMPLES) expect(checkIps(example(id)), id).toBeUndefined();
	});

	it('refuses in the backend order, with its codes', () => {
		expect(checkIps([])).toBe('not_a_bundle');
		expect(checkIps({ ...minimal(), type: 'collection' })).toBe('not_a_document');
		expect(checkIps({ ...minimal(), entry: [] })).toBe('no_composition');
		const other = minimal();
		(other.entry as { resource: { type: unknown } }[])[0].resource.type = {
			coding: [{ system: 'http://loinc.org', code: '34133-9' }]
		};
		expect(checkIps(other)).toBe('not_a_patient_summary');
		const anonymous = minimal();
		(anonymous.entry as { resource: { subject: unknown } }[])[0].resource.subject = {
			reference: ' '
		};
		expect(checkIps(anonymous)).toBe('no_subject');
	});

	it('names five refusals, each with a pointer', () => {
		expect(REFUSALS.map(([code]) => code)).toEqual([
			'not_a_bundle',
			'not_a_document',
			'no_composition',
			'not_a_patient_summary',
			'no_subject'
		]);
		for (const [, pointer] of REFUSALS) expect(pointer.startsWith('#/')).toBe(true);
	});
});

describe('TourService', () => {
	it('stores, lists, reads and deletes, writing the id into Bundle.id', async () => {
		const service = new TourService();
		const sent = example('IPS-examples-Bundle-01');
		const { id, bundle } = await service.create(sent);
		expect(isServiceId(id)).toBe(true);
		expect(bundle).toEqual({ ...sent, id });
		expect(await service.list()).toHaveLength(1);
		expect((await service.read(id)).bundle).toEqual({ ...sent, id });
		await service.remove(id);
		expect(await service.list()).toEqual([]);
		await expect(service.read(id)).rejects.toMatchObject({ status: 404 });
		await expect(service.remove(id)).rejects.toMatchObject({ status: 404 });
	});

	it('refuses a non-IPS document with 422, code and pointer', async () => {
		const error = await new TourService().create({ resourceType: 'Patient' }).catch((e) => e);
		expect(error).toBeInstanceOf(ServiceError);
		expect(error).toMatchObject({ status: 422, code: 'not_a_bundle', pointer: '#/resourceType' });
	});

	it('answers 404 for an id it could never issue', async () => {
		const service = new TourService();
		for (const id of ['not-a-uuid', '00000000-0000-0000-0000-000000000000'])
			await expect(service.read(id)).rejects.toMatchObject({ status: 404 });
	});

	it('lists newest first, with title and date', async () => {
		const service = new TourService();
		await service.create(example('bundle-minimal'));
		const { id } = await service.create(example('IPS-examples-Bundle-01'));
		const [first] = await service.list();
		expect(first.id).toBe(id);
		expect(typeof first.title).toBe('string');
		expect(typeof first.date).toBe('string');
		expect(first.patient, 'the subject is resolved and named').toBeTruthy();
	});

	it('keeps its own copies', async () => {
		const service = new TourService();
		const sent = minimal();
		const { id, bundle } = await service.create(sent);
		sent.type = 'changed';
		bundle.type = 'changed';
		expect((await service.read(id)).bundle.type).toBe('document');
	});
});
