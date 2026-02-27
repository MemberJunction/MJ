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
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJAIModelCostEntity: class {
        InputPricePerUnit = 0;
        OutputPricePerUnit = 0;
    }
}));

import {
    PerMillionTokensPriceUnitType,
    PerThousandTokensPriceUnitType,
    PerHundredThousandTokensPriceUnitType,
} from '../PriceUnitTypes';

// Helper to create a mock cost entity
function createMockCost(inputPrice: number, outputPrice: number): { InputPricePerUnit: number; OutputPricePerUnit: number } {
    return {
        InputPricePerUnit: inputPrice,
        OutputPricePerUnit: outputPrice,
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
