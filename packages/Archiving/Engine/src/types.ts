import { BaseEntity, UserInfo } from '@memberjunction/core';
import { FileStorageBase } from '@memberjunction/storage';

/**
 * Configuration for which fields to archive on an entity.
 */
export interface ArchiveFieldConfiguration {
    /** List of field-level configurations */
    Fields: ArchiveFieldConfig[];
    /** Whether to include the full record snapshot in the archive document */
    ArchiveFullRecord?: boolean;
    /** If all of these fields are null, skip archiving (record already archived) */
    SkipIfAllNullFields?: string[];
}

/**
 * Per-field configuration within an archive configuration entity.
 */
export interface ArchiveFieldConfig {
    /** Name of the entity field to archive */
    FieldName: string;
    /** Whether this field configuration is active */
    IsActive?: boolean;
    /** Additional driver-specific options for this field */
    Options?: Record<string, unknown>;
}

/**
 * The JSON document stored in external storage for each archived record version.
 */
export interface ArchiveDocument {
    /** Schema version for forward compatibility */
    archiveVersion: number;
    /** Name of the entity that was archived */
    entityName: string;
    /** ID of the Entity metadata record */
    entityId: string;
    /** Primary key value of the archived record (first key field) */
    recordId: string;
    /** Full composite primary key */
    primaryKey: ArchivePrimaryKeyField[];
    /** ISO 8601 timestamp used as the version identifier */
    versionStamp: string;
    /** ISO 8601 timestamp when the archive was created */
    archivedAt: string;
    /** ID of the ArchiveConfigurationEntity that triggered this archive */
    archiveConfigurationEntityId: string;
    /** ID of the parent ArchiveConfiguration */
    archiveConfigurationId: string;
    /** Archive mode (e.g. 'archive', 'purge') */
    mode: string;
    /** Map of field names to their archived values */
    archivedFields: Record<string, unknown>;
    /** Full record snapshot, or null if ArchiveFullRecord was false */
    fullRecord: Record<string, unknown> | null;
}

/**
 * Represents a single field in a composite primary key.
 */
export interface ArchivePrimaryKeyField {
    FieldName: string;
    Value: string;
}

/**
 * Context passed to archive drivers for processing a single record.
 */
export interface ArchiveRecordContext {
    /** The entity record to archive */
    Record: BaseEntity;
    /** Field configuration for this entity */
    FieldConfig: ArchiveFieldConfiguration;
    /** The ArchiveConfigurationEntity record */
    ConfigEntity: BaseEntity;
    /** The parent ArchiveConfiguration record */
    Config: BaseEntity;
    /** Initialized storage driver for writing archive documents */
    StorageDriver: FileStorageBase;
    /** Base path prefix in storage */
    BasePath: string;
    /** User context for server-side operations */
    ContextUser: UserInfo;
    /** The current ArchiveRun record */
    ArchiveRun: BaseEntity;
}

/**
 * Result of archiving a single record.
 */
export interface ArchiveRecordResult {
    /** Whether the archive operation succeeded */
    Success: boolean;
    /** Storage path where the archive document was written, or null on failure */
    StoragePath: string | null;
    /** Number of bytes written to storage */
    BytesArchived: number;
    /** Error message if Success is false */
    ErrorMessage?: string;
    /** True if the record was intentionally skipped (e.g., all fields already null) */
    Skipped?: boolean;
}

/**
 * Context passed to archive drivers for restoring a single record.
 */
export interface RestoreRecordContext {
    /** The ArchiveRunDetail record describing what was archived */
    ArchiveRunDetail: BaseEntity;
    /** Initialized storage driver for reading archive documents */
    StorageDriver: FileStorageBase;
    /** User context for server-side operations */
    ContextUser: UserInfo;
}

/**
 * Result of restoring a single archived record.
 */
export interface RestoreRecordResult {
    /** Whether the restore operation succeeded */
    Success: boolean;
    /** Error message if Success is false */
    ErrorMessage?: string;
    /** List of field names that were restored */
    RestoredFields: string[];
}

/**
 * Result of a complete archive run across all configured entities.
 */
export interface ArchiveRunResult {
    /** Whether the overall run succeeded */
    Success: boolean;
    /** ID of the ArchiveRun record created for this execution */
    ArchiveRunId: string;
    /** Total number of records evaluated */
    TotalRecords: number;
    /** Number of records successfully archived */
    ArchivedRecords: number;
    /** Number of records that failed to archive */
    FailedRecords: number;
    /** Number of records intentionally skipped */
    SkippedRecords: number;
    /** Total bytes written to storage across all records */
    TotalBytesArchived: number;
    /** Error message if Success is false */
    ErrorMessage?: string;
}
