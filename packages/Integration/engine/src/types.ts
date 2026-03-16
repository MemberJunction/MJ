import type { TransformStep } from './transforms.js';

/** Direction of data synchronization between MJ and external system */
export type SyncDirection = 'Pull' | 'Push' | 'Bidirectional';

/** What triggers a sync run */
export type SyncTriggerType = 'Scheduled' | 'Manual' | 'Webhook';

/** Type of watermark used for incremental sync */
export type WatermarkType = 'Timestamp' | 'Cursor' | 'ChangeToken' | 'Version';

/** How to resolve conflicts when both sides have changes */
export type ConflictResolution = 'SourceWins' | 'DestWins' | 'MostRecent' | 'Manual';

/** What to do when the external system marks a record as deleted */
export type DeleteBehavior = 'SoftDelete' | 'DoNothing' | 'HardDelete';

/** Classification of the change to apply to an MJ record */
export type RecordChangeType = 'Create' | 'Update' | 'Delete' | 'Skip';

/** Status of a running integration sync */
export type IntegrationRunStatus = 'Pending' | 'In Progress' | 'Success' | 'Failed';

/** Classification of sync errors for retry/alert decisions */
export type SyncErrorCode =
    | 'VALIDATION_ERROR'
    | 'FK_CONSTRAINT_VIOLATION'
    | 'DUPLICATE_KEY'
    | 'NETWORK_TIMEOUT'
    | 'RATE_LIMIT_EXCEEDED'
    | 'CONNECTOR_ERROR'
    | 'TRANSFORM_ERROR'
    | 'MATCH_RESOLUTION_ERROR'
    | 'DATABASE_ERROR'
    | 'WATERMARK_INVALID'
    | 'CONFIGURATION_ERROR'
    | 'UNKNOWN_ERROR';

/** Severity level of a sync error */
export type ErrorSeverity = 'Critical' | 'Warning' | 'Info';

/** Whether an error with the given code is retryable */
export function IsRetryableError(code: SyncErrorCode): boolean {
    return code === 'NETWORK_TIMEOUT' || code === 'RATE_LIMIT_EXCEEDED' || code === 'DATABASE_ERROR';
}

/** Classify an error from its message/type into a structured code and severity */
export function ClassifyError(error: unknown): { Code: SyncErrorCode; Severity: ErrorSeverity } {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('econnreset')) {
        return { Code: 'NETWORK_TIMEOUT', Severity: 'Warning' };
    }
    if (lower.includes('rate limit') || lower.includes('throttl') || lower.includes('429')) {
        return { Code: 'RATE_LIMIT_EXCEEDED', Severity: 'Warning' };
    }
    if (lower.includes('foreign key') || lower.includes('fk_') || lower.includes('reference constraint')) {
        return { Code: 'FK_CONSTRAINT_VIOLATION', Severity: 'Critical' };
    }
    if (lower.includes('duplicate') || lower.includes('unique constraint') || lower.includes('primary key')) {
        return { Code: 'DUPLICATE_KEY', Severity: 'Warning' };
    }
    if (lower.includes('validation') || lower.includes('validate')) {
        return { Code: 'VALIDATION_ERROR', Severity: 'Warning' };
    }
    if (lower.includes('transform') || lower.includes('mapping')) {
        return { Code: 'TRANSFORM_ERROR', Severity: 'Warning' };
    }
    if (lower.includes('match') || lower.includes('resolve')) {
        return { Code: 'MATCH_RESOLUTION_ERROR', Severity: 'Warning' };
    }
    if (lower.includes('watermark') || lower.includes('invalid watermark')) {
        return { Code: 'WATERMARK_INVALID', Severity: 'Warning' };
    }
    if (lower.includes('configuration') || lower.includes('config')) {
        return { Code: 'CONFIGURATION_ERROR', Severity: 'Critical' };
    }
    if (lower.includes('connect') || lower.includes('econnrefused') || lower.includes('sql')) {
        return { Code: 'DATABASE_ERROR', Severity: 'Critical' };
    }
    if (lower.includes('connector')) {
        return { Code: 'CONNECTOR_ERROR', Severity: 'Critical' };
    }
    return { Code: 'UNKNOWN_ERROR', Severity: 'Critical' };
}

/** A record fetched from an external system */
export interface ExternalRecord {
    /** Unique identifier in the external system */
    ExternalID: string;
    /** Object type name in the external system (e.g., "Contact", "Company") */
    ObjectType: string;
    /** Field name→value pairs from the external system */
    Fields: Record<string, unknown>;
    /** When this record was last modified externally */
    ModifiedAt?: Date;
    /** Whether this record has been deleted in the external system */
    IsDeleted?: boolean;
}

/** A record that has been mapped from external fields to MJ entity fields */
export interface MappedRecord {
    /** The original external record */
    ExternalRecord: ExternalRecord;
    /** Target MJ entity name */
    MJEntityName: string;
    /** Fields mapped to MJ entity field names */
    MappedFields: Record<string, unknown>;
    /** What kind of change to apply */
    ChangeType: RecordChangeType;
    /** ID of an existing MJ record if matched */
    MatchedMJRecordID?: string;
}

/** Aggregate result of a sync operation */
export interface SyncResult {
    /** Whether the overall sync completed without fatal errors */
    Success: boolean;
    /** Summary error message when the sync fails or completes with errors */
    ErrorMessage?: string;
    /** The CompanyIntegrationRun ID created for this sync */
    RunID?: string;
    /** Total records processed */
    RecordsProcessed: number;
    /** New records created in MJ */
    RecordsCreated: number;
    /** Existing records updated in MJ */
    RecordsUpdated: number;
    /** Records deleted/soft-deleted in MJ */
    RecordsDeleted: number;
    /** Records that encountered errors */
    RecordsErrored: number;
    /** Records that were skipped */
    RecordsSkipped: number;
    /** Details of individual record errors */
    Errors: SyncRecordError[];
    /** Watermark value after this sync for incremental next-run */
    WatermarkAfter?: string;
    /** Per-entity-map results breakdown */
    EntityMapResults?: EntityMapSyncResult[];
    /** Duration of the sync in milliseconds */
    Duration?: number;
}

/** Per-entity-map result within a sync run */
export interface EntityMapSyncResult {
    /** The entity map ID */
    EntityMapID: string;
    /** External object name */
    ExternalObjectName: string;
    /** Target MJ entity name */
    EntityName: string;
    /** Whether this entity map synced without errors */
    Success: boolean;
    /** Record counts for this entity map */
    RecordsProcessed: number;
    RecordsCreated: number;
    RecordsUpdated: number;
    RecordsDeleted: number;
    RecordsErrored: number;
    RecordsSkipped: number;
    /** Duration of this entity map sync in milliseconds */
    Duration?: number;
}

/** Error details for a single record during sync */
export interface SyncRecordError {
    /** External system record identifier */
    ExternalID: string;
    /** The intended change type that failed */
    ChangeType: RecordChangeType;
    /** Human-readable error description */
    ErrorMessage: string;
    /** Structured error code for programmatic handling */
    ErrorCode: SyncErrorCode;
    /** Severity of this error */
    Severity: ErrorSeverity;
    /** The external record that caused the error, if available */
    ExternalRecord?: ExternalRecord;
}

/** Progress tracking for a running sync operation */
export interface SyncProgress {
    /** Index of the current entity map being processed (0-based) */
    EntityMapIndex: number;
    /** Total number of entity maps to process */
    TotalEntityMaps: number;
    /** Number of records processed in the current entity map */
    RecordsProcessedInCurrentMap: number;
    /** Total records fetched for the current entity map */
    TotalRecordsInCurrentMap: number;
    /** Overall percent complete (0-100) */
    PercentComplete: number;
}

/** Callback for progress tracking during sync */
export type OnProgressCallback = (progress: SyncProgress) => void;

/** Notification event type — what triggered the notification */
export type SyncNotificationEvent = 'SyncCompleted' | 'SyncFailed' | 'SyncCompletedWithErrors';

/** Severity level for a sync notification */
export type SyncNotificationSeverity = 'Info' | 'Warning' | 'Error';

/** Notification emitted after a sync run completes or fails */
export interface SyncNotification {
    /** What happened to trigger this notification */
    Event: SyncNotificationEvent;
    /** Overall severity */
    Severity: SyncNotificationSeverity;
    /** ID of the CompanyIntegration that was synced */
    CompanyIntegrationID: string;
    /** ID of the run record created for this sync */
    RunID: string;
    /** Human-readable summary suitable for email subject lines */
    Subject: string;
    /** Full text body — formatted for human consumption */
    Body: string;
    /** The aggregate sync result for programmatic access */
    Result: SyncResult;
    /** When the notification was emitted */
    OccurredAt: Date;
}

/** Callback invoked after a sync run completes (success or failure) */
export type OnNotificationCallback = (notification: SyncNotification) => void;

/** Options for controlling integration sync behavior */
export interface IntegrationSyncOptions {
    /** Restrict sync to specific entity map IDs. If omitted, all enabled maps are synced. */
    EntityMapIDs?: string[];
    /** Force a full sync, ignoring watermarks. Defaults to false. */
    FullSync?: boolean;
    /** Links this sync run to a ScheduledJobRun for traceability. */
    ScheduledJobRunID?: string;
}

// ─── Source Schema Introspection Types ──────────────────────────────
// These types define the schema introspection contract for connectors.
// Used by the Schema Builder (packages/Integration/schema-builder) to
// generate DDL, soft FKs, and metadata files.

/** Top-level container returned by a connector's IntrospectSchema(). */
export interface SourceSchemaInfo {
    /** All objects (tables, API entities) discovered in the source system. */
    Objects: SourceObjectInfo[];
}

/** One source object (table, API entity) discovered during introspection. */
export interface SourceObjectInfo {
    /** Name in the source system (e.g., "deals", "MemberList"). */
    ExternalName: string;
    /** Human-readable label (e.g., "Deals", "Members"). */
    ExternalLabel: string;
    /** Human-readable description of the object's purpose (used for sp_addextendedproperty on the table). */
    Description?: string;
    /** Fields/columns in the source object. */
    Fields: SourceFieldInfo[];
    /** Primary key field name(s). */
    PrimaryKeyFields: string[];
    /** Foreign key relationships to other source objects. */
    Relationships: SourceRelationshipInfo[];
}

/** One field/column in a source object discovered during introspection. */
export interface SourceFieldInfo {
    /** Field name in the source system. */
    Name: string;
    /** Human-readable label. */
    Label: string;
    /** Human-readable description of the field's purpose (used for sp_addextendedproperty on the column). */
    Description?: string;
    /** Generic source type (e.g., "string", "integer", "datetime", "boolean"). */
    SourceType: string;
    /** Whether the field is required/non-nullable. */
    IsRequired: boolean;
    /** Maximum length for string types (null if not applicable). */
    MaxLength: number | null;
    /** Precision for numeric types (null if not applicable). */
    Precision: number | null;
    /** Scale for numeric types (null if not applicable). */
    Scale: number | null;
    /** Default value expression (null if none). */
    DefaultValue: string | null;
    /** Whether this field is part of the primary key. */
    IsPrimaryKey: boolean;
    /** Whether this field is a foreign key. */
    IsForeignKey: boolean;
    /** If FK, which source object it references (null if not a FK). */
    ForeignKeyTarget: string | null;
}

/** One foreign key relationship in a source object. */
export interface SourceRelationshipInfo {
    /** Field in this object that references another object. */
    FieldName: string;
    /** Target source object name. */
    TargetObject: string;
    /** Target field name (usually the PK). */
    TargetField: string;
}

// ─── CRUD & Search Types ─────────────────────────────────────────────
// Standardized types for connector CRUD operations and search.
// Connectors that support write or search operations use these types.

/** Context for a CRUD operation against an external system */
export interface CRUDContext {
    /** The company integration entity providing connection details */
    CompanyIntegration: unknown; // MJCompanyIntegrationEntity (avoids circular import)
    /** External object name to operate on */
    ObjectName: string;
    /** User context for authorization */
    ContextUser: unknown; // UserInfo (avoids circular import)
}

/** Context for creating a record in an external system */
export interface CreateRecordContext extends CRUDContext {
    /** Field values for the new record */
    Attributes: Record<string, unknown>;
    /** Optional relationship data (JSON:API relationships, FK references, etc.) */
    Relationships?: Record<string, unknown>;
}

/** Context for updating a record in an external system */
export interface UpdateRecordContext extends CRUDContext {
    /** External ID of the record to update */
    ExternalID: string;
    /** Field values to update */
    Attributes: Record<string, unknown>;
    /** Optional relationship data to update */
    Relationships?: Record<string, unknown>;
}

/** Context for deleting a record from an external system */
export interface DeleteRecordContext extends CRUDContext {
    /** External ID of the record to delete */
    ExternalID: string;
}

/** Context for retrieving a single record from an external system */
export interface GetRecordContext extends CRUDContext {
    /** External ID of the record to retrieve */
    ExternalID: string;
}

/** Result of a CRUD operation (create, update, or delete) */
export interface CRUDResult {
    /** Whether the operation succeeded */
    Success: boolean;
    /** External ID of the created/updated record */
    ExternalID?: string;
    /** Error message if the operation failed */
    ErrorMessage?: string;
    /** HTTP status code (for REST connectors) or operation-specific code */
    StatusCode: number;
}

/** Context for searching records in an external system */
export interface SearchContext extends CRUDContext {
    /** Filter predicates (connector-specific format) */
    Filters: Record<string, string>;
    /** Sort expression (connector-specific format) */
    Sort?: string;
    /** Page number (1-based) */
    Page?: number;
    /** Maximum records per page */
    PageSize?: number;
}

/** Result of a search operation */
export interface SearchResult {
    /** Matching records */
    Records: ExternalRecord[];
    /** Total number of matching records (may exceed returned count) */
    TotalCount: number;
    /** Whether more pages of results exist */
    HasMore: boolean;
}

/** A default field mapping returned by a connector's discovery */
export interface DefaultFieldMapping {
    /** Field name in the external system */
    SourceFieldName: string;
    /** Corresponding MJ entity field name */
    DestinationFieldName: string;
    /** Optional transform pipeline to apply */
    TransformPipeline?: TransformStep[];
    /** Whether this field is used for record matching */
    IsKeyField?: boolean;
}
