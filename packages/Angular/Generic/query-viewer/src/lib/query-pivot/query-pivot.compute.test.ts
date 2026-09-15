import { describe, it, expect } from 'vitest';
import {
    aggregateValues,
    bucketTimestamp,
    computeDeltaPercent,
    computePivot,
    formatDelta,
    formatDuration,
    formatMeasureValue
} from './query-pivot.compute';
import { QueryPivotConfig } from './query-pivot.types';

describe('query-pivot.compute', () => {
    describe('formatMeasureValue', () => {
        it('renders null, undefined, or NaN as an em dash', () => {
            expect(formatMeasureValue(null, 'currency')).toBe('—');
            expect(formatMeasureValue(undefined, 'number')).toBe('—');
            expect(formatMeasureValue(NaN, 'percent')).toBe('—');
        });

        it('formats currency with dollar sign, comma separators, and 2 decimals', () => {
            expect(formatMeasureValue(1234.56, 'currency')).toBe('$1,234.56');
            expect(formatMeasureValue(0, 'currency')).toBe('$0.00');
            expect(formatMeasureValue(10, 'currency')).toBe('$10.00');
        });

        it('formats numbers with commas and appropriate decimal places', () => {
            expect(formatMeasureValue(1000, 'number')).toBe('1,000');
            expect(formatMeasureValue(1234.567, 'number')).toBe('1,234.57');
        });

        it('formats percentage with 1 decimal and % sign', () => {
            expect(formatMeasureValue(12.34, 'percent')).toBe('12.3%');
            expect(formatMeasureValue(0, 'percent')).toBe('0.0%');
        });

        it('formats duration into ms, s, and m s units', () => {
            expect(formatDuration(450)).toBe('450ms');
            expect(formatDuration(2500)).toBe('2.50s');
            expect(formatDuration(125000)).toBe('2m 5s');
        });
    });

    describe('formatDelta', () => {
        it('formats positive delta with + prefix and % sign', () => {
            expect(formatDelta(15.23)).toBe('+15.2%');
        });

        it('formats negative delta with - sign', () => {
            expect(formatDelta(-8.46)).toBe('-8.5%');
        });

        it('returns em dash for null or undefined delta', () => {
            expect(formatDelta(null)).toBe('—');
            expect(formatDelta(undefined)).toBe('—');
        });
    });

    describe('bucketTimestamp', () => {
        const ts = '2026-09-15T14:35:22.000Z';

        it('buckets into hour grain (YYYY-MM-DD HH:00)', () => {
            expect(bucketTimestamp(ts, 'hour')).toBe('2026-09-15 14:00');
        });

        it('buckets into day grain (YYYY-MM-DD)', () => {
            expect(bucketTimestamp(ts, 'day')).toBe('2026-09-15');
        });

        it('returns em dash for null or empty dates', () => {
            expect(bucketTimestamp(null, 'hour')).toBe('—');
            expect(bucketTimestamp('', 'day')).toBe('—');
        });
    });

    describe('aggregateValues', () => {
        const nums = [10, 20, 30];

        it('computes sum', () => {
            expect(aggregateValues(nums, 'sum')).toBe(60);
        });

        it('computes average', () => {
            expect(aggregateValues(nums, 'avg')).toBe(20);
        });

        it('computes min and max', () => {
            expect(aggregateValues(nums, 'min')).toBe(10);
            expect(aggregateValues(nums, 'max')).toBe(30);
        });

        it('computes count of non-null items', () => {
            expect(aggregateValues([10, null, 20, undefined, 30], 'count')).toBe(3);
        });

        it('returns null if all values are null or undefined', () => {
            expect(aggregateValues([null, undefined, null], 'sum')).toBeNull();
        });

        it('ignores null and undefined when aggregating valid numbers', () => {
            expect(aggregateValues([10, null, 20, undefined], 'sum')).toBe(30);
            expect(aggregateValues([10, null, 20, undefined], 'avg')).toBe(15);
        });
    });

    describe('computeDeltaPercent', () => {
        it('computes percentage delta correctly', () => {
            expect(computeDeltaPercent(150, 100)).toBe(50);
            expect(computeDeltaPercent(75, 100)).toBe(-25);
        });

        it('returns null if previous is zero or either value is null', () => {
            expect(computeDeltaPercent(100, 0)).toBeNull();
            expect(computeDeltaPercent(null, 100)).toBeNull();
            expect(computeDeltaPercent(100, null)).toBeNull();
        });
    });

    describe('computePivot', () => {
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
                dimensionColumns: ['Agent'],
                measureColumns: [
                    { key: 'Cost', label: 'Total Cost', format: 'currency', aggregation: 'sum' },
                    { key: 'Tokens', label: 'Total Tokens', format: 'number', aggregation: 'sum' }
                ]
            };

            const result = computePivot(twelveRowFixture, config);

            expect(result.totalInputRows).toBe(12);
            expect(result.groupedRowCount).toBe(3);

            const supportRow = result.rows.find(r => r['Agent'] === 'SupportBot')!;
            expect(supportRow).toBeDefined();
            expect(supportRow['Cost']).toBe('$35.00');
            expect(supportRow['Cost_raw']).toBe(35.0);
            expect(supportRow['Tokens']).toBe('3,500');
            expect(supportRow['Tokens_raw']).toBe(3500);

            const salesRow = result.rows.find(r => r['Agent'] === 'SalesBot')!;
            expect(salesRow['Cost']).toBe('$65.00');
            expect(salesRow['Tokens']).toBe('6,500');

            const triageRow = result.rows.find(r => r['Agent'] === 'TriageBot')!;
            expect(triageRow['Cost']).toBe('$5.00');
            expect(triageRow['Tokens']).toBe('1,200');
        });

        it('renders null measure as em dash when all grouped rows have null', () => {
            const config: QueryPivotConfig = {
                dimensionColumns: ['Agent', 'Model'],
                measureColumns: [
                    { key: 'Cost', label: 'Cost', format: 'currency', aggregation: 'sum' }
                ]
            };

            const result = computePivot(twelveRowFixture, config);
            const unpricedRow = result.rows.find(r => r['Agent'] === 'TriageBot' && r['Model'] === 'custom-internal')!;

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
                dimensionColumns: ['Agent'],
                measureColumns: [
                    { key: 'Cost', label: 'Cost', format: 'currency', aggregation: 'sum' }
                ],
                comparisonWindow: true,
                comparisonPeriodColumn: 'Period'
            };

            const result = computePivot(comparisonFixture, config);

            const supportRow = result.rows.find(r => r['Agent'] === 'SupportBot')!;
            expect(supportRow['Cost']).toBe('$120.00');
            expect(supportRow['Cost_prev']).toBe('$100.00');
            expect(supportRow['Cost_delta']).toBe('+20.0%');
            expect(supportRow['Cost_delta_percent']).toBe(20);

            const salesRow = result.rows.find(r => r['Agent'] === 'SalesBot')!;
            expect(salesRow['Cost']).toBe('$80.00');
            expect(salesRow['Cost_prev']).toBe('$100.00');
            expect(salesRow['Cost_delta']).toBe('-20.0%');

            const newBotRow = result.rows.find(r => r['Agent'] === 'NewBot')!;
            expect(newBotRow['Cost']).toBe('$50.00');
            expect(newBotRow['Cost_prev']).toBe('—');
            expect(newBotRow['Cost_delta']).toBe('—');
        });

        it('returns empty result for empty input rows', () => {
            const result = computePivot([], {
                dimensionColumns: ['Agent'],
                measureColumns: [{ key: 'Cost', label: 'Cost', format: 'currency' }]
            });

            expect(result.rows).toEqual([]);
            expect(result.groupedRowCount).toBe(0);
            expect(result.columnConfigs.length).toBe(2);
        });
    });
});
