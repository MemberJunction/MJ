/**
 * @fileoverview REALTIME COST LINES: the pure math that prices a realtime run's generated avatar video on a line of its
 * own, and the record of how the run's cost splits, written into `ModelSpecificResponseDetails` under `CostLines` when
 * the run is priced.
 *
 * A realtime call is one prompt run priced by one cost row. Avatar video has its own price, in the model vendor's
 * resolved configuration (`Realtime.Pricing.AvatarVideoOutput`), per minute or per 1M tokens. The run's cost is then
 * its default line (the cost row, over the run's token columns less the output tokens the provider counted as video)
 * plus the video line: the stored output video seconds at a per-minute price, or the stored output video tokens at a
 * per-token price.
 *
 * Pure: no entity or engine access; `MJAIPromptRunEntityServer` resolves the cost row and the configuration.
 */
import type { AIModelConfiguration, JSONObject, JSONValue, RealtimeUnitPrice } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';
import { ModelResponseDetailsForWrite, ParseModelResponseDetails } from './ModelResponseDetails';
import type { NormalizedUsage } from './PriceUnitTypes';
import type { RealtimeUsageRecord } from './RealtimeUsageRecord';

/** The `ModelSpecificResponseDetails` key that holds a priced run's {@link PromptRunCostLine} list. */
export const COST_LINES_DETAILS_KEY = 'CostLines';

/** The {@link PromptRunCostLine.Modality} of the line that prices a generated avatar's video. */
export const AVATAR_VIDEO_COST_LINE_MODALITY = 'Video';

/** One line of a prompt run's cost. The lines add up to the run's `Cost`, in its `CostCurrency`. */
export interface PromptRunCostLine {
    /** `null` for the default line (the run's cost row); `'Video'` for the avatar video line. */
    Modality: string | null;
    /** The `MJ: AI Model Costs` row that priced the line; `null` for a line priced from the model configuration. */
    CostRowID: string | null;
    /**
     * What the line's quantities count. The default line counts in its cost row's measure (`'Tokens'`, or `'Seconds'`
     * for a time-priced run); the avatar video line counts `'Seconds'` at a per-minute price, `'Tokens'` at a per-token
     * price.
     */
    Measure: string;
    /** The input quantity priced on the line, cache reads and writes included. */
    Input: number;
    /** The output quantity priced on the line; on the default line, after the video line took its tokens. */
    Output: number;
    /** The line's cost, to 8 decimals. */
    Cost: number;
}

/** Why a run's avatar video was not priced on its own line. */
export type AvatarVideoUnpricedReason = 'no-price' | 'unit' | 'currency' | 'no-seconds' | 'no-tokens';

/** An avatar video line priced from the configuration. */
export interface PricedAvatarVideo {
    Priced: true;
    /** What the line priced: the output video `'Seconds'` at a per-minute price, or its `'Tokens'` at a per-token price. */
    Measure: 'Seconds' | 'Tokens';
    /** The output video seconds the run stored; the quantity priced when {@link PricedAvatarVideo.Measure} is `'Seconds'`. */
    Seconds: number;
    /** The line's cost, to 8 decimals. */
    Cost: number;
    /**
     * The output tokens the provider counted as video, which leave the default line's output bucket; the quantity priced
     * when {@link PricedAvatarVideo.Measure} is `'Tokens'`.
     */
    VideoTokens: number;
}

/** Avatar video the run stored but that could not be priced on its own line; it prices as before, in the tokens. */
export interface UnpricedAvatarVideo {
    Priced: false;
    Reason: AvatarVideoUnpricedReason;
}

/** The default line's quantities after a priced video line took its tokens. */
export interface AvatarVideoTokenExclusion {
    Usage: NormalizedUsage;
    /** The video tokens were more than the output bucket held, so the bucket stopped at 0. */
    Clamped: boolean;
}

/** What one avatar video price unit prices, and how many of that quantity one billed unit holds. */
interface AvatarVideoPriceUnit {
    Measure: PricedAvatarVideo['Measure'];
    PerBillingUnit: number;
}

/**
 * The avatar video price units this prices, with the measure and size the `MJ: AI Model Price Unit Types` row of the
 * same name gives them (`UsageTypeID`, `UnitsPerBillingUnit`): a minute is 60 seconds, the token unit a million tokens.
 * Keyed by the configuration's unit type, so a unit added there does not compile until it is priced here.
 */
const AVATAR_VIDEO_PRICE_UNITS: ReadonlyMap<string, AvatarVideoPriceUnit> = new Map(
    Object.entries({
        'Per Minute': { Measure: 'Seconds', PerBillingUnit: 60 },
        'Per 1M Tokens': { Measure: 'Tokens', PerBillingUnit: 1_000_000 },
    } satisfies Record<NonNullable<RealtimeUnitPrice['Unit']>, AvatarVideoPriceUnit>)
);

/** A configured avatar video price that can price the run: its amount and its unit. */
interface UsableAvatarVideoPrice extends AvatarVideoPriceUnit {
    Price: number;
}

/**
 * Prices the avatar video a realtime run stored at the price in the model vendor's resolved configuration: its output
 * video seconds at a `'Per Minute'` price, or its output video tokens at a `'Per 1M Tokens'` price. `null` when the
 * run stored no avatar video (no output video seconds and no video tokens). Otherwise either the priced line, or why
 * the video stays priced as before: no usable price (a partial price counts as none), a unit other than those two, a
 * currency other than the cost row's, or nothing stored in the price's measure (video tokens without seconds at a
 * per-minute price, seconds without video tokens at a per-token price).
 *
 * @param record The run's stored usage record.
 * @param configuration The model vendor's resolved model configuration.
 * @param rowCurrency The currency of the run's cost row, which the run's cost is in.
 */
export function PriceAvatarVideoOutput(
    record: RealtimeUsageRecord | null,
    configuration: AIModelConfiguration | null,
    rowCurrency: string
): PricedAvatarVideo | UnpricedAvatarVideo | null {
    const seconds = record?.Output?.VideoSeconds ?? 0;
    const videoTokens = record?.Output?.VideoTokens ?? 0;
    if (seconds <= 0 && videoTokens <= 0) {
        return null;
    }
    const price = readAvatarPrice(configuration?.Realtime?.Pricing?.AvatarVideoOutput ?? null, rowCurrency);
    if (typeof price === 'string') {
        return { Priced: false, Reason: price };
    }
    const quantity = price.Measure === 'Tokens' ? videoTokens : seconds;
    if (quantity <= 0) {
        return { Priced: false, Reason: price.Measure === 'Tokens' ? 'no-tokens' : 'no-seconds' };
    }
    return {
        Priced: true,
        Measure: price.Measure,
        Seconds: seconds,
        Cost: RoundCost((quantity / price.PerBillingUnit) * price.Price),
        VideoTokens: videoTokens,
    };
}

/**
 * Takes the output tokens a priced avatar video line covers out of the default line's output bucket: the provider
 * counted them in the run's output total, and the video line prices them now. The bucket never goes below 0.
 *
 * @param usage The default line's quantities.
 * @param videoTokens The output tokens the provider counted as video.
 */
export function ExcludeAvatarVideoTokens(usage: NormalizedUsage, videoTokens: number): AvatarVideoTokenExclusion {
    const wanted = Math.max(0, videoTokens);
    const removed = Math.min(usage.output, wanted);
    return { Usage: { ...usage, output: usage.output - removed }, Clamped: removed < wanted };
}

/**
 * The lines of a run's cost: the default line, and the avatar video line when one was priced.
 *
 * @param defaultLine The cost row's id, its measure, the quantities it priced and their cost.
 * @param video The priced avatar video line, if any.
 */
export function BuildCostLines(
    defaultLine: { CostRowID: string; Measure: string; Usage: NormalizedUsage; Cost: number },
    video: PricedAvatarVideo | null
): PromptRunCostLine[] {
    const usage = defaultLine.Usage;
    const lines: PromptRunCostLine[] = [
        {
            Modality: null,
            CostRowID: defaultLine.CostRowID,
            Measure: defaultLine.Measure,
            Input: usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0),
            Output: usage.output,
            Cost: RoundCost(defaultLine.Cost),
        },
    ];
    if (video) {
        const output = video.Measure === 'Tokens' ? video.VideoTokens : video.Seconds;
        lines.push({ Modality: AVATAR_VIDEO_COST_LINE_MODALITY, CostRowID: null, Measure: video.Measure, Input: 0, Output: output, Cost: video.Cost });
    }
    return lines;
}

/**
 * Writes a run's cost lines into its `ModelSpecificResponseDetails` under {@link COST_LINES_DETAILS_KEY}, keeping every
 * other key. `null` when the stored details are not a JSON object, which this never overwrites.
 *
 * @param details The prompt run's `ModelSpecificResponseDetails`.
 * @param lines The lines to write.
 */
export function WriteCostLines(details: string | null | undefined, lines: PromptRunCostLine[]): string | null {
    const root = ModelResponseDetailsForWrite(details);
    if (!root) {
        return null;
    }
    root[COST_LINES_DETAILS_KEY] = lines.map((line) => costLineAsJson(line));
    return JSON.stringify(root);
}

/**
 * A run's cost lines, read from its `ModelSpecificResponseDetails`. Empty when the run has none, or its details are
 * malformed; a line without a finite cost is skipped. Never throws.
 *
 * @param details The prompt run's `ModelSpecificResponseDetails`.
 */
export function ReadCostLines(details: string | null | undefined): PromptRunCostLine[] {
    const stored = ParseModelResponseDetails(details)?.[COST_LINES_DETAILS_KEY];
    if (!Array.isArray(stored)) {
        return [];
    }
    return stored.map((value) => readCostLine(value)).filter((line): line is PromptRunCostLine => line !== null);
}

/** A cost to 8 decimals, the precision of `AIPromptRun.Cost` (`decimal(19,8)`). */
export function RoundCost(cost: number): number {
    return Math.round(cost * 1e8) / 1e8;
}

/**
 * The configured price and its unit when it can price the run, or why it can't. A price applies only when all three of
 * its fields are set, so a partial price counts as none.
 */
function readAvatarPrice(price: RealtimeUnitPrice | null, rowCurrency: string): UsableAvatarVideoPrice | AvatarVideoUnpricedReason {
    if (!price || price.Price == null || price.Unit == null || price.Currency == null) {
        return 'no-price';
    }
    if (!Number.isFinite(price.Price) || price.Price < 0) {
        return 'no-price';
    }
    const unit = AVATAR_VIDEO_PRICE_UNITS.get(price.Unit);
    if (!unit) {
        return 'unit';
    }
    return price.Currency.trim().toUpperCase() === rowCurrency.trim().toUpperCase() ? { ...unit, Price: price.Price } : 'currency';
}

function costLineAsJson(line: PromptRunCostLine): JSONObject {
    return { Modality: line.Modality, CostRowID: line.CostRowID, Measure: line.Measure, Input: line.Input, Output: line.Output, Cost: line.Cost };
}

function readCostLine(value: JSONValue): PromptRunCostLine | null {
    if (!IsPlainObject(value) || typeof value['Cost'] !== 'number' || !Number.isFinite(value['Cost'])) {
        return null;
    }
    return {
        Modality: typeof value['Modality'] === 'string' ? value['Modality'] : null,
        CostRowID: typeof value['CostRowID'] === 'string' ? value['CostRowID'] : null,
        Measure: typeof value['Measure'] === 'string' ? value['Measure'] : 'Tokens',
        Input: typeof value['Input'] === 'number' ? value['Input'] : 0,
        Output: typeof value['Output'] === 'number' ? value['Output'] : 0,
        Cost: value['Cost'],
    };
}
