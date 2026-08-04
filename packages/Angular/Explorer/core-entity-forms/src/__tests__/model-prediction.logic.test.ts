import { describe, it, expect } from 'vitest';
import {
    bandFor,
    formatLastScored,
    formatValue,
    gaugePct,
    parseDrivers,
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
});
