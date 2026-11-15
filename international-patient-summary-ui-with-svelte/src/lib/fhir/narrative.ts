// Sanitise FHIR narrative XHTML before display (spec §7, P2-T8).
//
// FHIR's narrative rules already forbid scripts, forms and event handlers;
// a document can still break them, so the viewer enforces an allowlist.
// Headings inside a narrative are rewritten as paragraphs so the page keeps
// one h1 and sections as h2 (spec §7 accessibility).
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
	'a',
	'abbr',
	'acronym',
	'b',
	'big',
	'blockquote',
	'br',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'dd',
	'dfn',
	'div',
	'dl',
	'dt',
	'em',
	'hr',
	'i',
	'img',
	'li',
	'ol',
	'p',
	'pre',
	'q',
	'samp',
	'small',
	'span',
	'strong',
	'sub',
	'sup',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'tt',
	'ul',
	'var',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6'
];
const ALLOWED_ATTR = [
	'href',
	'name',
	'title',
	'alt',
	'src',
	'colspan',
	'rowspan',
	'scope',
	'lang',
	'id'
];

/** Safe href and src schemes: web links, mail, and in-page fragments; images may be data:. */
const SAFE_URL = /^(?:https?:|mailto:|#)/i;
const SAFE_IMG = /^(?:https:|data:image\/(?:png|gif|jpe?g|webp);)/i;

let instance: ReturnType<typeof DOMPurify> | undefined;
function purifier() {
	if (instance) return instance;
	const purify = DOMPurify(window);
	purify.addHook('afterSanitizeAttributes', (node) => {
		const element = node as Element;
		if (element.hasAttribute?.('href')) {
			const href = element.getAttribute('href') ?? '';
			if (!SAFE_URL.test(href.trim())) element.removeAttribute('href');
			else if (!href.startsWith('#')) element.setAttribute('rel', 'noopener noreferrer external');
		}
		if (element.tagName === 'IMG') {
			const src = element.getAttribute('src') ?? '';
			if (!SAFE_IMG.test(src.trim())) element.removeAttribute('src');
		}
		// Ids from a document could collide with the page's own ids.
		if (element.hasAttribute?.('id'))
			element.setAttribute('id', `narrative-${element.getAttribute('id')}`);
	});
	instance = purify;
	return purify;
}

/** Sanitised narrative HTML, safe for {@html}. Empty string when nothing is left. */
export function sanitizeNarrative(div: string | undefined): string {
	if (!div || typeof window === 'undefined') return '';
	const fragment = purifier().sanitize(div, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOW_DATA_ATTR: false,
		ALLOW_ARIA_ATTR: false,
		RETURN_DOM_FRAGMENT: true
	}) as DocumentFragment;
	for (const heading of Array.from(fragment.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
		const p = heading.ownerDocument.createElement('p');
		p.className = 'narrative-heading';
		const strong = heading.ownerDocument.createElement('strong');
		strong.append(...Array.from(heading.childNodes));
		p.append(strong);
		heading.replaceWith(p);
	}
	const holder = document.createElement('div');
	holder.append(fragment);
	return holder.innerHTML.trim();
}

/** Narrative XHTML as plain text, for the Markdown and PDF exports. */
export function narrativeToText(div: string | undefined): string {
	if (!div) return '';
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(div, 'text/html');
		for (const br of Array.from(doc.querySelectorAll('br'))) br.replaceWith('\n');
		for (const block of Array.from(
			doc.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, dt, dd')
		))
			block.append('\n');
		for (const cell of Array.from(doc.querySelectorAll('td, th'))) cell.append(' ');
		return (doc.body.textContent ?? '')
			.split('\n')
			.map((l) => l.replace(/\s+/g, ' ').trim())
			.filter(Boolean)
			.join('\n');
	}
	return div
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.split('\n')
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
}
