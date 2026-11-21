import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserPdfDeps, containsCjk, exportPdf, paperFor, type PdfDeps } from './pdf.ts';
import { context, exampleDoc, fixtureDoc, IG_FIXTURES } from '../test-helpers.ts';
import { sectionModels } from '../fhir/models.ts';
import type { IpsDocument } from '../fhir/types.ts';

const FONTS = join(import.meta.dirname, '..', '..', '..', 'static', 'fonts');
const NOW = new Date('2026-11-15T12:00:00Z');

async function deps(): Promise<PdfDeps> {
	const module = await import('pdfmake/build/pdfmake.js');
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const pdfMake = ((module as any).default ?? module) as PdfDeps['pdfMake'];
	return { pdfMake, loadFont: async (file) => readFileSync(join(FONTS, file)).toString('base64') };
}

async function pdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const pdf = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
	let text = '';
	for (let i = 1; i <= pdf.numPages; i++) {
		const content = await (await pdf.getPage(i)).getTextContent();
		text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
	}
	return { pages: pdf.numPages, text: text.replace(/\s+/g, ' ') };
}

function mustShow(doc: IpsDocument, locale = 'en-US'): string[] {
	const ctx = context(locale);
	const out: string[] = [];
	for (const key of ['allergies', 'alerts']) {
		const s = doc.sections.find((x) => x.key === key);
		if (s?.state === 'known') out.push(...sectionModels(s, doc, ctx).map((m) => m.title));
	}
	return out;
}

const squash = (s: string) => s.replace(/\s+/g, '');

describe('one-page PDF', () => {
	it.each(IG_FIXTURES)('fits %s on exactly one page, with all must-show text', async (name) => {
		const doc = exampleDoc(name);
		const result = await exportPdf(
			doc,
			context('en-US'),
			{ title: 'x.pdf', now: NOW },
			await deps()
		);
		expect(result.pageCount).toBe(1);
		expect(result.overflow).toBe(false);
		const { pages, text } = await pdfText(result.bytes);
		expect(pages).toBe(1);
		const name0 = doc.patient?.name?.[0];
		if (name0?.family) expect(text).toContain(name0.family);
		for (const s of mustShow(doc)) expect(squash(text)).toContain(squash(s));
		expect(text).toContain('Not a medical device');
		expect(text).toContain('Page 1 of 1');
		expect(result.cjk).toBe(false);
	});

	it('runs to two pages, never dropping an allergy, when must-show content cannot fit', async () => {
		const doc = fixtureDoc('eighty-allergies.json');
		const result = await exportPdf(
			doc,
			context('en-US'),
			{ title: 'x.pdf', now: NOW },
			await deps()
		);
		expect(result.overflow).toBe(true);
		const { pages, text } = await pdfText(result.bytes);
		expect(pages).toBeGreaterThanOrEqual(2);
		for (let i = 0; i < 80; i++) expect(text).toContain(`Test substance number ${i} `);
		expect(text.match(/CONTINUED/g)?.length).toBe(pages);
	});

	it('lists exactly the trimmed sections on the "Not shown" line', async () => {
		const doc = fixtureDoc('eighty-allergies.json');
		const result = await exportPdf(
			doc,
			context('en-US'),
			{ title: 'x.pdf', now: NOW },
			await deps()
		);
		const { text } = await pdfText(result.bytes);
		const ctx = context('en-US');
		if (result.notShown.length) {
			const line = ctx.t('summary.notShown', {
				sections: result.notShown.map((k) => ctx.t(`sections.${k}.title`)).join(', ')
			});
			expect(squash(text)).toContain(squash(line));
		} else expect(text).not.toContain('Not shown on this page');
	});

	it('embeds the CJK font only when the content has CJK text', async () => {
		const result = await exportPdf(
			exampleDoc('bundle-minimal'),
			context('zh-CN'),
			{ title: 'x.pdf', now: NOW },
			await deps()
		);
		expect(result.cjk).toBe(true);
		expect(result.pageCount).toBe(1);
		expect(containsCjk(['中文'])).toBe(true);
		expect(containsCjk(['ŵ ŷ Cymraeg'])).toBe(false);
	});

	it('chooses US Letter for en-US and A4 elsewhere', () => {
		expect(paperFor('en-US')).toBe('LETTER');
		expect(paperFor('en-GB')).toBe('A4');
		expect(paperFor('en-US', 'A4')).toBe('A4');
	});
});

describe('browserPdfDeps', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('loads a font file from the base address as base64, in chunks', async () => {
		const bytes = new Uint8Array(0x8000 * 2 + 5).map((_, i) => i % 251);
		const fetched: string[] = [];
		vi.stubGlobal('fetch', async (url: string) => {
			fetched.push(url);
			return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer };
		});
		const { pdfMake, loadFont } = await browserPdfDeps('/fonts/');
		expect(typeof pdfMake.createPdf).toBe('function');
		const base64 = await loadFont('Font.ttf');
		expect(fetched).toEqual(['/fonts/Font.ttf']);
		expect(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))).toEqual(bytes);
	});

	it('refuses a font file the server does not have', async () => {
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 404 }));
		const { loadFont } = await browserPdfDeps('/fonts/');
		await expect(loadFont('Missing.ttf')).rejects.toThrow('font Missing.ttf: HTTP 404');
	});
});
