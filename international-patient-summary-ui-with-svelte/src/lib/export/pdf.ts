// One-page PDF summary (spec F-EXP-3, tasks.md P6-T5…T7), made with pdfmake,
// which is imported only when a PDF is asked for.
//
// Fitting to one page: lay out, read the page count from pdfmake's footer
// callback, and repeat — first shrinking the font to an 8 pt floor, then
// trimming the lowest-priority sections to their most recent items ("+N more
// not shown"), then replacing whole low-priority sections with a notice.
// Every trimmed or omitted section is named on a "Not shown on this page"
// line. Must-show content — identity, alerts, allergies and intolerances,
// active medications — is never trimmed: if it cannot fit on one page at
// 8 pt, the PDF runs to a second page, says "CONTINUED" on both, and the
// caller is told so it can warn before download.
import { pdfPriority } from '../fhir/sections.ts';
import {
	sectionModels,
	stateLabel,
	type EntryModel,
	type MedicationModel
} from '../fhir/models.ts';
import { documentSummary, patientSummary } from '../fhir/summary.ts';
import type { FormatContext, IpsDocument, IpsSection, SectionKey } from '../fhir/types.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Content = any;
type DocDefinition = Record<string, any>;

export type PaperSize = 'auto' | 'A4' | 'LETTER';

export interface PdfOptions {
	paper?: PaperSize;
	/** The PDF metadata title: the non-identifying filename (F-EXP-5). */
	title: string;
	now?: Date;
}

/** What the PDF layer needs from the outside world: pdfmake and font bytes. */
export interface PdfDeps {
	pdfMake: {
		createPdf: (def: DocDefinition) => {
			getStream(): Promise<any>;
			getBuffer(): Promise<Uint8Array>;
		};
		addVirtualFileSystem: (vfs: Record<string, string>) => void;
		fonts: Record<string, Record<string, string>>;
	};
	/** Base64 of a font file in static/fonts/, e.g. "NotoSans-Regular.ttf". */
	loadFont: (file: string) => Promise<string>;
}

export interface PdfResult {
	bytes: Uint8Array;
	pageCount: number;
	/** True when must-show content needed a second page. */
	overflow: boolean;
	/** Section keys trimmed or omitted to fit, in the order they were cut. */
	notShown: SectionKey[];
	fontSize: number;
	cjk: boolean;
}

export const FONT_SIZES = [10, 9.5, 9, 8.5, 8];
const MUST_SHOW: SectionKey[] = ['alerts', 'allergies'];
const CJK =
	/[\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

/** True when any text contains CJK characters (checked on content, not on the UI locale). */
export function containsCjk(texts: Iterable<string>): boolean {
	for (const text of texts) if (CJK.test(text)) return true;
	return false;
}

/** Every string in a pdfmake content tree. */
export function textsOf(node: Content, out: string[] = []): string[] {
	if (typeof node === 'string') out.push(node);
	else if (Array.isArray(node)) for (const n of node) textsOf(n, out);
	else if (node && typeof node === 'object')
		for (const [k, v] of Object.entries(node)) if (k !== 'image' && k !== 'svg') textsOf(v, out);
	return out;
}

export function paperFor(locale: string, paper: PaperSize = 'auto'): 'A4' | 'LETTER' {
	if (paper !== 'auto') return paper;
	return /^en-US$/i.test(locale) ? 'LETTER' : 'A4';
}

interface Plan {
	fontSize: number;
	/** Per section: a cap on items shown, or 'omit' for the whole section. */
	caps: Map<SectionKey, number | 'omit'>;
}

interface PreparedSection {
	section: IpsSection;
	title: string;
	models: EntryModel[];
	/** Items that are never trimmed (current medicines). */
	mustShow: EntryModel[];
	/** Items that may be trimmed, most recent first. */
	others: EntryModel[];
}

function dateOf(m: EntryModel): string {
	const any = m as unknown as Record<string, string | undefined>;
	return (
		any.effective ?? any.occurrence ?? any.performed ?? any.onset ?? any.timing ?? any.date ?? ''
	);
}

function itemLine(m: EntryModel, base: number): Content {
	const rest = m.fields
		.slice(1)
		.map((f) => f.value)
		.filter(Boolean);
	// One item never splits across a page break.
	return {
		stack: [{ text: [{ text: m.title, bold: true }, rest.length ? `  ${rest.join(' · ')}` : ''] }],
		unbreakable: true,
		margin: [0, 0, 0, base * 0.15]
	};
}

function prepare(doc: IpsDocument, ctx: FormatContext): PreparedSection[] {
	return doc.sections
		.filter((s) => s.key !== 'alerts' && s.key !== 'allergies')
		.map((section) => {
			const models = section.state === 'known' ? sectionModels(section, doc, ctx) : [];
			const flat: EntryModel[] = models.flatMap((m): EntryModel[] =>
				m.kind === 'report' ? [m, ...m.results] : [m]
			);
			const mustShow =
				section.key === 'medications'
					? flat.filter((m) => m.kind === 'medication' && (m as MedicationModel).current)
					: [];
			const others = flat
				.filter((m) => !mustShow.includes(m))
				.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
			return {
				section,
				title: ctx.t(`sections.${section.key}.title`),
				models: flat,
				mustShow,
				others
			};
		})
		.sort((a, b) => pdfPriority(a.section.key) - pdfPriority(b.section.key));
}

/** The pdfmake document for one plan. `pageCount` is filled in during layout. */
function definition(
	doc: IpsDocument,
	ctx: FormatContext,
	prepared: PreparedSection[],
	plan: Plan,
	options: PdfOptions,
	font: string,
	measured: { pageCount: number; continued: boolean }
): DocDefinition {
	const { t, locale } = ctx;
	const base = plan.fontSize;
	const now = options.now ?? new Date();
	const patient = patientSummary(doc, ctx, now);
	const meta = documentSummary(doc, ctx);
	const notStated = t('patient.notStated');

	const identity: Content = {
		table: {
			widths: ['*'],
			body: [
				[
					{
						stack: [
							{ text: patient.name ?? notStated, bold: true, fontSize: base + 5 },
							{
								text: [
									{ text: `${t('patient.birthDate')}: `, bold: true },
									patient.birthDateLabel
										? `${patient.birthDateLabel}${patient.ageLabel ? ` (${patient.ageLabel})` : ''}`
										: notStated,
									'    ',
									{ text: `${t('patient.gender')}: `, bold: true },
									patient.genderLabel ?? notStated,
									'    ',
									{ text: `${t('patient.identifiers')}: `, bold: true },
									patient.identifiers[0]
										? `${patient.identifiers[0].value}${patient.identifiers[0].system ? ` (${patient.identifiers[0].type ?? patient.identifiers[0].system})` : ''}`
										: notStated
								]
							},
							...(patient.deceasedLabel ? [{ text: patient.deceasedLabel, bold: true }] : [])
						],
						fillColor: '#e6f2f1',
						margin: [6, 5, 6, 5]
					}
				]
			]
		},
		layout: 'noBorders',
		margin: [0, 0, 0, base * 0.6]
	};

	// Alerts and allergies: never trimmed (spec §8).
	const danger: Content[] = [
		{ text: t('summary.alertsAndAllergies'), bold: true, fontSize: base + 1, margin: [0, 0, 0, 2] }
	];
	for (const key of MUST_SHOW) {
		const section = doc.sections.find((s) => s.key === key);
		if (!section) continue;
		const models = section.state === 'known' ? sectionModels(section, doc, ctx) : [];
		danger.push({ text: t(`sections.${key}.title`), bold: true, margin: [0, 2, 0, 1] });
		if (models.length === 0) danger.push({ text: stateLabel(section, t), italics: true });
		else for (const m of models) danger.push(itemLine(m, base));
	}
	const dangerBox: Content = {
		table: { widths: ['*'], body: [[{ stack: danger, margin: [6, 4, 6, 4] }]] },
		layout: {
			hLineWidth: () => 1.5,
			vLineWidth: () => 1.5,
			hLineColor: () => '#b42318',
			vLineColor: () => '#b42318'
		},
		margin: [0, 0, 0, base * 0.6]
	};

	const body: Content[] = [];
	const notShown: string[] = [];
	for (const p of prepared) {
		const cap = plan.caps.get(p.section.key);
		body.push({ text: p.title, bold: true, fontSize: base + 1, margin: [0, base * 0.4, 0, 1] });
		if (p.models.length === 0) {
			body.push({ text: stateLabel(p.section, t), italics: true });
			continue;
		}
		if (cap === 'omit') {
			body.push({ text: t('summary.sectionNotShown'), italics: true });
			notShown.push(p.title);
			continue;
		}
		const shown = cap === undefined ? p.others : p.others.slice(0, cap);
		for (const m of [...p.mustShow, ...shown]) body.push(itemLine(m, base));
		const hidden = p.others.length - shown.length;
		if (hidden > 0) {
			body.push({ text: t('summary.moreNotShown', { count: hidden }), italics: true });
			notShown.push(p.title);
		}
	}
	if (notShown.length)
		body.push({
			text: t('summary.notShown', { sections: notShown.join(', ') }),
			bold: true,
			margin: [0, base * 0.6, 0, 0]
		});

	const generated = new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(now);
	const footerLine = [
		t('summary.generatedAt', { date: generated }),
		meta.dateLabel ? t('summary.sourceDate', { date: meta.dateLabel }) : undefined,
		`${t('document.version')}: ${meta.versionLabel}`,
		t('summary.notMedicalDevice')
	]
		.filter(Boolean)
		.join(' · ');

	return {
		pageSize: paperFor(locale, options.paper),
		pageMargins: [28, measured.continued ? 34 : 26, 28, 40],
		info: {
			title: options.title,
			subject: options.title,
			creator: 'International Patient Summary viewer',
			producer: 'pdfmake'
		},
		language: locale,
		defaultStyle: { font, fontSize: base, lineHeight: 1.12 },
		header: measured.continued
			? () => ({
					text: t('summary.continued'),
					bold: true,
					alignment: 'center',
					margin: [28, 12, 28, 0],
					color: '#b42318'
				})
			: undefined,
		footer: (currentPage: number, pageCount: number) => {
			measured.pageCount = Math.max(measured.pageCount, pageCount);
			return {
				columns: [
					{ text: footerLine, fontSize: 7 },
					{
						text: t('summary.pageOf', { page: currentPage, count: pageCount }),
						fontSize: 7,
						alignment: 'right',
						width: 'auto'
					}
				],
				margin: [28, 10, 28, 0]
			};
		},
		content: [identity, dangerBox, ...body]
	};
}

/** Strip Unicode bidi isolates that MF2 places around placeholders; fonts lack them. */
function stripIsolates(node: Content): Content {
	if (typeof node === 'string') return node.replace(/[\u2066-\u2069]/g, '');
	if (Array.isArray(node)) return node.map(stripIsolates);
	if (node && typeof node === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(node))
			out[k] =
				typeof v === 'function' ? wrapFn(v as (...a: unknown[]) => unknown) : stripIsolates(v);
		return out;
	}
	return node;
}
function wrapFn(fn: (...a: unknown[]) => unknown) {
	return (...args: unknown[]) => stripIsolates(fn(...args));
}

/** The order in which plans are tried: shrink, then trim, then omit. */
export function* plans(prepared: PreparedSection[]): Generator<Plan> {
	for (const fontSize of FONT_SIZES) yield { fontSize, caps: new Map() };
	const floor = FONT_SIZES[FONT_SIZES.length - 1];
	const caps = new Map<SectionKey, number | 'omit'>();
	// Lowest priority first; only sections that have something to trim.
	const trimmable = [...prepared]
		.filter((p) => p.others.length > 0)
		.sort((a, b) => pdfPriority(b.section.key) - pdfPriority(a.section.key));
	for (const limit of [3, 1]) {
		for (const p of trimmable) {
			if (p.others.length <= limit) continue;
			caps.set(p.section.key, limit);
			yield { fontSize: floor, caps: new Map(caps) };
		}
	}
	for (const p of trimmable) {
		// Current medicines are must-show, so a medication section is never omitted while it has any.
		if (p.mustShow.length > 0) {
			caps.set(p.section.key, 0);
		} else caps.set(p.section.key, 'omit');
		yield { fontSize: floor, caps: new Map(caps) };
	}
}

async function measure(
	deps: PdfDeps,
	def: DocDefinition,
	measured: { pageCount: number }
): Promise<number> {
	measured.pageCount = 0;
	const out = deps.pdfMake.createPdf(def);
	const stream = await out.getStream();
	try {
		stream.end?.();
	} catch {
		// The stream is only needed for its layout.
	}
	return measured.pageCount;
}

export async function exportPdf(
	doc: IpsDocument,
	ctx: FormatContext,
	options: PdfOptions,
	deps: PdfDeps
): Promise<PdfResult> {
	const prepared = prepare(doc, ctx);
	const measured = { pageCount: 0, continued: false };

	// Fonts: Noto Sans always; Noto Sans SC only when the content has CJK text.
	const probe = definition(
		doc,
		ctx,
		prepared,
		{ fontSize: FONT_SIZES[0], caps: new Map() },
		options,
		'NotoSans',
		measured
	);
	const cjk =
		containsCjk(textsOf(probe.content)) ||
		containsCjk([
			ctx.t('summary.notMedicalDevice'),
			ctx.t('summary.pageOf', { page: 1, count: 1 })
		]);
	const files = cjk ? ['NotoSansSC-Regular.otf'] : ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf'];
	const vfs: Record<string, string> = {};
	for (const file of files) vfs[file] = await deps.loadFont(file);
	deps.pdfMake.addVirtualFileSystem(vfs);
	deps.pdfMake.fonts = cjk
		? {
				NotoSansSC: {
					normal: 'NotoSansSC-Regular.otf',
					bold: 'NotoSansSC-Regular.otf',
					italics: 'NotoSansSC-Regular.otf',
					bolditalics: 'NotoSansSC-Regular.otf'
				}
			}
		: {
				NotoSans: {
					normal: 'NotoSans-Regular.ttf',
					bold: 'NotoSans-Bold.ttf',
					italics: 'NotoSans-Regular.ttf',
					bolditalics: 'NotoSans-Bold.ttf'
				}
			};
	const font = cjk ? 'NotoSansSC' : 'NotoSans';
	const build = (plan: Plan) =>
		stripIsolates(definition(doc, ctx, prepared, plan, options, font, measured)) as DocDefinition;

	let chosen: Plan | undefined;
	let last: Plan = { fontSize: FONT_SIZES[0], caps: new Map() };
	for (const plan of plans(prepared)) {
		last = plan;
		const def = build(plan);
		// The footer callback writes into `measured`; the stripped copy wraps it.
		if ((await measure(deps, def, measured)) <= 1) {
			chosen = plan;
			break;
		}
	}
	let overflow = false;
	if (!chosen) {
		overflow = true;
		measured.continued = true;
		chosen = last;
	}
	const def = build(chosen);
	measured.pageCount = 0;
	const bytes = new Uint8Array(await deps.pdfMake.createPdf(def).getBuffer());
	// In the order the PDF prints them on its "Not shown on this page" line.
	const caps = chosen.caps;
	const notShown = prepared
		.filter((p) => {
			const cap = caps.get(p.section.key);
			return p.models.length > 0 && cap !== undefined && (cap === 'omit' || p.others.length > cap);
		})
		.map((p) => p.section.key);
	return {
		bytes,
		pageCount: measured.pageCount,
		overflow,
		notShown,
		fontSize: chosen.fontSize,
		cjk
	};
}

/** The browser dependencies: pdfmake's browser build and the app's own font files. */
export async function browserPdfDeps(fontBaseUrl: string): Promise<PdfDeps> {
	const module = await import('pdfmake/build/pdfmake.js');
	const pdfMake = ((module as any).default ?? module) as PdfDeps['pdfMake'];
	return {
		pdfMake,
		async loadFont(file) {
			const response = await fetch(`${fontBaseUrl}${file}`);
			if (!response.ok) throw new Error(`font ${file}: HTTP ${response.status}`);
			const bytes = new Uint8Array(await response.arrayBuffer());
			let binary = '';
			for (let i = 0; i < bytes.length; i += 0x8000)
				binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			return btoa(binary);
		}
	};
}
