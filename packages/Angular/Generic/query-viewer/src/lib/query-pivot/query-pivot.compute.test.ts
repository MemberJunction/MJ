import { describe, it, expect } from 'vitest';
import {
    AggregateValues,
    BucketTimestamp,
    ComputeDeltaPercent,
    ComputePivot,
    FormatDelta,
    FormatDuration,
    FormatMeasureValue
} from './query-pivot.compute';
import { QueryPivotConfig } from './query-pivot.types';

describe('query-pivot.compute', () => {
    describe('FormatMeasureValue', () => {
        it('renders null, undefined, or NaN as an em dash', () => {
            expect(FormatMeasureValue(null, 'currency')).toBe('—');
            expect(FormatMeasureValue(undefined, 'number')).toBe('—');
            expect(FormatMeasureValue(NaN, 'percent')).toBe('—');
        });

        it('formats currency with dollar sign, comma separators, and 2 decimals', () => {
            expect(FormatMeasureValue(1234.56, 'currency')).toBe('$1,234.56');
            expect(FormatMeasureValue(0, 'currency')).toBe('$0.00');
            expect(FormatMeasureValue(10, 'currency')).toBe('$10.00');
        });

        it('shows a real sub-cent amount as under a cent, never as $0.00', () => {
            expect(FormatMeasureValue(0.004, 'currency')).toBe('<$0.01');
            expect(FormatMeasureValue(0.004, 'currency', 'EUR')).toBe('<€0.01');
            expect(FormatMeasureValue(0.005, 'currency')).toBe('$0.01');
            expect(FormatMeasureValue(0, 'currency')).toBe('$0.00');
        });

        it('formats numbers with commas and appropriate decimal places', () => {
            expect(FormatMeasureValue(1000, 'number')).toBe('1,000');
            expect(FormatMeasureValue(1234.567, 'number')).toBe('1,234.57');
        });

        it('formats percentage with 1 decimal and % sign', () => {
            expect(FormatMeasureValue(12.34, 'percent')).toBe('12.3%');
            expect(FormatMeasureValue(0, 'percent')).toBe('0.0%');
        });

        it('formats duration into ms, s, and m s units', () => {
            expect(FormatDuration(450)).toBe('450ms');
            expect(FormatDuration(2500)).toBe('2.50s');
            expect(FormatDuration(125000)).toBe('2m 5s');
        });
    });

    describe('FormatDelta', () => {
        it('formats positive delta with + prefix and % sign', () => {
            expect(FormatDelta(15.23)).toBe('+15.2%');
        });

        it('formats negative delta with - sign', () => {
            expect(FormatDelta(-8.46)).toBe('-8.5%');
        });

        it('returns em dash for null or undefined delta', () => {
            expect(FormatDelta(null)).toBe('—');
            expect(FormatDelta(undefined)).toBe('—');
        });
    });

    describe('BucketTimestamp', () => {
        const ts = '2026-09-15T14:35:22.000Z';

        it('buckets into hour grain (YYYY-MM-DD HH:00)', () => {
            expect(BucketTimestamp(ts, 'hour')).toBe('2026-09-15 14:00');
        });

        it('buckets into day grain (YYYY-MM-DD)', () => {
            expect(BucketTimestamp(ts, 'day')).toBe('2026-09-15');
        });

        it('returns em dash for null or empty dates', () => {
            expect(BucketTimestamp(null, 'hour')).toBe('—');
            expect(BucketTimestamp('', 'day')).toBe('—');
        });
    });

    describe('AggregateValues', () => {
        const nums = [10, 20, 30];

        it('computes sum', () => {
            expect(AggregateValues(nums, 'sum')).toBe(60);
        });

        it('computes average', () => {
            expect(AggregateValues(nums, 'avg')).toBe(20);
        });

        it('computes min and max', () => {
            expect(AggregateValues(nums, 'min')).toBe(10);
            expect(AggregateValues(nums, 'max')).toBe(30);
        });

        it('computes count of non-null items', () => {
            expect(AggregateValues([10, null, 20, undefined, 30], 'count')).toBe(3);
        });

        it('returns null if all values are null or undefined', () => {
            expect(AggregateValues([null, undefined, null], 'sum')).toBeNull();
        });

        it('ignores null and undefined when aggregating valid numbers', () => {
            expect(AggregateValues([10, null, 20, undefined], 'sum')).toBe(30);
            expect(AggregateValues([10, null, 20, undefined], 'avg')).toBe(15);
        });
    });

    describe('ComputeDeltaPercent', () => {
        it('computes percentage delta correctly', () => {
            expect(ComputeDeltaPercent(150, 100)).toBe(50);
            expect(ComputeDeltaPercent(75, 100)).toBe(-25);
        });

        it('returns null if previous is zero or either value is null', () => {
            expect(ComputeDeltaPercent(100, 0)).toBeNull();
            expect(ComputeDeltaPercent(null, 100)).toBeNull();
            expect(ComputeDeltaPercent(100, null)).toBeNull();
        });
    });

    describe('ComputePivot', () => {
        const twelveRowFixture = [
            { Agent: 'SupportBot', Model: 'gpt-4o', Cost: 10.0, Tokens: 1000, Timestamp: '2026-09-15T00:00:00Z' },
            { Agent: 'SupportBot', Model: 'gpt-4o', Cost: 15.0, Tokens: 1500, Timestamp: '2026-09-15T01:00:00Z' },
            { Agent: 'SupportBot', Model: 'claude-3-5', Cost: 5.0, Tokens: 500, Timestamp: '2026-09-15T00:00:00Z' },
            { Agent: 'SupportBot', Model: 'claude-3-5', Cost: 5.0, Tokens: 500, Timestamp: '2026-09-15T01:00:00Z' },
            { Agent: 'SalesBot', Model: 'gpt-4o', Cost: 20.0, Tokens: 2000, Timestamp: '2026-09-15T00:00:00Z' },
            { Agent: 'SalesBot', Model: 'gpt-4o', Cost: 25.0, Tokens: 2500, Timestamp: '2026-09-15T01:00:00Z' },
            { Agent: 'SalesBot', Model: 'claude-3-5', Cost: 10.0, Tokens: 1000, Timestamp: '2026-09-15T00:00:00Z' },
            { Agent: 'SalesBot', Model: 'claude-3-5', Cost: 10.0, Tokens: 1000, Timestamp: '2026-09-15T01:00:00Z' },
            { Agent: 'TriageBot', Model: 'gemini-1-5', Cost: 2.0, Tokens: 400, Timestamp: '2026-09-15T00:00:00Z' },
            { Agent: 'TriageBot', Model: 'gemini-1-5', Cost: 3.0, Tokens: 600, Timestamp: '2026-09-15T01:00:00Z' },
            { Agent: 'TriageBot', Model: 'custom-internal', Cost: null, Tokens: 100, Timestamp: '2026-09-15T00:00:00Z' },
            { Agent: 'TriageBot', Model: 'custom-internal', Cost: null, Tokens: 100, Timestamp: '2026-09-15T01:00:00Z' }
        ];

        it('groups 12-row fixture into expected agent dimension totals', () => {
            const config: QueryPivotConfig = {
                DimensionColumns: ['Agent'],
                MeasureColumns: [
                    { Key: 'Cost', Label: 'Total Cost', Format: 'currency', Aggregation: 'sum' },
                    { Key: 'Tokens', Label: 'Total Tokens', Format: 'number', Aggregation: 'sum' }
                ]
            };

            const result = ComputePivot(twelveRowFixture, config);

            expect(result.TotalInputRows).toBe(12);
            expect(result.GroupedRowCount).toBe(3);

            const supportRow = result.Rows.find(r => r['Agent'] === 'SupportBot')!;
            expect(supportRow).toBeDefined();
            expect(supportRow['Cost']).toBe('$35.00');
            expect(supportRow['Cost_raw']).toBe(35.0);
            expect(supportRow['Tokens']).toBe('3,500');
            expect(supportRow['Tokens_raw']).toBe(3500);

            const salesRow = result.Rows.find(r => r['Agent'] === 'SalesBot')!;
            expect(salesRow['Cost']).toBe('$65.00');
            expect(salesRow['Tokens']).toBe('6,500');

            const triageRow = result.Rows.find(r => r['Agent'] === 'TriageBot')!;
            expect(triageRow['Cost']).toBe('$5.00');
            expect(triageRow['Tokens']).toBe('1,200');
        });

        it('groups by a hidden ID column so two records sharing a name stay separate rows', () => {
            const rows = [
                { AgentID: 'a1', Agent: 'Helper', Cost: 1 },
                { AgentID: 'a2', Agent: 'Helper', Cost: 2 },
                { AgentID: 'a1', Agent: 'Helper', Cost: 3 }
            ];
            const config: QueryPivotConfig = {
                DimensionColumns: ['AgentID', 'Agent'],
                HiddenColumns: ['AgentID'],
                MeasureColumns: [{ Key: 'Cost', Label: 'Cost', Format: 'currency', Aggregation: 'sum' }]
            };

            const result = ComputePivot(rows, config);

            expect(result.GroupedRowCount).toBe(2);
            expect(result.Rows.find(r => r['AgentID'] === 'a1')?.['Cost_raw']).toBe(4);
            const byField = new Map(result.ColumnConfigs.map(c => [c.field, c]));
            expect(byField.get('AgentID')?.visible).toBe(false);
            expect(byField.get('Agent')?.visible).toBe(true);
        });

        it('titles dimension and time columns from ColumnLabels, falling back to the field name', () => {
            const config: QueryPivotConfig = {
                DimensionColumns: ['Agent', 'SourceKind'],
                ColumnLabels: { SourceKind: 'Source', Timestamp: 'Day' },
                TimeColumn: 'Timestamp',
                Grain: 'day',
                MeasureColumns: [{ Key: 'Cost', Label: 'Total Cost', Format: 'currency', Aggregation: 'sum' }]
            };

            const titles = ComputePivot(twelveRowFixture.map(r => ({ ...r, SourceKind: 'agent' })), config)
                .ColumnConfigs.map(c => [c.field, c.title]);

            expect(titles).toEqual([['Agent', 'Agent'], ['SourceKind', 'Source'], ['Timestamp', 'Day'], ['Cost', 'Total Cost']]);
        });

        it('keeps the grain suffix on the time column when no label is given', () => {
            const config: QueryPivotConfig = {
                DimensionColumns: ['Agent'],
                TimeColumn: 'Timestamp',
                Grain: 'hour',
                MeasureColumns: [{ Key: 'Cost', Label: 'Cost', Format: 'currency', Aggregation: 'sum' }]
            };
            const time = ComputePivot(twelveRowFixture, config).ColumnConfigs.find(c => c.field === 'Timestamp');
            expect(time?.title).toBe('Timestamp (Hour)');
        });

        it('renders null measure as em dash when all grouped rows have null', () => {
            const config: QueryPivotConfig = {
                DimensionColumns: ['Agent', 'Model'],
                MeasureColumns: [
                    { Key: 'Cost', Label: 'Cost', Format: 'currency', Aggregation: 'sum' }
                ]
            };

            const result = ComputePivot(twelveRowFixture, config);
            const unpricedRow = result.Rows.find(r => r['Agent'] === 'TriageBot' && r['Model'] === 'custom-internal')!;

            expect(unpricedRow).toBeDefined();
            expect(unpricedRow['Cost']).toBe('—');
            expect(unpricedRow['Cost_raw']).toBeNull();
        });

        it('produces expected comparison window metrics and deltas', () => {
            const comparisonFixture = [
                { Agent: 'SupportBot', Cost: 120.0, Period: 'current' },
                { Agent: 'SupportBot', Cost: 100.0, Period: 'previous' },
                { Agent: 'SalesBot', Cost: 80.0, Period: 'current' },
                { Agent: 'SalesBot', Cost: 100.0, Period: 'previous' },
                { Agent: 'NewBot', Cost: 50.0, Period: 'current' }
            ];

            const config: QueryPivotConfig = {
                DimensionColumns: ['Agent'],
                MeasureColumns: [
                    { Key: 'Cost', Label: 'Cost', Format: 'currency', Aggregation: 'sum' }
                ],
                ComparisonWindow: true,
                ComparisonPeriodColumn: 'Period'
            };

            const result = ComputePivot(comparisonFixture, config);

            const supportRow = result.Rows.find(r => r['Agent'] === 'SupportBot')!;
            expect(supportRow['Cost']).toBe('$120.00');
            expect(supportRow['Cost_prev']).toBe('$100.00');
            expect(supportRow['Cost_delta']).toBe('+20.0%');
            expect(supportRow['Cost_delta_percent']).toBe(20);

            const salesRow = result.Rows.find(r => r['Agent'] === 'SalesBot')!;
            expect(salesRow['Cost']).toBe('$80.00');
            expect(salesRow['Cost_prev']).toBe('$100.00');
            expect(salesRow['Cost_delta']).toBe('-20.0%');

            const newBotRow = result.Rows.find(r => r['Agent'] === 'NewBot')!;
            expect(newBotRow['Cost']).toBe('$50.00');
            expect(newBotRow['Cost_prev']).toBe('—');
            expect(newBotRow['Cost_delta']).toBe('—');
        });

        it('returns empty result for empty input rows', () => {
            const result = ComputePivot([], {
                DimensionColumns: ['Agent'],
                MeasureColumns: [{ Key: 'Cost', Label: 'Cost', Format: 'currency' }]
            });

            expect(result.Rows).toEqual([]);
            expect(result.GroupedRowCount).toBe(0);
            expect(result.ColumnConfigs.length).toBe(2);
        });

        it('never sums a currency measure across currencies when CurrencyColumn is set', () => {
            const rows = [
                { Agent: 'SupportBot', Cost: 10, CostCurrency: 'USD' },
                { Agent: 'SupportBot', Cost: 5, CostCurrency: 'USD' },
                { Agent: 'SupportBot', Cost: 7, CostCurrency: 'EUR' }
            ];
            const result = ComputePivot(rows, {
                DimensionColumns: ['Agent'],
                MeasureColumns: [{ Key: 'Cost', Label: 'Cost', Format: 'currency', CurrencyColumn: 'CostCurrency' }]
            });

            expect(result.Rows.length).toBe(2);
            expect(result.Rows.find(r => r['CostCurrency'] === 'USD')!['Cost']).toBe('$15.00');
            expect(result.Rows.find(r => r['CostCurrency'] === 'EUR')!['Cost']).toBe('€7.00');
            // The currency is shown as its own column, so the split is visible rather than implied.
            expect(result.ColumnConfigs.map(c => c.field)).toEqual(['Agent', 'CostCurrency', 'Cost']);
        });
    });
});
