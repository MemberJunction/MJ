import { describe, it, expect } from 'vitest';
import { ParseChartSpec, ChartColorAt, ChartPalette } from '@/components/charts/chart-spec';
import { Colors } from '@/theme/tokens';

describe('chart-spec', () => {
    describe('ParseChartSpec — rejects non-chart shapes', () => {
        it('returns null for non-objects', () => {
            expect(ParseChartSpec(null)).toBeNull();
            expect(ParseChartSpec(undefined)).toBeNull();
            expect(ParseChartSpec('bar')).toBeNull();
            expect(ParseChartSpec(42)).toBeNull();
        });

        it('returns null for arrays (not a record)', () => {
            expect(ParseChartSpec([{ label: 'A', value: 1 }])).toBeNull();
        });

        it('returns null when there is no chart-type hint and no series field', () => {
            // Ordinary JSON object with data but no discriminator.
            expect(ParseChartSpec({ data: [{ label: 'A', value: 1 }] })).toBeNull();
        });

        it('returns null when a chart type is present but no data resolves', () => {
            expect(ParseChartSpec({ chartType: 'bar', data: [] })).toBeNull();
            expect(ParseChartSpec({ chartType: 'bar' })).toBeNull();
        });

        it('returns null when all values are non-numeric garbage', () => {
            expect(
                ParseChartSpec({ chartType: 'bar', data: [{ label: 'A', value: 'nope' }] }),
            ).toBeNull();
        });
    });

    describe('ParseChartSpec — kind normalization', () => {
        it('maps bar-family hints to "bar"', () => {
            for (const t of ['bar', 'column', 'histogram', 'BAR', ' Column ']) {
                const spec = ParseChartSpec({ chartType: t, data: [{ label: 'A', value: 1 }] });
                expect(spec?.Kind).toBe('bar');
            }
        });

        it('maps line-family hints to "line"', () => {
            for (const t of ['line', 'area', 'spline']) {
                const spec = ParseChartSpec({ type: t, data: [{ label: 'A', value: 1 }] });
                expect(spec?.Kind).toBe('line');
            }
        });

        it('maps pie-family hints to "pie"', () => {
            for (const t of ['pie', 'donut', 'doughnut']) {
                const spec = ParseChartSpec({ chart: t, data: [{ label: 'A', value: 1 }] });
                expect(spec?.Kind).toBe('pie');
            }
        });

        it('reads the type discriminator from any of the common field names', () => {
            expect(ParseChartSpec({ kind: 'pie', data: [{ label: 'A', value: 1 }] })?.Kind).toBe('pie');
        });

        it('defaults to "bar" when only a series field is present (no explicit kind)', () => {
            const spec = ParseChartSpec({ series: [1, 2], labels: ['a', 'b'] });
            expect(spec?.Kind).toBe('bar');
            expect(spec?.Data).toHaveLength(2);
        });
    });

    describe('ParseChartSpec — {label,value} object rows', () => {
        it('parses canonical label/value rows', () => {
            const spec = ParseChartSpec({
                chartType: 'bar',
                data: [
                    { label: 'A', value: 1 },
                    { label: 'B', value: 2 },
                ],
            });
            expect(spec?.Data).toEqual([
                { label: 'A', value: 1 },
                { label: 'B', value: 2 },
            ]);
        });

        it('accepts alternate label keys (name/x/category) and value keys (y/count/amount)', () => {
            const spec = ParseChartSpec({
                chartType: 'pie',
                data: [
                    { name: 'A', count: 3 },
                    { x: 'B', y: 4 },
                    { category: 'C', amount: 5 },
                ],
            });
            expect(spec?.Data).toEqual([
                { label: 'A', value: 3 },
                { label: 'B', value: 4 },
                { label: 'C', value: 5 },
            ]);
        });

        it('coerces numeric strings and synthesizes a label when missing', () => {
            const spec = ParseChartSpec({ chartType: 'bar', data: [{ value: '3.5' }] });
            expect(spec?.Data).toEqual([{ label: '#1', value: 3.5 }]);
        });

        it('skips rows whose value cannot be coerced to a finite number', () => {
            const spec = ParseChartSpec({
                chartType: 'bar',
                data: [
                    { label: 'A', value: 1 },
                    { label: 'B', value: 'x' },
                    { label: 'C', value: 3 },
                ],
            });
            expect(spec?.Data).toEqual([
                { label: 'A', value: 1 },
                { label: 'C', value: 3 },
            ]);
        });
    });

    describe('ParseChartSpec — Chart.js style (labels + datasets/series)', () => {
        it('zips a datasets[0].data array against a parallel labels array', () => {
            const spec = ParseChartSpec({
                type: 'bar',
                labels: ['A', 'B', 'C'],
                datasets: [{ data: [10, 20, 30] }],
            });
            expect(spec?.Data).toEqual([
                { label: 'A', value: 10 },
                { label: 'B', value: 20 },
                { label: 'C', value: 30 },
            ]);
        });

        it('treats a bare series of {label,value} objects as data', () => {
            const spec = ParseChartSpec({
                type: 'bar',
                series: [
                    { label: 'X', value: 5 },
                    { label: 'Y', value: 6 },
                ],
            });
            expect(spec?.Data).toEqual([
                { label: 'X', value: 5 },
                { label: 'Y', value: 6 },
            ]);
        });

        it('zips a flat numeric series against labels', () => {
            const spec = ParseChartSpec({ type: 'line', series: [1, 2, 3], labels: ['a', 'b', 'c'] });
            expect(spec?.Data).toEqual([
                { label: 'a', value: 1 },
                { label: 'b', value: 2 },
                { label: 'c', value: 3 },
            ]);
        });

        it('falls back to synthetic labels when labels are shorter than values', () => {
            const spec = ParseChartSpec({ type: 'bar', values: [1, 2] });
            expect(spec?.Data).toEqual([
                { label: '#1', value: 1 },
                { label: '#2', value: 2 },
            ]);
        });
    });

    describe('ParseChartSpec — title handling', () => {
        it('captures a string title', () => {
            const spec = ParseChartSpec({ chartType: 'bar', title: 'Revenue', data: [{ label: 'A', value: 1 }] });
            expect(spec?.title).toBe('Revenue');
        });

        it('ignores non-string titles', () => {
            const spec = ParseChartSpec({ chartType: 'bar', title: 123, data: [{ label: 'A', value: 1 }] });
            expect(spec?.title).toBeUndefined();
        });
    });

    describe('ChartColorAt / ChartPalette', () => {
        it('exposes a non-empty palette of brand + agent colors', () => {
            expect(ChartPalette.length).toBeGreaterThan(0);
            expect(ChartPalette[0]).toBe(Colors.brand);
        });

        it('returns the palette color at an in-range index', () => {
            expect(ChartColorAt(0)).toBe(ChartPalette[0]);
            expect(ChartColorAt(1)).toBe(ChartPalette[1]);
        });

        it('wraps around past the end of the palette', () => {
            expect(ChartColorAt(ChartPalette.length)).toBe(ChartPalette[0]);
            expect(ChartColorAt(ChartPalette.length + 1)).toBe(ChartPalette[1]);
        });
    });
});
