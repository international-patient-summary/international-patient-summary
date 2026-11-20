import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { locale, waitLocale } from '@sveltia/i18n';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportMenu from './ExportMenu.svelte';
import { setupI18n } from '../i18n.ts';
import { exampleDoc } from '../test-helpers.ts';

const pdf = vi.hoisted(() => ({
	overflow: false,
	exportPdf: vi.fn(async (...args: [unknown, unknown, { paper: string }]) => {
		void args;
		return {
			bytes: new Uint8Array([37, 80, 68, 70]),
			pageCount: 1,
			overflow: pdf.overflow,
			omitted: [],
			cjk: false
		};
	})
}));

vi.mock('#lib/export/pdf.ts', () => ({
	browserPdfDeps: vi.fn(async () => ({})),
	exportPdf: pdf.exportPdf
}));

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

beforeEach(() => {
	pdf.overflow = false;
	pdf.exportPdf.mockClear();
	vi.stubGlobal('URL', {
		createObjectURL: vi.fn(() => 'blob:test'),
		revokeObjectURL: vi.fn()
	});
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('ExportMenu', () => {
	const announcement = () =>
		(screen.getByRole('status').textContent ?? '').replace(/[\u2066-\u2069]/g, '');

	it.each([
		['JSON', '.json'],
		['YAML', '.yaml'],
		['Markdown', '.md']
	])('downloads %s in the browser', async (label, extension) => {
		const user = userEvent.setup();
		render(ExportMenu, { doc: exampleDoc('bundle-minimal') });
		await user.click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }));
		if (label === 'Markdown') {
			await user.click(screen.getByText('Options'));
			await user.click(screen.getByLabelText(/Include.*narrative/));
			await user.click(screen.getByLabelText(/Include codes/));
		}
		await user.click(screen.getByRole('button', { name: 'Download' }));
		await waitFor(() => expect(announcement()).toContain(`Downloaded international`));
		expect(announcement()).toContain(extension);
		expect(URL.createObjectURL).toHaveBeenCalledOnce();
	});

	it('generates a PDF with the selected paper size', async () => {
		const user = userEvent.setup();
		render(ExportMenu, { doc: exampleDoc('bundle-minimal') });
		await user.click(screen.getByText('Options'));
		await user.click(screen.getByRole('radio', { name: /^A4/ }));
		await user.click(screen.getByRole('button', { name: 'Download' }));
		await waitFor(() => expect(pdf.exportPdf).toHaveBeenCalledOnce());
		expect(pdf.exportPdf.mock.calls[0][2]).toMatchObject({ paper: 'A4' });
		expect(screen.getByRole('status').textContent).toContain('.pdf');
	});

	it('warns before downloading a PDF that exceeds one page', async () => {
		pdf.overflow = true;
		const user = userEvent.setup();
		render(ExportMenu, { doc: exampleDoc('bundle-minimal') });
		await user.click(screen.getByRole('button', { name: 'Download' }));
		const confirm = await screen.findByRole('button', { name: 'Download the PDF anyway' });
		expect(URL.createObjectURL).not.toHaveBeenCalled();
		await user.click(confirm);
		expect(URL.createObjectURL).toHaveBeenCalledOnce();
	});
});
