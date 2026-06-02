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
    DeleteRecordContext,
    GetRecordContext,
    CRUDResult,
    SearchContext,
    SearchResult,
    ListContext,
    ListResult,
} from './types.js';

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

        // Parallel describe — sequential is brutal when a connector has
        // hundreds of objects to introspect (Sage Intacct can run ~30 minutes
        // sequentially on a large catalog). 8-way is a safe default that
        // mirrors the Salesforce override and respects most APIs' rate limits.
        const CONCURRENCY = 8;
        const total = objects.length;
        const startMs = Date.now();
        let nextIdx = 0;
        let succeeded = 0;
        let skipped = 0;

        const worker = async (): Promise<void> => {
            while (true) {
                const myIdx = nextIdx++;
                if (myIdx >= total) return;
                const obj = objects[myIdx];
                const objStart = Date.now();
                console.log(JSON.stringify({
                    ts: new Date().toISOString(),
                    event: 'introspect.object.start',
                    objectIndex: myIdx + 1,
                    total,
                    objectName: obj.Name,
                }));
                let fields: ExternalFieldSchema[];
                try {
                    fields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    console.warn(`WARNING: Skipping object "${obj.Name}" — DiscoverFields failed: ${msg}`);
                    console.log(JSON.stringify({
                        ts: new Date().toISOString(),
                        event: 'introspect.object.skipped',
                        objectIndex: myIdx + 1,
                        total,
                        objectName: obj.Name,
                        error: msg,
                        durationMs: Date.now() - objStart,
                    }));
                    skipped++;
                    continue;
                }
                console.log(JSON.stringify({
                    ts: new Date().toISOString(),
                    event: 'introspect.object.complete',
                    objectIndex: myIdx + 1,
                    total,
                    objectName: obj.Name,
                    fieldsDiscovered: fields.length,
                    primaryKeyFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                    foreignKeyFields: fields.filter(f => f.IsForeignKey).length,
                    durationMs: Date.now() - objStart,
                }));
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
                    // Honest PK selection: only IsPrimaryKey=true fields qualify.
                    // Prior behavior used IsUniqueKey which is wrong — an object
                    // can have multiple unique fields (e.g. email + phone) of which
                    // only one is the PK. Connectors that don't yet set IsPrimaryKey
                    // on their DiscoverFields output will return an empty PrimaryKeyFields;
                    // the runtime PK classifier (Phase 0 D2/D4) handles the residual.
                    PrimaryKeyFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                    Relationships: fields
                        .filter(f => (f.IsForeignKey ?? false) && f.ForeignKeyTarget)
                        .map(f => ({
                            FieldName: f.Name,
                            TargetObject: f.ForeignKeyTarget!,
                            TargetField: 'ID',
                        })),
                });
                succeeded++;
                const done = succeeded + skipped;
                if (done % 100 === 0 || done === total) {
                    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
                    console.log(
                        `[IntrospectSchema] progress: ${done}/${total} (ok=${succeeded}, skipped=${skipped}) — ${elapsedSec}s elapsed`
                    );
                }
            }
        };

        const workerCount = Math.min(CONCURRENCY, total);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        return result;
    }

}
