/**
 * Promotion planner — the brain of the post-sync custom-column step (gaps.md §2, M2).
 *
 * After a sync, the values a source returned with no field map are parked as JSON in the
 * {@link CUSTOM_OVERFLOW_COLUMN} system column (M1 capture). This module decides, from a
 * coverage scan of that column, WHICH of those keys earn a real column and WHAT bounded
 * type each should get. It is PURE — no DB, no RSU, no I/O — so the genuinely new logic is
 * fully unit-testable. The server-side orchestrator (M2b) feeds the resulting plan into the
 * EXISTING refresh pipeline (SchemaEvolution ADD COLUMN → RSU → IntegrationSchemaSync IOF →
 * field map); this module never touches schema itself.
 *
 * Design rules (from gaps.md §2 + the connector-code conventions):
 * - Provable-only / never fabricate: a key earns a column only on PERVASIVENESS evidence
 *   (coverage ≥ threshold), never on a single malformed row. PK/FK are NEVER inferred here —
 *   customs are always emitted nullable, non-PK, non-FK (classification is deferred to D4).
 * - Generous bounded typing (the NVARCHAR(MAX) problem): size columns comfortably from the
 *   observed samples and err LARGER — a roomy bounded column beats a truncating tight one,
 *   and both beat MAX. Only fall back to MAX/TEXT when the observed length genuinely can't be
 *   bounded. Narrow to number/boolean/datetime ONLY when every non-null sample unambiguously
 *   supports it; otherwise default to a (generously bounded) string — that is the safe choice
 *   that can hold anything the source later returns.
 * - Terminate / never re-promote: a key whose column already exists is skipped, so the
 *   capture→promote loop converges instead of re-promoting forever.
 */

/** The schema-builder field-type family + the concrete per-dialect SQL types we infer. */
export interface InferredColumnType {
    /** Schema-builder SchemaFieldType family ('string' | 'number' | 'boolean' | 'datetime'). */
    SchemaFieldType: 'string' | 'number' | 'boolean' | 'datetime';
    /** Concrete SQL Server column type, e.g. `NVARCHAR(255)`, `BIGINT`, `DATETIMEOFFSET`. */
    SqlServerType: string;
    /** Concrete PostgreSQL column type, e.g. `VARCHAR(255)`, `BIGINT`, `TIMESTAMPTZ`. */
    PostgresType: string;
    /** Bound for string types (null for non-string or when unbounded → MAX/TEXT). */
    MaxLength: number | null;
}

/** Per-key statistics from a coverage scan of the overflow column for one (CompanyIntegration, entity). */
export interface OverflowKeyStats {
    /** The source key as it appears in the overflow JSON. */
    Key: string;
    /** Rows in which the key was present with a non-null value. */
    Occurrences: number;
    /** Total rows scanned (rows that had any overflow JSON). */
    TotalRows: number;
    /** A bounded sample of observed values for this key, for type inference. */
    SampleValues: unknown[];
}

/** A key that earned a real column, with its inferred bounded type. */
export interface PromotionCandidate {
    /** The source key → becomes both the SourceFieldName (field map) and the column name. */
    Key: string;
    /** Pervasiveness in [0,1] = Occurrences / TotalRows. */
    Coverage: number;
    /** The inferred, generously-bounded column type. */
    Inferred: InferredColumnType;
}

/** Tuning + context for {@link planPromotions}. */
export interface PromotionPlanOptions {
    /**
     * Minimum coverage (in [0,1]) a key must clear to earn a column. Default 0.5 — a key
     * present on at least half the rows that carried any overflow. Below this it stays in the
     * overflow JSON (queryable, never lost) rather than minting a sparse column from noise.
     */
    CoverageThreshold?: number;
    /**
     * Column names that already exist on the target entity (case-insensitive). A key whose
     * column already exists is NOT re-promoted — this is what makes the loop terminate.
     */
    ExistingColumnNames?: ReadonlySet<string>;
}

const DEFAULT_COVERAGE_THRESHOLD = 0.5;
/** SQL Server's largest bounded NVARCHAR before MAX; above this we must use MAX/TEXT. */
const MAX_BOUNDED_STRING = 4000;
/** Floor for a generous string bound — never size a custom string column tighter than this. */
const MIN_STRING_BOUND = 255;

/** Matches an ISO-8601-ish date / datetime so we don't mistake "5" or "2020" for a date. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Plans which overflow keys to promote to real columns. Pure; deterministic (sorted by key).
 *
 * @param stats - per-key coverage statistics from the overflow scan
 * @param opts  - coverage threshold + the set of already-existing column names
 * @returns the promotion candidates, sorted by key for stable, replayable output
 */
export function planPromotions(
    stats: OverflowKeyStats[],
    opts: PromotionPlanOptions = {}
): PromotionCandidate[] {
    const threshold = opts.CoverageThreshold ?? DEFAULT_COVERAGE_THRESHOLD;
    const existing = lowercaseSet(opts.ExistingColumnNames);
    const candidates: PromotionCandidate[] = [];

    for (const stat of stats) {
        // Terminate / never re-promote: the column already exists.
        if (existing.has(stat.Key.toLowerCase())) continue;
        // Pervasiveness floor — never mint a column from a junk key in one malformed row.
        if (stat.TotalRows <= 0) continue;
        const coverage = stat.Occurrences / stat.TotalRows;
        if (coverage < threshold) continue;

        candidates.push({
            Key: stat.Key,
            Coverage: coverage,
            Inferred: inferColumnTypeFromSamples(stat.SampleValues),
        });
    }

    return candidates.sort((a, b) => a.Key.localeCompare(b.Key));
}

/**
 * Infers a generously-bounded column type from observed sample values. Narrows to
 * boolean/number/datetime ONLY when EVERY non-null sample unambiguously supports it;
 * otherwise defaults to a comfortably-bounded string. Never returns MAX/TEXT unless the
 * observed string length genuinely can't be bounded.
 */
export function inferColumnTypeFromSamples(samples: unknown[]): InferredColumnType {
    const nonNull = samples.filter(v => v !== null && v !== undefined);

    // No evidence → a safe, generous default string.
    if (nonNull.length === 0) return stringType(MIN_STRING_BOUND);

    if (nonNull.every(isBoolean)) {
        return { SchemaFieldType: 'boolean', SqlServerType: 'BIT', PostgresType: 'BOOLEAN', MaxLength: null };
    }

    if (nonNull.every(isFiniteNumber)) {
        const allIntegers = nonNull.every(v => Number.isInteger(v as number));
        return allIntegers
            ? { SchemaFieldType: 'number', SqlServerType: 'BIGINT', PostgresType: 'BIGINT', MaxLength: null }
            // Generous fixed-point — wide precision so we don't truncate decimals.
            : { SchemaFieldType: 'number', SqlServerType: 'DECIMAL(38,10)', PostgresType: 'DECIMAL(38,10)', MaxLength: null };
    }

    if (nonNull.every(isIsoDateString)) {
        return { SchemaFieldType: 'datetime', SqlServerType: 'DATETIMEOFFSET', PostgresType: 'TIMESTAMPTZ', MaxLength: null };
    }

    // Default: a generously-bounded string sized to comfortably hold the longest observed value.
    const longest = Math.max(...nonNull.map(v => String(v).length));
    return stringType(generousStringBound(longest));
}

/** Builds a string {@link InferredColumnType}; bound===null ⇒ unbounded (MAX/TEXT). */
function stringType(bound: number | null): InferredColumnType {
    if (bound === null) {
        return { SchemaFieldType: 'string', SqlServerType: 'NVARCHAR(MAX)', PostgresType: 'TEXT', MaxLength: null };
    }
    return { SchemaFieldType: 'string', SqlServerType: `NVARCHAR(${bound})`, PostgresType: `VARCHAR(${bound})`, MaxLength: bound };
}

/**
 * Generous bound for a string column: double the longest observed length (room to grow),
 * floored at {@link MIN_STRING_BOUND}; if that would exceed the bounded limit, fall back to
 * unbounded (null → MAX/TEXT) since it genuinely can't be bounded safely.
 */
function generousStringBound(longestObserved: number): number | null {
    const doubled = Math.max(longestObserved * 2, MIN_STRING_BOUND);
    return doubled > MAX_BOUNDED_STRING ? null : doubled;
}

function isBoolean(v: unknown): boolean {
    return typeof v === 'boolean';
}

function isFiniteNumber(v: unknown): boolean {
    return typeof v === 'number' && Number.isFinite(v);
}

function isIsoDateString(v: unknown): boolean {
    return typeof v === 'string' && ISO_DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
}

function lowercaseSet(set: ReadonlySet<string> | undefined): ReadonlySet<string> {
    if (!set || set.size === 0) return new Set<string>();
    return new Set([...set].map(s => s.toLowerCase()));
}

/** Max distinct sample values retained per key for type inference (bounded memory). */
const DEFAULT_SAMPLE_CAP = 20;

/**
 * Builds per-key coverage statistics from a SAMPLE of rows that carried overflow JSON.
 * Each row's overflow column is a JSON object string (what M1 parked); this tallies, per key,
 * how many sampled rows had it non-null and collects a bounded sample of its values for type
 * inference. Robust to malformed/empty JSON (such rows contribute to TotalRows but no keys).
 *
 * Coverage is therefore computed over the SAMPLE (bounded memory at any table size) — a
 * statistically sound basis for the pervasiveness decision; the exactness the threshold needs
 * (a key on ~half the rows vs. a junk key on one) survives sampling.
 *
 * @param overflowJsonStrings - the raw overflow-column value from each sampled row
 * @param sampleCap - max values retained per key (default {@link DEFAULT_SAMPLE_CAP})
 */
export function buildOverflowStats(
    overflowJsonStrings: Array<string | null | undefined>,
    sampleCap: number = DEFAULT_SAMPLE_CAP
): OverflowKeyStats[] {
    const byKey = new Map<string, { occurrences: number; samples: unknown[] }>();
    let totalRows = 0;

    for (const raw of overflowJsonStrings) {
        totalRows++;
        const parsed = safeParseObject(raw);
        if (!parsed) continue;
        for (const [key, value] of Object.entries(parsed)) {
            if (value === null || value === undefined) continue;
            let entry = byKey.get(key);
            if (!entry) {
                entry = { occurrences: 0, samples: [] };
                byKey.set(key, entry);
            }
            entry.occurrences++;
            if (entry.samples.length < sampleCap) entry.samples.push(value);
        }
    }

    return [...byKey.entries()].map(([key, e]) => ({
        Key: key,
        Occurrences: e.occurrences,
        TotalRows: totalRows,
        SampleValues: e.samples,
    }));
}

/**
 * Sanitizes a source key into a safe SQL/MJ column identifier (letters, digits, underscore;
 * never leading-digit; bounded length). The original key is kept as the field map's
 * SourceFieldName; the sanitized form becomes the column + DestinationFieldName. Returns the
 * BASE name only — collision resolution (suffixing) is the orchestrator's job since it needs
 * the existing-column context.
 */
export function sanitizeColumnName(key: string): string {
    let name = key.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (name.length === 0) name = 'Custom';
    if (/^[0-9]/.test(name)) name = `c_${name}`;
    return name.length > 120 ? name.slice(0, 120) : name;
}

function safeParseObject(raw: string | null | undefined): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}
