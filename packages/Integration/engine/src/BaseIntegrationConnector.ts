import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type {
    IntegrationObjectInfo,
    ActionGeneratorConfig,
} from './ActionMetadataGenerator.js';
import type {
    ExternalRecord,
    DefaultFieldMapping,
    SourceSchemaInfo,
    IntrospectSchemaOptions,
    CreateRecordContext,
    UpdateRecordContext,
    UpsertRecordContext,
    DeleteRecordContext,
    GetRecordContext,
    CRUDResult,
    SearchContext,
    SearchResult,
    ListContext,
    ListResult,
} from './types.js';
import { ClassifyError } from './types.js';
import { ExtractRetryAfterFromError } from './RetryAfter.js';
import {
    discoverFromStream,
    pickKeyFromStats,
    pickPrimaryKeyFromStats,
    type StreamDiscoveryOptions,
    type PkPickOptions,
} from './StreamingDiscovery.js';
import { AdaptiveConcurrencyController, RunAdaptive, type AdaptiveItemOutcome } from './AdaptiveConcurrency.js';
import { flattenRecord, hasNestedObject } from './RecordFlatten.js';
import { DiscoveryWatchdog } from './DiscoveryWatchdog.js';

/** Result of testing a connection to an external system */
export interface ConnectionTestResult {
    /** Whether the connection was successful */
    Success: boolean;
    /** Human-readable status message */
    Message: string;
    /** Server or API version reported by the external system */
    ServerVersion?: string;
}

/** Schema description of an object/table in an external system */
export interface ExternalObjectSchema {
    /** IntegrationObject ID from the MJ database */
    ID?: string;
    /** API name of the object (e.g., "Contact", "Account") */
    Name: string;
    /** Human-readable label */
    Label: string;
    /** Human-readable description of the object's purpose */
    Description?: string;
    /** Whether this object supports incremental sync via watermarks */
    SupportsIncrementalSync: boolean;
    /** Whether this object can be created/updated from MJ (push) */
    SupportsWrite: boolean;
}

/** Schema description of a single field on an external object */
export interface ExternalFieldSchema {
    /** API name of the field */
    Name: string;
    /** Human-readable label */
    Label: string;
    /** Human-readable description of the field's purpose */
    Description?: string;
    /** Field data type in the external system */
    DataType: string;
    /**
     * Whether the field must be provided when creating a new record.
     * Semantically distinct from AllowsNull — required is a create-time
     * constraint; nullable is a record-state constraint. Often related but
     * not always (e.g. a field can be required on create and become nullable
     * later via update; a field can be optional on create with a default
     * applied that produces a non-null stored value).
     */
    IsRequired: boolean;
    /**
     * Whether NULL is a permitted value at rest.
     * Distinct from IsRequired (see above). When the source system reports
     * neither explicit nullability nor a NOT NULL constraint, leave undefined
     * — consumers default to permissive (nullable). Per the framework's
     * provable-only policy, don't infer NOT NULL from sample data.
     */
    AllowsNull?: boolean;
    /**
     * Whether this field is THE primary key of the object.
     * Distinct from IsUniqueKey — an object can have several unique fields
     * (email, phone) of which only one is the PK. Connectors that introspect
     * a source whose docs distinguish PK from unique constraint should set
     * BOTH flags correctly; consumers should treat them independently.
     */
    IsPrimaryKey?: boolean;
    /** Whether the field is a unique identifier (may or may not be the PK) */
    IsUniqueKey: boolean;
    /** Whether the field is read-only */
    IsReadOnly: boolean;
    /** Whether this field is a foreign key */
    IsForeignKey?: boolean;
    /** If FK, which source object it references */
    ForeignKeyTarget?: string | null;
    /** Maximum length for string types — surfaced when the source system reports it. */
    MaxLength?: number | null;
    /** Precision for numeric types — surfaced when the source system reports it. */
    Precision?: number | null;
    /** Scale for numeric types — surfaced when the source system reports it. */
    Scale?: number | null;
    /** Default value expression — surfaced when the source system reports it. */
    DefaultValue?: string | null;
}

/** Context passed to FetchChanges for incremental data retrieval */
export interface FetchContext {
    /** The company integration entity providing connection details */
    CompanyIntegration: MJCompanyIntegrationEntity;
    /** External object name to fetch from */
    ObjectName: string;
    /** Current watermark value for incremental fetch, or null for full fetch */
    WatermarkValue: string | null;
    /** Maximum number of records to fetch in a single batch */
    BatchSize: number;
    /** User context for authorization */
    ContextUser: UserInfo;
    /** Current page number for page-based pagination (1-based). Passed by engine on subsequent calls. */
    CurrentPage?: number;
    /** Current offset for offset-based pagination. Passed by engine on subsequent calls. */
    CurrentOffset?: number;
    /** Current cursor for cursor-based pagination. Passed by engine on subsequent calls. */
    CurrentCursor?: string;
    /**
     * KEYSET / seek resume position (plan.md §7): the last-seen value of the connector's
     * StableOrderingKey. The connector fetches `WHERE <key> > AfterKeyValue ORDER BY <key>` so a
     * mid-stream insert/delete cannot corrupt the scan position. Engine passes it on subsequent
     * calls (and on restart-recovery). undefined/null on the first page.
     */
    AfterKeyValue?: string | null;
    /** Optional list of source field names to request from the external API. When provided, the connector should limit the returned fields to this set. */
    RequestedSourceFields?: string[];
    /**
     * Adaptive rate-limit hooks (plan.md §7), supplied by the engine so a connector's INNER request
     * loop (e.g. a second-layer/parent-iterated object that fires one request per parent) is governed
     * by the SAME per-credential AIMD token bucket that paces the outer object level — instead of a
     * fixed self-throttle that defeats concurrency and ignores 429 back-off. Optional + back-compat: a
     * connector that ignores them behaves exactly as before; the engine omits them when unavailable.
     *
     * - `RateLimitAcquire()` — await one token from the adaptive bucket before each inner request.
     * - `RateLimitReport(err?)` — feed the outcome back so the rate auto-tunes (clean → ramp up, 429 → back off).
     * - `MaxConcurrency` — the engine's resolved in-flight cap for inner requests (>=1).
     */
    RateLimitAcquire?: () => Promise<void>;
    RateLimitReport?: (throttledErr?: unknown) => void;
    MaxConcurrency?: number;
    /**
     * SAMPLING, NOT SYNCING — and the wall-clock this call must not outlive.
     *
     * Discovery wants a corpus, not a corpus of everything: ~50 records is enough to infer columns,
     * types, string widths and a provable primary key. `DiscoverFieldsViaFetch` already knows that
     * and already computes a budget — but it hands that budget to the code CONSUMING the record
     * stream, and the consumer only regains control BETWEEN `FetchChanges` calls. Nothing was ever
     * passed to the connector itself, so a connector could not honour a budget even if it wanted to:
     * it had no way to know it was being sampled rather than synced.
     *
     * That is survivable while one `FetchChanges` is one HTTP page — the consumer stops after 50
     * records and the gap never shows. It is NOT survivable for a parent-scoped object, where a
     * single call fans out internally into one request per parent. There the consumer cannot
     * interrupt anything, because control does not come back until every parent has been walked.
     *
     * Observed live 2026-08-12: a Totara discovery spent 28 minutes inside ONE `FetchChanges` call,
     * walking every parent, and returned `rows=0` — half an hour of correct, pointless work to
     * collect a sample it could never have found there. A sampling operation had silently become an
     * exhaustive one.
     *
     * So the intent now travels with the call. A connector that ignores these behaves exactly as
     * before; one that fans out internally can stop early and return what it has.
     *
     * STOP ON RECORDS, NOT ON PARENTS. A child object only yields through its parents, so capping the
     * number of parents visited would be wrong — if the first three courses have no enrolments you
     * genuinely must keep walking to find fifty rows. `SampleTargetRecords` is therefore the primary
     * stop and the walk should honour it the moment it is met, whichever parent it happens to be on.
     * `DeadlineMs` is the BACKSTOP for the other case: parents that will never yield anything, where
     * no record count can ever be reached and only the clock can end it.
     *
     * - `IsDiscoverySample`    — this call exists to characterise the shape of the data, not to move it.
     * - `SampleTargetRecords`  — stop as soon as this many records have been collected. Enough is enough.
     * - `DeadlineMs`           — epoch ms after which the connector should stop and return what it has.
     *                            A partial sample is the CORRECT result here: discovery infers from
     *                            whatever it gets, and returning little beats half an hour of silence.
     */
    IsDiscoverySample?: boolean;
    SampleTargetRecords?: number;
    DeadlineMs?: number;
}

/**
 * A non-fatal diagnostic a connector attaches to a fetch result so the engine surfaces it in the
 * structured run artifact instead of letting it be a swallowed `console.warn`. The canonical use is
 * a second-layer/association object that fetched ZERO records because its parents weren't available
 * (not synced, unmapped, or DAG-ordered wrong) — the classic silent-empty.
 */
export interface FetchWarning {
    /** Stable machine code, e.g. 'ZERO_PARENTS'. */
    Code: string;
    /** Human-readable explanation. */
    Message: string;
    /** Optional structured context (parent object name, counts, etc.). */
    Data?: Record<string, unknown>;
}

/** Result of a FetchChanges call, containing a batch of records */
export interface FetchBatchResult {
    /** Records retrieved in this batch */
    Records: ExternalRecord[];
    /** Whether there are more records to fetch after this batch */
    HasMore: boolean;
    /**
     * Non-fatal diagnostics from this fetch (e.g. a second-layer object that found zero parents).
     * The engine forwards each to the structured progress artifact as a SyncWarning so the
     * silent-empty case is visible over GraphQL instead of a swallowed console.warn.
     */
    Warnings?: FetchWarning[];
    /** Updated watermark value after this batch */
    NewWatermarkValue?: string;
    /** Next page number to pass back via FetchContext.CurrentPage on the next call (page-based pagination) */
    NextPage?: number;
    /** Next offset to pass back via FetchContext.CurrentOffset on the next call (offset-based pagination) */
    NextOffset?: number;
    /** Next keyset/seek position — the highest StableOrderingKey value in this batch — to pass back via FetchContext.AfterKeyValue (plan.md §7 keyset resume). */
    NextAfterKeyValue?: string;
    /** Next cursor to pass back via FetchContext.CurrentCursor on the next call (cursor-based pagination) */
    NextCursor?: string;
}

/** Configurable timeout values for connector operations */
export interface OperationTimeouts {
    /** Timeout for TestConnection in milliseconds. Default: 5000 */
    TestConnectionMs: number;
    /** Timeout for DiscoverObjects in milliseconds. Default: 10000 */
    DiscoverObjectsMs: number;
    /** Timeout for DiscoverFields in milliseconds. Default: 10000 */
    DiscoverFieldsMs: number;
    /** Timeout for FetchChanges in milliseconds. Default: 30000 */
    FetchChangesMs: number;
}

/** Default timeout values for connector operations */
export const DEFAULT_OPERATION_TIMEOUTS: OperationTimeouts = {
    TestConnectionMs: 5000,
    DiscoverObjectsMs: 10000,
    DiscoverFieldsMs: 10000,
    FetchChangesMs: 30000,
};

/**
 * The error {@link WithTimeout} rejects with when ITS OWN budget expires — as distinct from an error
 * the wrapped operation itself produced.
 *
 * That distinction is the whole point of the class. `ClassifyError` maps anything matching "timeout"
 * to `NETWORK_TIMEOUT`, which `IsRetryableError` treats as transient — correct for a socket that
 * dropped, wrong for "we gave this operation N ms and it wanted more." Retrying the latter re-runs
 * the same work under the same budget, so it fails the same way, having spent the budget again.
 *
 * The message is deliberately UNCHANGED from the plain `Error` this replaced: `ClassifyError` reads
 * message text, so existing classification, logging and the run-event stream all behave exactly as
 * before. Only callers that explicitly check `instanceof` see any difference.
 */
export class OperationTimeoutError extends Error {
    /** The `operationName` passed to {@link WithTimeout}. */
    public readonly OperationName: string;
    /** The budget that expired, in milliseconds. */
    public readonly TimeoutMs: number;

    constructor(operationName: string, timeoutMs: number) {
        super(`Operation '${operationName}' timed out after ${timeoutMs}ms`);
        this.name = 'OperationTimeoutError';
        this.OperationName = operationName;
        this.TimeoutMs = timeoutMs;
    }
}

/**
 * Wraps a promise with a timeout. Rejects with {@link OperationTimeoutError} if the
 * promise does not resolve within the specified duration.
 *
 * CAVEAT — this does NOT cancel the wrapped operation. It is a `Promise.race`, so on timeout the
 * underlying work keeps running to completion (or its own failure) with nobody awaiting it. A caller
 * that retries a timed-out operation therefore stacks a second copy on top of the first, still
 * in-flight — which is why `IntegrationEngine`'s fetch path does not retry
 * {@link OperationTimeoutError}. Real cancellation needs an `AbortSignal` threaded into the
 * connector contract; until then, treat a timeout as terminal for that attempt.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation for error messaging
 * @returns The result of the promise
 * @throws OperationTimeoutError if the operation times out
 */
export async function WithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new OperationTimeoutError(operationName, timeoutMs));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        return result;
    } finally {
        if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
        }
    }
}

/** Proposed default configuration for a quick-start setup */
export interface DefaultObjectConfig {
    /** Source object name in the external system */
    SourceObjectName: string;
    /** Proposed target table name in the MJ database */
    TargetTableName: string;
    /** Proposed MJ entity name */
    TargetEntityName: string;
    /** Whether to enable sync by default */
    SyncEnabled: boolean;
    /** Proposed field mappings */
    FieldMappings: DefaultFieldMapping[];
}

/** Full default configuration returned by a connector for quick setup */
export interface DefaultIntegrationConfig {
    /** Proposed DB schema name for new tables (e.g., "YourMembership", "HubSpot") */
    DefaultSchemaName: string;
    /** Objects to sync by default with proposed table/entity names */
    DefaultObjects: DefaultObjectConfig[];
}

/**
 * Abstract base class for integration connectors.
 * Each external system (HubSpot, Salesforce, etc.) implements this class
 * to provide system-specific data access and discovery.
 *
 * Subclasses declare their capabilities via the `SupportsX` getters.
 * Callers can interrogate a connector instance to determine which
 * operations it supports before attempting them.
 */
/**
 * A connector's declared rate-limit policy for the engine's adaptive token-bucket limiter
 * (plan.md §7). The engine starts at TokensPerSec, cuts multiplicatively on a 429/limit signal,
 * and ramps back up on sustained success (AIMD).
 */
export interface RateLimitPolicy {
    /** Sustained requests/sec ceiling for this source API. */
    TokensPerSec: number;
    /** Burst capacity. Defaults to TokensPerSec when omitted. */
    Burst?: number;
    /** Multiplicative-decrease factor applied on a throttle signal (0 < f < 1). */
    ThrottleBackoffFactor?: number;
    /**
     * How fast the effective rate ramps back up per successful call after a throttle (additive
     * increase). Lower = more conservative recovery. Default: TokensPerSec/10 (≈10 successes to
     * fully recover). Set low for an API that stays throttled for a while after a 429.
     */
    SuccessRampPerCall?: number;
    /**
     * Floor the effective rate never drops below, even after repeated throttles (tokens/sec).
     * Default: TokensPerSec/20. Set when the vendor guarantees a minimum service rate.
     */
    MinTokensPerSec?: number;
}

export abstract class BaseIntegrationConnector {

    // ─── Capability Getters ──────────────────────────────────────────
    // Override in subclasses to declare which operations the connector supports.
    // All connectors support Get (read/FetchChanges) by default.

    /** Whether this connector supports reading/fetching records. Always true. */
    public get SupportsGet(): boolean { return true; }

    /** Whether this connector supports creating new records in the external system. */
    public get SupportsCreate(): boolean { return false; }

    /** Whether this connector supports updating existing records in the external system. */
    public get SupportsUpdate(): boolean { return false; }

    /**
     * Whether this connector supports idempotent upserts (create-or-update keyed
     * by a unique business property). Connectors override this AND `Upsert` to enable it.
     */
    public get SupportsUpsert(): boolean { return false; }

    /** Whether this connector supports deleting records from the external system. */
    public get SupportsDelete(): boolean { return false; }

    /** Whether this connector supports searching/querying records with filters. */
    public get SupportsSearch(): boolean { return false; }

    /** Whether this connector supports paginated listing of records. */
    public get SupportsListing(): boolean { return false; }

    // ─── Standard CRUD Operations ────────────────────────────────────
    // Default implementations throw if not supported. Subclasses override
    // both the capability getter AND the method to enable the operation.

    /**
     * Creates a new record in the external system.
     * Override in subclasses that support write operations.
     * Check `SupportsCreate` before calling.
     */
    public async CreateRecord(_ctx: CreateRecordContext): Promise<CRUDResult> {
        throw new Error(`CreateRecord is not supported by ${this.constructor.name}`);
    }

    /**
     * Updates an existing record in the external system.
     * Override in subclasses that support write operations.
     * Check `SupportsUpdate` before calling.
     */
    public async UpdateRecord(_ctx: UpdateRecordContext): Promise<CRUDResult> {
        throw new Error(`UpdateRecord is not supported by ${this.constructor.name}`);
    }

    /**
     * Upserts a record — a single idempotent create-or-update keyed by a unique
     * business property (e.g. email), eliminating the search-then-create race window.
     * Override in subclasses whose external system exposes a keyed upsert primitive.
     * Check `SupportsUpsert` before calling.
     */
    public async Upsert(_ctx: UpsertRecordContext): Promise<CRUDResult> {
        throw new Error(`Upsert is not supported by ${this.constructor.name}`);
    }

    /**
     * Deletes a record from the external system.
     * Override in subclasses that support delete operations.
     * Check `SupportsDelete` before calling.
     */
    public async DeleteRecord(_ctx: DeleteRecordContext): Promise<CRUDResult> {
        throw new Error(`DeleteRecord is not supported by ${this.constructor.name}`);
    }

    /**
     * Retrieves a single record by ID from the external system.
     * Override in subclasses that support direct record retrieval.
     */
    public async GetRecord(_ctx: GetRecordContext): Promise<ExternalRecord | null> {
        throw new Error(`GetRecord is not supported by ${this.constructor.name}`);
    }

    /**
     * Searches for records matching the given filters.
     * Override in subclasses that support search/query operations.
     * Check `SupportsSearch` before calling.
     */
    public async SearchRecords(_ctx: SearchContext): Promise<SearchResult> {
        throw new Error(`SearchRecords is not supported by ${this.constructor.name}`);
    }

    /**
     * Lists records with cursor-based pagination.
     * Override in subclasses that support paginated listing.
     * Check `SupportsListing` before calling.
     */
    public async ListRecords(_ctx: ListContext): Promise<ListResult> {
        throw new Error(`ListRecords is not supported by ${this.constructor.name}`);
    }

    /**
     * Builds a CRUDResult for a record CREATE, failing LOUDLY when the external system returned
     * no usable record ID. A 2xx response with an empty/undefined ID means the create did not
     * durably produce a record we can track — returning Success:true there silently loses the
     * record and causes duplicate creates on the next sync (the HubSpot-association class of bug,
     * fixed in next commit 9f718a7e). This makes that failure explicit at the connector boundary.
     */
    protected BuildCreatedResult(externalID: string | undefined | null, statusCode: number, objectName: string): CRUDResult {
        const id = externalID == null ? '' : String(externalID).trim();
        if (id.length === 0) {
            return {
                Success: false,
                StatusCode: statusCode,
                ErrorMessage: `Create of "${objectName}" returned HTTP ${statusCode} but the response contained no record ID — treating as a failure to avoid silently losing the record (and duplicate creates on the next sync).`,
            };
        }
        return { Success: true, StatusCode: statusCode, ExternalID: id };
    }

    // ─── §7/§10/§12 Sync-efficiency contract (composable; connector fills in) ─────────
    // Optional hooks the universal sync engine consumes for peak-aware rate limiting, adaptive
    // parallelism, keyset/no-watermark resume, aggressive batch writes, and type-driven
    // post-processing. EVERY member has a safe default, so existing connectors are unaffected; a
    // connector "fills out the contract" by overriding what its source supports (plan.md §7/§10/§12).

    /**
     * Token-bucket rate-limit policy for this connector's source API (plan.md §7 peak-aware rate
     * limiting). `null` → the engine derives a conservative rate from Integration.BatchRequestWaitTime.
     * Override to push to the source's real limits.
     */
    public get RateLimitPolicy(): RateLimitPolicy | null { return null; }

    /**
     * Whether the watermark this connector returns (`FetchBatchResult.NewWatermarkValue`) is a
     * RELIABLE, monotonically-increasing global maximum — i.e. the connector fetches in watermark
     * order so the last batch's value IS the true high-water mark, and an updated record always
     * re-surfaces at a NEW (higher) watermark. When `true`, the engine uses that watermark to NARROW
     * the next incremental (instead of advancing a full sync to wall-clock "now", and instead of the
     * keyset clear-and-re-scan), so incrementals fetch only what's new.
     *
     * Default `false` — the safe, backwards-compatible choice: a connector whose source returns
     * records out of watermark order (e.g. HubSpot's creation-ordered list API, where the last batch
     * can carry old modstamps) MUST stay false so the engine keeps advancing to "now" and never saves
     * a stale watermark. Override to `true` ONLY when the source guarantees monotonic ordering.
     */
    public get MonotonicWatermark(): boolean { return false; }

    /**
     * Parse a Retry-After / rate-limit signal out of a failed response or thrown error into
     * milliseconds so the engine can back off precisely. Return `undefined` when the error is not a
     * throttle (or carries no hint).
     *
     * The default reads the standard `Retry-After` header (RFC 9110 §10.2.3 — the header a 429 and a
     * 503 carry), in both its delay-seconds and HTTP-date forms, from wherever the HTTP client put
     * it. That is not a heuristic and not vendor-specific: there is one correct reading of it, and
     * every HTTP connector benefits from having it read.
     *
     * This used to return `undefined` unconditionally, and no connector in this repo overrode it —
     * so the engine's limiter never learned a delay any vendor had actually stated, and discovery's
     * throttle check (which asked this and only this) concluded "not a throttle" for every 429 MJ
     * ever received.
     *
     * Override when the vendor signals its delay somewhere non-standard — in the response body, or
     * in prose (PheedLoop's "Expected available in N second"). Deliberately not parsed here:
     * guessing a duration out of message text risks inventing one, and a wrong Retry-After is worse
     * than none, since it freezes the token bucket for a made-up interval.
     */
    public ExtractRetryAfterMs(error: unknown): number | undefined {
        return ExtractRetryAfterFromError(error);
    }

    /**
     * Highest SAFE per-layer concurrency the source tolerates (plan.md §7 peak parallelization) — the
     * ceiling the engine's adaptive controller ramps toward. `null` → use configured syncConcurrency.
     */
    public get MaxConcurrencyHint(): number | null { return null; }

    /**
     * Per-connector override for the `FetchChanges` timeout, in milliseconds. `null` → use
     * `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs` (30s).
     *
     * Raise this when a single page is legitimately slow: a connector that fans out one request per
     * parent (ORCID's per-iD `/record`, any second-layer object) does N requests inside ONE
     * `FetchChanges` call, so its page time scales with `BatchSize` — and with how much concurrency
     * the engine's adaptive controller currently allows. Under the fixed 30s, a page that comfortably
     * fit when parallel no longer fit once the controller had cut concurrency, which forced connector
     * authors to shrink `BatchSize` for the sequential worst case and waste the parallel headroom the
     * rest of the time.
     *
     * Note the timeout does NOT itself cut concurrency: `ClassifyError` gives it `NETWORK_TIMEOUT`,
     * and only `RATE_LIMIT_EXCEEDED` feeds the adaptive limiter. A timing-out page simply never ramps
     * the rate UP (the ramp needs a clean fetch), and the object ends incomplete — reported as
     * `FETCH_ABORTED_INCOMPLETE`. Earlier revisions of this comment described a self-reinforcing
     * timeout→concurrency-cut spiral; that is not what the code does.
     *
     * Precedence (highest first): `CompanyIntegration.Configuration.fetchTimeoutMs` → this property
     * → `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs`. Deployments therefore keep the last word without
     * a code change, while a connector that KNOWS it is slow ships a sane default.
     */
    public get FetchChangesTimeoutMs(): number | null { return null; }

    /**
     * Name of a stable, monotonic ordering key (PK/identity) usable for KEYSET/seek resume on
     * watermark-less objects (plan.md §7 — resume from last-seen key, robust to mid-stream
     * insert/delete). `null` → keyset resume unavailable for this object.
     */
    public StableOrderingKey(_objectName: string): string | null { return null; }

    /** Whether this connector supports batched target writes (plan.md §7 aggressive batching). */
    public get SupportsBatchWrite(): boolean { return false; }

    /** Batch-create. Default loops single-record CreateRecord, so the engine may always call the batch form. */
    public async BatchCreateRecords(ctxs: CreateRecordContext[]): Promise<CRUDResult[]> {
        return this.runBatchViaSingles(ctxs, c => this.CreateRecord(c));
    }
    /** Batch-update. Default loops single-record UpdateRecord. */
    public async BatchUpdateRecords(ctxs: UpdateRecordContext[]): Promise<CRUDResult[]> {
        return this.runBatchViaSingles(ctxs, c => this.UpdateRecord(c));
    }
    /** Batch-delete. Default loops single-record DeleteRecord. */
    public async BatchDeleteRecords(ctxs: DeleteRecordContext[]): Promise<CRUDResult[]> {
        return this.runBatchViaSingles(ctxs, c => this.DeleteRecord(c));
    }
    private async runBatchViaSingles<C>(ctxs: C[], one: (c: C) => Promise<CRUDResult>): Promise<CRUDResult[]> {
        const out: CRUDResult[] = [];
        for (const c of ctxs) out.push(await one(c));
        return out;
    }

    /**
     * Type-driven post-processing hook (plan.md §10): a connector may normalize/enforce a record's
     * values to the resolved column formats AFTER transform/normalize and BEFORE write. Default
     * returns the record unchanged. (Named for this system — NOT MCP, not `take`.) The engine ALSO
     * applies target-type constraint enforcement; this is the connector-side complement.
     */
    public PostProcessRecord(record: ExternalRecord): ExternalRecord { return record; }

    /**
     * Stage-2 field discovery for sources WITHOUT a describe/introspection endpoint (file feeds,
     * undocumented JSON list endpoints): stream the source's actual records — READ-ONLY, no save,
     * no ack — and derive the full field set + data-informed PK/uniqueness/nullability from the
     * gathered statistics. The connector supplies whatever read-only fetch yields the records; this
     * helper turns that stream into `ExternalFieldSchema[]`.
     *
     * Why data-informed: streaming the real values lets `pickPrimaryKeyFromStats` pick the PK from
     * evidence (uniqueness/non-null statistics) COMBINED with the naming convention, rather than a
     * name guess alone. The PK is a SOFT key, so the pick is best-available, not strict-significance:
     * a confident unique+non-null column wins outright; otherwise a near-unique / convention-named
     * column is taken as a soft key (a PK-less object would stall CodeGen). The scan is time-bounded —
     * it stops on exhaustion OR `opts.Discovery.TimeBudgetMs`; more rows simply mean stronger claims.
     *
     * Provable-only encoding into the standard flags:
     *  - `IsPrimaryKey` — set ONLY on the single statistics-first pick. Multiple equally-ranked unique
     *    columns leave PK unset here (ambiguous → the pipeline's `SoftPKClassifier` LLM tiebreaker
     *    decides, fed these same stats). Zero unique columns → no PK is fabricated.
     *  - `IsUniqueKey` — set when the column was all-distinct over the scan AND uniqueness was provable
     *    (the distinct-cap wasn't hit).
     *  - `AllowsNull` — asserted `true` ONLY when a null/absent value was actually observed; otherwise
     *    left undefined (permissive default). Never fabricates NOT NULL — critical under a time-capped
     *    partial scan where unseen rows could still be null.
     *
     * The PK emitted here is SOFT (it rides additionalSchemaInfo via the persist + DDL path; it is
     * NEVER a hard DB key), so a wrong inference can never reject a valid row — the engine dedupes via
     * the record-map. `IsReadOnly` defaults to true (stream discovery targets read feeds); a writable
     * source overrides via `opts.ReadOnly`.
     *
     * @param records - A read-only sync/async iterable of source records (the caller's fetch yields them).
     * @param opts.Discovery - Time budget / sample caps for the scan (see {@link StreamDiscoveryOptions}).
     * @param opts.Pk - Significance threshold + naming-rank tiebreaker (see {@link PkPickOptions}).
     * @param opts.ReadOnly - Whether discovered fields are read-only. Default true.
     */
    protected async DiscoverFieldsViaStream(
        records: AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>,
        opts: { Discovery?: StreamDiscoveryOptions; Pk?: PkPickOptions; ReadOnly?: boolean } = {}
    ): Promise<ExternalFieldSchema[]> {
        // Flatten nested objects so the column corpus + PK pick see SCALAR fields (e.g.
        // checkin_question.id → checkin_question_id) instead of an object-valued blob being chosen
        // as the key. Mirrors the sync-intake flatten (FieldMappingEngine) EXACTLY, so the field
        // names discovered here match what sync produces. A flat record passes through unchanged.
        async function* flattenRecords(): AsyncIterable<Record<string, unknown>> {
            for await (const r of records) yield hasNestedObject(r) ? flattenRecord(r) : r;
        }
        const scan = await discoverFromStream(flattenRecords(), opts.Discovery);
        // Provable-only identity in ONE pass: best contender per subset size (1,2,3…) → the SMALLEST
        // size whose best contender is a provable key (single OR composite), decided by the Chao1
        // domain-saturation test on the streamed sample. No fabricated keys; a genuinely-keyless object
        // simply gets no PK and is honestly not added downstream.
        const key = pickKeyFromStats(scan.Columns, scan.RowSamples, opts.Pk);
        let pkFieldNames: string[] = key.Fields ?? [];
        let pkReason = key.Reason;
        if (pkFieldNames.length === 0) {
            // No PROVABLE key (Chao1 saturated, or sub-significance sample). Fall back to a SOFT
            // best-available SINGLE-column pick: a convention-named column ('id'-like) carrying an
            // identity signal (non-null on every row + near-unique/distinct-capped). Rationale: a
            // PK-less entity STALLS CodeGen — it skips spCreate/Update/Delete + views for that table,
            // exits non-zero, and aborts ApplyAll. A soft key is dedup-only (can NEVER reject a row),
            // so "all keys are soft, best-available" keeps the table syncable. Genuinely-signal-less
            // objects still get no PK (content-hash identity handles dedup).
            // #A4 — tell the PK picker whether the scan saw the WHOLE stream; a time-budget-truncated scan
            // must not yield a confident soft key from a partial prefix.
            const soft = pickPrimaryKeyFromStats(scan.Columns, { ...opts.Pk, ScanComplete: scan.StoppedReason !== 'time-budget' });
            if (soft.Field) { pkFieldNames = [soft.Field]; pkReason = `[soft-fallback] ${soft.Reason}`; }
        }
        const pkFields = new Set<string>(pkFieldNames);
        // Diagnostic: the verdict + per-column stats, so a keyless object is an explained decision.
        const stats = scan.Columns.map(c => `${c.Key}(occ=${c.Occurrences}/${c.TotalRows},distinct=${c.DistinctNonNull}${c.DistinctCapped ? ',capped' : ''})`).join(', ');
        console.log(`[DiscoverFieldsViaStream] key pick — rows=${scan.RowSamples.length} | ${pkReason} | cols: [${stats}]`);
        const readOnly = opts.ReadOnly ?? true;

        return scan.Columns.map(c => {
            const provablyUnique = !c.DistinctCapped && c.Occurrences > 0 && c.DistinctNonNull === c.Occurrences;
            const isKey = pkFields.has(c.Key);
            const field: ExternalFieldSchema = {
                Name: c.Key,
                Label: c.Key,
                DataType: c.Inferred.SchemaFieldType,
                IsRequired: false,
                IsUniqueKey: provablyUnique,
                IsReadOnly: readOnly,
            };
            // §10 — discovered columns default NULLABLE. A sample can prove a value CAN be null but can
            // NEVER prove NOT NULL, and a wrong NOT NULL rejects real rows. So always permit null here;
            // a genuine NOT NULL only ever comes from an explicit source-declared "required".
            field.AllowsNull = true;
            // Statistics-first PK: mark each component of the chosen identity (single column or the
            // greedy composite set). Empty set = genuinely keyless → content-hash identity handles dedup.
            if (isKey) field.IsPrimaryKey = true;
            // §11 — ALWAYS size with generous headroom: a streamed-sample max is NOT the true max, so pad
            // well above it (≥2×, rounded up to a standard bucket) so the next-larger record never
            // truncates. Key columns stay capped at the 450-byte index-key limit so they remain
            // PK-eligible (and never NVARCHAR(MAX), which can't be a key); unproven length uses that cap.
            field.MaxLength = (() => {
                const m = c.Inferred.MaxLength;
                if (m == null || m <= 0) {
                    // Unknown length (#A5): a KEY must stay within the index-key limit (≤450, never MAX) so it
                    // remains PK-eligible. But a NON-key field of unknown length must size GENEROUSLY — defaulting
                    // it to 450 too silently TRUNCATED long descriptions / URLs / blobs. Err large + bounded.
                    return isKey ? 450 : 4000;
                }
                const padded = [32, 64, 128, 256, 512, 1024, 2048, 4000].find(b => b >= m * 2) ?? 4000;
                return isKey ? Math.min(padded, 450) : padded;
            })();
            return field;
        });
    }

    /**
     * Discovery via the connector's READ PATH ({@link FetchChanges}), TIME-BOUNDED — the way to gather
     * a statistically-significant sample when a single {@link DiscoverFields} sample is too small to
     * PROVE a key. "Discovery is the sync read path with the save removed."
     *
     * Loops FetchChanges as a read-only FULL fetch (WatermarkValue=null, nothing persisted), threading
     * pagination/keyset cursors across batches, and streams every record through the data-informed
     * field + provable-PK inference. It stops at the discovery TIME BUDGET (default 5 min), or a record
     * cap, or source exhaustion — whichever comes first — so the provable-PK decision is made on as much
     * real data as the budget allows. It NEVER fabricates a key: if even this larger sample yields no
     * provable single/composite PK, the field set comes back PK-less and the object is honestly not added.
     *
     * Falls back to the single-sample {@link DiscoverFields} if the read path can't run for this object
     * (e.g. a connector whose FetchChanges needs an already-persisted IO row that doesn't exist yet).
     */
    public async DiscoverFieldsViaFetch(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo,
        opts: { TimeBudgetMs?: number; BatchSize?: number; MaxRecords?: number } = {}
    ): Promise<ExternalFieldSchema[]> {
        // Discovery budgets are operator-tunable via env (time- or record-count-based — either bounds it);
        // explicit opts win, then env, then the sensible defaults. The record cap usually hits before time.
        const envInt = (name: string, fb: number): number => {
            const v = parseInt(process.env[name] ?? '', 10);
            return Number.isFinite(v) && v > 0 ? v : fb;
        };
        // §A — per-connection overrides via Configuration (set over GraphQL through IntegrationSetSyncConfig).
        // Precedence: explicit opts > per-connection Configuration > operator env > default.
        let cfg: { discoveryTimeBudgetMs?: number; discoveryBatchSize?: number; discoveryMaxRecords?: number } = {};
        try { if (companyIntegration.Configuration) cfg = JSON.parse(companyIntegration.Configuration); } catch { /* malformed → defaults */ }
        const cfgInt = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined);
        const timeBudgetMs = opts.TimeBudgetMs ?? cfgInt(cfg.discoveryTimeBudgetMs) ?? envInt('MJ_INTEGRATION_DISCOVERY_TIME_BUDGET_MS', 5 * 60 * 1000);
        const batchSize = opts.BatchSize ?? cfgInt(cfg.discoveryBatchSize) ?? envInt('MJ_INTEGRATION_DISCOVERY_BATCH_SIZE', 500);
        // §C — default sample is SMALL (one batch). Discovery only needs a column corpus + a lightweight
        // PK guess + type inference — NOT a full scan. The old 5000 default caused a 100-objects × 5000-rows
        // read storm on no-describe (file-feed) sources for zero added schema fidelity (the runtime soft-PK
        // classifier judges uniqueness on the live data, not this sample; custom-column overflow captures any
        // late-appearing field). Operator-tunable via env or, per-connection, the IntegrationSetSyncConfig
        // `discoveryMaxRecords` knob. Sampling itself is the FALLBACK path — used only when the source lacks a
        // describe endpoint that yields pk+type+columns; a describe-capable connector returns here-unused.
        // The Configuration read was MISSING from this line. `discoveryMaxRecords` is declared in the cfg
        // type above, documented directly above as a per-connection knob, accepted and persisted by
        // MJServer's IntegrationSetSyncConfig, returned by IntegrationGetSyncConfig, and surfaced in the
        // product as a settings field ("Max records" - cap on records sampled during discovery). All of
        // that worked. Nothing read the value back, so setting it saved a number and changed nothing.
        //
        // Its two siblings immediately above both read Configuration. This one did not, which made the one
        // discovery budget an operator actually wants to lower for a slow source the ONLY one that needed
        // an app setting and a process restart. Same precedence as the others now:
        // explicit opts > per-connection Configuration > operator env > default.
        const maxRecords = opts.MaxRecords ?? cfgInt(cfg.discoveryMaxRecords) ?? envInt('MJ_INTEGRATION_DISCOVERY_MAX_RECORDS', 500);
        // Announce intent AND cost. Until now only the FAILURE branch below said anything, so a
        // healthy-but-slow object, an object grinding out its whole time budget, and one that will
        // never return were indistinguishable from outside the process. The watchdog names whatever
        // is still in flight while it runs; the budget marker on the way out separates "slow source"
        // from "this object can never satisfy its stop condition".
        const watchdog = DiscoveryWatchdog.Instance;
        const startedMs = Date.now();
        const deadlineMs = startedMs + timeBudgetMs;
        const watchKey = watchdog.Start(objectName, deadlineMs);
        console.log(`[DiscoverFieldsViaFetch] -> "${objectName}" budget=${timeBudgetMs}ms maxRecords=${maxRecords} batch=${batchSize}`);
        try {
            const fields = await this.DiscoverFieldsViaStream(
                this.DiscoverySampleRecordStream(
                    companyIntegration, objectName, contextUser, batchSize, maxRecords,
                    // The SAME budget the stream consumer is given, now also reaching the producer —
                    // the consumer can only act between FetchChanges calls, which is no help at all
                    // when one call fans out into thousands of requests internally.
                    deadlineMs,
                    watchKey,
                ),
                { Discovery: { TimeBudgetMs: timeBudgetMs }, ReadOnly: true },
            );
            const tookMs = Date.now() - startedMs;
            const seen = watchdog.Peek(watchKey);
            console.log(
                `[DiscoverFieldsViaFetch] <- "${objectName}" ${tookMs}ms fields=${fields.length} ` +
                `records=${seen?.Records ?? '?'} pages=${seen?.Pages ?? '?'}` +
                (tookMs >= timeBudgetMs * 0.9
                    ? '  *** EXHAUSTED ITS TIME BUDGET — the source never yielded enough for it to stop on ***'
                    : ''),
            );
            return fields;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[DiscoverFieldsViaFetch] <- FAILED "${objectName}" after ${Date.now() - startedMs}ms (${msg}); falling back to single-sample DiscoverFields.`);
            return this.DiscoverFields(companyIntegration, objectName, contextUser);
        } finally {
            watchdog.End(watchKey);
        }
    }

    /**
     * The record source `DiscoverFieldsViaFetch` streams for field/PK inference. Default: loop
     * `FetchChanges` (full fetch), yielding each record's fields until `maxRecords`. A protocol subclass
     * (e.g. REST) overrides this to sample a template-var CHILD with the correct record-constrained,
     * recursive stream. Yields plain field maps; the caller stops it at `maxRecords`.
     */
    protected async *DiscoverySampleRecordStream(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo,
        batchSize: number,
        maxRecords: number,
        /**
         * Epoch ms this sample must not outlive, forwarded to the connector as `FetchContext.DeadlineMs`.
         * Optional so existing overrides of this method keep compiling and keep their current behaviour.
         */
        deadlineMs?: number,
        /** Watchdog key for this sample, when the caller registered one. Diagnostics only. */
        watchKey?: string,
    ): AsyncGenerator<Record<string, unknown>> {
        let ctx: FetchContext = {
            CompanyIntegration: companyIntegration,
            ObjectName: objectName,
            WatermarkValue: null,   // FULL fetch — discovery wants breadth, not the incremental delta
            BatchSize: batchSize,
            ContextUser: contextUser,
            // TELL THE CONNECTOR WHAT THIS CALL IS FOR. Stopping after `maxRecords` here only works
            // when one FetchChanges is one page; a connector that fans out internally (one request
            // per parent) never hands control back for us to stop it. See FetchContext.DeadlineMs.
            IsDiscoverySample: true,
            SampleTargetRecords: maxRecords,
            DeadlineMs: deadlineMs,
        };
        const watchdog = DiscoveryWatchdog.Instance;
        let yielded = 0;
        let page = 0;
        try {
            for (;;) {
                page++;
                watchdog.Note(watchKey, { Stage: `FetchChanges#${page}` });
                const pageStartedMs = Date.now();
                const batch = await this.FetchChanges(ctx);
                console.log(
                    `[DiscoverySampleStream] "${objectName}" page ${page} -> ${batch.Records.length} record(s) ` +
                    `in ${Date.now() - pageStartedMs}ms (HasMore=${!!batch.HasMore}, yieldedSoFar=${yielded}/${maxRecords})`,
                );
                watchdog.Note(watchKey, { Stage: 'inferring', Pages: page, Records: yielded + batch.Records.length });
                for (const rec of batch.Records) {
                    yield rec.Fields;
                    if (++yielded >= maxRecords) {
                        console.log(`[DiscoverySampleStream] "${objectName}" stop=SAMPLE_TARGET_MET at ${yielded} record(s) after ${page} page(s)`);
                        return;
                    }
                }
                if (!batch.HasMore) {
                    console.log(`[DiscoverySampleStream] "${objectName}" stop=SOURCE_EXHAUSTED at ${yielded} record(s) after ${page} page(s)`);
                    break;
                }
                // STOP AT THE DEADLINE. The deadline is handed to the connector so it can bound its own
                // internal fan-out, but a connector that ignores it (every connector predating the
                // marker) keeps returning HasMore=true and this loop keeps asking — the budget the
                // caller set is then enforced by nothing at all. This is the one place the sampler can
                // always honour it: between pages, having kept everything collected so far.
                if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
                    console.log(`[DiscoverySampleStream] "${objectName}" stop=DEADLINE at ${yielded} record(s) after ${page} page(s)`);
                    return;
                }
                ctx = {
                    ...ctx,
                    WatermarkValue: null,
                    CurrentPage: batch.NextPage,
                    CurrentOffset: batch.NextOffset,
                    CurrentCursor: batch.NextCursor,
                    AfterKeyValue: batch.NextAfterKeyValue ?? ctx.AfterKeyValue,
                };
            }
        } finally {
            watchdog.Note(watchKey, { Stage: 'stream-closed' });
        }
    }

    // ─── Core Abstract Methods ───────────────────────────────────────

    /**
     * Tests connectivity to the external system.
     * @param companyIntegration - The company integration entity with connection credentials
     * @param contextUser - User context for authorization
     * @returns Connection test result with success/failure and message
     */
    public abstract TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult>;

    /**
     * Discovers available objects/tables in the external system.
     * @param companyIntegration - The company integration entity with connection credentials
     * @param contextUser - User context for authorization
     * @returns Array of object schemas available for integration
     */
    public abstract DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]>;

    /**
     * Discovers fields on a specific external object.
     * @param companyIntegration - The company integration entity with connection credentials
     * @param objectName - Name of the external object to inspect
     * @param contextUser - User context for authorization
     * @returns Array of field schemas for the specified object
     */
    public abstract DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]>;

    /**
     * Fetches a batch of changed records from the external system.
     * Supports incremental fetching via watermarks.
     * @param ctx - Context containing connection info, object name, and watermark
     * @returns Batch of external records with pagination info
     */
    public abstract FetchChanges(ctx: FetchContext): Promise<FetchBatchResult>;

    /**
     * Returns suggested default field mappings for an external object to MJ entity.
     * Override in subclasses to provide intelligent defaults.
     * @param _objectName - Name of the external object
     * @param _entityName - Name of the target MJ entity
     * @returns Array of default field mappings (empty by default)
     */
    public GetDefaultFieldMappings(_objectName: string, _entityName: string): DefaultFieldMapping[] {
        return [];
    }

    /**
     * Returns a proposed default configuration for quick setup.
     * Override in subclasses to provide connector-specific defaults
     * including schema name, objects to sync, and field mappings.
     * Returns null by default (no quick setup available).
     */
    public GetDefaultConfiguration(): DefaultIntegrationConfig | null {
        return null;
    }

    // ─── Action Metadata Generation ─────────────────────────────────

    /**
     * Returns the integration objects and their fields that this connector
     * supports, for use by the ActionMetadataGenerator. This is static
     * metadata that does NOT require a live connection — it describes the
     * connector's known object model.
     *
     * Override in subclasses to provide connector-specific objects/fields.
     * Returns an empty array by default (no action generation available).
     */
    public GetIntegrationObjects(): IntegrationObjectInfo[] {
        return [];
    }

    /**
     * Returns the ActionGeneratorConfig for this connector, combining the
     * integration name, category, icon, and objects into a ready-to-use
     * configuration for ActionMetadataGenerator.Generate().
     *
     * Override in subclasses to customize the config (e.g., icon, category).
     * Returns null by default if GetIntegrationObjects() returns empty.
     */
    public GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const allObjects = this.GetIntegrationObjects();
        // Only include objects that opt-in to action generation (default: true)
        const objects = allObjects.filter(o => o.IncludeInActionGeneration !== false);
        if (objects.length === 0) return null;

        return {
            IntegrationName: this.IntegrationName,
            CategoryName: this.IntegrationName,
            IconClass: 'fa-solid fa-plug',
            Objects: objects,
            IncludeSearch: this.SupportsSearch,
            IncludeList: this.SupportsListing,
        };
    }

    /**
     * The canonical integration name (e.g., "HubSpot", "Rasa.io").
     * Used by GetActionGeneratorConfig() and IntegrationActionExecutor
     * to match connectors to action Config.IntegrationName.
     *
     * Override in subclasses. Defaults to the class name.
     */
    public get IntegrationName(): string {
        return this.constructor.name;
    }

    // ─── Schema Introspection ────────────────────────────────────────

    /**
     * Introspects the source system's schema — returns metadata about available
     * objects, their fields, primary keys, and foreign key relationships.
     * Used by the Schema Builder to generate local DDL.
     *
     * Default implementation builds SourceSchemaInfo from DiscoverObjects + DiscoverFields.
     * Override in subclasses for richer metadata (e.g., FK relationships, type details).
     *
     * @param companyIntegration - The company integration entity with connection credentials
     * @param contextUser - User context for authorization
     * @param options - Optional filter to restrict introspection to a subset of objects
     * @returns Full schema info for all (or the requested subset of) source objects
     */
    /**
     * §7 — does this connector's discovery (DiscoverObjects/DiscoverFields → IntrospectSchema) return the
     * AUTHORITATIVE, COMPLETE gamut of objects/fields the credentials expose? Default **false** (safe):
     * a connector must explicitly affirm this. Override to `true` ONLY when DiscoverObjects hits a real
     * list/describe endpoint that returns EVERYTHING accessible — so an object/field absent from a refresh
     * genuinely means the source dropped it (and may be deactivated). Leave false for stubbed discovery
     * (returns nothing → static metadata is all we have), a cache-driven IntrospectSchema, or any
     * partial/scoped enumeration — there, absence proves nothing and MUST NOT deactivate.
     */
    public get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    public async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        options?: IntrospectSchemaOptions
    ): Promise<SourceSchemaInfo> {
        const allObjects = await this.DiscoverObjects(companyIntegration, contextUser);
        const wanted = options?.ObjectNames && options.ObjectNames.length > 0
            ? new Set(options.ObjectNames)
            : null;
        const objects = wanted ? allObjects.filter(o => wanted.has(o.Name)) : allObjects;
        // §7 — a SCOPED introspection (ObjectNames filter) is never authoritative over the whole surface,
        // so it can never drive deactivation even if the connector affirms authoritative discovery.
        const result: SourceSchemaInfo = { Objects: [], IsAuthoritative: this.DiscoveryIsAuthoritative && !wanted };

        // Parallel describe via the SAME control law the sync engine uses for its layers —
        // `RunAdaptive` + `AdaptiveConcurrencyController` (AIMD). Discovery IS the sync read path with
        // the save removed, so it shares the concurrency machinery rather than a separate fixed pool:
        // it ramps UP on clean describes and CUTS on a throttle (detected via the connector's
        // `ExtractRetryAfterMs`). The cap honors the connector's `MaxConcurrencyHint` + a per-connection
        // `Configuration.maxConcurrency` override (the same `IntegrationSetSyncConfig` knob that tunes
        // sync). Default start is 8 — a read-only introspection sweep tolerates more parallelism than
        // the write path's default of 1; sequential introspection is brutal (Sage Intacct ~30 min).
        const total = objects.length;
        const startMs = Date.now();
        let succeeded = 0;
        let skipped = 0;

        const DEFAULT_DISCOVERY_CONCURRENCY = 8;
        let maxConcurrency = Math.max(DEFAULT_DISCOVERY_CONCURRENCY, this.MaxConcurrencyHint ?? 0);
        try {
            const raw = companyIntegration.Configuration;
            if (raw) {
                const m = (JSON.parse(raw) as { maxConcurrency?: number }).maxConcurrency;
                if (typeof m === 'number' && Number.isFinite(m) && m >= 1) maxConcurrency = Math.floor(m);
            }
        } catch { /* malformed Configuration → defaults */ }
        const controller = new AdaptiveConcurrencyController({
            start: Math.min(DEFAULT_DISCOVERY_CONCURRENCY, Math.max(1, maxConcurrency)),
            min: 1,
            max: Math.max(1, maxConcurrency),
        });

        const introspectOne = async (obj: ExternalObjectSchema): Promise<AdaptiveItemOutcome> => {
            const objStart = Date.now();
            console.log(JSON.stringify({
                ts: new Date().toISOString(), event: 'introspect.object.start', objectName: obj.Name, total,
            }));
            let fields: ExternalFieldSchema[];
            try {
                fields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`WARNING: Skipping object "${obj.Name}" — DiscoverFields failed: ${msg}`);
                console.log(JSON.stringify({
                    ts: new Date().toISOString(), event: 'introspect.object.skipped',
                    objectName: obj.Name, total, error: msg, durationMs: Date.now() - objStart,
                }));
                skipped++;
                // U11 — determinate discovery progress: a skipped object still advances the bar.
                try { options?.OnProgress?.(succeeded + skipped, total); } catch { /* progress must never break introspection */ }
                // A real rate-limit failure cuts the in-flight cap (AIMD); a plain describe error does not.
                //
                // `ExtractRetryAfterMs` alone is not enough to make that distinction. Its base
                // implementation returns `undefined`, and NO connector in this repo overrides it — so
                // asking only that question answered "not a throttle" for every connector MJ ships, and
                // discovery kept all 8 describes in flight straight through a vendor's 429s. That is the
                // shape of a brittle discovery: the source says slow down, the fan-out doesn't, more
                // objects fail, and the enumeration comes back short for a reason that was transient.
                //
                // `ClassifyError` reads the error's own text ('rate limit' / 'throttl' / '429'), which
                // costs a connector nothing to benefit from — the same classifier the sync fetch path at
                // IntegrationEngine already uses for exactly this decision. Keep `ExtractRetryAfterMs`
                // first: a connector that DOES parse the vendor's header gives a precise signal, and this
                // is a fallback under it, not a replacement for it.
                const retryAfterMs = this.ExtractRetryAfterMs(err);
                const throttled = retryAfterMs !== undefined || ClassifyError(err).Code === 'RATE_LIMIT_EXCEEDED';
                if (throttled) {
                    console.log(JSON.stringify({
                        ts: new Date().toISOString(), event: 'introspect.object.throttled',
                        objectName: obj.Name, total, retryAfterMs: retryAfterMs ?? null,
                        source: retryAfterMs !== undefined ? 'connector' : 'classifier',
                    }));
                }
                return { ok: false, throttled };
            }
            console.log(JSON.stringify({
                ts: new Date().toISOString(), event: 'introspect.object.complete',
                objectName: obj.Name, total, fieldsDiscovered: fields.length,
                primaryKeyFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                foreignKeyFields: fields.filter(f => f.IsForeignKey).length, durationMs: Date.now() - objStart,
            }));
            // Single-threaded async → these mutations are atomic across concurrent introspectOne calls
            // (same safety the sync engine's per-map aggregate mutations rely on).
            result.Objects.push({
                ExternalName: obj.Name,
                ExternalLabel: obj.Label,
                Description: obj.Description,
                Fields: fields.map(f => ({
                    Name: f.Name,
                    Label: f.Label,
                    Description: f.Description,
                    SourceType: f.DataType,
                    IsRequired: f.IsRequired,
                    AllowsNull: f.AllowsNull,
                    MaxLength: f.MaxLength ?? null,
                    Precision: f.Precision ?? null,
                    Scale: f.Scale ?? null,
                    DefaultValue: f.DefaultValue ?? null,
                    // U1 — propagate `undefined` (source had no opinion), never coerce to false:
                    // `?? false` here turned a sample's SILENCE into a hard "not a PK/FK" that the
                    // persist overlay then treated as a Discovered opinion, wiping declared flags.
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsUniqueKey: f.IsUniqueKey,
                    IsReadOnly: f.IsReadOnly,
                    IsForeignKey: f.IsForeignKey,
                    ForeignKeyTarget: f.ForeignKeyTarget ?? null,
                })),
                // Honest PK selection: only IsPrimaryKey=true fields qualify (an object can have several
                // unique fields of which only one is the PK). Connectors that don't set IsPrimaryKey
                // return an empty PrimaryKeyFields; the runtime PK classifier (D2/D4) handles the residual.
                PrimaryKeyFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                Relationships: fields
                    .filter(f => (f.IsForeignKey ?? false) && f.ForeignKeyTarget)
                    .map(f => ({ FieldName: f.Name, TargetObject: f.ForeignKeyTarget!, TargetField: 'ID' })),
            });
            succeeded++;
            const done = succeeded + skipped;
            if (done % 100 === 0 || done === total) {
                console.log(`[IntrospectSchema] progress: ${done}/${total} (ok=${succeeded}, skipped=${skipped}) — ${((Date.now() - startMs) / 1000).toFixed(1)}s elapsed`);
            }
            // U11 — determinate discovery progress (scanned of total) for the caller's progress bar.
            try { options?.OnProgress?.(done, total); } catch { /* progress must never break introspection */ }
            return { ok: true, throttled: false };
        };

        await RunAdaptive(objects, introspectOne, controller);

        return result;
    }

}
