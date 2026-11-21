import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { locale, waitLocale } from '@sveltia/i18n';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Loader from './Loader.svelte';
import { setupI18n } from '../i18n.ts';
import { viewer } from '../state.svelte.ts';
import { exampleText } from '../test-helpers.ts';

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

beforeEach(() => {
	viewer.clear();
	viewer.busy = false;
});

afterEach(() => vi.unstubAllGlobals());

describe('Loader', () => {
	it('opens pasted JSON and reports invalid pasted input', async () => {
		const user = userEvent.setup();
		render(Loader);
		await user.click(screen.getByRole('tab', { name: 'Paste' }));
		const input = screen.getByLabelText('Paste a FHIR Bundle (JSON or YAML)');
		await fireEvent.input(input, { target: { value: exampleText('bundle-minimal') } });
		await user.click(screen.getByRole('button', { name: 'Open pasted document' }));
		await waitFor(() => expect(viewer.doc).toBeDefined());
		expect(viewer.loaded?.source.kind).toBe('text');

		await user.clear(input);
		await fireEvent.input(input, { target: { value: '{broken' } });
		await user.click(screen.getByRole('button', { name: 'Open pasted document' }));
		await waitFor(() => expect(viewer.errors.length).toBeGreaterThan(0));
		expect(screen.getByText(/not valid JSON/)).toBeDefined();
	});

	it('opens a selected YAML file', async () => {
		const user = userEvent.setup();
		const { container } = render(Loader);
		const file = new File([exampleText('bundle-minimal', 'yaml')], 'summary.yaml', {
			type: 'application/yaml'
		});
		await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file);
		await waitFor(() => expect(viewer.loaded?.source.name).toBe('summary.yaml'));
		expect(viewer.loaded?.format).toBe('yaml');
	});

	it('fetches a requested secure web address', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(exampleText('bundle-minimal'), {
					headers: { 'content-type': 'application/fhir+json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const user = userEvent.setup();
		render(Loader);
		await user.click(screen.getByRole('tab', { name: 'Web address' }));
		await user.type(
			screen.getByLabelText('Web address of a FHIR Bundle'),
			'https://example.test/summary.json'
		);
		await user.click(screen.getByRole('button', { name: 'Fetch and open' }));
		await waitFor(() => expect(viewer.loaded?.source.kind).toBe('url'));
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('opens a bundled example', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(exampleText('bundle-minimal'), { status: 200 }))
		);
		const user = userEvent.setup();
		render(Loader);
		await user.click(screen.getByRole('tab', { name: 'Examples' }));
		await user.click(screen.getByRole('button', { name: /Open.*Minimal/ }));
		await waitFor(() => expect(viewer.loaded?.source.kind).toBe('example'));
	});

	it('shows and clears the document drop target', async () => {
		const { container } = render(Loader);
		await fireEvent.dragOver(document, { dataTransfer: { types: ['Files'] } });
		expect(container.querySelector('.drop-overlay')?.textContent).toBe('Drop the file to open it');
		const leave = new Event('dragleave', { bubbles: true });
		Object.defineProperty(leave, 'relatedTarget', { value: null });
		await fireEvent(document, leave);
		expect(container.querySelector('.drop-overlay')).toBeNull();
	});

	it('opens a file dropped on the page, and ignores a drop with no file', async () => {
		render(Loader);
		const drop = (files: File[]) => {
			const event = new Event('drop', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'dataTransfer', { value: { files } });
			document.dispatchEvent(event);
			return event;
		};
		expect(drop([]).defaultPrevented).toBe(false);
		const file = new File([exampleText('bundle-minimal')], 'dropped.json', {
			type: 'application/json'
		});
		expect(drop([file]).defaultPrevented).toBe(true);
		await waitFor(() => expect(viewer.doc).toBeDefined());
	});
});
