import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { ExternalRecord, DefaultFieldMapping, SourceSchemaInfo } from './types.js';

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
 */
export abstract class BaseIntegrationConnector {
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
                Relationships: [],
            });
        }

        return result;
    }

    // ── Optional write-back interface ──────────────────────────────────────
    // Connectors that support write operations implement these methods.
    // They are optional; connectors that are read-only can leave them undefined.

    /**
     * Creates a new record in the external system for the given object type.
     * Implement in subclasses that support write-back.
     * @param objectType - Name of the external object (e.g., "contacts", "members")
     * @param data - Field name → value map for the new record
     * @param companyIntegration - The company integration entity with connection credentials
     * @param contextUser - User context for authorization
     * @returns The created record as returned by the external API (including generated ID)
     */
    public CreateRecord?(
        objectType: string,
        data: Record<string, unknown>,
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>>;

    /**
     * Updates an existing record in the external system.
     * Implement in subclasses that support write-back.
     * @param objectType - Name of the external object
     * @param externalId - The external system's ID for the record to update
     * @param data - Field name → value map of fields to update
     * @param companyIntegration - The company integration entity with connection credentials
     * @param contextUser - User context for authorization
     * @returns The updated record as returned by the external API
     */
    public UpdateRecord?(
        objectType: string,
        externalId: string,
        data: Record<string, unknown>,
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>>;

    /**
     * Deletes a record from the external system.
     * Implement in subclasses that support write-back.
     * @param objectType - Name of the external object
     * @param externalId - The external system's ID for the record to delete
     * @param companyIntegration - The company integration entity with connection credentials
     * @param contextUser - User context for authorization
     * @returns True if the record was deleted successfully
     */
    public DeleteRecord?(
        objectType: string,
        externalId: string,
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<boolean>;

    /**
     * Searches records in the external system.
     * Implement in subclasses that support read-by-filter operations.
     * @param objectType - Name of the external object
     * @param filter - Field name → value map of search criteria
     * @param companyIntegration - The company integration entity with connection credentials
     * @param contextUser - User context for authorization
     * @returns Array of matching records
     */
    public SearchRecords?(
        objectType: string,
        filter: Record<string, unknown>,
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>[]>;
}
