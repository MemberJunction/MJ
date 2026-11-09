/**
 * @fileoverview REALTIME COST LINES: the pure math that prices a realtime run's generated avatar video and its audio
 * tokens on lines of their own, and the record of how the run's cost splits, written into `ModelSpecificResponseDetails`
 * under `CostLines` when the run is priced.
 *
 * A realtime call is one prompt run priced by one cost row. Avatar video has its own price, in the model vendor's
 * resolved configuration (`Realtime.Pricing.AvatarVideoOutput`), per minute or per 1M tokens. The run's cost is then
 * its default line (the cost row, over the run's token columns less the output tokens the provider counted as video)
 * plus the video line: the stored output video seconds at a per-minute price, or the stored output video tokens at a
 * per-token price.
 *
 * Audio tokens work the same way: providers bill them at a different rate from text tokens, and a cost row holds one
 * input and one output rate. With an audio price in the configuration (`Realtime.Pricing.AudioInput` / `AudioOutput`,
 * per 1M tokens), each direction's audio tokens leave the default line's bucket and are priced on an `'Audio'` line.
 * Without one, they stay on the default line at the row's rate, and that line is marked `Blended`.
 *
 * Cached input is priced at the cost row's cache-read rate. A realtime run's `TokensPrompt` holds the provider's whole
 * input, cache hits included, and nothing writes `TokensCacheRead` on it; the record's `Input.CachedTokens` (every
 * modality) says how much of that input was a cache hit. {@link MoveCachedInputTokens} moves those tokens from the
 * default line's uncached bucket to its cache-read bucket, and the input audio line prices only the uncached audio
 * (`AudioTokens` less `CachedAudioTokens`). Cached audio is therefore priced at the row's `CacheReadPricePerUnit`
 * (the row's input rate when it has none): the configuration has no cached-audio price.
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

/** The {@link PromptRunCostLine.Modality} of a line that prices audio tokens, one line per direction. */
export const AUDIO_COST_LINE_MODALITY = 'Audio';

/** One line of a prompt run's cost. The lines add up to the run's `Cost`, in its `CostCurrency`. */
export interface PromptRunCostLine {
    /**
     * `null` for the default line (the run's cost row); `'Video'` for the avatar video line; `'Audio'` for an audio
     * line, whose {@link PromptRunCostLine.Input} or {@link PromptRunCostLine.Output} holds the audio tokens of its
     * direction (the other is 0).
     */
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
    /**
     * Set to `true` on the default line when it priced audio tokens at the cost row's text rates because the
     * configuration has no usable audio price for their direction, so a report can tell such runs apart. Absent
     * otherwise.
     */
    Blended?: boolean;
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

/** The direction of a run's audio tokens. */
export type RealtimeAudioDirection = 'Input' | 'Output';

/** Why a direction's audio tokens were not priced on a line of their own. */
export type AudioTokensUnpricedReason = 'no-price' | 'unit' | 'currency';

/** One direction's audio tokens, priced on an `'Audio'` line from the configuration. */
export interface PricedAudioTokens {
    Priced: true;
    Direction: RealtimeAudioDirection;
    /**
     * The audio tokens the line prices, which leave the default line's bucket: on the input side, the uncached audio
     * (`AudioTokens` less `CachedAudioTokens`).
     */
    Tokens: number;
    /** The line's cost, to 8 decimals. */
    Cost: number;
    /** The configured price per 1M audio tokens the line was priced at. */
    UnitPrice: number;
}

/** One direction's audio tokens that stay on the default line at the cost row's rate, and why. */
export interface UnpricedAudioTokens {
    Priced: false;
    Direction: RealtimeAudioDirection;
    Tokens: number;
    Reason: AudioTokensUnpricedReason;
}

/** How each direction's audio tokens are priced; `null` for a direction with no audio tokens stored. */
export interface AudioTokensPricing {
    Input: PricedAudioTokens | UnpricedAudioTokens | null;
    Output: PricedAudioTokens | UnpricedAudioTokens | null;
}

/** The default line's quantities after priced audio lines took their tokens. */
export interface AudioTokenExclusion {
    Usage: NormalizedUsage;
    /** The audio input tokens were more than the input bucket held, so the bucket stopped at 0. */
    ClampedInput: boolean;
    /** The audio output tokens were more than the output bucket held, so the bucket stopped at 0. */
    ClampedOutput: boolean;
    /** The input audio tokens that left the input bucket: what the input audio line may price. */
    RemovedInput: number;
    /** The output audio tokens that left the output bucket: what the output audio line may price. */
    RemovedOutput: number;
}

/** The default line's quantities after the cached input moved to the cache-read bucket. */
export interface CachedInputMove {
    Usage: NormalizedUsage;
    /** The input tokens moved from the uncached bucket to the cache-read bucket (0 when none moved). */
    Moved: number;
}

/**
 * The audio price units this prices: per 1M tokens only. The token counts are what the providers report per modality;
 * nothing records audio seconds per direction to price a per-minute rate against.
 */
const AUDIO_PRICE_UNITS: ReadonlyMap<string, number> = new Map([['Per 1M Tokens', 1_000_000]]);

/**
 * Prices the audio tokens a realtime run stored, per direction, at the prices in the model vendor's resolved
 * configuration (`Realtime.Pricing.AudioInput` / `AudioOutput`, per 1M tokens). For each direction: `null` when the
 * run stored no audio tokens for it; otherwise the priced line, or why the tokens stay on the default line at the cost
 * row's rate: no usable price (a partial price counts as none), a unit other than `'Per 1M Tokens'`, or a currency
 * other than the cost row's.
 *
 * @param record The run's stored usage record.
 * @param configuration The model vendor's resolved model configuration.
 * @param rowCurrency The currency of the run's cost row, which the run's cost is in.
 */
export function PriceAudioTokens(record: RealtimeUsageRecord | null, configuration: AIModelConfiguration | null, rowCurrency: string): AudioTokensPricing {
    const pricing = configuration?.Realtime?.Pricing;
    return {
        Input: priceAudioDirection('Input', UncachedInputAudioTokens(record), pricing?.AudioInput ?? null, rowCurrency),
        Output: priceAudioDirection('Output', record?.Output?.AudioTokens ?? 0, pricing?.AudioOutput ?? null, rowCurrency),
    };
}

/**
 * The input audio tokens a run stored that were not cache hits: `Input.AudioTokens` less `Input.CachedAudioTokens`,
 * never below 0. Providers count cached audio in the audio total (OpenAI's `cached_tokens_details.audio_tokens` is a
 * subset of `audio_tokens`), and cached audio is priced at the cache-read rate, not the audio rate.
 *
 * @param record The run's stored usage record.
 */
export function UncachedInputAudioTokens(record: RealtimeUsageRecord | null): number {
    const audio = record?.Input?.AudioTokens ?? 0;
    const cached = record?.Input?.CachedAudioTokens ?? 0;
    return Math.max(0, audio - cached);
}

/**
 * Moves the input tokens a realtime run's record counts as cache hits (`Input.CachedTokens`, every modality) from the
 * default line's uncached input bucket to its cache-read bucket, so the cost row prices them at its cache-read rate.
 * Nothing moves when the run already has cache reads in its token columns (they are then already net of the cache), or
 * the record holds no cached tokens. The uncached bucket never goes below 0.
 *
 * @param usage The default line's quantities.
 * @param record The run's stored usage record.
 */
export function MoveCachedInputTokens(usage: NormalizedUsage, record: RealtimeUsageRecord | null): CachedInputMove {
    const cached = record?.Input?.CachedTokens ?? 0;
    if ((usage.cacheRead ?? 0) > 0 || !Number.isFinite(cached) || cached <= 0) {
        return { Usage: usage, Moved: 0 };
    }
    const moved = Math.min(usage.input, cached);
    return { Usage: { ...usage, input: usage.input - moved, cacheRead: moved }, Moved: moved };
}

/**
 * An audio line limited to the tokens that actually left the default line's bucket, re-priced at its unit price. A run
 * whose stored audio tokens exceed its token columns would otherwise bill more audio than the run recorded. The line
 * is returned unchanged when its tokens fit; `null` when no tokens are left to price.
 *
 * @param line The priced audio line.
 * @param available The audio tokens that left the bucket for the line's direction.
 */
export function CapPricedAudioTokens(line: PricedAudioTokens, available: number): PricedAudioTokens | null {
    const tokens = Math.max(0, Math.min(line.Tokens, available));
    if (tokens <= 0) {
        return null;
    }
    if (tokens === line.Tokens) {
        return line;
    }
    return { ...line, Tokens: tokens, Cost: RoundCost((tokens / 1_000_000) * line.UnitPrice) };
}

/**
 * Takes the audio tokens that priced audio lines cover out of the default line: input audio tokens from the uncached
 * input bucket, output audio tokens from the output bucket. The cache buckets stay on the default line. A bucket never
 * goes below 0.
 *
 * @param usage The default line's quantities.
 * @param inputAudioTokens The input audio tokens a priced line covers (0 when the input direction is not priced).
 * @param outputAudioTokens The output audio tokens a priced line covers (0 when the output direction is not priced).
 */
export function ExcludeAudioTokens(usage: NormalizedUsage, inputAudioTokens: number, outputAudioTokens: number): AudioTokenExclusion {
    const wantedInput = Math.max(0, inputAudioTokens);
    const wantedOutput = Math.max(0, outputAudioTokens);
    const removedInput = Math.min(usage.input, wantedInput);
    const removedOutput = Math.min(usage.output, wantedOutput);
    return {
        Usage: { ...usage, input: usage.input - removedInput, output: usage.output - removedOutput },
        ClampedInput: removedInput < wantedInput,
        ClampedOutput: removedOutput < wantedOutput,
        RemovedInput: removedInput,
        RemovedOutput: removedOutput,
    };
}

/**
 * The lines of a run's cost: the default line, the audio lines that were priced, and the avatar video line when one
 * was priced.
 *
 * @param defaultLine The cost row's id, its measure, the quantities it priced, their cost, and whether it priced audio
 * tokens at the row's text rates.
 * @param video The priced avatar video line, if any.
 * @param audio The priced audio lines, if any.
 */
export function BuildCostLines(
    defaultLine: { CostRowID: string; Measure: string; Usage: NormalizedUsage; Cost: number; Blended?: boolean },
    video: PricedAvatarVideo | null,
    audio: readonly PricedAudioTokens[] = []
): PromptRunCostLine[] {
    const usage = defaultLine.Usage;
    const first: PromptRunCostLine = {
        Modality: null,
        CostRowID: defaultLine.CostRowID,
        Measure: defaultLine.Measure,
        Input: usage.input + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0),
        Output: usage.output,
        Cost: RoundCost(defaultLine.Cost),
    };
    if (defaultLine.Blended) {
        first.Blended = true;
    }
    const lines: PromptRunCostLine[] = [first];
    for (const line of audio) {
        lines.push({
            Modality: AUDIO_COST_LINE_MODALITY,
            CostRowID: null,
            Measure: 'Tokens',
            Input: line.Direction === 'Input' ? line.Tokens : 0,
            Output: line.Direction === 'Output' ? line.Tokens : 0,
            Cost: line.Cost,
        });
    }
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
 * The configured avatar video price and its unit when it can price the run, or why it can't.
 */
function readAvatarPrice(price: RealtimeUnitPrice | null, rowCurrency: string): UsableAvatarVideoPrice | AvatarVideoUnpricedReason {
    const usable = readConfiguredPrice(price, rowCurrency, AVATAR_VIDEO_PRICE_UNITS);
    return typeof usable === 'string' ? usable : { ...usable.Unit, Price: usable.Price };
}

/** One direction's audio tokens priced at its configured price, or why they stay on the default line. */
function priceAudioDirection(
    direction: RealtimeAudioDirection,
    tokens: number,
    price: RealtimeUnitPrice | null,
    rowCurrency: string
): PricedAudioTokens | UnpricedAudioTokens | null {
    if (!Number.isFinite(tokens) || tokens <= 0) {
        return null;
    }
    const usable = readConfiguredPrice(price, rowCurrency, AUDIO_PRICE_UNITS);
    if (typeof usable === 'string') {
        return { Priced: false, Direction: direction, Tokens: tokens, Reason: usable };
    }
    return { Priced: true, Direction: direction, Tokens: tokens, Cost: RoundCost((tokens / usable.Unit) * usable.Price), UnitPrice: usable.Price };
}

/**
 * A configured price and what its unit maps to in `units` when it can price the run, or why it can't. A price applies
 * only when all three of its fields are set and the amount is a finite number of at least 0, so a partial price counts
 * as none; its currency must be the cost row's, compared without case or surrounding space.
 */
function readConfiguredPrice<TUnit>(
    price: RealtimeUnitPrice | null,
    rowCurrency: string,
    units: ReadonlyMap<string, TUnit>
): { Price: number; Unit: TUnit } | 'no-price' | 'unit' | 'currency' {
    if (!price || price.Price == null || price.Unit == null || price.Currency == null) {
        return 'no-price';
    }
    if (!Number.isFinite(price.Price) || price.Price < 0) {
        return 'no-price';
    }
    const unit = units.get(price.Unit);
    if (unit === undefined) {
        return 'unit';
    }
    return price.Currency.trim().toUpperCase() === rowCurrency.trim().toUpperCase() ? { Price: price.Price, Unit: unit } : 'currency';
}

function costLineAsJson(line: PromptRunCostLine): JSONObject {
    const json: JSONObject = { Modality: line.Modality, CostRowID: line.CostRowID, Measure: line.Measure, Input: line.Input, Output: line.Output, Cost: line.Cost };
    if (line.Blended) {
        json['Blended'] = true;
    }
    return json;
}

function readCostLine(value: JSONValue): PromptRunCostLine | null {
    if (!IsPlainObject(value) || typeof value['Cost'] !== 'number' || !Number.isFinite(value['Cost'])) {
        return null;
    }
    const line: PromptRunCostLine = {
        Modality: typeof value['Modality'] === 'string' ? value['Modality'] : null,
        CostRowID: typeof value['CostRowID'] === 'string' ? value['CostRowID'] : null,
        Measure: typeof value['Measure'] === 'string' ? value['Measure'] : 'Tokens',
        Input: typeof value['Input'] === 'number' ? value['Input'] : 0,
        Output: typeof value['Output'] === 'number' ? value['Output'] : 0,
        Cost: value['Cost'],
    };
    if (value['Blended'] === true) {
        line.Blended = true;
    }
    return line;
}
