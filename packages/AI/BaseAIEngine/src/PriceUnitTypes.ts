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

    /**
     * Cache-aware cost calculation: prices the three input buckets (uncached/net-new, cache reads,
     * cache writes) at their own per-unit rates, plus output. Cache reads/writes use
     * CacheReadPricePerUnit / CacheWritePricePerUnit when recorded on the cost row; when those are
     * NULL they fall back to InputPricePerUnit, which makes the result identical to the legacy
     * single-bucket pricing. This is the entry point cost calculators should prefer.
     *
     * The default implementation here preserves the legacy behavior (all input at the input rate)
     * so any external BasePriceUnitType subclass that only overrides CalculateNormalizedCost keeps
     * working unchanged. The built-in per-unit types below override it to apply per-bucket rates.
     */
    public CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        const totalInput = (uncachedInputTokens || 0) + (cacheReadTokens || 0) + (cacheWriteTokens || 0);
        return this.CalculateNormalizedCost(activeCost, totalInput, outputTokens);
    }

    /**
     * Per-bucket cost math shared by the built-in unit types. Cache rates fall back to the input
     * rate when not populated, so cost is unchanged until a model/vendor records a distinct cache
     * rate. All buckets are normalized by the same divisor (e.g. 1,000,000 for per-1M-tokens).
     */
    protected InternalCalculateNormalizedCostWithCache(
        divisor: number,
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        const inputRate = Number(activeCost.InputPricePerUnit);
        const outputRate = Number(activeCost.OutputPricePerUnit);
        const cacheReadRate = activeCost.CacheReadPricePerUnit != null
            ? Number(activeCost.CacheReadPricePerUnit)
            : inputRate;
        const cacheWriteRate = activeCost.CacheWritePricePerUnit != null
            ? Number(activeCost.CacheWritePricePerUnit)
            : inputRate;

        return (
            (uncachedInputTokens / divisor) * inputRate +
            (cacheReadTokens / divisor) * cacheReadRate +
            (cacheWriteTokens / divisor) * cacheWriteRate +
            (outputTokens / divisor) * outputRate
        );
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

    override CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        return this.InternalCalculateNormalizedCostWithCache(
            1000000, activeCost, uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
        );
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

    override CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        return this.InternalCalculateNormalizedCostWithCache(
            1000, activeCost, uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
        );
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

    override CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        return this.InternalCalculateNormalizedCostWithCache(
            100000, activeCost, uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
        );
    }
}