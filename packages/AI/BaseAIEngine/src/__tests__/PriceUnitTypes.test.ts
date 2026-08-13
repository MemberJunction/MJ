import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
/**
 * Unit tests for PriceUnitTypes
 *
 * Tests the cost calculation logic for different pricing tiers:
 * - PerMillionTokens
 * - PerThousandTokens
 * - PerHundredThousandTokens
 * - TimePerMinute / TimePerHour (continuous audio, quantities in seconds)
 * - PerImage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        RegisterClass: () => () => {},
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJAIModelCostEntity: class {
        InputPricePerUnit = 0;
        OutputPricePerUnit = 0;
        CacheReadPricePerUnit: number | null = null;
        CacheWritePricePerUnit: number | null = null;
    }
}));

import {
    BasePriceUnitType,
    PerMillionTokensPriceUnitType,
    PerThousandTokensPriceUnitType,
    PerHundredThousandTokensPriceUnitType,
    TimePerMinutePriceUnitType,
    TimePerHourPriceUnitType,
    PerImagePriceUnitType,
    LinearPriceUnitType,
    TOKEN_PRICE_UNIT_TYPE_DIVISORS,
} from '../PriceUnitTypes';
import { MODEL_USAGE_UNIT_KINDS, type ModelUsageUnitKind } from '@memberjunction/ai';

type MockCost = {
    InputPricePerUnit: number;
    OutputPricePerUnit: number;
    CacheReadPricePerUnit: number | null;
    CacheWritePricePerUnit: number | null;
};

// Helper to create a mock cost entity. Cache rates default to null (= "not recorded"), which the
// calculator treats as "fall back to the input rate".
function createMockCost(
    inputPrice: number,
    outputPrice: number,
    cacheReadPrice: number | null = null,
    cacheWritePrice: number | null = null
): MockCost {
    return {
        InputPricePerUnit: inputPrice,
        OutputPricePerUnit: outputPrice,
        CacheReadPricePerUnit: cacheReadPrice,
        CacheWritePricePerUnit: cacheWritePrice,
    };
}

describe('PerMillionTokensPriceUnitType', () => {
    let calculator: PerMillionTokensPriceUnitType;

    beforeEach(() => {
        calculator = new PerMillionTokensPriceUnitType();
    });

    it('should calculate cost for 1M input tokens at $3/M', () => {
        const cost = createMockCost(3, 15);
        const result = calculator.CalculateNormalizedCost(cost as never, 1000000, 0);
        expect(result).toBeCloseTo(3.0);
    });

    it('should calculate cost for 1M output tokens at $15/M', () => {
        const cost = createMockCost(3, 15);
        const result = calculator.CalculateNormalizedCost(cost as never, 0, 1000000);
        expect(result).toBeCloseTo(15.0);
    });

    it('should calculate combined input and output cost', () => {
        const cost = createMockCost(3, 15);
        const result = calculator.CalculateNormalizedCost(cost as never, 1000000, 500000);
        // 3 + (0.5 * 15) = 3 + 7.5 = 10.5
        expect(result).toBeCloseTo(10.5);
    });

    it('should handle zero tokens', () => {
        const cost = createMockCost(3, 15);
        const result = calculator.CalculateNormalizedCost(cost as never, 0, 0);
        expect(result).toBe(0);
    });

    it('should handle small token counts', () => {
        const cost = createMockCost(3, 15);
        // 1000 input tokens at $3/M = $0.003
        const result = calculator.CalculateNormalizedCost(cost as never, 1000, 0);
        expect(result).toBeCloseTo(0.003);
    });

    it('should handle fractional prices', () => {
        const cost = createMockCost(0.25, 1.25);
        const result = calculator.CalculateNormalizedCost(cost as never, 2000000, 1000000);
        // (2M/1M * 0.25) + (1M/1M * 1.25) = 0.5 + 1.25 = 1.75
        expect(result).toBeCloseTo(1.75);
    });
});

describe('PerThousandTokensPriceUnitType', () => {
    let calculator: PerThousandTokensPriceUnitType;

    beforeEach(() => {
        calculator = new PerThousandTokensPriceUnitType();
    });

    it('should calculate cost for 1K input tokens at $0.003/K', () => {
        const cost = createMockCost(0.003, 0.015);
        const result = calculator.CalculateNormalizedCost(cost as never, 1000, 0);
        expect(result).toBeCloseTo(0.003);
    });

    it('should calculate cost for 1K output tokens at $0.015/K', () => {
        const cost = createMockCost(0.003, 0.015);
        const result = calculator.CalculateNormalizedCost(cost as never, 0, 1000);
        expect(result).toBeCloseTo(0.015);
    });

    it('should calculate combined cost', () => {
        const cost = createMockCost(0.003, 0.015);
        const result = calculator.CalculateNormalizedCost(cost as never, 5000, 2000);
        // (5000/1000 * 0.003) + (2000/1000 * 0.015) = 0.015 + 0.03 = 0.045
        expect(result).toBeCloseTo(0.045);
    });

    it('should handle zero tokens', () => {
        const cost = createMockCost(0.003, 0.015);
        const result = calculator.CalculateNormalizedCost(cost as never, 0, 0);
        expect(result).toBe(0);
    });
});

describe('PerHundredThousandTokensPriceUnitType', () => {
    let calculator: PerHundredThousandTokensPriceUnitType;

    beforeEach(() => {
        calculator = new PerHundredThousandTokensPriceUnitType();
    });

    it('should calculate cost for 100K input tokens', () => {
        const cost = createMockCost(0.30, 1.50);
        const result = calculator.CalculateNormalizedCost(cost as never, 100000, 0);
        expect(result).toBeCloseTo(0.30);
    });

    it('should calculate cost for 100K output tokens', () => {
        const cost = createMockCost(0.30, 1.50);
        const result = calculator.CalculateNormalizedCost(cost as never, 0, 100000);
        expect(result).toBeCloseTo(1.50);
    });

    it('should calculate combined cost', () => {
        const cost = createMockCost(0.30, 1.50);
        const result = calculator.CalculateNormalizedCost(cost as never, 200000, 100000);
        // (200000/100000 * 0.30) + (100000/100000 * 1.50) = 0.60 + 1.50 = 2.10
        expect(result).toBeCloseTo(2.10);
    });

    it('should handle zero tokens', () => {
        const cost = createMockCost(0.30, 1.50);
        const result = calculator.CalculateNormalizedCost(cost as never, 0, 0);
        expect(result).toBe(0);
    });
});

describe('CalculateNormalizedCostWithCache', () => {
    let calculator: PerMillionTokensPriceUnitType;

    beforeEach(() => {
        calculator = new PerMillionTokensPriceUnitType();
    });

    it('falls back to the input rate for cache buckets when no cache rates are set', () => {
        const cost = createMockCost(3, 15); // no cache rates
        // 0.5M uncached + 0.5M cacheRead + 0M cacheWrite, all at $3/M, + 0 output
        const result = calculator.CalculateNormalizedCostWithCache(cost as never, 500000, 500000, 0, 0);
        // (0.5 + 0.5) * 3 = 3.0 — identical to pricing the whole 1M at the input rate
        expect(result).toBeCloseTo(3.0);
    });

    it('matches the legacy total-input calculation when cache rates are null', () => {
        const cost = createMockCost(3, 15);
        const withCache = calculator.CalculateNormalizedCostWithCache(cost as never, 400000, 300000, 300000, 1000000);
        const legacy = calculator.CalculateNormalizedCost(cost as never, 400000 + 300000 + 300000, 1000000);
        expect(withCache).toBeCloseTo(legacy, 10);
    });

    it('prices cache-read tokens at the (cheaper) cache-read rate when set', () => {
        // input $3/M, cache read $0.30/M (10% of input — typical Anthropic/Gemini)
        const cost = createMockCost(3, 15, 0.3);
        // 1M uncached + 1M cacheRead + 0 write + 0 output
        const result = calculator.CalculateNormalizedCostWithCache(cost as never, 1000000, 1000000, 0, 0);
        // (1 * 3) + (1 * 0.3) = 3.3
        expect(result).toBeCloseTo(3.3);
    });

    it('prices cache-write tokens at the cache-write rate when set', () => {
        // input $3/M, cache write $3.75/M (1.25x input — typical Anthropic)
        const cost = createMockCost(3, 15, 0.3, 3.75);
        // 0 uncached + 0 read + 1M write + 0 output
        const result = calculator.CalculateNormalizedCostWithCache(cost as never, 0, 0, 1000000, 0);
        expect(result).toBeCloseTo(3.75);
    });

    it('combines all four buckets with their distinct rates', () => {
        const cost = createMockCost(3, 15, 0.3, 3.75);
        // 1M uncached@3 + 2M read@0.3 + 0.5M write@3.75 + 1M output@15
        const result = calculator.CalculateNormalizedCostWithCache(cost as never, 1000000, 2000000, 500000, 1000000);
        // 3 + 0.6 + 1.875 + 15 = 20.475
        expect(result).toBeCloseTo(20.475);
    });

    it('is consistent across unit types for equivalent cache pricing', () => {
        const perMillion = new PerMillionTokensPriceUnitType();
        const perThousand = new PerThousandTokensPriceUnitType();
        const costM = createMockCost(3.0, 15.0, 0.3, 3.75);
        const costK = createMockCost(0.003, 0.015, 0.0003, 0.00375);
        const resM = perMillion.CalculateNormalizedCostWithCache(costM as never, 400000, 300000, 100000, 200000);
        const resK = perThousand.CalculateNormalizedCostWithCache(costK as never, 400000, 300000, 100000, 200000);
        expect(resM).toBeCloseTo(resK, 10);
    });
});

describe('Cross-calculator consistency', () => {
    it('should produce consistent costs across different unit types for equivalent pricing', () => {
        // $3.00 per million tokens = $0.003 per thousand tokens = $0.30 per hundred thousand tokens
        const perMillion = new PerMillionTokensPriceUnitType();
        const perThousand = new PerThousandTokensPriceUnitType();
        const perHundredK = new PerHundredThousandTokensPriceUnitType();

        const costM = createMockCost(3.00, 15.00);
        const costK = createMockCost(0.003, 0.015);
        const costHK = createMockCost(0.30, 1.50);

        const tokens = 500000;

        const resultM = perMillion.CalculateNormalizedCost(costM as never, tokens, tokens);
        const resultK = perThousand.CalculateNormalizedCost(costK as never, tokens, tokens);
        const resultHK = perHundredK.CalculateNormalizedCost(costHK as never, tokens, tokens);

        expect(resultM).toBeCloseTo(resultK, 10);
        expect(resultM).toBeCloseTo(resultHK, 10);
    });
});

describe('TimePerMinutePriceUnitType', () => {
    let calculator: TimePerMinutePriceUnitType;

    beforeEach(() => {
        calculator = new TimePerMinutePriceUnitType();
    });

    it('measures in Seconds, not Tokens', () => {
        expect(calculator.UnitKind).toBe('Seconds');
    });

    it('prices 90 seconds at OpenAI whisper-1 list pricing ($0.006/min)', () => {
        const cost = createMockCost(0.006, 0);
        expect(calculator.CalculateNormalizedCost(cost as never, 90, 0)).toBeCloseTo(0.009, 10);
    });

    it('prices output audio seconds at the output rate', () => {
        const cost = createMockCost(0, 0.015);
        expect(calculator.CalculateNormalizedCost(cost as never, 0, 120)).toBeCloseTo(0.03, 10);
    });

    it('returns 0 for zero duration', () => {
        const cost = createMockCost(0.006, 0.015);
        expect(calculator.CalculateNormalizedCost(cost as never, 0, 0)).toBe(0);
    });

    it('satisfies the AC1 divisor probe: one minute in + one minute out costs input + output', () => {
        const cost = createMockCost(2.5, 10);
        expect(calculator.CalculateNormalizedCost(cost as never, 60, 60)).toBeCloseTo(12.5, 10);
    });
});

describe('TimePerHourPriceUnitType', () => {
    let calculator: TimePerHourPriceUnitType;

    beforeEach(() => {
        calculator = new TimePerHourPriceUnitType();
    });

    it('measures in Seconds — the recorded quantity is always seconds regardless of the rate period', () => {
        expect(calculator.UnitKind).toBe('Seconds');
    });

    it('prices 90 minutes of audio at Groq whisper-large-v3 list pricing ($0.111/hr)', () => {
        const cost = createMockCost(0.111, 0);
        expect(calculator.CalculateNormalizedCost(cost as never, 5400, 0)).toBeCloseTo(0.1665, 10);
    });

    it('agrees with the per-minute driver for an equivalent rate', () => {
        const perHour = new TimePerHourPriceUnitType();
        const perMinute = new TimePerMinutePriceUnitType();
        // $0.36/hour is the same rate as $0.006/minute
        const hourly = createMockCost(0.36, 0);
        const perMin = createMockCost(0.006, 0);
        const seconds = 4321;
        expect(perHour.CalculateNormalizedCost(hourly as never, seconds, 0))
            .toBeCloseTo(perMinute.CalculateNormalizedCost(perMin as never, seconds, 0), 10);
    });

    it('satisfies the AC1 divisor probe: one hour in + one hour out costs input + output', () => {
        const cost = createMockCost(2.5, 10);
        expect(calculator.CalculateNormalizedCost(cost as never, 3600, 3600)).toBeCloseTo(12.5, 10);
    });
});

describe('PerImagePriceUnitType', () => {
    let calculator: PerImagePriceUnitType;

    beforeEach(() => {
        calculator = new PerImagePriceUnitType();
    });

    it('measures in Images', () => {
        expect(calculator.UnitKind).toBe('Images');
    });

    it('prices generated images off the output rate, which is where image cost rows carry it', () => {
        const cost = createMockCost(0, 0.04);
        expect(calculator.CalculateNormalizedCost(cost as never, 0, 3)).toBeCloseTo(0.12, 10);
    });

    it('returns 0 when nothing was generated', () => {
        const cost = createMockCost(0, 0.04);
        expect(calculator.CalculateNormalizedCost(cost as never, 0, 0)).toBe(0);
    });

    it('satisfies the AC1 divisor probe: one image in + one image out costs input + output', () => {
        const cost = createMockCost(2.5, 10);
        expect(calculator.CalculateNormalizedCost(cost as never, 1, 1)).toBeCloseTo(12.5, 10);
    });
});

describe('CalculateCost — the quantity-based entry point', () => {
    it('defaults to Tokens for drivers that predate continuous-media pricing', () => {
        expect(new PerMillionTokensPriceUnitType().UnitKind).toBe('Tokens');
    });

    it('is identical to CalculateNormalizedCostWithCache for token drivers, including cache buckets', () => {
        const calculator = new PerMillionTokensPriceUnitType();
        const cost = createMockCost(3.0, 15.0, 0.3, 3.75);
        const viaUsage = calculator.CalculateCost(cost as never, {
            input: 400_000, output: 200_000, cacheRead: 300_000, cacheWrite: 100_000
        });
        const viaLegacy = calculator.CalculateNormalizedCostWithCache(cost as never, 400_000, 300_000, 100_000, 200_000);
        expect(viaUsage).toBeCloseTo(viaLegacy, 10);
    });

    it('treats omitted cache buckets as zero', () => {
        const calculator = new PerThousandTokensPriceUnitType();
        const cost = createMockCost(0.003, 0.015);
        expect(calculator.CalculateCost(cost as never, { input: 1000, output: 2000 }))
            .toBeCloseTo(0.003 + 0.03, 10);
    });

    it('folds cache buckets into input for the time drivers, which never see them non-zero', () => {
        const calculator = new TimePerMinutePriceUnitType();
        const cost = createMockCost(0.006, 0);
        expect(calculator.CalculateCost(cost as never, { input: 60, output: 0 })).toBeCloseTo(0.006, 10);
    });
});

describe('LinearPriceUnitType — priced entirely from its own catalog row', () => {
    /** A `MJ: AI Model Price Unit Types` row as the engine hands it to the driver. */
    const row = (usageType: string, unitsPerBillingUnit: number) =>
        ({ UsageType: usageType, UnitsPerBillingUnit: unitsPerBillingUnit } as never);

    it('takes its measure from the row, not from code', () => {
        expect(new LinearPriceUnitType(row('Seconds', 60)).UnitKind).toBe('Seconds');
        expect(new LinearPriceUnitType(row('Images', 1)).UnitKind).toBe('Images');
        expect(new LinearPriceUnitType(row('Characters', 1000)).UnitKind).toBe('Characters');
    });

    it('takes its divisor from the row, so a new linear unit type needs no code', () => {
        // The B60 fix: 'Per 1,000 Characters' is one seeded row, not a row + a class + a release.
        const driver = new LinearPriceUnitType(row('Characters', 1000));
        const cost = createMockCost(2, 0);
        // 1000 characters at $2 per 1000 = exactly $2.
        expect(driver.CalculateNormalizedCost(cost as never, 1000, 0)).toBeCloseTo(2, 10);
        expect(driver.UnitsPerBillingUnit).toBe(1000);
    });

    it('reproduces a hardcoded driver exactly, given the same row values', () => {
        // If the data-driven path disagreed with the hardcoded one, migrating a unit type from a
        // class to a row would silently re-price every run through it.
        const cost = createMockCost(0.111, 0.222);
        const linear = new LinearPriceUnitType(row('Seconds', 3600));
        const hardcoded = new TimePerHourPriceUnitType();
        for (const seconds of [1, 60, 1234.5, 7200]) {
            expect(linear.CalculateNormalizedCost(cost as never, seconds, 0))
                .toBeCloseTo(hardcoded.CalculateNormalizedCost(cost as never, seconds, 0), 12);
        }
    });

    it('falls back to the identity divisor rather than producing Infinity or NaN', () => {
        // The database carries CHECK (UnitsPerBillingUnit > 0), so reaching this means something
        // bypassed the constraint — a poisoned cost is worse than a wrong-scale one.
        const cost = createMockCost(5, 0);
        for (const bad of [0, -60, Number.NaN, Number.POSITIVE_INFINITY]) {
            const driver = new LinearPriceUnitType(row('Tokens', bad));
            expect(driver.UnitsPerBillingUnit).toBe(1);
            expect(Number.isFinite(driver.CalculateNormalizedCost(cost as never, 3, 0))).toBe(true);
        }
    });
});

describe('The catalog row is authoritative for every driver, not just Linear', () => {
    const row = (usageType: string, unitsPerBillingUnit: number) =>
        ({ UsageType: usageType, UnitsPerBillingUnit: unitsPerBillingUnit } as never);

    it('a hardcoded driver prices by its ROW divisor when one is supplied', () => {
        // Before this, UnitsPerBillingUnit was decoration: an admin could edit Per Hour to 7200
        // through the generated form, save, and change nothing about how anything priced — the mirror
        // image of B60, where the data was present and the code ignored it.
        const cost = createMockCost(3.6, 0);
        const perHour = new TimePerHourPriceUnitType(row('Seconds', 7200));
        expect(perHour.UnitsPerBillingUnit).toBe(7200);
        // 7200 seconds at $3.60 per billing unit = exactly $3.60, not the $7.20 a 3600 divisor gives.
        expect(perHour.CalculateNormalizedCost(cost as never, 7200, 0)).toBeCloseTo(3.6, 10);
    });

    it('falls back to the compiled-in literal when no row was supplied', () => {
        // Direct instantiation — tests, and any consumer wanting a scale without loading the engine.
        expect(new TimePerHourPriceUnitType().UnitsPerBillingUnit).toBe(3_600);
        expect(new TimePerMinutePriceUnitType().UnitsPerBillingUnit).toBe(60);
        expect(new PerMillionTokensPriceUnitType().UnitsPerBillingUnit).toBe(1_000_000);
        expect(new PerImagePriceUnitType().UnitsPerBillingUnit).toBe(1);
    });

    it('ignores a non-positive row value and uses the literal, so cost stays finite', () => {
        expect(new TimePerHourPriceUnitType(row('Seconds', 0)).UnitsPerBillingUnit).toBe(3_600);
        expect(new TimePerHourPriceUnitType(row('Seconds', Number.NaN)).UnitsPerBillingUnit).toBe(3_600);
    });

    it('keeps the exported token divisor map on the literals, since it is built without rows', () => {
        // The map is derived from instances constructed with no row, so it reports the compiled-in
        // scales — which is what the dashboards want: the shipped shape, not one deployment's edits.
        expect(TOKEN_PRICE_UNIT_TYPE_DIVISORS['PerMillionTokens']).toBe(1_000_000);
    });

    it('defaults to Tokens and 1 when constructed with no row at all', () => {
        const driver = new LinearPriceUnitType();
        expect(driver.UnitKind).toBe('Tokens');
        expect(driver.UnitsPerBillingUnit).toBe(1);
    });

    it('applies per-bucket cache rates on the row divisor', () => {
        const cost = createMockCost(3, 15);
        cost.CacheReadPricePerUnit = 0.3;
        const driver = new LinearPriceUnitType(row('Tokens', 1_000_000));
        const expected =
            (100_000 / 1_000_000) * 3 + (200_000 / 1_000_000) * 0.3 + (50_000 / 1_000_000) * 15;
        expect(driver.CalculateNormalizedCostWithCache(cost as never, 100_000, 200_000, 0, 50_000))
            .toBeCloseTo(expected, 12);
    });
});

describe('TOKEN_PRICE_UNIT_TYPE_DIVISORS', () => {
    it('carries exactly the token drivers, and nothing measured in another unit', () => {
        // Consumers doing token-rate math (the Explorer cost dashboards) key off this map, so a
        // continuous-media driver leaking in would put an hourly rate through a per-token divisor.
        // A missing key is the signal to SKIP the row — which is why there is no all-drivers map.
        expect(TOKEN_PRICE_UNIT_TYPE_DIVISORS).toEqual({
            PerMillionTokens: 1_000_000,
            PerHundredThousandTokens: 100_000,
            PerThousandTokens: 1_000
        });
    });

    it('has no entry for the continuous-media drivers, so token math cannot silently consume them', () => {
        expect(TOKEN_PRICE_UNIT_TYPE_DIVISORS['TimePerHour']).toBeUndefined();
        expect(TOKEN_PRICE_UNIT_TYPE_DIVISORS['TimePerMinute']).toBeUndefined();
        expect(TOKEN_PRICE_UNIT_TYPE_DIVISORS['PerImage']).toBeUndefined();
    });

    it('is derived from the drivers, so the map and the pricing math cannot disagree', () => {
        // Not a drift DETECTOR any more — the map is built from these very instances, so this
        // asserts the derivation is wired to the driver each key claims to describe.
        const byDriverClass: ReadonlyArray<[string, BasePriceUnitType]> = [
            ['PerMillionTokens', new PerMillionTokensPriceUnitType()],
            ['PerHundredThousandTokens', new PerHundredThousandTokensPriceUnitType()],
            ['PerThousandTokens', new PerThousandTokensPriceUnitType()]
        ];
        const cost = createMockCost(1, 0);
        for (const [driverClass, driver] of byDriverClass) {
            const divisor = TOKEN_PRICE_UNIT_TYPE_DIVISORS[driverClass];
            expect(divisor).toBe(driver.UnitsPerBillingUnit);
            // One divisor's worth of input priced at $1/unit is exactly $1.
            expect(driver.CalculateNormalizedCost(cost as never, divisor, 0)).toBeCloseTo(1, 10);
        }
    });

    it('reports UnitsPerBillingUnit for the continuous-media drivers too, even though they are not in the map', () => {
        // The property is the single home of every divisor; the map is only the token-safe subset.
        expect(new TimePerMinutePriceUnitType().UnitsPerBillingUnit).toBe(60);
        expect(new TimePerHourPriceUnitType().UnitsPerBillingUnit).toBe(3_600);
        expect(new PerImagePriceUnitType().UnitsPerBillingUnit).toBe(1);
    });
});

describe('ModelUsageUnitKind vs. the AIUsageType catalog', () => {
    /**
     * These two are one concept expressed in two places, and the DATABASE side is the source.
     * `MJAIPromptRunEntityServer` resolves a run's `UsageTypeID` to the catalog row's `Name` and
     * assigns that string into `ModelUsageUnitKind`:
     *
     *     unitsKind: usageTypeName as ModelUsageUnitKind | null
     *
     * Nothing about that is checked by the compiler — the name arrives as a plain `string` from a
     * database row — so a usage type seeded with a name this union does not carry produces no build
     * error at all. It produces a RUNTIME hole instead: every run recorded in that measure reaches
     * the driver lookup, matches nothing, and is refused as unpriceable. Silent, and only on the
     * rows that use the new measure.
     *
     * That is why this test reads the migration rather than restating its contents. A hand-copied
     * list here would drift the moment someone adds a row, which is precisely the event it exists
     * to catch.
     */
    const MIGRATION = resolve(__dirname, '../../../../../migrations/v6/V202608092321__v6.1.x__AIPromptRun_Continuous_Units.sql');

    /** The names the migration actually seeds into AIUsageType. */
    function seededUsageTypeNames(): string[] {
        const sql = readFileSync(MIGRATION, 'utf-8');
        const insert = sql.indexOf('INSERT INTO ${flyway:defaultSchema}.AIUsageType');
        expect(insert, 'the AIUsageType seed INSERT must exist in the migration').toBeGreaterThan(-1);
        // Each seeded row is `(@UsageTypeX, 'Name', '...')` — take the first quoted literal per row.
        const block = sql.slice(insert, sql.indexOf('GO', insert));
        return [...block.matchAll(/\(\s*@UsageType\w+\s*,\s*'([^']+)'/g)].map((m) => m[1]);
    }

    it('carries every usage type the migration seeds', () => {
        const seeded = seededUsageTypeNames();

        expect(seeded.length, 'the seed INSERT should have been parsed').toBeGreaterThan(0);
        for (const name of seeded) {
            expect(
                MODEL_USAGE_UNIT_KINDS as readonly string[],
                `AIUsageType seeds '${name}', so ModelUsageUnitKind must carry it or every run ` +
                `recorded in that measure is silently unpriceable`
            ).toContain(name);
        }
    });

    it('seeds Tokens, which the NOT NULL default on AIModelCost.UsageTypeID depends on', () => {
        // The column is `NOT NULL CONSTRAINT DF_AIModelCost_UsageTypeID DEFAULT '<Tokens id>'`.
        // If that row stopped being seeded the default would point at a non-existent parent and the
        // foreign key would reject every insert — including the ones the release-time metadata-sync
        // migration makes through the pre-existing stored procedure.
        expect(seededUsageTypeNames()).toContain('Tokens');
    });

    /**
     * A kind with no driver is NOT a defect — the costing path refuses to price it and logs why,
     * which is the intended behaviour and strictly better than dividing seconds by a million and
     * reporting the ~$0 that produces. What this pins is that the set of driverless kinds is a
     * deliberate, enumerated list rather than an accident, so adding a kind forces a decision
     * about its driver instead of silently producing uncosted runs.
     */
    it('documents which kinds have a driver and which are knowingly unpriceable', () => {
        // Derived from the driver classes rather than restated as a literal list. A hardcoded set
        // goes stale in the direction that matters: shipping the documented `PerCharacter` driver
        // would leave a restated set unchanged, so `Characters` would still look driverless and
        // the assertion below would keep passing while its own premise had become false.
        const driverClasses = [
            PerMillionTokensPriceUnitType,
            PerThousandTokensPriceUnitType,
            PerHundredThousandTokensPriceUnitType,
            TimePerMinutePriceUnitType,
            TimePerHourPriceUnitType,
            PerImagePriceUnitType
        ];
        const kindsWithDrivers = new Set<ModelUsageUnitKind>(driverClasses.map(C => new C().UnitKind));

        // A RECORD keyed by the union, not an array of it. `ReadonlyArray<ModelUsageUnitKind>` has
        // no exhaustiveness semantics whatsoever — adding `'Frames'` to the union and omitting it
        // from an array literal compiles clean, so a new kind would escape this inventory entirely
        // and the assertion would stay green while the answer was wrong. A `Record` keyed by the
        // union does not compile with a member missing, which is the property this test needs.
        const declaredKinds: Record<ModelUsageUnitKind, true> = {
            Tokens: true,
            Seconds: true,
            Characters: true,
            Images: true
        };
        const withoutDriver = (Object.keys(declaredKinds) as ModelUsageUnitKind[])
            .filter(k => !kindsWithDrivers.has(k));

        // `Characters` is the only one, and it is expected: per-character TTS billing is coming,
        // and the value has to exist in the CHECK before a driver can reference it. Anything else
        // appearing here means a kind shipped without the driver that makes it costable. Compared
        // as a set, so a new kind's insertion position does not decide the failure message.
        expect(new Set(withoutDriver)).toEqual(new Set(['Characters']));
    });
});
