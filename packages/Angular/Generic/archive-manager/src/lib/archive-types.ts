/**
 * Lightweight interfaces for archive data used by the Angular UI components.
 * These mirror the database schema fields needed for display purposes.
 * Since CodeGen hasn't run yet for the archive entities, we use RunView
 * with ResultType: 'simple' and these interfaces for type safety.
 */

/** Shape of a row from the MJ: Archive Run Details view */
export interface ArchiveRunDetailRow {
    ID: string;
    ArchiveRunID: string;
    EntityID: string;
    RecordID: string;
    Status: 'Success' | 'Failed' | 'Skipped';
    StoragePath: string | null;
    BytesArchived: number;
    ErrorMessage: string | null;
    ArchivedAt: string | null;
    VersionStamp: string | null;
    IsRecordChangeArchive: boolean;
}

/** Shape of a row from the MJ: Archive Runs view */
export interface ArchiveRunRow {
    ID: string;
    ArchiveConfigurationID: string;
    StartedAt: string;
    CompletedAt: string | null;
    Status: 'Running' | 'Complete' | 'Failed' | 'Cancelled' | 'PartialSuccess';
    TotalRecords: number;
    ArchivedRecords: number;
    FailedRecords: number;
    SkippedRecords: number;
    TotalBytesArchived: number;
    ErrorLog: string | null;
    UserID: string;
    /** Denormalized from view join */
    ArchiveConfiguration?: string;
}

/** Shape of a row from the MJ: Archive Configurations view */
export interface ArchiveConfigurationRow {
    ID: string;
    Name: string;
    Description: string | null;
    StorageAccountID: string;
    RootPath: string;
    ArchiveFormat: 'JSON' | 'Parquet' | 'CSV';
    IsActive: boolean;
    DefaultRetentionDays: number;
    DefaultMode: 'StripFields' | 'SoftDelete' | 'HardDelete' | 'ArchiveOnly';
    DefaultBatchSize: number;
    ArchiveRelatedRecordChanges: boolean;
    Status: 'Idle' | 'Running' | 'Error' | 'Disabled';
    CreatedByUserID: string;
    /** Denormalized from view join */
    StorageAccount?: string;
}

/** Shape of a row from the MJ: Archive Configuration Entities view */
export interface ArchiveConfigEntityRow {
    ID: string;
    ArchiveConfigurationID: string;
    EntityID: string;
    Mode: 'StripFields' | 'SoftDelete' | 'HardDelete' | 'ArchiveOnly' | null;
    RetentionDays: number | null;
    DateField: string;
    FilterExpression: string | null;
    BatchSize: number | null;
    Priority: number;
    FieldConfiguration: string;
    DriverClass: string | null;
    ArchiveRelatedRecordChanges: boolean | null;
    IsActive: boolean;
    /** Denormalized from view join */
    Entity?: string;
}

/** Info passed from status badge to restore dialog */
export interface ArchiveVersionInfo {
    EntityName: string;
    RecordID: string;
    LatestArchiveDate: Date;
    FieldCount: number;
}
