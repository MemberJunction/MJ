import { describe, it, expect } from 'vitest';
import {
    BandFor,
    FormatLastScored,
    FormatHistoryTimestamp,
    FormatValue,
    GaugePct,
    ParseDrivers,
    ParsePayloadDrivers,
    ParseHistoryItem,
    FilterHistoryByModel,
    GetDistinctModelsFromHistory,
    ResolveLabel,
    ToNumber,
    ValueKind,
    MAX_DRIVERS,
    type PredictionHistoryItem,
} from '../lib/panels/model-predictions/model-prediction.logic';

describe('model-prediction.logic', () => {
    describe('toNumber', () => {
        it('passes finite numbers through', () => {
            expect(ToNumber(0.5)).toBe(0.5);
            expect(ToNumber(0)).toBe(0);
            expect(ToNumber(-3)).toBe(-3);
        });
        it('parses numeric strings', () => {
            expect(ToNumber('0.72')).toBe(0.72);
            expect(ToNumber('  12 ')).toBe(12);
        });
        it('returns null for non-numbers', () => {
            expect(ToNumber(null)).toBeNull();
            expect(ToNumber(undefined)).toBeNull();
            expect(ToNumber('')).toBeNull();
            expect(ToNumber('Renewing')).toBeNull();
            expect(ToNumber(NaN)).toBeNull();
            expect(ToNumber(Infinity)).toBeNull();
        });
    });

    describe('valueKind', () => {
        it('regression with a number → numeric', () => {
            expect(ValueKind('regression', 1234.5)).toBe('numeric');
        });
        it('classification with a 0–1 value → probability', () => {
            expect(ValueKind('classification', 0)).toBe('probability');
            expect(ValueKind('classification', 0.5)).toBe('probability');
            expect(ValueKind('classification', 1)).toBe('probability');
        });
        it('classification with an out-of-range number → class', () => {
            expect(ValueKind('classification', 5)).toBe('class');
            expect(ValueKind('classification', -0.1)).toBe('class');
        });
        it('non-numeric (a class label) → class', () => {
            expect(ValueKind('classification', null)).toBe('class');
            expect(ValueKind('regression', null)).toBe('class');
        });
    });

    describe('bandFor — neutral tercile, no moral direction', () => {
        it('splits [0,1] into three equal terciles', () => {
            expect(BandFor(0)).toBe('low');
            expect(BandFor(0.2)).toBe('low');
            expect(BandFor(0.33)).toBe('low');
            expect(BandFor(0.34)).toBe('mid');
            expect(BandFor(0.5)).toBe('mid');
            expect(BandFor(0.66)).toBe('mid');
            expect(BandFor(0.67)).toBe('high');
            expect(BandFor(1)).toBe('high');
        });
        it('clamps out-of-range input', () => {
            expect(BandFor(-1)).toBe('low');
            expect(BandFor(2)).toBe('high');
        });
    });

    describe('gaugePct', () => {
        it('maps 0–1 to 0–100 rounded', () => {
            expect(GaugePct(0)).toBe(0);
            expect(GaugePct(0.724)).toBe(72);
            expect(GaugePct(0.726)).toBe(73);
            expect(GaugePct(1)).toBe(100);
        });
        it('clamps', () => {
            expect(GaugePct(-0.5)).toBe(0);
            expect(GaugePct(1.5)).toBe(100);
        });
    });

    describe('formatValue', () => {
        it('formats a probability as a percentage', () => {
            expect(FormatValue(0.72, 0.72, 'probability')).toBe('72%');
        });
        it('formats a regression number with grouping and ≤4 decimals', () => {
            expect(FormatValue(1240.5, 1240.5, 'numeric')).toBe((1240.5).toLocaleString(undefined, { maximumFractionDigits: 4 }));
        });
        it('renders a class label verbatim', () => {
            expect(FormatValue('Renewing', null, 'class')).toBe('Renewing');
        });
        it('renders an em dash for missing values', () => {
            expect(FormatValue(null, null, 'class')).toBe('—');
            expect(FormatValue('', null, 'class')).toBe('—');
        });
    });

    describe('resolveLabel — entity-agnostic, no hardcoded domain term', () => {
        it('prefers the model target variable', () => {
            expect(ResolveLabel('WillRenew', 'RenewalScore')).toBe('WillRenew');
        });
        it('falls back to the bound column', () => {
            expect(ResolveLabel(null, 'LeadScore')).toBe('LeadScore');
            expect(ResolveLabel('   ', 'LeadScore')).toBe('LeadScore');
        });
        it('falls back to a generic label when nothing supplied', () => {
            expect(ResolveLabel(null, null)).toBe('Prediction');
        });
    });

    describe('parseDrivers — feature importance', () => {
        it('returns [] for null / empty / invalid JSON', () => {
            expect(ParseDrivers(null)).toEqual([]);
            expect(ParseDrivers('')).toEqual([]);
            expect(ParseDrivers('not json')).toEqual([]);
            expect(ParseDrivers('[1,2,3]')).toEqual([]); // array, not a map
            expect(ParseDrivers('{}')).toEqual([]);
        });
        it('sorts by importance magnitude descending and caps at MAX_DRIVERS', () => {
            const json = JSON.stringify({ a: 0.1, b: 0.9, c: 0.5, d: 0.3, e: 0.2, f: 0.05, g: 0.4 });
            const drivers = ParseDrivers(json);
            expect(drivers).toHaveLength(MAX_DRIVERS);
            expect(drivers.map(d => d.name)).toEqual(['b', 'c', 'g', 'd', 'e']);
        });
        it('uses absolute value of negative contributions', () => {
            const drivers = ParseDrivers(JSON.stringify({ pos: 0.4, neg: -0.8 }));
            expect(drivers[0].name).toBe('neg');
            expect(drivers[0].importance).toBe(0.8);
        });
        it('computes relativePct against the strongest driver', () => {
            const drivers = ParseDrivers(JSON.stringify({ top: 1.0, half: 0.5 }));
            expect(drivers[0].RelativePct).toBe(100);
            expect(drivers[1].RelativePct).toBe(50);
        });
        it('drops zero-importance features', () => {
            const drivers = ParseDrivers(JSON.stringify({ a: 0, b: 0.5 }));
            expect(drivers.map(d => d.name)).toEqual(['b']);
        });
    });

    describe('formatLastScored', () => {
        it('returns null for null / invalid dates', () => {
            expect(FormatLastScored(null)).toBeNull();
            expect(FormatLastScored('not a date')).toBeNull();
        });
        it('formats a valid Date', () => {
            const result = FormatLastScored(new Date('2026-03-15T00:00:00Z'));
            expect(result).not.toBeNull();
            expect(result!.length).toBeGreaterThan(0);
        });
        it('accepts an ISO string', () => {
            expect(FormatLastScored('2026-03-15T12:00:00Z')).not.toBeNull();
        });
    });

    describe('formatHistoryTimestamp', () => {
        it('returns em-dash for null or invalid dates', () => {
            expect(FormatHistoryTimestamp(null)).toBe('—');
            expect(FormatHistoryTimestamp('invalid')).toBe('—');
        });
        it('formats a valid ISO timestamp', () => {
            const result = FormatHistoryTimestamp('2026-09-20T14:30:00Z');
            expect(result).not.toBe('—');
            expect(result).toContain('2026');
        });
    });

    describe('parsePayloadDrivers', () => {
        it('handles null/undefined gracefully', () => {
            expect(ParsePayloadDrivers(null)).toEqual([]);
            expect(ParsePayloadDrivers(undefined)).toEqual([]);
        });
        it('parses array of feature/value objects', () => {
            const raw = [
                { feature: 'AutoRenew', value: 0.8 },
                { feature: 'TenureDays', value: -0.4 },
                { feature: 'ZeroImpact', value: 0 },
            ];
            const drivers = ParsePayloadDrivers(raw);
            expect(drivers).toHaveLength(2);
            expect(drivers[0].name).toBe('AutoRenew');
            expect(drivers[0].RelativePct).toBe(100);
            expect(drivers[1].name).toBe('TenureDays');
            expect(drivers[1].RelativePct).toBe(50);
        });
    });

    describe('parseHistoryItem', () => {
        const mockModelLookup = new Map([
            [
                'M-123',
                {
                    Name: 'Renewal Likelihood Model',
                    Pipeline: 'Member Retention',
                    Version: 2,
                    ProblemType: 'classification',
                    TargetVariable: 'RenewalLikelihood',
                },
            ],
            [
                'M-456',
                {
                    Name: 'Order Spend Model',
                    Pipeline: 'Revenue Forecast',
                    Version: 1,
                    ProblemType: 'regression',
                    TargetVariable: 'ExpectedSpend',
                },
            ],
        ]);

        it('parses wrapped output payload from MLModelInferenceProcessor', () => {
            const raw = {
                ID: 'PRD-001',
                ProcessRunID: 'PR-999',
                Status: 'Succeeded',
                CompletedAt: '2026-09-20T00:04:28Z',
                ResultPayload: JSON.stringify({
                    output: {
                        modelId: 'M-123',
                        target: 'RenewalLikelihood',
                        problemType: 'classification',
                        score: 0.88,
                        class: 'Renewing',
                        drivers: [{ feature: 'AutoRenew', value: 0.9 }],  // wire key: the processor writes it lowercase, and ParseHistoryItem reads payload['drivers']
                        scoredAt: '2026-09-20T00:04:27Z',
                    },
                    writeBack: { updatedRecord: true },
                }),
                ErrorMessage: null,
            };

            const item = ParseHistoryItem(raw, mockModelLookup);
            expect(item.id).toBe('PRD-001');
            expect(item.ProcessRunId).toBe('PR-999');
            expect(item.modelId).toBe('M-123');
            expect(item.ModelName).toBe('Renewal Likelihood Model');
            expect(item.Provenance).toBe('Member Retention v2');
            expect(item.problemType).toBe('classification');
            expect(item.NumericValue).toBe(0.88);
            expect(item.PredictedClass).toBe('Renewing');
            expect(item.DisplayValue).toBe('Renewing');
            expect(item.IsProbability).toBe(true);
            expect(item.Band).toBe('high');
            expect(item.StatusBand?.Label).toBe('High');
            expect(item.StatusBand?.BadgeColor).toBe('green');
            expect(item.BadgeColor).toBe('green');
            expect(item.Drivers).toHaveLength(1);
            expect(item.Drivers[0].name).toBe('AutoRenew');
            expect(item.RawPayload).not.toBeNull();
        });

        it('resolves adverse polarity for risk/churn models', () => {
            const raw = {
                ID: 'PRD-004',
                ProcessRunID: 'PR-998',
                Status: 'Succeeded',
                CompletedAt: '2026-09-20T00:05:00Z',
                ResultPayload: JSON.stringify({
                    output: {
                        target: 'ChurnRisk',
                        problemType: 'classification',
                        score: 0.85,
                    },
                }),
                ErrorMessage: null,
            };

            const item = ParseHistoryItem(raw);
            expect(item.IsProbability).toBe(true);
            expect(item.StatusBand?.Label).toBe('High Risk');
            expect(item.StatusBand?.BadgeColor).toBe('red');
            expect(item.BadgeColor).toBe('red');
        });

        it('resolves categorical outcome styles for class labels', () => {
            const raw = {
                ID: 'PRD-005',
                ProcessRunID: 'PR-997',
                Status: 'Succeeded',
                CompletedAt: '2026-09-20T00:06:00Z',
                ResultPayload: JSON.stringify({
                    output: {
                        target: 'PaymentStatus',
                        problemType: 'classification',
                        class: 'Late',
                    },
                }),
                ErrorMessage: null,
            };

            const item = ParseHistoryItem(raw);
            expect(item.PredictedClass).toBe('Late');
            expect(item.BadgeColor).toBe('red');
            expect(item.StatusLabel).toBe('Late');
        });

        it('parses regression models correctly', () => {
            const raw = {
                ID: 'PRD-002',
                ProcessRunID: 'PR-888',
                Status: 'Succeeded',
                CompletedAt: '2026-09-20T01:00:00Z',
                ResultPayload: JSON.stringify({
                    modelId: 'M-456',
                    target: 'ExpectedSpend',
                    problemType: 'regression',
                    score: 1450.5,
                }),
                ErrorMessage: null,
            };

            const item = ParseHistoryItem(raw, mockModelLookup);
            expect(item.id).toBe('PRD-002');
            expect(item.problemType).toBe('regression');
            expect(item.NumericValue).toBe(1450.5);
            expect(item.IsProbability).toBe(false);
            expect(item.Band).toBeNull();
            expect(item.DisplayValue).toBe((1450.5).toLocaleString(undefined, { maximumFractionDigits: 4 }));
        });

        it('handles malformed payload and failed runs gracefully', () => {
            const raw = {
                ID: 'PRD-003',
                ProcessRunID: 'PR-777',
                Status: 'Failed',
                CompletedAt: null,
                ResultPayload: '{ not valid json',
                ErrorMessage: 'Timeout talking to model sidecar',
            };

            const item = ParseHistoryItem(raw, mockModelLookup);
            expect(item.id).toBe('PRD-003');
            expect(item.status).toBe('Failed');
            expect(item.ErrorMessage).toBe('Timeout talking to model sidecar');
            expect(item.RawPayload).toBeNull();
            expect(item.DisplayValue).toBe('—');
        });
    });

    describe('filterHistoryByModel and getDistinctModelsFromHistory', () => {
        const makeHistoryItem = (overrides: Partial<PredictionHistoryItem> = {}): PredictionHistoryItem => ({
            id: '1',
            ProcessRunId: 'pr1',
            modelId: 'M1',
            ModelName: 'Model 1',
            Provenance: 'M1 v1',
            target: 'T1',
            problemType: 'classification',
            NumericValue: 0.9,
            PredictedClass: null,
            DisplayValue: '90%',
            IsProbability: true,
            Band: 'high',
            StatusBand: null,
            StatusLabel: null,
            BadgeColor: 'gray',
            BadgeIcon: null,
            status: 'Succeeded',
            CompletedAt: null,
            FormattedTime: 'Today',
            Drivers: [],
            ErrorMessage: null,
            RawPayload: null,
            ...overrides,
        });
        const item1 = makeHistoryItem();
        const item2 = makeHistoryItem({ id: '2', modelId: 'M2', ModelName: 'Model 2' });
        const item3 = makeHistoryItem({ id: '3', modelId: 'M1', ModelName: 'Model 1' });
        const items = [item1, item2, item3];

        it('filterHistoryByModel returns all when null or "ALL"', () => {
            expect(FilterHistoryByModel(items, null)).toHaveLength(3);
            expect(FilterHistoryByModel(items, 'ALL')).toHaveLength(3);
        });

        it('filterHistoryByModel filters to specific modelId', () => {
            const filtered = FilterHistoryByModel(items, 'M2');
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('2');
        });

        it('getDistinctModelsFromHistory aggregates distinct models with counts', () => {
            const summaries = GetDistinctModelsFromHistory(items);
            expect(summaries).toHaveLength(2);
            const m1 = summaries.find(s => s.modelId === 'M1');
            const m2 = summaries.find(s => s.modelId === 'M2');
            expect(m1?.count).toBe(2);
            expect(m2?.count).toBe(1);
        });
    });
});
