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
    SourceObjectInfo,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    GetRecordContext,
    CRUDResult,
    SearchContext,
    SearchResult,
    ListContext,
    ListResult,
} from './types.js';
import type { TransformPipeline } from './strategies/TransformStrategy.js';
import type { PaginationStrategy } from './strategies/PaginationStrategy.js';
import type { BatchingStrategy } from './strategies/BatchingStrategy.js';
import type { RateLimitStrategy } from './strategies/RateLimitStrategy.js';
import type { WritebackStrategy } from './strategies/WritebackStrategy.js';
import type { EndpointTraversal } from './strategies/EndpointTraversalStrategy.js';
import type { IncrementalSyncStrategy } from './strategies/IncrementalSyncStrategy.js';
import type { IntegrationLogger, TransactionLogger } from './strategies/LoggingPolicy.js';
import { DefaultTransformPipeline } from './strategies/builtin/transforms/DefaultTransformPipeline.js';
import { NoPagination } from './strategies/builtin/pagination/NoPagination.js';
import { NoBatching } from './strategies/builtin/batching/NoBatching.js';
import { NoRateLimit } from './strategies/builtin/ratelimit/NoRateLimit.js';
import { ReadOnlyWriteback } from './strategies/builtin/writeback/ReadOnlyWriteback.js';
import { NoIncrementalSync } from './strategies/builtin/incremental/NoIncrementalSync.js';

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
    /** Whether the field is required */
    IsRequired: boolean;
    /** Whether the field is a unique identifier */
    IsUniqueKey: boolean;
    /** Whether the field is read-only */
    IsReadOnly: boolean;
    /** Whether this field is a foreign key */
    IsForeignKey?: boolean;
    /** If FK, which source object it references */
    ForeignKeyTarget?: string | null;
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
}

/** Result of a FetchChanges call, containing a batch of records */
export interface FetchBatchResult {
    /** Records retrieved in this batch */
    Records: ExternalRecord[];
    /** Whether there are more records to fetch after this batch */
    HasMore: boolean;
    /** Updated watermark value after this batch */
    NewWatermarkValue?: string;
    /** Next page number to pass back via FetchContext.CurrentPage on the next call (page-based pagination) */
    NextPage?: number;
    /** Next offset to pass back via FetchContext.CurrentOffset on the next call (offset-based pagination) */
    NextOffset?: number;
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

    // ─── Strategy Accessors ───────────────────────────────────────────
    // Override in subclasses to compose the connector from reusable strategies.
    // Each accessor returns a default (no-op) implementation that subclasses replace.

    /**
     * Returns the transform pipeline for this connector.
     * Override to compose connector-specific and platform-specific transform rules.
     */
    public GetTransformPipeline(): TransformPipeline {
        return new DefaultTransformPipeline([]);
    }

    /**
     * Returns the pagination strategy for a specific object.
     * Override per-object if the connector uses different pagination for different endpoints.
     * @param _objectName - the integration object being fetched
     */
    public GetPaginationStrategy(_objectName: string): PaginationStrategy {
        return new NoPagination();
    }

    /**
     * Returns the batching strategy for write operations.
     * Override to enable batch writes (e.g., HubSpot 100/call, Salesforce Bulk API).
     */
    public GetBatchingStrategy(): BatchingStrategy {
        return new NoBatching();
    }

    /**
     * Returns the rate limit strategy for API requests.
     * Override to enable throttling and retry logic.
     */
    public GetRateLimitStrategy(): RateLimitStrategy {
        return new NoRateLimit();
    }

    /**
     * Returns the writeback strategy for CRUD operations on the external system.
     * Override to enable create/update/delete support.
     */
    public GetWritebackStrategy(): WritebackStrategy {
        return new ReadOnlyWriteback();
    }

    /**
     * Returns the endpoint traversal classification for a specific object.
     * Override per-object to describe how each endpoint is fetched.
     * @param _objectName - the integration object being fetched
     */
    public GetEndpointTraversal(_objectName: string): EndpointTraversal {
        return { Type: 'Paginated', Description: 'Default paginated fetch' };
    }

    /**
     * Returns the incremental sync strategy for a specific object.
     * Override per-object to enable watermark-based incremental sync.
     * @param _objectName - the integration object being fetched
     */
    public GetIncrementalStrategy(_objectName: string): IncrementalSyncStrategy {
        return new NoIncrementalSync();
    }

    /**
     * Returns the integration logger for human-readable console output.
     * Override to customize logging format or destination.
     */
    public GetLogger(): IntegrationLogger {
        const tableSummaries: import('./strategies/LoggingPolicy.js').TableSyncSummary[] = [];
        return {
            Info: (obj, msg) => console.log(`[${this.IntegrationName}/${obj}] ${msg}`),
            Warn: (obj, msg) => console.warn(`[${this.IntegrationName}/${obj}] ${msg}`),
            Error: (obj, msg, err) => console.error(`[${this.IntegrationName}/${obj}] ${msg}`, err ?? ''),
            Progress: (obj, processed, total) => console.log(`[${this.IntegrationName}/${obj}] ${processed}${total != null ? `/${total}` : ''} records`),
            StartPhase: (phase, obj) => console.log(`[${this.IntegrationName}/${obj}] ▶ ${phase}`),
            EndPhase: (phase, obj, result) => console.log(`[${this.IntegrationName}/${obj}] ${result === 'success' ? '✓' : '✗'} ${phase}`),
            SyncPlanAnnounce: (tables) => console.log(`[${this.IntegrationName}] Sync plan: ${tables.length} tables will sync → [${tables.join(', ')}]`),
            TableStart: (obj, index, total) => {
                console.log(`[${this.IntegrationName}/${obj}] Starting (${index + 1}/${total})`);
                tableSummaries.push({ ObjectName: obj, Status: 'in_progress', RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0, RecordsErrored: 0, DurationMs: null });
            },
            TableComplete: (obj, summary) => {
                console.log(`[${this.IntegrationName}/${obj}] Completed — ${summary.RecordsProcessed} records (${summary.RecordsCreated} created, ${summary.RecordsUpdated} updated, ${summary.RecordsErrored} errors) in ${summary.DurationMs ?? 0}ms`);
                const existing = tableSummaries.find(s => s.ObjectName === obj);
                if (existing) Object.assign(existing, summary, { Status: 'completed' as const });
            },
            TableFailed: (obj, error) => {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`[${this.IntegrationName}/${obj}] FAILED: ${msg}`);
                const existing = tableSummaries.find(s => s.ObjectName === obj);
                if (existing) { existing.Status = 'failed'; existing.ErrorMessage = msg; }
            },
            TableSkipped: (obj, reason) => {
                console.log(`[${this.IntegrationName}/${obj}] Skipped: ${reason}`);
                tableSummaries.push({ ObjectName: obj, Status: 'skipped', RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0, RecordsErrored: 0, DurationMs: null });
            },
            GetTableSummaries: () => [...tableSummaries],
        };
    }

    /**
     * Returns the transaction logger for database-persisted audit trails.
     * Override to write to CompanyIntegrationRunDetail records.
     */
    public GetTransactionLogger(): TransactionLogger {
        // Default: no-op transaction logger (logs nothing to DB, yields no stream entries)
        return {
            LogBatchStart: () => {},
            LogBatchComplete: () => {},
            LogRecordOperation: () => {},
            LogPhaseTransition: () => {},
            Flush: async () => {},
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            async *StreamLogs(_runId: string) { /* no-op: yields nothing */ },
        };
    }

    // ─── Custom Object Discovery ────────────────────────────────────

    /** Whether this connector supports discovering custom objects from the external system */
    public get SupportsCustomObjects(): boolean { return false; }

    /**
     * Discovers custom objects defined in the external system (e.g., HubSpot custom objects).
     * Returns lightweight schema info (name, label, capabilities).
     * Override in connectors that support custom object discovery.
     * @param _companyIntegration - connection details
     * @param _contextUser - user context
     * @returns array of discovered custom object schemas
     */
    public async DiscoverCustomObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return [];
    }

    /**
     * Discovers custom objects with FULL schema detail — fields, PKs, FK relationships.
     * Returns SourceObjectInfo[] suitable for feeding directly into SchemaBuilder to
     * generate DDL with proper soft PKs/FKs.
     *
     * If the external system provides relationship/association metadata (e.g., HubSpot
     * custom object associations), this method should extract and return them as
     * SourceRelationshipInfo entries so SchemaBuilder can emit soft FK config.
     *
     * Default implementation delegates to DiscoverCustomObjects() + DiscoverFields()
     * for basic coverage. Override for richer metadata (associations, typed FKs, etc.).
     *
     * @param companyIntegration - connection details
     * @param contextUser - user context
     * @returns full schema info for custom objects (fields, PKs, FKs)
     */
    public async DiscoverCustomObjectSchemas(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceObjectInfo[]> {
        const customObjects = await this.DiscoverCustomObjects(companyIntegration, contextUser);
        const result: SourceObjectInfo[] = [];

        for (const obj of customObjects) {
            let fields: ExternalFieldSchema[];
            try {
                fields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);
            } catch {
                // If field discovery fails, include with empty fields
                fields = [];
            }

            result.push({
                ExternalName: obj.Name,
                ExternalLabel: obj.Label,
                Description: obj.Description,
                Fields: fields.map(f => ({
                    Name: f.Name,
                    Label: f.Label,
                    Description: f.Description,
                    SourceType: f.DataType,
                    IsRequired: f.IsRequired,
                    MaxLength: null,
                    Precision: null,
                    Scale: null,
                    DefaultValue: null,
                    IsPrimaryKey: f.IsUniqueKey,
                    IsForeignKey: f.IsForeignKey ?? false,
                    ForeignKeyTarget: f.ForeignKeyTarget ?? null,
                })),
                PrimaryKeyFields: fields.filter(f => f.IsUniqueKey).map(f => f.Name),
                Relationships: fields
                    .filter(f => (f.IsForeignKey ?? false) && f.ForeignKeyTarget)
                    .map(f => ({
                        FieldName: f.Name,
                        TargetObject: f.ForeignKeyTarget!,
                        TargetField: 'ID',
                    })),
            });
        }

        return result;
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
     * @returns Full schema info for all source objects
     */
    public async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const objects = await this.DiscoverObjects(companyIntegration, contextUser);
        const result: SourceSchemaInfo = { Objects: [] };

        for (const obj of objects) {
            let fields: ExternalFieldSchema[];
            try {
                fields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`WARNING: Skipping object "${obj.Name}" — DiscoverFields failed: ${msg}`);
                continue;
            }
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
                    MaxLength: null,
                    Precision: null,
                    Scale: null,
                    DefaultValue: null,
                    IsPrimaryKey: f.IsUniqueKey,
                    IsForeignKey: f.IsForeignKey ?? false,
                    ForeignKeyTarget: f.ForeignKeyTarget ?? null,
                })),
                PrimaryKeyFields: fields.filter(f => f.IsUniqueKey).map(f => f.Name),
                Relationships: fields
                    .filter(f => (f.IsForeignKey ?? false) && f.ForeignKeyTarget)
                    .map(f => ({
                        FieldName: f.Name,
                        TargetObject: f.ForeignKeyTarget!,
                        TargetField: 'ID',
                    })),
            });
        }

        return result;
    }

}
