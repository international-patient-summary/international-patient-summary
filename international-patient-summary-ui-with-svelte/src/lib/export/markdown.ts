// Markdown export (spec F-EXP-2, tasks.md P6-T4): a readable clinical
// summary in GitHub-flavoured Markdown. Every section is included, in
// Composition order, with the three required sections always present and
// absent states in words. Clinical text is escaped so it cannot break a
// table or inject HTML; narrative XHTML becomes plain text, never HTML.
import { codesText } from '../fhir/format.ts';
import { sectionModels, stateLabel, type EntryModel, type Field } from '../fhir/models.ts';
import { narrativeToText } from '../fhir/narrative.ts';
import { documentSummary, patientSummary } from '../fhir/summary.ts';
import type { FormatContext, IpsDocument } from '../fhir/types.ts';

export interface MarkdownOptions {
	includeNarrative?: boolean;
	includeCodes?: boolean;
	/** When the export was made; defaults to now. */
	now?: Date;
}

/** Escape Markdown and HTML metacharacters in inline text. */
export function escapeMarkdown(text: string): string {
	return (
		text
			.replace(/\r?\n/g, ' ')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/[\\`*_{}[\]#|~>]/g, (c) => `\\${c}`)
			.trim()
			// A list or heading marker only matters at the start of a line.
			.replace(/^([-+]|\d+\.)(\s)/, '\\$1$2')
	);
}

function cell(text: string): string {
	return escapeMarkdown(text) || ' ';
}

function table(
	rows: Field[][],
	models: EntryModel[],
	ctx: FormatContext,
	includeCodes: boolean
): string[] {
	const keys: string[] = [];
	const labels = new Map<string, string>();
	for (const row of rows)
		for (const f of row)
			if (!labels.has(f.key)) {
				keys.push(f.key);
				labels.set(f.key, f.label);
			}
	if (includeCodes) {
		keys.push('__codes');
		labels.set('__codes', ctx.t('summary.codes'));
	}
	if (keys.length === 1 && !includeCodes)
		return rows.map((r) => `- ${escapeMarkdown(r[0]?.value ?? '')}`);
	const lines = [
		`| ${keys.map((k) => cell(labels.get(k) ?? k)).join(' | ')} |`,
		`| ${keys.map(() => '---').join(' | ')} |`
	];
	rows.forEach((row, i) => {
		const byKey = new Map(row.map((f) => [f.key, f.value]));
		if (includeCodes) byKey.set('__codes', codesText(models[i].codes));
		lines.push(`| ${keys.map((k) => cell(byKey.get(k) ?? '')).join(' | ')} |`);
	});
	return lines;
}

/** The rows for one model; a report contributes itself and then its results. */
function rowsOf(m: EntryModel): { fields: Field[]; model: EntryModel }[] {
	if (m.kind === 'report')
		return [
			{ fields: m.fields, model: m },
			...m.results.map((r) => ({ fields: r.fields, model: r as EntryModel }))
		];
	return [{ fields: m.fields, model: m }];
}

export function exportMarkdown(
	doc: IpsDocument,
	ctx: FormatContext,
	options: MarkdownOptions = {}
): string {
	const { t, locale } = ctx;
	const now = options.now ?? new Date();
	const patient = patientSummary(doc, ctx, now);
	const meta = documentSummary(doc, ctx);
	const out: string[] = [];

	out.push(`# ${escapeMarkdown(meta.title ?? t('viewer.documentHeading'))}`, '');

	out.push(`## ${escapeMarkdown(t('summary.patient'))}`, '');
	const notStated = t('patient.notStated');
	const dob = patient.birthDateLabel
		? patient.ageLabel
			? `${patient.birthDateLabel} (${patient.ageLabel})`
			: patient.birthDateLabel
		: notStated;
	out.push(
		`- **${escapeMarkdown(t('patient.name'))}:** ${escapeMarkdown(patient.name ?? notStated)}`
	);
	if (patient.deceasedLabel) out.push(`- **${escapeMarkdown(patient.deceasedLabel)}**`);
	out.push(`- **${escapeMarkdown(t('patient.birthDate'))}:** ${escapeMarkdown(dob)}`);
	out.push(
		`- **${escapeMarkdown(t('patient.gender'))}:** ${escapeMarkdown(patient.genderLabel ?? notStated)}`
	);
	const ids = patient.identifiers.map((i) =>
		i.system ? `${i.value} (${i.type ?? i.system})` : i.value
	);
	out.push(
		`- **${escapeMarkdown(t('patient.identifiers'))}:** ${escapeMarkdown(ids.length ? ids.join('; ') : notStated)}`
	);
	out.push('');

	out.push(`## ${escapeMarkdown(t('document.heading'))}`, '');
	const metaRows: [string, string | undefined][] = [
		[t('document.date'), meta.dateLabel],
		[t('document.authors'), meta.authors.join('; ') || undefined],
		[t('document.custodian'), meta.custodian],
		[t('document.attesters'), meta.attesters.join('; ') || undefined],
		[t('document.confidentiality'), meta.confidentialityLabel],
		[t('document.language'), meta.languageLabel],
		[t('document.version'), meta.versionLabel]
	];
	for (const [label, value] of metaRows)
		if (value) out.push(`- **${escapeMarkdown(label)}:** ${escapeMarkdown(value)}`);
	out.push('');

	for (const section of doc.sections) {
		out.push(`## ${escapeMarkdown(t(`sections.${section.key}.title`))}`, '');
		const models = section.state === 'known' ? sectionModels(section, doc, ctx) : [];
		if (models.length === 0) {
			out.push(`*${escapeMarkdown(stateLabel(section, t))}*`, '');
		} else {
			const rows = models.flatMap(rowsOf);
			out.push(
				...table(
					rows.map((r) => r.fields),
					rows.map((r) => r.model),
					ctx,
					!!options.includeCodes
				),
				''
			);
		}
		if (section.unresolved.length > 0)
			out.push(
				`> ${escapeMarkdown(t('viewer.unresolvedInline', { count: section.unresolved.length }))}`,
				''
			);
		if (options.includeNarrative && section.narrative) {
			const text = narrativeToText(section.narrative);
			if (text) {
				out.push(`**${escapeMarkdown(t('summary.narrative'))}:**`, '');
				for (const line of text.split('\n')) out.push(`> ${escapeMarkdown(line)}`);
				out.push('');
			}
		}
	}

	const generated = new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(now);
	out.push('---', '');
	out.push(`- ${escapeMarkdown(t('summary.generatedAt', { date: generated }))}`);
	if (meta.dateLabel)
		out.push(
			`- ${escapeMarkdown(
				meta.identifier
					? t('summary.sourceDocument', { identifier: meta.identifier, date: meta.dateLabel })
					: t('summary.sourceDate', { date: meta.dateLabel })
			)}`
		);
	out.push(`- ${escapeMarkdown(`${t('document.version')}: ${meta.versionLabel}`)}`);
	out.push(`- **${escapeMarkdown(t('summary.notMedicalDevice'))}**`, '');
	// MF2 wraps placeholders in invisible bidi isolates; a text file needs none.
	return out.join('\n').replace(/[\u2066-\u2069]/g, '');
}

export function markdownBlob(
	doc: IpsDocument,
	ctx: FormatContext,
	options: MarkdownOptions = {}
): Blob {
	return new Blob([exportMarkdown(doc, ctx, options)], { type: 'text/markdown' });
}
