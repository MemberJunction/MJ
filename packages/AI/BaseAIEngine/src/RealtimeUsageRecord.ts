/**
 * @fileoverview REALTIME USAGE RECORD: the usage a realtime prompt run stores by direction and modality, in its
 * `ModelSpecificResponseDetails` under `RealtimeUsage`, and the rules that add usage updates into it.
 *
 * A realtime co-agent prompt run is one row for a whole call; its usage arrives as updates (token amounts per turn,
 * avatar video seconds per turn, inbound video running totals). The browser runtime adds updates up between relays,
 * the server adds each relay into the stored record, and pricing reads the record at finalize. All three use the
 * functions here, so an amount is never counted as a running total or the other way round.
 *
 * Pure: no entity or engine access. A stored value that is not a JSON object reads as "no record" and is never
 * overwritten.
 */
import type { JSONObject, JSONValue, RealtimeUsageModalityDetail } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';
import { ModelResponseDetailsForWrite, ParseModelResponseDetails } from './ModelResponseDetails';

/** The `ModelSpecificResponseDetails` key that holds a realtime run's {@link RealtimeUsageRecord}. */
export const REALTIME_USAGE_DETAILS_KEY = 'RealtimeUsage';

/**
 * A realtime run's usage by direction and modality. Each block is shaped like Core's
 * `RealtimeUsageModalityDetail`, so a writer can add fields without renaming anything.
 */
export interface RealtimeUsageRecord {
    /** What went in: tokens added up; `VideoFrames` and `VideoSeconds` the latest running totals (telemetry). */
    Input?: RealtimeUsageModalityDetail;
    /** What came out: tokens and avatar `VideoSeconds` added up. */
    Output?: RealtimeUsageModalityDetail;
}

/** Limits {@link MergeRealtimeUsageRecord} applies to the stored record. */
export interface RealtimeUsageMergeOptions {
    /**
     * The most output video seconds the record may hold. The relay passes the run's elapsed seconds plus 30, so a
     * client cannot report more avatar video than the call could have generated.
     */
    MaxOutputVideoSeconds?: number;
}

/** What {@link MergeRealtimeUsageRecord} produced. */
export interface RealtimeUsageMergeResult {
    /** The new `ModelSpecificResponseDetails` JSON. */
    Details: string;
    /** Output video seconds the limit dropped (0 when the record stayed under it). */
    ClampedVideoSeconds: number;
}

type RealtimeUsageDirection = 'Input' | 'Output';
type ModalityField = keyof RealtimeUsageModalityDetail;

/** Every field a modality block carries. */
const MODALITY_FIELDS: readonly ModalityField[] = ['TextTokens', 'AudioTokens', 'ImageTokens', 'VideoTokens', 'CachedTokens', 'VideoFrames', 'VideoSeconds'];

/** The fields that hold a running total rather than an amount per update: adding keeps the larger value. */
const RUNNING_TOTALS: Record<RealtimeUsageDirection, ReadonlySet<ModalityField>> = {
    Input: new Set<ModalityField>(['VideoFrames', 'VideoSeconds']),
    Output: new Set<ModalityField>(['VideoFrames']),
};

const DIRECTIONS: readonly RealtimeUsageDirection[] = ['Input', 'Output'];

/**
 * Adds a usage update into a record and returns the sum; neither argument changes. Amounts add up, and a running
 * total keeps the larger value (an inbound running total only grows). Seconds keep millisecond precision; counts are
 * whole numbers. A field that is not a finite number of at least 0 contributes nothing.
 *
 * @param record What was added up so far, or nothing.
 * @param update The update to add.
 */
export function AddRealtimeUsageRecord(record: RealtimeUsageRecord | null | undefined, update: RealtimeUsageRecord): RealtimeUsageRecord {
    const result: RealtimeUsageRecord = {};
    for (const direction of DIRECTIONS) {
        const block = addBlock(record?.[direction], update[direction], RUNNING_TOTALS[direction]);
        if (block) {
            result[direction] = block;
        }
    }
    return result;
}

/**
 * Reads a usage record from a JSON string: the relayed argument of `RelayRealtimeUsage`. Keeps only the fields a
 * modality block defines, and only values that are finite numbers of at least 0. `null` for an absent, blank or
 * malformed string, or one that names no usage.
 *
 * @param json The JSON text of a {@link RealtimeUsageRecord}.
 */
export function ParseRealtimeUsageRecord(json: string | null | undefined): RealtimeUsageRecord | null {
    const parsed = ParseModelResponseDetails(json);
    return parsed ? readRecord(parsed) : null;
}

/**
 * Reads the usage record a prompt run's `ModelSpecificResponseDetails` holds under {@link REALTIME_USAGE_DETAILS_KEY},
 * with the same rules as {@link ParseRealtimeUsageRecord}. `null` when the details are absent, malformed or hold no
 * record; never throws.
 *
 * @param details The prompt run's `ModelSpecificResponseDetails`.
 */
export function ReadRealtimeUsageRecord(details: string | null | undefined): RealtimeUsageRecord | null {
    const stored = ParseModelResponseDetails(details)?.[REALTIME_USAGE_DETAILS_KEY];
    return IsPlainObject(stored) ? readRecord(stored) : null;
}

/**
 * Whether a record holds any usage: a field above 0 in either direction.
 *
 * @param record The record, or nothing.
 */
export function HasRealtimeUsage(record: RealtimeUsageRecord | null | undefined): boolean {
    return DIRECTIONS.some((direction) => MODALITY_FIELDS.some((field) => (usableNumber(record?.[direction]?.[field]) ?? 0) > 0));
}

/**
 * Adds a usage update into the record a prompt run's `ModelSpecificResponseDetails` holds, and returns the new JSON.
 * Every other key of the details (`CostLines` among them) and every key of the record this does not define are kept.
 * `null` when the stored details are not a JSON object: this never overwrites a value it cannot read.
 *
 * @param details The prompt run's `ModelSpecificResponseDetails`.
 * @param update The usage to add.
 * @param options Limits on the stored record.
 */
export function MergeRealtimeUsageRecord(
    details: string | null | undefined,
    update: RealtimeUsageRecord,
    options: RealtimeUsageMergeOptions = {}
): RealtimeUsageMergeResult | null {
    const root = ModelResponseDetailsForWrite(details);
    if (!root) {
        return null;
    }
    const storedValue = root[REALTIME_USAGE_DETAILS_KEY];
    const stored: JSONObject = IsPlainObject(storedValue) ? storedValue : {};
    const sum = AddRealtimeUsageRecord(readRecord(stored), update);
    const clamped = clampOutputVideoSeconds(sum, options.MaxOutputVideoSeconds);
    root[REALTIME_USAGE_DETAILS_KEY] = { ...stored, ...blocksAsJson(stored, sum) };
    return { Details: JSON.stringify(root), ClampedVideoSeconds: clamped };
}

/** The sum of two blocks, or `undefined` when neither exists. */
function addBlock(
    base: RealtimeUsageModalityDetail | undefined,
    update: RealtimeUsageModalityDetail | undefined,
    runningTotals: ReadonlySet<ModalityField>
): RealtimeUsageModalityDetail | undefined {
    if (!base && !update) {
        return undefined;
    }
    const result: RealtimeUsageModalityDetail = {};
    for (const field of MODALITY_FIELDS) {
        const current = usableNumber(base?.[field]);
        const added = usableNumber(update?.[field]);
        if (current === undefined && added === undefined) {
            continue;
        }
        const value = runningTotals.has(field) ? Math.max(current ?? 0, added ?? 0) : (current ?? 0) + (added ?? 0);
        result[field] = roundField(field, value);
    }
    return result;
}

/** A record's blocks from a JSON object, keeping only defined fields with usable values. `null` when it names none. */
function readRecord(value: JSONObject): RealtimeUsageRecord | null {
    const record: RealtimeUsageRecord = {};
    for (const direction of DIRECTIONS) {
        const block = readBlock(value[direction]);
        if (block) {
            record[direction] = block;
        }
    }
    return record.Input || record.Output ? record : null;
}

/** One modality block from a JSON value: the defined fields whose values are finite numbers of at least 0. */
function readBlock(value: JSONValue | undefined): RealtimeUsageModalityDetail | undefined {
    if (!IsPlainObject(value)) {
        return undefined;
    }
    const block: RealtimeUsageModalityDetail = {};
    for (const field of MODALITY_FIELDS) {
        const number = usableNumber(value[field]);
        if (number !== undefined) {
            block[field] = roundField(field, number);
        }
    }
    return Object.keys(block).length > 0 ? block : undefined;
}

/** The record's blocks as JSON, each written over the stored block so a key this module does not define survives. */
function blocksAsJson(stored: JSONObject, record: RealtimeUsageRecord): JSONObject {
    const result: JSONObject = {};
    for (const direction of DIRECTIONS) {
        const block = record[direction];
        if (block) {
            const storedBlock = stored[direction];
            const json: JSONObject = IsPlainObject(storedBlock) ? { ...storedBlock } : {};
            for (const field of MODALITY_FIELDS) {
                const value = block[field];
                if (value !== undefined) {
                    json[field] = value;
                }
            }
            result[direction] = json;
        }
    }
    return result;
}

/** Caps the record's output video seconds at `max` and returns how many it dropped. */
function clampOutputVideoSeconds(record: RealtimeUsageRecord, max: number | undefined): number {
    const seconds = record.Output?.VideoSeconds;
    if (record.Output === undefined || seconds === undefined || max === undefined || !Number.isFinite(max) || seconds <= max) {
        return 0;
    }
    const limit = roundField('VideoSeconds', Math.max(0, max));
    record.Output.VideoSeconds = limit;
    return roundField('VideoSeconds', seconds - limit);
}

/** A finite number of at least 0, or `undefined`. */
function usableNumber(value: JSONValue | number | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Seconds to the millisecond; counts of tokens and frames to whole numbers. */
function roundField(field: ModalityField, value: number): number {
    return field === 'VideoSeconds' ? Math.round(value * 1000) / 1000 : Math.floor(value);
}
