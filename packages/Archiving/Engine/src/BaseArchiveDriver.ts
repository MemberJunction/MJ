import { BaseEntity, IMetadataProvider, Metadata } from '@memberjunction/core';
import {
    ArchiveRecordContext,
    ArchiveRecordResult,
    RestoreRecordContext,
    RestoreRecordResult,
    ArchiveDocument,
    ArchivePrimaryKeyField,
} from './types';

/**
 * Abstract base class for archive drivers. Concrete implementations handle
 * the specifics of how records are archived and restored.
 *
 * Use `@RegisterClass(BaseArchiveDriver, 'YourDriverName')` on concrete subclasses
 * to make them discoverable via the MJ ClassFactory.
 */
export abstract class BaseArchiveDriver {
    /** Optional metadata provider; falls back to Metadata.Provider when not set. */
    private _provider: IMetadataProvider | undefined;

    public set Provider(value: IMetadataProvider | undefined) {
        this._provider = value;
    }

    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Determines whether a given record should be archived based on its current field values.
     * @param context - The archive context including record, field config, etc.
     * @returns True if the record should be archived, false to skip it
     */
    public abstract ShouldArchiveRecord(context: ArchiveRecordContext): boolean;

    /**
     * Archives a single record: writes the archive document to storage and
     * optionally nullifies the archived fields on the source record.
     * @param context - The archive context including record, storage driver, etc.
     * @returns Result indicating success/failure and storage details
     */
    public abstract ArchiveRecord(context: ArchiveRecordContext): Promise<ArchiveRecordResult>;

    /**
     * Restores a previously archived record by reading the archive document
     * from storage and setting the field values back on the source record.
     * @param context - The restore context including the ArchiveRunDetail record
     * @returns Result indicating success/failure and which fields were restored
     */
    public abstract RestoreRecord(context: RestoreRecordContext): Promise<RestoreRecordResult>;

    // ========================================
    // Protected Helpers
    // ========================================

    /**
     * Builds a storage path for an archive document.
     * Format: `{basePath}/{SanitizedEntityName}/{RecordID}/{VersionStamp}.json`
     * @param basePath - The configured base path prefix
     * @param entityName - The entity name (will be sanitized)
     * @param recordId - The primary key value of the record
     * @param versionStamp - The timestamp for this archive version
     * @returns The full storage path string
     */
    protected BuildStoragePath(basePath: string, entityName: string, recordId: string, versionStamp: Date): string {
        const sanitizedEntity = this.SanitizePathSegment(entityName);
        const sanitizedRecordId = this.SanitizePathSegment(recordId);
        const formattedStamp = this.FormatVersionStamp(versionStamp);
        const prefix = basePath ? `${basePath}/` : '';
        return `${prefix}${sanitizedEntity}/${sanitizedRecordId}/${formattedStamp}.json`;
    }

    /**
     * Builds the ArchiveDocument JSON structure from a record context.
     * @param context - The archive context
     * @param versionStamp - The timestamp for this version
     * @returns A fully populated ArchiveDocument
     */
    protected BuildArchiveDocument(context: ArchiveRecordContext, versionStamp: Date): ArchiveDocument {
        const record = context.Record;
        const archivedFields = this.ExtractArchivedFields(context);
        const fullRecord = this.ExtractFullRecord(context);
        const primaryKey = this.ExtractPrimaryKey(record);

        return {
            archiveVersion: 1,
            entityName: record.EntityInfo.Name,
            entityId: record.EntityInfo.ID,
            recordId: primaryKey.length > 0 ? primaryKey[0].Value : '',
            primaryKey,
            versionStamp: versionStamp.toISOString(),
            archivedAt: new Date().toISOString(),
            archiveConfigurationEntityId: context.ConfigEntity.Get('ID') as string,
            archiveConfigurationId: context.Config.Get('ID') as string,
            mode: (context.ConfigEntity.Get('Mode') as string) ?? (context.Config.Get('DefaultMode') as string) ?? 'StripFields',
            archivedFields,
            fullRecord,
        };
    }

    /**
     * Extracts the values of fields configured for archiving from the record.
     */
    protected ExtractArchivedFields(context: ArchiveRecordContext): Record<string, unknown> {
        const fields: Record<string, unknown> = {};
        for (const fieldConfig of context.FieldConfig.Fields) {
            if (fieldConfig.IsActive !== false) {
                fields[fieldConfig.FieldName] = context.Record.Get(fieldConfig.FieldName);
            }
        }
        return fields;
    }

    /**
     * Extracts a full record snapshot if configured, otherwise returns null.
     */
    protected ExtractFullRecord(context: ArchiveRecordContext): Record<string, unknown> | null {
        if (!context.FieldConfig.ArchiveFullRecord) {
            return null;
        }
        return context.Record.GetAll();
    }

    /**
     * Extracts the primary key fields and values from a BaseEntity record.
     */
    protected ExtractPrimaryKey(record: BaseEntity): ArchivePrimaryKeyField[] {
        return record.PrimaryKey.KeyValuePairs.map(kvp => ({
            FieldName: kvp.FieldName,
            Value: String(kvp.Value),
        }));
    }

    /**
     * Sanitizes a string for use as a storage path segment by replacing
     * spaces, colons, and other problematic characters with underscores.
     */
    protected SanitizePathSegment(value: string): string {
        return value.replace(/[\s:\/\\]/g, '_');
    }

    /**
     * Formats a Date as an ISO 8601 string safe for use in file paths.
     * Colons are replaced with underscores.
     */
    protected FormatVersionStamp(date: Date): string {
        return date.toISOString().replace(/:/g, '_');
    }
}
