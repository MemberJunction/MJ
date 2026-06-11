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
import {
    discoverFromStream,
    pickKeyFromStats,
    pickPrimaryKeyFromStats,
    type StreamDiscoveryOptions,
    type PkPickOptions,
} from './StreamingDiscovery.js';
import { AdaptiveConcurrencyController, RunAdaptive, type AdaptiveItemOutcome } from './AdaptiveConcurrency.js';
import { flattenRecord, hasNestedObject } from './RecordFlatten.js';

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
 * Wraps a promise with a timeout. Rejects with a timeout error if the
 * promise does not resolve within the specified duration.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation for error messaging
 * @returns The result of the promise
 * @throws Error if the operation times out
 */
export async function WithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
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
     */
    public ExtractRetryAfterMs(_error: unknown): number | undefined { return undefined; }

    /**
     * Highest SAFE per-layer concurrency the source tolerates (plan.md §7 peak parallelization) — the
     * ceiling the engine's adaptive controller ramps toward. `null` → use configured syncConcurrency.
     */
    public get MaxConcurrencyHint(): number | null { return null; }

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
            const soft = pickPrimaryKeyFromStats(scan.Columns, opts.Pk);
            if (soft.Field) { pkFieldNames = [soft.Field]; pkReason = `[soft-fallback] ${soft.Reason}`; }
        }
        const pkFields = new Set<string>(pkFieldNames);
        // Diagnostic: the verdict + per-column stats, so a keyless object is an explained decision.
        const stats = scan.Columns.map(c => `${c.Key}(occ=${c.Occurrences}/${c.TotalRows},distinct=${c.DistinctNonNull}${c.DistinctCapped ? ',capped' : ''})`).join(', ');
        console.log(`[DiscoverFieldsViaStream] key pick — rows=${scan.RowSamples.length} | ${pkReason} | cols: [${stats}]`);
        const readOnly = opts.ReadOnly ?? true;

        return scan.Columns.map(c => {
            const provablyUnique = !c.DistinctCapped && c.Occurrences > 0 && c.DistinctNonNull === c.Occurrences;
            const sawNull = c.Occurrences < c.TotalRows;
            const field: ExternalFieldSchema = {
                Name: c.Key,
                Label: c.Key,
                DataType: c.Inferred.SchemaFieldType,
                IsRequired: false,
                IsUniqueKey: provablyUnique,
                IsReadOnly: readOnly,
            };
            // Provable-only: only assert nullability we actually observed; never fabricate NOT NULL.
            if (sawNull) field.AllowsNull = true;
            // Statistics-first PK: mark each component of the chosen identity (single column or the
            // greedy composite set). Empty set = genuinely keyless → content-hash identity handles dedup.
            if (pkFields.has(c.Key)) field.IsPrimaryKey = true;
            // Provable-only length: a streamed-sample max isn't a proof. When unproven, seed a
            // safe bounded default (450 — the largest a key column can be, so any field stays
            // PK-eligible) so the column is nvarchar(450) downstream — never NVARCHAR(MAX),
            // which can't be a key and breaks idempotent re-apply.
            field.MaxLength = c.Inferred.MaxLength ?? 450;
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
        const timeBudgetMs = opts.TimeBudgetMs ?? envInt('MJ_INTEGRATION_DISCOVERY_TIME_BUDGET_MS', 5 * 60 * 1000);
        const batchSize = opts.BatchSize ?? envInt('MJ_INTEGRATION_DISCOVERY_BATCH_SIZE', 500);
        const maxRecords = opts.MaxRecords ?? envInt('MJ_INTEGRATION_DISCOVERY_MAX_RECORDS', 5000);
        const self = this;
        async function* readPathStream(): AsyncGenerator<Record<string, unknown>> {
            let ctx: FetchContext = {
                CompanyIntegration: companyIntegration,
                ObjectName: objectName,
                WatermarkValue: null,   // FULL fetch — discovery wants breadth, not the incremental delta
                BatchSize: batchSize,
                ContextUser: contextUser,
            };
            let yielded = 0;
            for (;;) {
                const batch = await self.FetchChanges(ctx);
                for (const rec of batch.Records) {
                    yield rec.Fields;
                    if (++yielded >= maxRecords) return;
                }
                if (!batch.HasMore) break;
                ctx = {
                    ...ctx,
                    WatermarkValue: null,
                    CurrentPage: batch.NextPage,
                    CurrentOffset: batch.NextOffset,
                    CurrentCursor: batch.NextCursor,
                    AfterKeyValue: batch.NextAfterKeyValue ?? ctx.AfterKeyValue,
                };
            }
        }
        try {
            return await this.DiscoverFieldsViaStream(readPathStream(), {
                Discovery: { TimeBudgetMs: timeBudgetMs },
                ReadOnly: true,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[DiscoverFieldsViaFetch] read-path discovery failed for "${objectName}" (${msg}); falling back to single-sample DiscoverFields.`);
            return this.DiscoverFields(companyIntegration, objectName, contextUser);
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
        const result: SourceSchemaInfo = { Objects: [] };

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
                // A real rate-limit failure cuts the in-flight cap (AIMD); a plain describe error does not.
                return { ok: false, throttled: this.ExtractRetryAfterMs(err) !== undefined };
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
                    IsPrimaryKey: f.IsPrimaryKey ?? false,
                    IsUniqueKey: f.IsUniqueKey,
                    IsReadOnly: f.IsReadOnly,
                    IsForeignKey: f.IsForeignKey ?? false,
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
            return { ok: true, throttled: false };
        };

        await RunAdaptive(objects, introspectOne, controller);

        return result;
    }

}
