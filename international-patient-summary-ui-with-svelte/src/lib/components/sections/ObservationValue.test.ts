import { render } from '@testing-library/svelte';
import { locale, waitLocale } from '@sveltia/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import ObservationValue from './ObservationValue.svelte';
import type { ObservationModel } from '#lib/fhir/models.ts';
import { setupI18n } from '../../i18n.ts';

beforeAll(async () => {
	setupI18n();
	await locale.set('en-US');
	await waitLocale();
});

const observation = (over: Partial<ObservationModel> = {}): ObservationModel =>
	({
		kind: 'observation',
		id: 'o',
		title: 'Heart rate',
		value: '72',
		unit: 'bpm',
		status: 'final',
		components: [],
		...over
	}) as ObservationModel;

const words = (container: HTMLElement) =>
	(container.textContent ?? '').replace(/[⁦-⁩]/g, '').replace(/\s+/g, ' ');

describe('ObservationValue', () => {
	it('shows a final value with its unit and reference range, and a meter when it has one', () => {
		const { container } = render(ObservationValue, {
			model: observation({
				range: '60–100',
				meter: { value: 72, min: 0, max: 200, low: 60, high: 100 }
			})
		});
		expect(words(container)).toContain('72');
		expect(words(container)).toContain('bpm');
		expect(words(container)).toContain('60–100');
		expect(container.querySelector('meter')).not.toBeNull();
	});

	it('says in words a status that is not final, with the supplied label or its own', () => {
		const supplied = render(ObservationValue, {
			model: observation({ status: 'preliminary', statusLabel: 'Provisional' })
		});
		expect(words(supplied.container)).toContain('Provisional');
		supplied.unmount();
		const own = render(ObservationValue, { model: observation({ status: 'amended' }) });
		expect(words(own.container)).toContain('Amended');
	});

	it('lists the parts of a panel, each with its own range, status and meter', () => {
		const part = (over: Partial<ObservationModel>) => observation({ components: [], ...over });
		const { container } = render(ObservationValue, {
			model: observation({
				value: '',
				components: [
					part({
						id: 'sys',
						title: 'Systolic',
						value: '120',
						unit: 'mmHg',
						range: '90–130',
						meter: { value: 120, min: 0, max: 250, low: 90, high: 130 }
					}),
					part({ id: 'dia', title: 'Diastolic', value: '80', status: 'preliminary' }),
					part({
						id: 'map',
						title: 'Mean',
						value: '93',
						status: 'amended',
						statusLabel: 'Corrected'
					})
				]
			})
		});
		const text = words(container);
		for (const expected of ['Systolic', '120', '90–130', 'Diastolic', 'Preliminary', 'Corrected']) {
			expect(text).toContain(expected);
		}
		expect(container.querySelectorAll('li')).toHaveLength(3);
	});

	it('leaves out an empty final main value when the panel has parts', () => {
		const { container } = render(ObservationValue, {
			model: observation({
				value: '',
				components: [observation({ id: 'p', title: 'Part', value: '1' })]
			})
		});
		expect(container.querySelectorAll('li')).toHaveLength(1);
		expect(words(container)).not.toContain('Heart rate');
	});
});
