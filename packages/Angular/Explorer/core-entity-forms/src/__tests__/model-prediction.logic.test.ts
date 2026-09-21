import { describe, it, expect } from 'vitest';
import {
    bandFor,
    formatLastScored,
    formatHistoryTimestamp,
    formatValue,
    gaugePct,
    parseDrivers,
    parsePayloadDrivers,
    parseHistoryItem,
    filterHistoryByModel,
    getDistinctModelsFromHistory,
    resolveLabel,
    toNumber,
    valueKind,
    MAX_DRIVERS,
} from '../lib/panels/model-predictions/model-prediction.logic';

describe('model-prediction.logic', () => {
    describe('toNumber', () => {
        it('passes finite numbers through', () => {
            expect(toNumber(0.5)).toBe(0.5);
            expect(toNumber(0)).toBe(0);
            expect(toNumber(-3)).toBe(-3);
        });
        it('parses numeric strings', () => {
            expect(toNumber('0.72')).toBe(0.72);
            expect(toNumber('  12 ')).toBe(12);
        });
        it('returns null for non-numbers', () => {
            expect(toNumber(null)).toBeNull();
            expect(toNumber(undefined)).toBeNull();
            expect(toNumber('')).toBeNull();
            expect(toNumber('Renewing')).toBeNull();
            expect(toNumber(NaN)).toBeNull();
            expect(toNumber(Infinity)).toBeNull();
        });
    });

    describe('valueKind', () => {
        it('regression with a number → numeric', () => {
            expect(valueKind('regression', 1234.5)).toBe('numeric');
        });
        it('classification with a 0–1 value → probability', () => {
            expect(valueKind('classification', 0)).toBe('probability');
            expect(valueKind('classification', 0.5)).toBe('probability');
            expect(valueKind('classification', 1)).toBe('probability');
        });
        it('classification with an out-of-range number → class', () => {
            expect(valueKind('classification', 5)).toBe('class');
            expect(valueKind('classification', -0.1)).toBe('class');
        });
        it('non-numeric (a class label) → class', () => {
            expect(valueKind('classification', null)).toBe('class');
            expect(valueKind('regression', null)).toBe('class');
        });
    });

    describe('bandFor — neutral tercile, no moral direction', () => {
        it('splits [0,1] into three equal terciles', () => {
            expect(bandFor(0)).toBe('low');
            expect(bandFor(0.2)).toBe('low');
            expect(bandFor(0.33)).toBe('low');
            expect(bandFor(0.34)).toBe('mid');
            expect(bandFor(0.5)).toBe('mid');
            expect(bandFor(0.66)).toBe('mid');
            expect(bandFor(0.67)).toBe('high');
            expect(bandFor(1)).toBe('high');
        });
        it('clamps out-of-range input', () => {
            expect(bandFor(-1)).toBe('low');
            expect(bandFor(2)).toBe('high');
        });
    });

    describe('gaugePct', () => {
        it('maps 0–1 to 0–100 rounded', () => {
            expect(gaugePct(0)).toBe(0);
            expect(gaugePct(0.724)).toBe(72);
            expect(gaugePct(0.726)).toBe(73);
            expect(gaugePct(1)).toBe(100);
        });
        it('clamps', () => {
            expect(gaugePct(-0.5)).toBe(0);
            expect(gaugePct(1.5)).toBe(100);
        });
    });

    describe('formatValue', () => {
        it('formats a probability as a percentage', () => {
            expect(formatValue(0.72, 0.72, 'probability')).toBe('72%');
        });
        it('formats a regression number with grouping and ≤4 decimals', () => {
            expect(formatValue(1240.5, 1240.5, 'numeric')).toBe((1240.5).toLocaleString(undefined, { maximumFractionDigits: 4 }));
        });
        it('renders a class label verbatim', () => {
            expect(formatValue('Renewing', null, 'class')).toBe('Renewing');
        });
        it('renders an em dash for missing values', () => {
            expect(formatValue(null, null, 'class')).toBe('—');
            expect(formatValue('', null, 'class')).toBe('—');
        });
    });

    describe('resolveLabel — entity-agnostic, no hardcoded domain term', () => {
        it('prefers the model target variable', () => {
            expect(resolveLabel('WillRenew', 'RenewalScore')).toBe('WillRenew');
        });
        it('falls back to the bound column', () => {
            expect(resolveLabel(null, 'LeadScore')).toBe('LeadScore');
            expect(resolveLabel('   ', 'LeadScore')).toBe('LeadScore');
        });
        it('falls back to a generic label when nothing supplied', () => {
            expect(resolveLabel(null, null)).toBe('Prediction');
        });
    });

    describe('parseDrivers — feature importance', () => {
        it('returns [] for null / empty / invalid JSON', () => {
            expect(parseDrivers(null)).toEqual([]);
            expect(parseDrivers('')).toEqual([]);
            expect(parseDrivers('not json')).toEqual([]);
            expect(parseDrivers('[1,2,3]')).toEqual([]); // array, not a map
            expect(parseDrivers('{}')).toEqual([]);
        });
        it('sorts by importance magnitude descending and caps at MAX_DRIVERS', () => {
            const json = JSON.stringify({ a: 0.1, b: 0.9, c: 0.5, d: 0.3, e: 0.2, f: 0.05, g: 0.4 });
            const drivers = parseDrivers(json);
            expect(drivers).toHaveLength(MAX_DRIVERS);
            expect(drivers.map(d => d.name)).toEqual(['b', 'c', 'g', 'd', 'e']);
        });
        it('uses absolute value of negative contributions', () => {
            const drivers = parseDrivers(JSON.stringify({ pos: 0.4, neg: -0.8 }));
            expect(drivers[0].name).toBe('neg');
            expect(drivers[0].importance).toBe(0.8);
        });
        it('computes relativePct against the strongest driver', () => {
            const drivers = parseDrivers(JSON.stringify({ top: 1.0, half: 0.5 }));
            expect(drivers[0].relativePct).toBe(100);
            expect(drivers[1].relativePct).toBe(50);
        });
        it('drops zero-importance features', () => {
            const drivers = parseDrivers(JSON.stringify({ a: 0, b: 0.5 }));
            expect(drivers.map(d => d.name)).toEqual(['b']);
        });
    });

    describe('formatLastScored', () => {
        it('returns null for null / invalid dates', () => {
            expect(formatLastScored(null)).toBeNull();
            expect(formatLastScored('not a date')).toBeNull();
        });
        it('formats a valid Date', () => {
            const result = formatLastScored(new Date('2026-03-15T00:00:00Z'));
            expect(result).not.toBeNull();
            expect(result!.length).toBeGreaterThan(0);
        });
        it('accepts an ISO string', () => {
            expect(formatLastScored('2026-03-15T12:00:00Z')).not.toBeNull();
        });
    });

    describe('formatHistoryTimestamp', () => {
        it('returns em-dash for null or invalid dates', () => {
            expect(formatHistoryTimestamp(null)).toBe('—');
            expect(formatHistoryTimestamp('invalid')).toBe('—');
        });
        it('formats a valid ISO timestamp', () => {
            const result = formatHistoryTimestamp('2026-09-20T14:30:00Z');
            expect(result).not.toBe('—');
            expect(result).toContain('2026');
        });
    });

    describe('parsePayloadDrivers', () => {
        it('handles null/undefined gracefully', () => {
            expect(parsePayloadDrivers(null)).toEqual([]);
            expect(parsePayloadDrivers(undefined)).toEqual([]);
        });
        it('parses array of feature/value objects', () => {
            const raw = [
                { feature: 'AutoRenew', value: 0.8 },
                { feature: 'TenureDays', value: -0.4 },
                { feature: 'ZeroImpact', value: 0 },
            ];
            const drivers = parsePayloadDrivers(raw);
            expect(drivers).toHaveLength(2);
            expect(drivers[0].name).toBe('AutoRenew');
            expect(drivers[0].relativePct).toBe(100);
            expect(drivers[1].name).toBe('TenureDays');
            expect(drivers[1].relativePct).toBe(50);
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
                        drivers: [{ feature: 'AutoRenew', value: 0.9 }],
                        scoredAt: '2026-09-20T00:04:27Z',
                    },
                    writeBack: { updatedRecord: true },
                }),
                ErrorMessage: null,
            };

            const item = parseHistoryItem(raw, mockModelLookup);
            expect(item.id).toBe('PRD-001');
            expect(item.processRunId).toBe('PR-999');
            expect(item.modelId).toBe('M-123');
            expect(item.modelName).toBe('Renewal Likelihood Model');
            expect(item.provenance).toBe('Member Retention v2');
            expect(item.problemType).toBe('classification');
            expect(item.numericValue).toBe(0.88);
            expect(item.predictedClass).toBe('Renewing');
            expect(item.displayValue).toBe('Renewing');
            expect(item.isProbability).toBe(true);
            expect(item.band).toBe('high');
            expect(item.statusBand?.Label).toBe('High');
            expect(item.statusBand?.BadgeColor).toBe('green');
            expect(item.badgeColor).toBe('green');
            expect(item.drivers).toHaveLength(1);
            expect(item.drivers[0].name).toBe('AutoRenew');
            expect(item.rawPayload).not.toBeNull();
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

            const item = parseHistoryItem(raw);
            expect(item.isProbability).toBe(true);
            expect(item.statusBand?.Label).toBe('High Risk');
            expect(item.statusBand?.BadgeColor).toBe('red');
            expect(item.badgeColor).toBe('red');
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

            const item = parseHistoryItem(raw);
            expect(item.predictedClass).toBe('Late');
            expect(item.badgeColor).toBe('red');
            expect(item.statusLabel).toBe('Late');
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

            const item = parseHistoryItem(raw, mockModelLookup);
            expect(item.id).toBe('PRD-002');
            expect(item.problemType).toBe('regression');
            expect(item.numericValue).toBe(1450.5);
            expect(item.isProbability).toBe(false);
            expect(item.band).toBeNull();
            expect(item.displayValue).toBe((1450.5).toLocaleString(undefined, { maximumFractionDigits: 4 }));
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

            const item = parseHistoryItem(raw, mockModelLookup);
            expect(item.id).toBe('PRD-003');
            expect(item.status).toBe('Failed');
            expect(item.errorMessage).toBe('Timeout talking to model sidecar');
            expect(item.rawPayload).toBeNull();
            expect(item.displayValue).toBe('—');
        });
    });

    describe('filterHistoryByModel and getDistinctModelsFromHistory', () => {
        const item1 = {
            id: '1',
            processRunId: 'pr1',
            modelId: 'M1',
            modelName: 'Model 1',
            provenance: 'M1 v1',
            target: 'T1',
            problemType: 'classification' as const,
            numericValue: 0.9,
            predictedClass: null,
            displayValue: '90%',
            isProbability: true,
            band: 'high' as const,
            status: 'Succeeded',
            completedAt: null,
            formattedTime: 'Today',
            drivers: [],
            errorMessage: null,
            rawPayload: null,
        };
        const item2 = { ...item1, id: '2', modelId: 'M2', modelName: 'Model 2' };
        const item3 = { ...item1, id: '3', modelId: 'M1', modelName: 'Model 1' };
        const items = [item1, item2, item3];

        it('filterHistoryByModel returns all when null or "ALL"', () => {
            expect(filterHistoryByModel(items, null)).toHaveLength(3);
            expect(filterHistoryByModel(items, 'ALL')).toHaveLength(3);
        });

        it('filterHistoryByModel filters to specific modelId', () => {
            const filtered = filterHistoryByModel(items, 'M2');
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('2');
        });

        it('getDistinctModelsFromHistory aggregates distinct models with counts', () => {
            const summaries = getDistinctModelsFromHistory(items);
            expect(summaries).toHaveLength(2);
            const m1 = summaries.find(s => s.modelId === 'M1');
            const m2 = summaries.find(s => s.modelId === 'M2');
            expect(m1?.count).toBe(2);
            expect(m2?.count).toBe(1);
        });
    });
});
