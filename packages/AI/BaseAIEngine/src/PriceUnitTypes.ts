import { ModelUsageUnitKind } from "@memberjunction/ai";
import { MJAIModelCostEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

/**
 * A run's billable quantities, already split into the buckets a price unit type prices
 * separately. The numbers are in the driver's own {@link BasePriceUnitType.UnitKind} — tokens for
 * the token drivers, seconds for the time drivers, images for the per-image driver — which is why
 * the fields are named for their role rather than for tokens.
 *
 * The cache buckets are meaningful only for token pricing; continuous-media drivers ignore them.
 */
export interface NormalizedUsage {
    /** Uncached / net-new input quantity. */
    input: number;
    /** Output quantity. */
    output: number;
    /** Input quantity served from the provider's prompt cache. Token pricing only. */
    cacheRead?: number;
    /** Input quantity written to the provider's prompt cache. Token pricing only. */
    cacheWrite?: number;
}

/**
 * The divisor each TOKEN-measured price unit type normalizes by, keyed by DriverClass.
 *
 * Split out from the full table below because token-rate math — cache-savings figures, per-token
 * cost splits — is meaningful only for these. A consumer doing that math must skip a cost row
 * priced by audio duration or by the image rather than fall back to a token divisor, which would
 * divide an hourly rate by a million and report noise.
 *
 * Keyed by **DriverClass**, never by the unit type's display name: the names are editable metadata
 * (`Per 1M Tokens` today) while the driver class is the contract the ClassFactory resolves.
 */
export const TOKEN_PRICE_UNIT_TYPE_DIVISORS: Readonly<Record<string, number>> = {
    PerMillionTokens: 1_000_000,
    PerHundredThousandTokens: 100_000,
    PerThousandTokens: 1_000
};

/**
 * The divisor each built-in price unit type normalizes by, keyed by DriverClass.
 *
 * Exported so consumers that need the scale of a cost row without instantiating a driver — the
 * Explorer cost dashboards, most notably — can read it from the same place the drivers do, rather
 * than restating the table and drifting from it.
 */
export const PRICE_UNIT_TYPE_DIVISORS: Readonly<Record<string, number>> = {
    ...TOKEN_PRICE_UNIT_TYPE_DIVISORS,
    TimePerHour: 3_600,
    TimePerMinute: 60,
    PerImage: 1
};

/**
 * This class serves as the abstract base class for handling price unit
 * types and is used by different price unit types implementations.
 */
export abstract class BasePriceUnitType {
    /**
     * The base measure this driver prices. Callers must hand it quantities in this measure —
     * a driver that prices audio never receives token counts, and vice versa.
     *
     * Defaults to `Tokens`, which is what every driver that predates continuous-media pricing
     * measures, so existing subclasses need not declare it.
     */
    public get UnitKind(): ModelUsageUnitKind {
        return 'Tokens';
    }

    /**
     * Calculates normalized cost based on each sub-classes specific algorithm.
     *
     * The two quantities are expressed in this driver's {@link UnitKind}: token counts for the
     * token drivers, seconds of audio for the time drivers, a count of images for the per-image
     * driver. The parameter names are historical — they predate any non-token unit type.
     *
     * @param activeCost The active cost configuration
     * @param inputTokens Input quantity, in this driver's unit kind
     * @param outputTokens Output quantity, in this driver's unit kind
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
     * Prices a run from its quantities, whatever measure those are in. **This is the entry point
     * callers should use**: it is the only one that works uniformly across token and
     * continuous-media pricing, so a caller need not branch on which kind of model it just ran.
     *
     * The default delegates to {@link CalculateNormalizedCostWithCache}, so every existing driver —
     * including subclasses outside this repo — gets it for free with unchanged behavior.
     *
     * Callers are responsible for handing over quantities in this driver's {@link UnitKind};
     * `AIEngineBase.CalculateModelCost` verifies that before calling.
     */
    public CalculateCost(activeCost: MJAIModelCostEntity, usage: NormalizedUsage): number {
        return this.CalculateNormalizedCostWithCache(
            activeCost,
            usage.input,
            usage.cacheRead ?? 0,
            usage.cacheWrite ?? 0,
            usage.output
        );
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

/**
 * Base for the drivers that price audio by elapsed time.
 *
 * Quantities arrive in SECONDS regardless of the rate's period, and the subclass supplies the
 * divisor that converts. Recording seconds rather than the vendor's billing period is what lets
 * one measured duration be priced against a per-minute row from one vendor and a per-hour row from
 * another without the run having to know which it will be billed by.
 *
 * The cache buckets play no part: no transcription or speech vendor caches audio, so the inherited
 * {@link BasePriceUnitType.CalculateNormalizedCostWithCache} default — which folds them into input
 * at the input rate — is both correct and inert here.
 */
export abstract class BaseTimePriceUnitType extends BasePriceUnitType {
    /** Seconds per unit of the price row's period — 60 for a per-minute rate, 3600 for per-hour. */
    protected abstract get SecondsPerUnit(): number;

    public override get UnitKind(): ModelUsageUnitKind {
        return 'Seconds';
    }

    /**
     * @param activeCost The active cost configuration
     * @param inputSeconds Seconds of input audio (e.g. audio submitted for transcription)
     * @param outputSeconds Seconds of output audio (e.g. synthesized speech)
     */
    CalculateNormalizedCost(
        activeCost: MJAIModelCostEntity,
        inputSeconds: number,
        outputSeconds: number
    ): number {
        return this.InternalCalculateNormalizedCost(this.SecondsPerUnit, activeCost, inputSeconds, outputSeconds);
    }
}

@RegisterClass(BasePriceUnitType,'TimePerMinute')
export class TimePerMinutePriceUnitType extends BaseTimePriceUnitType {
    protected get SecondsPerUnit(): number {
        return 60;
    }
}

@RegisterClass(BasePriceUnitType,'TimePerHour')
export class TimePerHourPriceUnitType extends BaseTimePriceUnitType {
    protected get SecondsPerUnit(): number {
        return 3600;
    }
}

/**
 * Prices image generation by the image.
 *
 * Divisor 1 — the quantity IS the number of billed units, so there is nothing to normalize. Image
 * cost rows carry the rate in `OutputPricePerUnit` (generated images are the output), which is the
 * convention the shipped rows already follow; callers pass the count as the output quantity.
 */
@RegisterClass(BasePriceUnitType,'PerImage')
export class PerImagePriceUnitType extends BasePriceUnitType {
    public override get UnitKind(): ModelUsageUnitKind {
        return 'Images';
    }

    /**
     * @param activeCost The active cost configuration
     * @param inputImages Images supplied as input, for models that charge for them; normally 0
     * @param outputImages Images generated
     */
    CalculateNormalizedCost(
        activeCost: MJAIModelCostEntity,
        inputImages: number,
        outputImages: number
    ): number {
        return this.InternalCalculateNormalizedCost(1, activeCost, inputImages, outputImages);
    }
}
