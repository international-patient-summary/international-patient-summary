// The tour session (spec §6.8): only the tour account signs in; the service is
// seeded from the bundled examples; sign-out forgets everything.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from './examples.ts';
import { viewer } from './state.svelte.ts';
import { tour, TOUR_EMAIL, TOUR_PASSWORD } from './tour.svelte.ts';

const EXAMPLES_DIR = join(import.meta.dirname, '..', '..', 'static', 'examples');
const href = (id: string) => `/examples/${id}.json`;
const fetchExamples = vi.fn(async (url: string | URL | Request) => {
	const name = String(url).split('/').pop() ?? '';
	return new Response(readFileSync(join(EXAMPLES_DIR, name), 'utf8'), { status: 200 });
}) as unknown as typeof fetch;

afterEach(() => tour.signOut());

describe('tour session', () => {
	it('refuses any account but the tour account', async () => {
		expect(await tour.signIn('someone@example.org', TOUR_PASSWORD, href, fetchExamples)).toBe(
			false
		);
		expect(await tour.signIn(TOUR_EMAIL, 'wrong', href, fetchExamples)).toBe(false);
		expect(tour.error).toBe('signIn');
		expect(tour.step).toBe('signIn');
	});

	it('signs in as example@example.com, seeded with every example', async () => {
		expect(await tour.signIn(' Example@Example.com ', TOUR_PASSWORD, href, fetchExamples)).toBe(
			true
		);
		expect(tour.email).toBe(TOUR_EMAIL);
		expect(tour.step).toBe('summaries');
		expect(tour.summaries).toHaveLength(EXAMPLES.length);
	});

	it('opens a summary in the viewer, deletes one, and forgets all on sign-out', async () => {
		await tour.signIn(TOUR_EMAIL, TOUR_PASSWORD, href, fetchExamples);
		await tour.open(tour.summaries[0]);
		expect(tour.step).toBe('view');
		expect(viewer.loaded?.source.kind).toBe('service');
		viewer.clear();
		await tour.remove(tour.summaries[0].id);
		expect(tour.summaries).toHaveLength(EXAMPLES.length - 1);
		tour.signOut();
		expect(tour.email).toBeUndefined();
		expect(tour.summaries).toEqual([]);
		expect(viewer.doc).toBeUndefined();
	});

	it('reports a summary that is gone', async () => {
		await tour.signIn(TOUR_EMAIL, TOUR_PASSWORD, href, fetchExamples);
		const [first] = tour.summaries;
		await tour.remove(first.id);
		await tour.open(first);
		expect(tour.error).toBe('notFound');
	});
});
