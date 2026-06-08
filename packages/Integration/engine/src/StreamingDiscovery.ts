/**
 * Time-bounded streaming discovery (the final discovery abstraction).
 *
 * Stage-2 of `DiscoverFields` for sources with no describe endpoint: stream the source's actual
 * records (read-only — no save, no ack) and, in ONE pass, accumulate two things:
 *   1. the full COLUMN corpus (every key seen) + a bounded sample of values per key for typing, and
 *   2. per-column UNIQUENESS / NULL statistics — the evidence a data-informed (not nominal) PK
 *      decision is made from.
 *
 * It stops when the stream is exhausted OR a TIME BUDGET is hit — whichever comes first — and
 * returns whatever it gathered. More rows → stronger claims; the budget guarantees discovery never
 * runs away. Memory stays bounded regardless of row count: only the key-set + capped per-key
 * sample-values + a capped distinct-set per key are retained (never the rows themselves).
 *
 * Pure + clock-injectable, so it's deterministically testable. Reuses {@link inferColumnTypeFromSamples}.
 */
import { inferColumnTypeFromSamples, type InferredColumnType } from './CustomColumnPromotion.js';

export interface StreamDiscoveryOptions {
    /** Wall-clock budget; once exceeded, stop and use what was gathered. Default 30s. */
    TimeBudgetMs?: number;
    /** Max sample values retained per column for type inference. Default 10. */
    SampleValueCap?: number;
    /**
     * Max distinct values tracked per column before we give up proving uniqueness exactly. Beyond
     * this the column is flagged `DistinctCapped` (uniqueness no longer provable from this scan, so
     * it can't be a confident PK candidate). Bounds memory. Default 100000.
     */
    MaxDistinctTracked?: number;
    /** Injectable clock (for tests). Defaults to Date.now. */
    Now?: () => number;
}

/** Per-column evidence gathered from the stream. */
export interface DiscoveredColumnStat {
    Key: string;
    /** Rows where the key was present + non-null. */
    Occurrences: number;
    /** Total rows scanned. */
    TotalRows: number;
    /** Distinct non-null values seen (exact, up to the cap). */
    DistinctNonNull: number;
    /** True if the distinct-cap was hit → uniqueness NOT provable from this scan. */
    DistinctCapped: boolean;
    /** Bounded sample of observed values (for type inference). */
    SampleValues: unknown[];
    /** Generously-bounded inferred type (both dialects). */
    Inferred: InferredColumnType;
}

export interface StreamDiscoveryResult {
    Columns: DiscoveredColumnStat[];
    RowsScanned: number;
    /** Why the scan ended — surfaced so a time-capped (partial) corpus is never silently treated as complete. */
    StoppedReason: 'exhausted' | 'time-budget';
}

const DEFAULT_TIME_BUDGET_MS = 30_000;
const DEFAULT_SAMPLE_VALUE_CAP = 10;
const DEFAULT_MAX_DISTINCT_TRACKED = 100_000;

interface ColumnAcc {
    occurrences: number;
    samples: unknown[];
    distinct: Set<string>;
    capped: boolean;
}

/**
 * Streams records (sync or async iterable), accumulating the column corpus + uniqueness/null stats
 * until exhaustion or the time budget. Read-only; the caller supplies whatever read-only fetch
 * yields the records (no save, no ack happens here).
 */
export async function discoverFromStream(
    records: AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>,
    opts: StreamDiscoveryOptions = {},
): Promise<StreamDiscoveryResult> {
    const timeBudgetMs = opts.TimeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
    const sampleCap = opts.SampleValueCap ?? DEFAULT_SAMPLE_VALUE_CAP;
    const distinctCap = opts.MaxDistinctTracked ?? DEFAULT_MAX_DISTINCT_TRACKED;
    const now = opts.Now ?? (() => Date.now());
    const start = now();

    const acc = new Map<string, ColumnAcc>();
    let totalRows = 0;
    let stoppedReason: 'exhausted' | 'time-budget' = 'exhausted';

    for await (const record of toAsyncIterable(records)) {
        totalRows++;
        accumulateRecord(record, acc, sampleCap, distinctCap);
        if (now() - start > timeBudgetMs) {
            stoppedReason = 'time-budget';
            break;
        }
    }

    const columns: DiscoveredColumnStat[] = [...acc.entries()].map(([key, e]) => ({
        Key: key,
        Occurrences: e.occurrences,
        TotalRows: totalRows,
        DistinctNonNull: e.distinct.size,
        DistinctCapped: e.capped,
        SampleValues: e.samples,
        Inferred: inferColumnTypeFromSamples(e.samples),
    }));
    return { Columns: columns, RowsScanned: totalRows, StoppedReason: stoppedReason };
}

/** Folds one record into the accumulator — O(columns), bounded memory. */
function accumulateRecord(
    record: Record<string, unknown>,
    acc: Map<string, ColumnAcc>,
    sampleCap: number,
    distinctCap: number,
): void {
    for (const [key, value] of Object.entries(record)) {
        let e = acc.get(key);
        if (!e) {
            e = { occurrences: 0, samples: [], distinct: new Set(), capped: false };
            acc.set(key, e);
        }
        if (value === null || value === undefined) continue;
        e.occurrences++;
        if (e.samples.length < sampleCap) e.samples.push(value);
        if (!e.capped) {
            if (e.distinct.size < distinctCap) e.distinct.add(stableValueKey(value));
            else e.capped = true;
        }
    }
}

/** Options for the data-informed PK pick. */
export interface PkPickOptions {
    /**
     * Minimum rows scanned before a unique+non-null column is trusted as a PK (statistical
     * significance — uniqueness over a tiny sample is not evidence). Default 50.
     */
    MinRowsForSignificance?: number;
    /** A naming-rank tiebreaker, used ONLY to choose among multiple equally-unique columns. */
    NameRank?: (columnName: string) => number;
}

/** The data-informed PK verdict (statistics-first). */
export interface PkStatVerdict {
    /** The chosen PK column, or null when no column clears the bar. */
    Field: string | null;
    /** All columns that are provably unique + non-null over enough rows (the candidate set). */
    UniqueCandidates: string[];
    /** True when there were ≥2 unique candidates and naming couldn't break the tie → defer to the LLM tiebreaker. */
    AmbiguousForLLM: boolean;
    Reason: string;
}

/**
 * Statistics-first PK pick from streamed evidence. A column is a candidate ONLY if it is, over a
 * statistically meaningful number of rows, **non-null on every row** AND **all-distinct** (and its
 * uniqueness was provable — the distinct-cap wasn't hit). One candidate → that's the PK (p<0.05:
 * all-distinct over a large N is not chance). Several candidates → naming breaks the tie if it can;
 * otherwise it's flagged ambiguous for the LLM tiebreaker. Zero candidates → no PK (no fabrication).
 */
export function pickPrimaryKeyFromStats(
    columns: DiscoveredColumnStat[],
    opts: PkPickOptions = {},
): PkStatVerdict {
    const minRows = opts.MinRowsForSignificance ?? 50;
    const candidates = columns.filter(c =>
        c.TotalRows >= minRows &&
        c.Occurrences === c.TotalRows &&     // non-null on EVERY row
        !c.DistinctCapped &&                  // uniqueness was provable from the scan
        c.DistinctNonNull === c.Occurrences,  // all values distinct → no duplicates
    );
    const names = candidates.map(c => c.Key);

    if (candidates.length === 0) {
        return { Field: null, UniqueCandidates: [], AmbiguousForLLM: false, Reason: 'No column is provably unique + non-null over a significant sample.' };
    }
    if (candidates.length === 1) {
        return { Field: names[0], UniqueCandidates: names, AmbiguousForLLM: false, Reason: `"${names[0]}" is unique + non-null across ${candidates[0].TotalRows} rows (statistically the key).` };
    }
    // Multiple unique columns — naming tiebreaker, else hand to the LLM judge with the stats in view.
    const rank = opts.NameRank ?? (() => 0);
    const ranked = [...candidates].sort((a, b) => rank(b.Key) - rank(a.Key));
    if (rank(ranked[0].Key) > rank(ranked[1].Key)) {
        return { Field: ranked[0].Key, UniqueCandidates: names, AmbiguousForLLM: false, Reason: `${candidates.length} unique columns; naming chose "${ranked[0].Key}".` };
    }
    return { Field: null, UniqueCandidates: names, AmbiguousForLLM: true, Reason: `${candidates.length} equally-named unique columns — ambiguous; defer to the evidence-fed LLM tiebreaker.` };
}

/** Stable string key for a value so distinct-counting is correct across primitives + objects. */
function stableValueKey(value: unknown): string {
    if (typeof value === 'object') {
        try { return 'o:' + JSON.stringify(value); } catch { return 'o:[unserializable]'; }
    }
    return typeof value + ':' + String(value);
}

/** Normalizes a sync or async iterable to an async iterable so the loop handles both. */
async function* toAsyncIterable<T>(src: AsyncIterable<T> | Iterable<T>): AsyncIterable<T> {
    if (Symbol.asyncIterator in Object(src)) {
        yield* src as AsyncIterable<T>;
    } else {
        for (const item of src as Iterable<T>) yield item;
    }
}
