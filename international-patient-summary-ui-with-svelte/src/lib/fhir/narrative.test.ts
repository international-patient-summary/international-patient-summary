import { describe, expect, it, vi } from 'vitest';
import { narrativeToText, sanitizeNarrative } from './narrative.ts';
import { fixtureDoc } from '../test-helpers.ts';

describe('narrative', () => {
	const doc = fixtureDoc('hostile-narrative.json');
	const html = sanitizeNarrative(doc.sections[0].narrative);

	it('strips scripts, event handlers and javascript: URLs', () => {
		expect(html).not.toMatch(/<script/i);
		expect(html).not.toMatch(/onclick|onerror/i);
		expect(html).not.toMatch(/javascript:/i);
		expect(html).toContain('href="https://example.org"');
		expect(html).toContain('rel="noopener noreferrer external"');
	});

	it('turns narrative headings into paragraphs, keeping one h1 on the page', () => {
		expect(html).not.toMatch(/<h1/i);
		expect(html).toContain('<p class="narrative-heading"><strong>Heading</strong></p>');
	});

	it('converts narrative to plain text', () => {
		expect(
			narrativeToText(
				'<div><p>One</p><p>Two <b>three</b></p><table><tr><td>a</td><td>b</td></tr></table></div>'
			)
		).toBe('One\nTwo three\na b');
	});

	it('turns narrative into text without a DOM, as in a worker or on the server', () => {
		vi.stubGlobal('DOMParser', undefined);
		try {
			expect(
				narrativeToText(
					'<div><p>One &amp; two<br/>three &lt;4&gt;</p><ul><li>a</li><li>b</li></ul></div>'
				)
			).toBe('One & two\nthree <4>\na\nb');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
