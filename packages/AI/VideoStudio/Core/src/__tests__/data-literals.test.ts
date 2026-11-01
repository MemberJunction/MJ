import { describe, expect, it } from 'vitest';
import {
    AS_OF_DATA_KEY,
    BuildBoundDataLiterals,
    BuildDataCheckInputs,
    BuildRenderDataSnapshot,
    CreateMJChartKit,
    ExtractNumericLiteralTokens,
    FormatAsOfCardText,
    FormatTableCell,
} from '../index.js';
import type {
    ChartKitPoint,
    DataDeltaValue,
    DataSeriesPoint,
    DataSeriesValue,
    DataTableValue,
    VideoBeat,
    VideoDataBinding,
} from '../index.js';

describe('VS-DAT-3: data-literals helpers', () => {
    describe('FormatAsOfCardText', () => {
        it('normalizes ISO-8601 timestamps, YYYY-MM-DD strings, and Date instances to "Data as of YYYY-MM-DD" with no numeric literal tokens', () => {
            const oct1Card = FormatAsOfCardText('2026-10-01T23:30:00.000Z');
            expect(oct1Card).toBe('Data as of 2026-10-01');
            expect(ExtractNumericLiteralTokens(oct1Card)).toEqual([]);

            expect(FormatAsOfCardText('2026-10-16T14:22:00Z')).toBe('Data as of 2026-10-16');
            expect(FormatAsOfCardText('2026-10-16')).toBe('Data as of 2026-10-16');
            expect(FormatAsOfCardText(new Date('2026-10-16T00:00:00Z'))).toBe('Data as of 2026-10-16');
        });

        it('throws on empty, non-date, or invalid calendar dates', () => {
            expect(() => FormatAsOfCardText('')).toThrow();
            expect(() => FormatAsOfCardText('   ')).toThrow();
            expect(() => FormatAsOfCardText('not-a-date')).toThrow();
            expect(() => FormatAsOfCardText('2026-02-30')).toThrow();
            expect(() => FormatAsOfCardText('2026-02-30T10:00:00Z')).toThrow();
            expect(() => FormatAsOfCardText(new Date('invalid'))).toThrow();
        });
    });

    describe('BuildRenderDataSnapshot', () => {
        it('clones values without mutation and injects __asOf', () => {
            const rawValues: Record<string, unknown> = {
                'kpi.arr': 14_200_000,
                'kpi.customers': 3_400,
            };
            const snapshot = BuildRenderDataSnapshot(rawValues, '2026-10-16T14:22:00Z');

            expect(snapshot).not.toBe(rawValues);
            expect(rawValues[AS_OF_DATA_KEY]).toBeUndefined();
            expect(snapshot).toEqual({
                'kpi.arr': 14_200_000,
                'kpi.customers': 3_400,
                __asOf: 'Data as of 2026-10-16',
            });
        });

        it('rejects a user binding map that already defines __asOf', () => {
            expect(() =>
                BuildRenderDataSnapshot({ __asOf: 'custom' }, '2026-10-16T00:00:00Z'),
            ).toThrow(/reserved/i);
        });
    });

    describe('BuildBoundDataLiterals', () => {
        const kit = CreateMJChartKit();

        it('formats Scalar, Series, Table, and Delta (including + variants, ChangePercent as Percent regardless of binding Decimals, and skipped unbound keys) identically to MJChartKit.FormatValue', () => {
            const seriesPoints: DataSeriesValue = [
                { Label: 'Q1', Value: 10_500_000 },
                { Label: 'Q2', Value: 14_200_000 },
            ];
            // DataSeriesPoint is identical to ChartKitPoint
            const chartPoints: ChartKitPoint[] = seriesPoints;
            const singlePoint: DataSeriesPoint = chartPoints[0]!;
            expect(singlePoint.Label).toBe('Q1');

            const deltaValue: DataDeltaValue = {
                Current: 1_250,
                Previous: 1_100,
                Change: 150,
                ChangePercent: 0.12,
            };

            const bindings: VideoDataBinding[] = [
                {
                    Key: 'kpi.arr',
                    Source: { Kind: 'Query', QueryID: 'q-arr' },
                    Shape: 'Scalar',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                },
                {
                    Key: 'kpi.cad',
                    Source: { Kind: 'Query', QueryID: 'q-cad' },
                    Shape: 'Scalar',
                    Format: { Kind: 'Currency', Currency: 'CAD', Decimals: 0 },
                },
                {
                    Key: 'series.quarterly',
                    Source: { Kind: 'Query', QueryID: 'q-quarterly' },
                    Shape: 'Series',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                },
                {
                    Key: 'delta.arr',
                    Source: { Kind: 'Query', QueryID: 'q-delta' },
                    Shape: 'Delta',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 0 },
                },
            ];

            const bound = BuildBoundDataLiterals(bindings, {
                'kpi.arr': 14_200_000,
                'kpi.cad': 1_250,
                'series.quarterly': seriesPoints,
                'delta.arr': deltaValue,
                'unbound.extraKey': 999_999,
            });

            expect(bound['unbound.extraKey']).toBeUndefined();
            expect(Object.keys(bound)).toEqual([
                'kpi.arr',
                'kpi.cad',
                'series.quarterly',
                'delta.arr',
            ]);

            expect(bound['kpi.arr']).toEqual([
                kit.FormatValue(14_200_000, { Kind: 'Currency', Currency: 'USD', Decimals: 1 }),
            ]);
            expect(bound['kpi.arr']).toEqual(['$14.2M']);

            // Non-symbol currency (CAD) keeps both the full formatted string and its extracted numeric token
            expect(bound['kpi.cad']).toEqual(['CAD 1,250', '1,250']);

            expect(bound['series.quarterly']).toEqual(['$10.5M', '$14.2M']);

            // Delta binding with Decimals: 0 still formats ChangePercent (0.12) as default Percent ('12.0%' and '+12.0%')
            expect(bound['delta.arr']).toEqual([
                '$1,250',
                '+$1,250',
                '$1,100',
                '+$1,100',
                '$150',
                '+$150',
                '12.0%',
                '+12.0%',
            ]);
        });

        it('formats Table bindings with per-column Format (Currency + Percent) via FormatTableCell', () => {
            const tableBinding: VideoDataBinding = {
                Key: 'table.segments',
                Source: { Kind: 'View', EntityName: 'Segments', Fields: ['Segment', 'ARR', 'Growth'] },
                Shape: 'Table',
                Columns: [
                    { Header: 'Segment' },
                    { Header: 'ARR', Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 } },
                    { Header: 'Growth', Format: { Kind: 'Percent', Decimals: 1 } },
                ],
            };

            const rows: DataTableValue = [
                { Segment: 'Enterprise', ARR: 14_200_000, Growth: 0.284 },
                { Segment: 'Mid-Market', ARR: 5_800_000, Growth: 0.145 },
            ];

            const bound = BuildBoundDataLiterals([tableBinding], {
                'table.segments': rows,
            });

            expect(
                FormatTableCell(tableBinding.Columns?.[1], 14_200_000),
            ).toBe('$14.2M');
            expect(
                FormatTableCell(tableBinding.Columns?.[2], 0.284),
            ).toBe('28.4%');

            expect(bound['table.segments']).toEqual([
                '$14.2M',
                '28.4%',
                '$5.8M',
                '14.5%',
            ]);
        });

        it('supports 2D array rows on Table bindings and extracts numeric tokens from string leaves', () => {
            const tableBinding: VideoDataBinding = {
                Key: 'table.matrix',
                Source: { Kind: 'Inline' },
                Shape: 'Table',
                Columns: [
                    { Header: 'Region' },
                    { Header: 'Revenue', Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 } },
                    { Header: 'Share', Format: { Kind: 'Percent', Decimals: 0 } },
                ],
            };

            const bound = BuildBoundDataLiterals([tableBinding], {
                'table.matrix': [
                    ['AMER (top 3)', 9_400_000, 0.62],
                ],
            });

            expect(bound['table.matrix']).toEqual(['3', '$9.4M', '62%']);
        });

        it('rejects a user binding whose Key is __asOf', () => {
            const illegalBinding: VideoDataBinding = {
                Key: AS_OF_DATA_KEY,
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
            };
            expect(() => BuildBoundDataLiterals([illegalBinding], { __asOf: 1 })).toThrow(/reserved/i);
        });
    });

    describe('BuildDataCheckInputs', () => {
        const sampleBeats: VideoBeat[] = [
            {
                Key: 'beat-1',
                Label: 'Hook',
                StartSeconds: 0,
                EndSeconds: 3,
                EntryState: 'Blank',
                ExitState: 'KPI visible',
                Purpose: 'Hook',
                OnScreenText: ['{kpi.arr}'],
                DataRefs: ['kpi.arr'],
                AssetRefs: [],
                LayoutNotes: { '16:9': 'Centered' },
            },
            {
                Key: 'beat-2',
                Label: 'Close',
                StartSeconds: 3,
                EndSeconds: 6,
                EntryState: 'KPI visible',
                ExitState: 'As-of visible',
                Purpose: 'Close',
                OnScreenText: [],
                DataRefs: [],
                AssetRefs: [],
                LayoutNotes: { '16:9': 'Bottom right' },
            },
        ];

        it('computes midpoints, settle timestamps (EndSeconds - 1/fps), AllowedDataLiterals, and RequiredFinalFrameText when DataBindings is non-empty', () => {
            const inputs = BuildDataCheckInputs(
                {
                    DataBindings: [
                        {
                            Key: 'kpi.arr',
                            Source: { Kind: 'Inline' },
                            Shape: 'Scalar',
                            Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                        },
                    ],
                    DataSnapshot: {
                        AsOf: '2026-10-16T14:22:00Z',
                        Sources: ['inline:kpi.arr'],
                        Inline: { 'kpi.arr': 14_200_000 },
                    },
                    Beats: sampleBeats,
                    Render: {
                        Renderer: 'HyperFrames',
                        RendererVersion: '0.1.0',
                        Fps: 30,
                        Seed: 42,
                        Quality: 'standard',
                    },
                },
                { 'kpi.arr': 14_200_000 },
            );

            expect(inputs.AllowedDataLiterals).toEqual(['$14.2M']);
            expect(inputs.BoundDataLiterals).toEqual({ 'kpi.arr': ['$14.2M'] });
            expect(inputs.SampleTimestampsSeconds).toEqual([1.5, 4.5]);
            expect(inputs.SettleTimestampsSeconds).toHaveLength(2);
            expect(inputs.SettleTimestampsSeconds?.[0]).toBeCloseTo(3 - 1 / 30, 6);
            expect(inputs.SettleTimestampsSeconds?.[1]).toBeCloseTo(6 - 1 / 30, 6);
            expect(inputs.RequiredFinalFrameText).toEqual(['Data as of 2026-10-16']);
        });

        it('returns RequiredFinalFrameText: [] when DataBindings is non-empty but DataSnapshot is absent', () => {
            const inputs = BuildDataCheckInputs(
                {
                    DataBindings: [
                        {
                            Key: 'kpi.arr',
                            Source: { Kind: 'Inline' },
                            Shape: 'Scalar',
                            Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                        },
                    ],
                    DataSnapshot: undefined,
                    Beats: sampleBeats,
                    Render: {
                        Renderer: 'HyperFrames',
                        RendererVersion: '0.1.0',
                        Fps: 30,
                        Seed: 42,
                        Quality: 'standard',
                    },
                },
                { 'kpi.arr': 14_200_000 },
            );

            expect(inputs.AllowedDataLiterals).toEqual(['$14.2M']);
            expect(inputs.BoundDataLiterals).toEqual({ 'kpi.arr': ['$14.2M'] });
            expect(inputs.RequiredFinalFrameText).toEqual([]);
        });

        it('returns AllowedDataLiterals: [] and RequiredFinalFrameText: [] when DataBindings is empty', () => {
            const inputs = BuildDataCheckInputs(
                {
                    DataBindings: [],
                    DataSnapshot: undefined,
                    Beats: sampleBeats,
                    Render: {
                        Renderer: 'HyperFrames',
                        RendererVersion: '0.1.0',
                        Fps: 60,
                        Seed: 42,
                        Quality: 'standard',
                    },
                },
                {},
            );

            expect(inputs.AllowedDataLiterals).toEqual([]);
            expect(inputs.BoundDataLiterals).toEqual({});
            expect(inputs.SampleTimestampsSeconds).toEqual([1.5, 4.5]);
            expect(inputs.SettleTimestampsSeconds?.[0]).toBeCloseTo(3 - 1 / 60, 6);
            expect(inputs.SettleTimestampsSeconds?.[1]).toBeCloseTo(6 - 1 / 60, 6);
            expect(inputs.RequiredFinalFrameText).toEqual([]);
        });
    });
});
