import { render } from '@testing-library/svelte';
import { locale, waitLocale } from '@sveltia/i18n';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Codes from './Codes.svelte';
import DocumentMeta from './DocumentMeta.svelte';
import ErrorList from './ErrorList.svelte';
import Narrative from './Narrative.svelte';
import { setupI18n } from '../i18n.ts';
import { viewer } from '../state.svelte.ts';
import { IG_FIXTURES, exampleDoc } from '../test-helpers.ts';

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

beforeEach(() => {
	viewer.clear();
	viewer.showCodes = false;
});

const text = (el: Element) => (el.textContent ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ');

describe('Codes', () => {
	it('shows a code with its system, or alone when it has none, and nothing for no codes', () => {
		const { container } = render(Codes, {
			codes: [
				{ system: 'LOINC', code: '1234-5' },
				{ system: '', code: 'local' }
			]
		});
		const items = [...container.querySelectorAll('code')].map((c) => c.textContent);
		expect(items).toEqual(['LOINC 1234-5', 'local']);
		const empty = render(Codes, { codes: [] });
		expect(empty.container.querySelector('.entry-codes')).toBeNull();
	});
});

describe('Narrative', () => {
	it('renders nothing for an empty narrative, and can start open', () => {
		const empty = render(Narrative, { div: '' });
		expect(empty.container.querySelector('.narrative')).toBeNull();
		const { container } = render(Narrative, {
			div: '<div xmlns="http://www.w3.org/1999/xhtml">Hello</div>',
			lang: 'en',
			open: true
		});
		expect(container.querySelector('details')?.open).toBe(true);
		expect(container.querySelector('.narrative-body')?.getAttribute('lang')).toBe('en');
	});
});

describe('ErrorList', () => {
	it('says where, and what, for an error with a position and a detail', () => {
		const { container } = render(ErrorList, {
			errors: [{ key: 'load.errors.invalidJson', line: 2, detail: 'Unexpected token' }]
		});
		const body = text(container);
		expect(body).toContain('Unexpected token');
		expect(container.querySelector('.error-detail')).not.toBeNull();
	});

	it('shows nothing when there are no errors', () => {
		const { container } = render(ErrorList, { errors: [] });
		expect(container.querySelector('.error-summary')).toBeNull();
	});
});

describe('DocumentMeta', () => {
	it('lists every field the document states', () => {
		const { container } = render(DocumentMeta, { doc: exampleDoc('bundle-ips-all-sections') });
		const terms = [...container.querySelectorAll('dt')].map((d) => text(d));
		expect(terms.length).toBeGreaterThanOrEqual(6);
	});

	it('shows the optional fields (title, custodian, attesters, status, identifier) where they exist', () => {
		const seen = new Set<string>();
		for (const name of IG_FIXTURES) {
			const { container, unmount } = render(DocumentMeta, { doc: exampleDoc(name) });
			for (const dt of container.querySelectorAll('dt')) seen.add(text(dt));
			unmount();
		}
		for (const term of [
			'Title',
			'Custodian',
			'Attested by',
			'Status',
			'Confidentiality',
			'Identifier'
		])
			expect(seen).toContain(term);
	});

	it('says "not stated" for a missing date, author and language', () => {
		const doc = exampleDoc('bundle-minimal');
		const bare = {
			...doc,
			bundle: {
				...doc.bundle,
				entry: (doc.bundle.entry ?? []).map((e) =>
					e.resource?.resourceType === 'Composition'
						? {
								...e,
								resource: {
									...e.resource,
									date: undefined,
									author: [],
									language: undefined
								}
							}
						: e
				)
			},
			language: undefined
		} as unknown as typeof doc;
		const { container } = render(DocumentMeta, { doc: bare });
		expect(text(container).match(/Not stated/g)?.length).toBeGreaterThanOrEqual(1);
	});
});
