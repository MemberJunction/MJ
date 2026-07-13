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
    /**
     * Max rows whose per-cell value-hashes are retained for COMPOSITE-key discovery. Bounded memory
     * (cap × columns) — never the raw values. Default 2000: enough for significance, cheap on CPU/RAM.
     */
    CompositeSampleRowCap?: number;
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
    /**
     * Bounded per-row cell-hash sample (column → stable value-hash for the row's non-null cells),
     * capped at {@link StreamDiscoveryOptions.CompositeSampleRowCap}. Feeds composite-key discovery
     * ({@link pickCompositeKeyFromStats}) without retaining raw values or every row.
     */
    RowSamples: Array<Record<string, string>>;
}

/** Positive integer from an env var, falling back when unset/invalid. */
function envInt(name: string, fallback: number): number {
    const v = parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
}

// The discovery budget is operator-tunable via env — any sampling bound works (time- or record-based).
// Unset → the sensible defaults below. The time budget is the primary "how long a discovery pass runs"
// knob; the record/distinct caps bound memory.
const DEFAULT_TIME_BUDGET_MS = envInt('MJ_INTEGRATION_DISCOVERY_TIME_BUDGET_MS', 30_000);
const DEFAULT_SAMPLE_VALUE_CAP = envInt('MJ_INTEGRATION_DISCOVERY_SAMPLE_VALUE_CAP', 10);
const DEFAULT_MAX_DISTINCT_TRACKED = envInt('MJ_INTEGRATION_DISCOVERY_MAX_DISTINCT', 100_000);
const DEFAULT_COMPOSITE_SAMPLE_ROW_CAP = envInt('MJ_INTEGRATION_DISCOVERY_COMPOSITE_ROW_CAP', 2_000);

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

    const compositeCap = opts.CompositeSampleRowCap ?? DEFAULT_COMPOSITE_SAMPLE_ROW_CAP;
    const acc = new Map<string, ColumnAcc>();
    const rowSamples: Array<Record<string, string>> = [];
    let totalRows = 0;
    let stoppedReason: 'exhausted' | 'time-budget' = 'exhausted';

    for await (const record of toAsyncIterable(records)) {
        totalRows++;
        accumulateRecord(record, acc, sampleCap, distinctCap);
        // Retain a bounded per-cell value-hash sample for composite-key discovery — never raw values,
        // never more than the cap. This is the per-row evidence the greedy composite pick needs.
        if (rowSamples.length < compositeCap) {
            const rowHash: Record<string, string> = {};
            for (const [k, v] of Object.entries(record)) {
                if (v !== null && v !== undefined) rowHash[k] = stableValueKey(v);
            }
            rowSamples.push(rowHash);
        }
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
    return { Columns: columns, RowsScanned: totalRows, StoppedReason: stoppedReason, RowSamples: rowSamples };
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
    /**
     * Whether the scan that produced these stats SAW THE WHOLE STREAM (#A4). Default true. When false
     * (the scan was time-budget-truncated), "non-null on every row + near-unique" was observed over only a
     * PARTIAL prefix — a column null/duplicated solely in the unscanned tail would look like a clean key.
     * So on a truncated scan the SOFT best-available fallback demands FULL prefix-uniqueness (not merely
     * near-unique) and annotates the verdict that it must be re-verified on full data.
     */
    ScanComplete?: boolean;
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
 * Recognizes a primary-key naming CONVENTION (`id`, `uuid`, `guid`, `pk`, or any `*_id` / `*_key` /
 * `*_code` form). Used ONLY by the soft best-available fallback — a convention name is the identity
 * SIGNAL that lets a not-provably-unique column still serve as a soft (dedup-only) key, rather than
 * leaving the object PK-less. Never used to override a provably-unique strict candidate.
 */
function isConventionPkName(name: string): boolean {
    return /^(id|uuid|guid|pk)$|(^|_)(id|uuid|guid|key|code)$/i.test(name);
}

/** Minimum distinct/non-null ratio for a convention-named column to qualify as a SOFT key. */
const SOFT_NEAR_UNIQUE_RATIO = 0.9;

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
        // SOFT best-available fallback (no hard significance gate). A column that is not PROVABLY unique
        // over a significant sample would otherwise yield NO PK — which stalls CodeGen SQL generation and
        // leaves the table unsyncable. A soft key is identity-for-dedup only (it can NEVER reject a row),
        // so we may pick the best-available CONVENTION-named column that still carries an identity signal:
        // non-null on every scanned row AND high-cardinality (near-unique, or distinct-capped = cardinality
        // beyond the tracking cap). Only convention-named columns qualify — an unnamed/low-signal column is
        // still left PK-less (no fabrication). This is the "all keys are soft, best-available" policy.
        // #A4: a time-budget-truncated scan only saw a prefix, so demand FULL prefix-uniqueness (1.0) for a
        // soft key rather than merely near-unique (0.9) — a column that's near-unique over a partial scan
        // could be null/duplicated in the unscanned tail and isn't trustworthy even as a soft dedup key.
        const scanComplete = opts.ScanComplete !== false;
        const softRatio = scanComplete ? SOFT_NEAR_UNIQUE_RATIO : 1.0;
        const soft = columns.filter(c =>
            isConventionPkName(c.Key) &&
            c.TotalRows > 0 &&
            c.Occurrences === c.TotalRows &&                                          // non-null on every row
            (c.DistinctCapped || c.DistinctNonNull / c.Occurrences >= softRatio),
        );
        if (soft.length > 0) {
            const rank = opts.NameRank ?? (() => 0);
            const card = (c: DiscoveredColumnStat) => (c.DistinctCapped ? Number.MAX_SAFE_INTEGER : c.DistinctNonNull);
            const best = [...soft].sort((a, b) => card(b) - card(a) || rank(b.Key) - rank(a.Key) || a.Key.localeCompare(b.Key))[0];
            const caveat = scanComplete ? '' : ' [partial scan — time-budget-truncated; re-verify on full data]';
            return { Field: best.Key, UniqueCandidates: [best.Key], AmbiguousForLLM: false, Reason: `Soft best-available key "${best.Key}" — convention-named with an identity signal (not provably unique; soft, dedup-only).${caveat}` };
        }
        return { Field: null, UniqueCandidates: [], AmbiguousForLLM: false, Reason: 'No column is provably unique + non-null over a significant sample, and none is a plausibly-identifying convention-named column.' };
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

/** The composite-key verdict — a provable multi-column identity, or null when none exists in the sample. */
export interface CompositePkVerdict {
    /** The composite key column set (≥2 columns), or null when no provable combination was found. */
    Fields: string[] | null;
    Reason: string;
}

/**
 * COMPOSITE PK pick from streamed evidence — for objects whose identity is a multi-column combination
 * (no single column is unique). Statistics-first + provable-only, same philosophy as the single-column
 * pick: it emits a column set ONLY when that set is provably unique + fully-non-null over a significant
 * sample; otherwise null (→ the caller uses the content-hash identity floor). No naming guesses.
 *
 * Cost is GREEDY, not combinatorial — O(R·C), never the 2^C subset blow-up:
 *   1. Candidate columns = those non-null on EVERY row (a null component can't be part of a stable key),
 *      sorted by cardinality desc (so uniqueness is reached in the fewest columns).
 *   2. Greedily add the next-highest-cardinality candidate and test combined-tuple uniqueness over the
 *      cached per-row cell-hashes. First column set whose tuples are all-distinct over the sample wins.
 * Greedy finds *a* provable unique combination (sufficient for identity/dedup), not necessarily the
 * globally-minimal one — minimality is a nice-to-have the identity path doesn't need. A significance
 * gate (MinRowsForSignificance) keeps a small-sample "uniqueness" from being a fluke.
 */
export function pickCompositeKeyFromStats(
    columns: DiscoveredColumnStat[],
    rowSamples: Array<Record<string, string>>,
    opts: PkPickOptions = {},
): CompositePkVerdict {
    const minRows = opts.MinRowsForSignificance ?? 50;
    const n = rowSamples.length;
    if (n < minRows) {
        return { Fields: null, Reason: `Composite key not attempted — only ${n} sampled rows (< ${minRows} for significance).` };
    }
    // A key column must be non-null on EVERY scanned row; order by cardinality desc for the greedy.
    const candidates = columns
        .filter(c => c.TotalRows > 0 && c.Occurrences === c.TotalRows)
        .sort((a, b) => b.DistinctNonNull - a.DistinctNonNull)
        .map(c => c.Key);
    if (candidates.length < 2) {
        return { Fields: null, Reason: `Fewer than 2 fully-non-null columns — no composite key possible (a single key would already have been found).` };
    }
    const NULL_MARK = String.fromCharCode(0), SEP = String.fromCharCode(1);
    const keyCols: string[] = [];
    for (const cand of candidates) {
        keyCols.push(cand);
        const seen = new Set<string>();
        let unique = true;
        for (const row of rowSamples) {
            const tuple = keyCols.map(k => row[k] ?? NULL_MARK).join(SEP);
            if (seen.has(tuple)) { unique = false; break; }
            seen.add(tuple);
        }
        // A single column going unique here is already covered by pickPrimaryKeyFromStats; require ≥2.
        if (unique && keyCols.length >= 2) {
            return { Fields: [...keyCols], Reason: `Composite key {${keyCols.join(', ')}} is unique + non-null across ${n} rows (greedy by cardinality, provable over the sample).` };
        }
    }
    return { Fields: null, Reason: `No combination of the ${candidates.length} non-null columns is unique over ${n} rows — genuinely keyless; use the content-hash identity floor.` };
}

/** The unified key verdict — the chosen identity columns (1 = single PK, ≥2 = composite), or null. */
export interface KeyVerdict {
    Fields: string[] | null;
    Reason: string;
}

/** All size-k combinations of `items` (k small; callers cap the candidate list). */
function* combinations<T>(items: T[], k: number): Generator<T[]> {
    if (k <= 0) { yield []; return; }
    for (let i = 0; i <= items.length - k; i++) {
        for (const rest of combinations(items.slice(i + 1), k - 1)) yield [items[i], ...rest];
    }
}

/**
 * Key-ness of a column SUBSET over the cached row-hash sample, via the Chao1 nonparametric
 * cardinality estimator. A subset is a PROVABLE key iff its estimated value-domain provably EXCEEDS
 * the sample (D̂ > n) — i.e. the domain has NOT saturated: we keep seeing brand-new tuples, the
 * signature of an identifier, not a category. Robust to skew (it reads the singleton/doubleton
 * structure of the repeats, not a raw distinct ratio) and CPU-cheap (one pass over the row-hashes).
 */
function subsetKeyness(rowSamples: Array<Record<string, string>>, cols: string[], minRows: number): { Dhat: number; isKey: boolean } {
    const n = rowSamples.length;
    const NULL_MARK = String.fromCharCode(0), SEP = String.fromCharCode(1);
    const counts = new Map<string, number>();
    for (const row of rowSamples) {
        const tuple = cols.map(c => row[c] ?? NULL_MARK).join(SEP);
        counts.set(tuple, (counts.get(tuple) ?? 0) + 1);
    }
    const d = counts.size;
    let f1 = 0, f2 = 0;
    for (const v of counts.values()) { if (v === 1) f1++; else if (v === 2) f2++; }
    // Chao1 (bias-corrected when no doubletons): D̂ blows up when values are mostly singletons
    // (domain ≫ sample → unsaturated → key); collapses toward `d` when repeats dominate (saturated).
    const Dhat = f2 > 0 ? d + (f1 * f1) / (2 * f2) : d + (f1 * (f1 - 1)) / 2;
    return { Dhat, isKey: n >= minRows && Dhat > n };
}

/**
 * Provable-only key pick — single OR composite, in ONE pass. Picks the BEST contender at each subset
 * size (1, 2, 3 …), then takes the SMALLEST size whose best contender is a provable key (minimality:
 * a 1-col key beats a 2-col beats a 3-col). "Best" + "is it a key" are the same Chao1 saturation test
 * ({@link subsetKeyness}) applied to the subset's combined tuple — no arbitrary distinct-ratio. If NO
 * size yields a provable key, returns null (the object is honestly keyless — never a fabricated key).
 */
export function pickKeyFromStats(
    columns: DiscoveredColumnStat[],
    rowSamples: Array<Record<string, string>>,
    opts: PkPickOptions & { MaxKeyColumns?: number; MaxCandidates?: number } = {},
): KeyVerdict {
    const minRows = opts.MinRowsForSignificance ?? 50;
    const maxK = opts.MaxKeyColumns ?? 3;
    const maxCandidates = opts.MaxCandidates ?? 15;
    if (rowSamples.length < minRows) {
        return { Fields: null, Reason: `Insufficient sample — ${rowSamples.length} rows (< ${minRows} for significance).` };
    }
    // A key column must be non-null on EVERY row; rank by cardinality, cap the candidate set so the
    // per-size subset enumeration stays cheap (C(maxCandidates, k) for k ≤ maxK).
    const candidates = columns
        .filter(c => c.TotalRows > 0 && c.Occurrences === c.TotalRows)
        .sort((a, b) => b.DistinctNonNull - a.DistinctNonNull)
        .slice(0, maxCandidates)
        .map(c => c.Key);
    if (candidates.length === 0) {
        return { Fields: null, Reason: 'No fully-non-null column to anchor a key.' };
    }
    for (let k = 1; k <= Math.min(maxK, candidates.length); k++) {
        let best: { subset: string[]; Dhat: number; isKey: boolean } | null = null;
        for (const subset of combinations(candidates, k)) {
            const v = subsetKeyness(rowSamples, subset, minRows);
            if (!best || v.Dhat > best.Dhat) best = { subset, Dhat: v.Dhat, isKey: v.isKey };
        }
        if (best && best.isKey) {
            return { Fields: best.subset, Reason: `Provable ${k}-column key {${best.subset.join(', ')}} — Chao1 domain D̂≈${Math.round(best.Dhat)} ≫ n=${rowSamples.length} (unsaturated).` };
        }
    }
    return { Fields: null, Reason: `No provable key at sizes 1..${Math.min(maxK, candidates.length)} over ${rowSamples.length} rows — every best contender's domain saturated (Chao1 D̂ ≤ n).` };
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
