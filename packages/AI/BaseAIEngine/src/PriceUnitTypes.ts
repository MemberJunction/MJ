import { MJAIModelCostEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

/**
 * This class serves as the abstract base class for handling price unit
 * types and is used by different price unit types implementations.
 */
export abstract class BasePriceUnitType {
    /**
     * Calculates normalized cost based on each sub-classes specific algorithm 
     * @param activeCost The active cost configuration
     * @param inputTokens Number of input tokens
     * @param outputTokens Number of output tokens
     * @returns The calculated cost
     */
    abstract CalculateNormalizedCost(
        activeCost: MJAIModelCostEntity,
        inputTokens: number,
        outputTokens: number
    ): number 

    protected InternalCalculateNormalizedCost(
        divisor: number,
        activeCost: MJAIModelCostEntity,
        inputTokens: number,
        outputTokens: number
    ): number {
        // Calculate costs
        const inputCost = (inputTokens / divisor) * Number(activeCost.InputPricePerUnit);
        const outputCost = (outputTokens / divisor) * Number(activeCost.OutputPricePerUnit);
        
        return inputCost + outputCost;
    }
}

@RegisterClass(BasePriceUnitType,'PerMillionTokens')
export class PerMillionTokensPriceUnitType extends BasePriceUnitType {
    /**
     * Calculates normalized cost for the Per Million Tokens unit type, and token counts
     * @param activeCost The active cost configuration
     * @param inputTokens Number of input tokens
     * @param outputTokens Number of output tokens
     * @returns The calculated cost
     */
    CalculateNormalizedCost(
        activeCost: MJAIModelCostEntity,
        inputTokens: number,
        outputTokens: number
    ): number {
        const divisor = 1000000; // Prices are per million tokens
        return this.InternalCalculateNormalizedCost(divisor, activeCost, inputTokens, outputTokens);
    }
}
 

@RegisterClass(BasePriceUnitType,'PerThousandTokens')
export class PerThousandTokensPriceUnitType extends BasePriceUnitType {
    /**
     * Calculates normalized cost for the Per Thousand Tokens unit type, and token counts
     * @param activeCost The active cost configuration
     * @param inputTokens Number of input tokens
     * @param outputTokens Number of output tokens
     * @returns The calculated cost
     */
    CalculateNormalizedCost(
        activeCost: MJAIModelCostEntity,
        inputTokens: number,
        outputTokens: number
    ): number {
        const divisor = 1000; // Prices are per thousand tokens
        return this.InternalCalculateNormalizedCost(divisor, activeCost, inputTokens, outputTokens);
    }
}

@RegisterClass(BasePriceUnitType,'PerHundredThousandTokens')
export class PerHundredThousandTokensPriceUnitType extends BasePriceUnitType {
    /**
     * Calculates normalized cost for the Per Hundred Thousand Tokens unit type, and token counts
     * @param activeCost The active cost configuration
     * @param inputTokens Number of input tokens
     * @param outputTokens Number of output tokens
     * @returns The calculated cost
     */
    CalculateNormalizedCost(
        activeCost: MJAIModelCostEntity,
        inputTokens: number,
        outputTokens: number
    ): number {
        const divisor = 100000; // Prices are per hundred thousand tokens
        return this.InternalCalculateNormalizedCost(divisor, activeCost, inputTokens, outputTokens);
    }
}