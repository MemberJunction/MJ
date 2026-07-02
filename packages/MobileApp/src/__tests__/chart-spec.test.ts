import { describe, it, expect } from 'vitest';
import { parseChartSpec, chartColorAt, ChartPalette } from '@/components/charts/chart-spec';
import { Colors } from '@/theme/tokens';

describe('chart-spec', () => {
    describe('parseChartSpec — rejects non-chart shapes', () => {
        it('returns null for non-objects', () => {
            expect(parseChartSpec(null)).toBeNull();
            expect(parseChartSpec(undefined)).toBeNull();
            expect(parseChartSpec('bar')).toBeNull();
            expect(parseChartSpec(42)).toBeNull();
        });

        it('returns null for arrays (not a record)', () => {
            expect(parseChartSpec([{ label: 'A', value: 1 }])).toBeNull();
        });

        it('returns null when there is no chart-type hint and no series field', () => {
            // Ordinary JSON object with data but no discriminator.
            expect(parseChartSpec({ data: [{ label: 'A', value: 1 }] })).toBeNull();
        });

        it('returns null when a chart type is present but no data resolves', () => {
            expect(parseChartSpec({ chartType: 'bar', data: [] })).toBeNull();
            expect(parseChartSpec({ chartType: 'bar' })).toBeNull();
        });

        it('returns null when all values are non-numeric garbage', () => {
            expect(
                parseChartSpec({ chartType: 'bar', data: [{ label: 'A', value: 'nope' }] }),
            ).toBeNull();
        });
    });

    describe('parseChartSpec — kind normalization', () => {
        it('maps bar-family hints to "bar"', () => {
            for (const t of ['bar', 'column', 'histogram', 'BAR', ' Column ']) {
                const spec = parseChartSpec({ chartType: t, data: [{ label: 'A', value: 1 }] });
                expect(spec?.kind).toBe('bar');
            }
        });

        it('maps line-family hints to "line"', () => {
            for (const t of ['line', 'area', 'spline']) {
                const spec = parseChartSpec({ type: t, data: [{ label: 'A', value: 1 }] });
                expect(spec?.kind).toBe('line');
            }
        });

        it('maps pie-family hints to "pie"', () => {
            for (const t of ['pie', 'donut', 'doughnut']) {
                const spec = parseChartSpec({ chart: t, data: [{ label: 'A', value: 1 }] });
                expect(spec?.kind).toBe('pie');
            }
        });

        it('reads the type discriminator from any of the common field names', () => {
            expect(parseChartSpec({ kind: 'pie', data: [{ label: 'A', value: 1 }] })?.kind).toBe('pie');
        });

        it('defaults to "bar" when only a series field is present (no explicit kind)', () => {
            const spec = parseChartSpec({ series: [1, 2], labels: ['a', 'b'] });
            expect(spec?.kind).toBe('bar');
            expect(spec?.data).toHaveLength(2);
        });
    });

    describe('parseChartSpec — {label,value} object rows', () => {
        it('parses canonical label/value rows', () => {
            const spec = parseChartSpec({
                chartType: 'bar',
                data: [
                    { label: 'A', value: 1 },
                    { label: 'B', value: 2 },
                ],
            });
            expect(spec?.data).toEqual([
                { label: 'A', value: 1 },
                { label: 'B', value: 2 },
            ]);
        });

        it('accepts alternate label keys (name/x/category) and value keys (y/count/amount)', () => {
            const spec = parseChartSpec({
                chartType: 'pie',
                data: [
                    { name: 'A', count: 3 },
                    { x: 'B', y: 4 },
                    { category: 'C', amount: 5 },
                ],
            });
            expect(spec?.data).toEqual([
                { label: 'A', value: 3 },
                { label: 'B', value: 4 },
                { label: 'C', value: 5 },
            ]);
        });

        it('coerces numeric strings and synthesizes a label when missing', () => {
            const spec = parseChartSpec({ chartType: 'bar', data: [{ value: '3.5' }] });
            expect(spec?.data).toEqual([{ label: '#1', value: 3.5 }]);
        });

        it('skips rows whose value cannot be coerced to a finite number', () => {
            const spec = parseChartSpec({
                chartType: 'bar',
                data: [
                    { label: 'A', value: 1 },
                    { label: 'B', value: 'x' },
                    { label: 'C', value: 3 },
                ],
            });
            expect(spec?.data).toEqual([
                { label: 'A', value: 1 },
                { label: 'C', value: 3 },
            ]);
        });
    });

    describe('parseChartSpec — Chart.js style (labels + datasets/series)', () => {
        it('zips a datasets[0].data array against a parallel labels array', () => {
            const spec = parseChartSpec({
                type: 'bar',
                labels: ['A', 'B', 'C'],
                datasets: [{ data: [10, 20, 30] }],
            });
            expect(spec?.data).toEqual([
                { label: 'A', value: 10 },
                { label: 'B', value: 20 },
                { label: 'C', value: 30 },
            ]);
        });

        it('treats a bare series of {label,value} objects as data', () => {
            const spec = parseChartSpec({
                type: 'bar',
                series: [
                    { label: 'X', value: 5 },
                    { label: 'Y', value: 6 },
                ],
            });
            expect(spec?.data).toEqual([
                { label: 'X', value: 5 },
                { label: 'Y', value: 6 },
            ]);
        });

        it('zips a flat numeric series against labels', () => {
            const spec = parseChartSpec({ type: 'line', series: [1, 2, 3], labels: ['a', 'b', 'c'] });
            expect(spec?.data).toEqual([
                { label: 'a', value: 1 },
                { label: 'b', value: 2 },
                { label: 'c', value: 3 },
            ]);
        });

        it('falls back to synthetic labels when labels are shorter than values', () => {
            const spec = parseChartSpec({ type: 'bar', values: [1, 2] });
            expect(spec?.data).toEqual([
                { label: '#1', value: 1 },
                { label: '#2', value: 2 },
            ]);
        });
    });

    describe('parseChartSpec — title handling', () => {
        it('captures a string title', () => {
            const spec = parseChartSpec({ chartType: 'bar', title: 'Revenue', data: [{ label: 'A', value: 1 }] });
            expect(spec?.title).toBe('Revenue');
        });

        it('ignores non-string titles', () => {
            const spec = parseChartSpec({ chartType: 'bar', title: 123, data: [{ label: 'A', value: 1 }] });
            expect(spec?.title).toBeUndefined();
        });
    });

    describe('chartColorAt / ChartPalette', () => {
        it('exposes a non-empty palette of brand + agent colors', () => {
            expect(ChartPalette.length).toBeGreaterThan(0);
            expect(ChartPalette[0]).toBe(Colors.brand);
        });

        it('returns the palette color at an in-range index', () => {
            expect(chartColorAt(0)).toBe(ChartPalette[0]);
            expect(chartColorAt(1)).toBe(ChartPalette[1]);
        });

        it('wraps around past the end of the palette', () => {
            expect(chartColorAt(ChartPalette.length)).toBe(ChartPalette[0]);
            expect(chartColorAt(ChartPalette.length + 1)).toBe(ChartPalette[1]);
        });
    });
});
