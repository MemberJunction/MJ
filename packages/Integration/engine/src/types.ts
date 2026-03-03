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
}

/** Error details for a single record during sync */
export interface SyncRecordError {
    /** External system record identifier */
    ExternalID: string;
    /** The intended change type that failed */
    ChangeType: RecordChangeType;
    /** Human-readable error description */
    ErrorMessage: string;
    /** The external record that caused the error, if available */
    ExternalRecord?: ExternalRecord;
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
