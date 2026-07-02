/**
 * Unit tests for PriceUnitTypes
 *
 * Tests the cost calculation logic for different pricing tiers:
 * - PerMillionTokens
 * - PerThousandTokens
 * - PerHundredThousandTokens
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal();
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
    PerMillionTokensPriceUnitType,
    PerThousandTokensPriceUnitType,
    PerHundredThousandTokensPriceUnitType,
} from '../PriceUnitTypes';

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
