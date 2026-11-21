import { describe, expect, it, vi } from 'vitest';
import { loadExample, loadFile, loadText, loadUrl } from './load.ts';
import { LoadError, MAX_INPUT_BYTES } from './parse.ts';
import { exampleText } from '../test-helpers.ts';

async function rejection(p: Promise<unknown>): Promise<LoadError> {
	try {
		await p;
	} catch (e) {
		if (e instanceof LoadError) return e;
		throw e;
	}
	throw new Error('expected a LoadError');
}

describe('loaders', () => {
	it('loads a file by its extension', async () => {
		const file = new File([exampleText('bundle-minimal', 'yaml')], 'minimal.yaml', { type: '' });
		const result = await loadFile(file);
		expect(result.format).toBe('yaml');
		expect(result.source).toEqual({ kind: 'file', name: 'minimal.yaml' });
	});

	it('rejects a file over the size limit before reading it', async () => {
		const file = new File(['{}'], 'x.json');
		expect((await rejection(loadFile(file, 1))).key).toBe('tooLarge');
	});

	it('loads pasted text', () => {
		expect(loadText(exampleText('bundle-minimal')).format).toBe('json');
	});

	it('fetches https URLs only', async () => {
		expect((await rejection(loadUrl('http://example.org/x.json'))).key).toBe('urlNotHttps');
		expect((await rejection(loadUrl('not a url'))).key).toBe('urlInvalid');
	});

	it('allows plain HTTP only for literal loopback hosts when development opts in', async () => {
		const ok = vi.fn(async () => new Response(exampleText('bundle-minimal')));
		for (const host of ['localhost', '127.0.0.1']) {
			const result = await loadUrl(`http://${host}:1241/fhir/Bundle/id`, ok, MAX_INPUT_BYTES, true);
			expect(result.source.name).toBe(`http://${host}:1241/fhir/Bundle/id`);
		}
		expect((await rejection(loadUrl('http://localhost/x', ok))).key).toBe('urlNotHttps');
		expect((await rejection(loadUrl('http://example.org/x', ok, MAX_INPUT_BYTES, true))).key).toBe(
			'urlNotHttps'
		);
	});

	it('explains a network or CORS failure in plain language', async () => {
		const failing = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
		const e = await rejection(loadUrl('https://example.org/ips.json', failing));
		expect(e.key).toBe('urlNetwork');
		expect(e.values.host).toBe('example.org');
	});

	it('reports an HTTP error status', async () => {
		const notFound = (() => Promise.resolve(new Response('no', { status: 404 }))) as typeof fetch;
		expect((await rejection(loadUrl('https://example.org/ips.json', notFound))).values.status).toBe(
			404
		);
	});

	it('parses a fetched document by its content type', async () => {
		const ok = (() =>
			Promise.resolve(
				new Response(exampleText('bundle-minimal'), {
					headers: { 'content-type': 'application/fhir+json' }
				})
			)) as typeof fetch;
		const result = await loadUrl('https://example.org/ips', ok);
		expect(result.format).toBe('json');
		expect(result.source.kind).toBe('url');
	});

	it('refuses a non-success status and a declared size over the limit', async () => {
		const status = vi.fn(async () => new Response('nope', { status: 404 }));
		expect((await rejection(loadUrl('https://example.org/x.json', status))).key).toBe('urlStatus');
		const big = vi.fn(
			async () => new Response('{}', { headers: { 'content-length': String(MAX_INPUT_BYTES + 1) } })
		);
		expect((await rejection(loadUrl('https://example.org/x.json', big))).key).toBe('tooLarge');
	});

	it('loads a bundled example from the app origin, and refuses one that is missing', async () => {
		const ok = vi.fn(async () => new Response(exampleText('bundle-minimal')));
		const result = await loadExample('/examples/minimal.json', 'Minimal', ok);
		expect(result.source).toEqual({ kind: 'example', name: 'Minimal' });
		const missing = vi.fn(async () => new Response('', { status: 404 }));
		expect((await rejection(loadExample('/examples/x.json', 'X', missing))).key).toBe('urlStatus');
	});
});
