import { ModelUsageUnitKind } from "@memberjunction/ai";
import { MJAIModelCostEntity, MJAIModelPriceUnitTypeEntity } from "@memberjunction/core-entities";
import { RegisterClass, RequiresSubclass } from "@memberjunction/global";

/**
 * The DriverClass a price unit type names to be priced from its own row rather than from code.
 *
 * Seeding a row with this driver, a `UsageTypeID` and a `UnitsPerBillingUnit` is all a new LINEAR
 * billing unit needs — no class, no registration, no build. See {@link LinearPriceUnitType}.
 */
export const LINEAR_PRICE_UNIT_DRIVER_CLASS = 'Linear';

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
 * This class serves as the abstract base class for handling price unit
 * types and is used by different price unit types implementations.
 *
 * ## Why `@RequiresSubclass()`
 * `CalculateNormalizedCost` is abstract, and `abstract` is erased at runtime — so without this
 * marker `ClassFactory.CreateInstance(BasePriceUnitType, 'NoSuchDriver')` falls back to
 * `new BasePriceUnitType()` and hands back a HOLLOW object whose only pricing method is
 * `undefined`. Every `if (!calculator)` guard written against that call is a dead branch, and the
 * failure surfaces as a `TypeError` inside cost math rather than as "this driver is not
 * registered".
 *
 * The `UnitKind` default below makes the hollow instance especially convincing: it answers
 * `'Tokens'`, so a token-billed run passes the kind check, proceeds, and only then throws. The
 * marker turns all of that into an explicit resolution failure — `CreateInstance` throws with
 * context, `TryCreateInstance` reports `{Resolved: false, Instance: null}`, and
 * {@link AIEngineBase.GetPriceCalculator}'s null return becomes real.
 */
@RequiresSubclass()
export abstract class BasePriceUnitType {
    /**
     * The `MJ: AI Model Price Unit Types` row this driver was resolved for, when the caller supplied
     * it — {@link AIEngineBase.GetPriceCalculator} always does.
     *
     * Optional, and read by no built-in driver except {@link LinearPriceUnitType}: the hardcoded
     * drivers know their own measure and scale, and any subclass outside this repo predates the
     * parameter entirely and keeps working because extra constructor arguments are inert in JS.
     * It exists so a driver CAN be configured by data instead of by code.
     */
    protected readonly PriceUnitType?: MJAIModelPriceUnitTypeEntity;

    constructor(priceUnitType?: MJAIModelPriceUnitTypeEntity) {
        this.PriceUnitType = priceUnitType;
    }

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
     * How many quantities in this driver's {@link UnitKind} make up ONE billed unit — 1,000,000 for
     * a per-million-tokens rate, 3,600 for a per-hour rate, 1 for a per-image rate.
     *
     * This is the divisor the pricing math applies, exposed as a property so it exists in exactly
     * ONE place per driver. Consumers that need the scale of a cost row without doing the math
     * (the Explorer cost dashboards) read it from here rather than restating the table; a restated
     * copy is a second source of truth for the arithmetic that prices every run.
     *
     * Defaults to 1 — "the quantity IS the number of billed units" — which is both the correct
     * answer for a per-image rate and a safe default for any subclass outside this repo that
     * predates this property.
     */
    public get UnitsPerBillingUnit(): number {
        return 1;
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
    public override get UnitsPerBillingUnit(): number {
        return 1_000_000;
    }

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
        return this.InternalCalculateNormalizedCost(this.UnitsPerBillingUnit, activeCost, inputTokens, outputTokens);
    }

    override CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        return this.InternalCalculateNormalizedCostWithCache(
            this.UnitsPerBillingUnit, activeCost, uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
        );
    }
}
 

@RegisterClass(BasePriceUnitType,'PerThousandTokens')
export class PerThousandTokensPriceUnitType extends BasePriceUnitType {
    public override get UnitsPerBillingUnit(): number {
        return 1_000;
    }

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
        return this.InternalCalculateNormalizedCost(this.UnitsPerBillingUnit, activeCost, inputTokens, outputTokens);
    }

    override CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        return this.InternalCalculateNormalizedCostWithCache(
            this.UnitsPerBillingUnit, activeCost, uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
        );
    }
}

@RegisterClass(BasePriceUnitType,'PerHundredThousandTokens')
export class PerHundredThousandTokensPriceUnitType extends BasePriceUnitType {
    public override get UnitsPerBillingUnit(): number {
        return 100_000;
    }

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
        return this.InternalCalculateNormalizedCost(this.UnitsPerBillingUnit, activeCost, inputTokens, outputTokens);
    }

    override CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        return this.InternalCalculateNormalizedCostWithCache(
            this.UnitsPerBillingUnit, activeCost, uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
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
    public override get UnitKind(): ModelUsageUnitKind {
        return 'Seconds';
    }

    /**
     * Seconds per unit of the price row's period — 60 for a per-minute rate, 3600 for per-hour.
     *
     * Declared through the inherited {@link BasePriceUnitType.UnitsPerBillingUnit} rather than a
     * separate `SecondsPerUnit` hook, so a time driver's divisor is readable by the same generic
     * accessor as every other driver's. Two names for one number is what let the exported divisor
     * table drift from the drivers in the first place.
     */
    public abstract override get UnitsPerBillingUnit(): number;

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
        return this.InternalCalculateNormalizedCost(this.UnitsPerBillingUnit, activeCost, inputSeconds, outputSeconds);
    }
}

@RegisterClass(BasePriceUnitType,'TimePerMinute')
export class TimePerMinutePriceUnitType extends BaseTimePriceUnitType {
    public override get UnitsPerBillingUnit(): number {
        return 60;
    }
}

@RegisterClass(BasePriceUnitType,'TimePerHour')
export class TimePerHourPriceUnitType extends BaseTimePriceUnitType {
    public override get UnitsPerBillingUnit(): number {
        return 3_600;
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
        // UnitsPerBillingUnit is the inherited default of 1 — an image IS the billed unit.
        return this.InternalCalculateNormalizedCost(this.UnitsPerBillingUnit, activeCost, inputImages, outputImages);
    }
}

/**
 * Prices any LINEAR billing unit entirely from its own `MJ: AI Model Price Unit Types` row.
 *
 * ## Why this exists — it closes B60's class, not just its instance
 *
 * The three continuous-media unit types that shipped uncosted (`Per Image`, `Per Minute`,
 * `Per Hour`) were seeded as DATA by one person while the driver classes that price them were
 * never written by another. The seam was silent for months. Every hardcoded driver below is a
 * standing invitation to repeat that: seeding a row is not sufficient, so a row can always exist
 * without the code that gives it meaning.
 *
 * With the measure (`UsageTypeID`) and the divisor (`UnitsPerBillingUnit`) held as columns, a linear
 * unit type needs no code at all — it names this driver and states its own arithmetic. "Per 1,000
 * Characters" becomes one seeded row rather than a row plus a class plus a registration plus a
 * release.
 *
 * ## Why unregistered driver names still refuse
 *
 * This is opt-in via `DriverClass = 'Linear'` rather than a fallback for any unresolvable driver.
 * `DriverClass` is NOT NULL, so every row names something, and an unrecognised name is ambiguous
 * between "a new linear unit type" and "a genuinely non-linear driver whose code is missing". Pricing
 * the second linearly would produce a confident wrong number, which is the one outcome this whole
 * subsystem is built to avoid. So an unknown driver keeps refusing, and a row that WANTS data-driven
 * pricing says so.
 *
 * `DriverClass` therefore remains the escape hatch for genuinely non-linear pricing: tiered rates,
 * per-image-by-resolution, or minimum-billing increments such as the Groq 10-second floor.
 */
@RegisterClass(BasePriceUnitType, LINEAR_PRICE_UNIT_DRIVER_CLASS)
export class LinearPriceUnitType extends BasePriceUnitType {
    /**
     * The measure named by the row's usage type. Falls back to `Tokens` only when this driver was
     * constructed with no row at all, which `GetPriceCalculator` never does — a caller that
     * instantiates it directly gets the same default every other driver has.
     */
    public override get UnitKind(): ModelUsageUnitKind {
        const name = this.PriceUnitType?.UsageType;
        return (name as ModelUsageUnitKind | undefined) ?? 'Tokens';
    }

    /**
     * The row's divisor. A non-positive or non-finite value would turn cost into Infinity or NaN, so
     * it falls back to 1 — the identity — rather than propagating a poisoned number into a persisted
     * cost. The database also carries `CK_AIModelPriceUnitType_UnitsPerBillingUnit CHECK (> 0)`, so
     * reaching this fallback means something bypassed the constraint.
     */
    public override get UnitsPerBillingUnit(): number {
        const raw = Number(this.PriceUnitType?.UnitsPerBillingUnit);
        return Number.isFinite(raw) && raw > 0 ? raw : 1;
    }

    CalculateNormalizedCost(
        activeCost: MJAIModelCostEntity,
        inputQuantity: number,
        outputQuantity: number
    ): number {
        return this.InternalCalculateNormalizedCost(this.UnitsPerBillingUnit, activeCost, inputQuantity, outputQuantity);
    }

    override CalculateNormalizedCostWithCache(
        activeCost: MJAIModelCostEntity,
        uncachedInputTokens: number,
        cacheReadTokens: number,
        cacheWriteTokens: number,
        outputTokens: number
    ): number {
        // Per-bucket rates are meaningful for token measures and inert for the others (no vendor
        // caches audio or images), so applying them uniformly is correct either way: with no cache
        // quantities recorded, this reduces exactly to input + output at their own rates.
        return this.InternalCalculateNormalizedCostWithCache(
            this.UnitsPerBillingUnit, activeCost, uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens
        );
    }
}

/**
 * The divisor each TOKEN-measured price unit type normalizes by, keyed by DriverClass.
 *
 * Token-rate math — cache-savings figures, per-token cost splits — is meaningful only for these. A
 * consumer doing that math must SKIP a cost row priced by audio duration or by the image rather than
 * fall back to a token divisor, which would divide an hourly rate by a million and report noise.
 * Restricting the map to the token drivers is what makes a missing key the correct signal to skip
 * rather than something to paper over with a default.
 *
 * Keyed by **DriverClass**, never by the unit type's display name: the names are editable metadata
 * (`Per 1M Tokens` today) while the driver class is the contract the ClassFactory resolves. The keys
 * are written out rather than read from `constructor.name`, which minifiers rewrite — this map is
 * consumed by the Explorer dashboards, where that would silently empty it.
 *
 * **The NUMBERS are derived from the driver instances, never restated here.** They live in exactly
 * one place per driver — {@link BasePriceUnitType.UnitsPerBillingUnit} — because a hand-written copy
 * of the arithmetic that prices every run is a second source of truth held together by nothing but a
 * unit test. Deriving makes drift impossible instead of merely detectable.
 */
export const TOKEN_PRICE_UNIT_TYPE_DIVISORS: Readonly<Record<string, number>> = Object.freeze(
    Object.fromEntries(
        ([
            ['PerMillionTokens', new PerMillionTokensPriceUnitType()],
            ['PerHundredThousandTokens', new PerHundredThousandTokensPriceUnitType()],
            ['PerThousandTokens', new PerThousandTokensPriceUnitType()]
        ] as ReadonlyArray<readonly [string, BasePriceUnitType]>)
            .map(([driverClass, driver]) => [driverClass, driver.UnitsPerBillingUnit])
    )
);
