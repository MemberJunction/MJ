import { CompositeKey, LogError, LogStatus, Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArchiveDriver } from './BaseArchiveDriver';
import {
    ArchiveRecordContext,
    ArchiveRecordResult,
    RestoreRecordContext,
    RestoreRecordResult,
    ArchiveDocument,
} from './types';

/**
 * Default archive driver implementation. Archives configured field values to
 * external storage, nullifies them on the source record, and supports restoring
 * the original values from the stored archive document.
 */
@RegisterClass(BaseArchiveDriver, 'DefaultArchiveDriver')
export class DefaultArchiveDriver extends BaseArchiveDriver {
    /**
     * Determines whether the record should be archived by checking if at least
     * one of the configured fields (or SkipIfAllNullFields) has a non-null value.
     * If all relevant fields are already null, the record is skipped.
     */
    public ShouldArchiveRecord(context: ArchiveRecordContext): boolean {
        const fieldsToCheck = this.GetFieldsToCheck(context);
        return fieldsToCheck.some(fieldName => {
            const value = context.Record.Get(fieldName);
            return value != null;
        });
    }

    /**
     * Archives a single record:
     * 1. Builds the archive document with field values
     * 2. Writes the document to external storage
     * 3. Nullifies the archived fields on the source record
     * 4. Saves the modified record
     */
    public async ArchiveRecord(context: ArchiveRecordContext): Promise<ArchiveRecordResult> {
        try {
            const versionStamp = new Date();
            const document = this.BuildArchiveDocument(context, versionStamp);
            const storagePath = this.BuildStoragePath(
                context.BasePath,
                context.Record.EntityInfo.Name,
                document.recordId,
                versionStamp
            );

            const writeResult = await this.WriteDocumentToStorage(context, storagePath, document);
            if (!writeResult.Success) {
                return writeResult;
            }

            const nullifyResult = await this.NullifyArchivedFields(context);
            if (!nullifyResult.Success) {
                return nullifyResult;
            }

            return {
                Success: true,
                StoragePath: storagePath,
                BytesArchived: writeResult.BytesArchived,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`DefaultArchiveDriver.ArchiveRecord failed: ${message}`);
            return {
                Success: false,
                StoragePath: null,
                BytesArchived: 0,
                ErrorMessage: message,
            };
        }
    }

    /**
     * Restores a previously archived record by reading the archive document
     * from storage and setting the field values back on the source record.
     */
    public async RestoreRecord(context: RestoreRecordContext): Promise<RestoreRecordResult> {
        try {
            const storagePath = context.ArchiveRunDetail.Get('StoragePath') as string;
            if (!storagePath) {
                return { Success: false, ErrorMessage: 'No StoragePath on ArchiveRunDetail', RestoredFields: [] };
            }

            const document = await this.ReadDocumentFromStorage(context, storagePath);
            const restoredFields = await this.ApplyArchivedFieldsToRecord(context, document);

            return {
                Success: true,
                RestoredFields: restoredFields,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`DefaultArchiveDriver.RestoreRecord failed: ${message}`);
            return {
                Success: false,
                ErrorMessage: message,
                RestoredFields: [],
            };
        }
    }

    // ========================================
    // Private Helpers
    // ========================================

    /**
     * Determines which fields to check for the "should archive" decision.
     * Uses SkipIfAllNullFields if configured, otherwise all active field names.
     */
    private GetFieldsToCheck(context: ArchiveRecordContext): string[] {
        if (context.FieldConfig.SkipIfAllNullFields && context.FieldConfig.SkipIfAllNullFields.length > 0) {
            return context.FieldConfig.SkipIfAllNullFields;
        }
        return context.FieldConfig.Fields
            .filter(f => f.IsActive !== false)
            .map(f => f.FieldName);
    }

    /**
     * Serializes the archive document and writes it to storage.
     */
    private async WriteDocumentToStorage(
        context: ArchiveRecordContext,
        storagePath: string,
        document: ArchiveDocument
    ): Promise<{ Success: boolean; BytesArchived: number; StoragePath: string | null; ErrorMessage?: string }> {
        const jsonContent = JSON.stringify(document, null, 2);
        const buffer = Buffer.from(jsonContent, 'utf8');

        const success = await context.StorageDriver.PutObject(storagePath, buffer, 'application/json');
        if (!success) {
            return {
                Success: false,
                BytesArchived: 0,
                StoragePath: null,
                ErrorMessage: `Failed to write archive document to storage path: ${storagePath}`,
            };
        }

        LogStatus(`Archived record to ${storagePath} (${buffer.byteLength} bytes)`);
        return { Success: true, BytesArchived: buffer.byteLength, StoragePath: storagePath };
    }

    /**
     * Sets all configured archive fields to null on the source record and saves it.
     */
    private async NullifyArchivedFields(
        context: ArchiveRecordContext
    ): Promise<{ Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string }> {
        for (const fieldConfig of context.FieldConfig.Fields) {
            if (fieldConfig.IsActive !== false) {
                context.Record.Set(fieldConfig.FieldName, null);
            }
        }

        const saveResult = await context.Record.Save();
        if (!saveResult) {
            return {
                Success: false,
                StoragePath: null,
                BytesArchived: 0,
                ErrorMessage: `Failed to save record after nullifying archived fields: ${context.Record.LatestResult?.Message ?? 'Unknown error'}`,
            };
        }

        return { Success: true, StoragePath: null, BytesArchived: 0 };
    }

    /**
     * Reads and parses an archive document from storage.
     */
    private async ReadDocumentFromStorage(context: RestoreRecordContext, storagePath: string): Promise<ArchiveDocument> {
        const buffer = await context.StorageDriver.GetObject({ fullPath: storagePath });
        const jsonContent = buffer.toString('utf8');
        return JSON.parse(jsonContent) as ArchiveDocument;
    }

    /**
     * Applies the archived field values from the document back onto the entity record and saves.
     */
    private async ApplyArchivedFieldsToRecord(
        context: RestoreRecordContext,
        document: ArchiveDocument
    ): Promise<string[]> {
        const entityName = document.entityName;
        const md = new Metadata();
        const record = await md.GetEntityObject(entityName, context.ContextUser);

        const compositeKey = new CompositeKey(
            document.primaryKey.map(pk => ({ FieldName: pk.FieldName, Value: pk.Value }))
        );

        // Load the current record so we can update it
        const loaded = await record.InnerLoad(compositeKey);
        if (!loaded) {
            throw new Error(`Failed to load record for entity "${entityName}" with key: ${JSON.stringify(document.primaryKey)}`);
        }

        const restoredFields: string[] = [];
        for (const [fieldName, fieldValue] of Object.entries(document.archivedFields)) {
            record.Set(fieldName, fieldValue);
            restoredFields.push(fieldName);
        }

        const saveResult = await record.Save();
        if (!saveResult) {
            throw new Error(`Failed to save restored record: ${record.LatestResult?.Message ?? 'Unknown error'}`);
        }

        LogStatus(`Restored ${restoredFields.length} fields for ${entityName} record ${document.recordId}`);
        return restoredFields;
    }
}
