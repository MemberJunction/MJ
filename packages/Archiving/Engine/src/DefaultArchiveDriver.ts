import { BaseEntity, CompositeKey, EntityFieldInfo, EntityFieldTSType, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type { FileStorageBase } from '@memberjunction/storage';
import { BaseArchiveDriver } from './BaseArchiveDriver';
import {
    ArchiveRecordContext,
    ArchiveRecordResult,
    RestoreRecordContext,
    RestoreRecordResult,
    ArchiveDocument,
    ArchiveFieldConfiguration,
    EligibilityFilterContext,
    IsPurgeStorageMode,
} from './types';

/**
 * Default archive driver implementation. Archives configured field values to
 * external storage, applies the appropriate post-archive action based on mode
 * (StripFields, HardDelete, ArchiveOnly), and supports restoring the original
 * values from the stored archive document. When StorageMode is 'Purge', it applies
 * the mode without writing anything to storage.
 */
@RegisterClass(BaseArchiveDriver, 'DefaultArchiveDriver')
export class DefaultArchiveDriver extends BaseArchiveDriver {
    public override get SupportsPurge(): boolean {
        return true;
    }

    /**
     * Determines whether the record should be archived by checking if at least
     * one of the configured fields (or SkipIfAllNullFields) holds a value. A null field
     * holds no value. In StripFields mode an empty string in a NOT NULL column holds no
     * value either, because that is what StripFields writes to such a column; in the other
     * modes it is a value like any other.
     * If no specific fields are configured but ArchiveFullRecord is true,
     * always archives — the intent is a full record snapshot, not field stripping.
     */
    public ShouldArchiveRecord(context: ArchiveRecordContext): boolean {
        const fieldsToCheck = this.getFieldsToCheck(context.FieldConfig);

        // If no specific fields are configured but ArchiveFullRecord is true,
        // always archive — the intent is a full record snapshot, not field stripping
        if (fieldsToCheck.length === 0) {
            return context.FieldConfig.ArchiveFullRecord === true;
        }

        const stripFields = this.resolveMode(context.ConfigEntity, context.Config) === 'StripFields';
        return fieldsToCheck.some(fieldName => this.fieldHoldsValue(context.Record, fieldName, stripFields));
    }

    /**
     * Returns the SQL form of {@link ShouldArchiveRecord}: an OR over the checked fields of
     * `[field] IS NOT NULL` for nullable columns and, in StripFields mode, `[field] LIKE '_%'`
     * for NOT NULL string columns. `LIKE '_%'` matches any non-empty string, whitespace
     * included, on SQL Server and PostgreSQL alike (unlike `<> ''`, which SQL Server
     * evaluates ignoring trailing spaces), and also works on text/ntext columns.
     * Returns null when there are no checked fields, or when one cannot be tested: it is
     * missing from the entity, its name contains a bracket, or it is a NOT NULL column that
     * always holds a value under the mode (any NOT NULL column outside StripFields, or a
     * NOT NULL non-string column), which makes the whole OR always true.
     */
    public override BuildEligibilityFilter(context: EligibilityFilterContext): string | null {
        const fieldsToCheck = this.getFieldsToCheck(context.FieldConfig);
        if (fieldsToCheck.length === 0) {
            return null;
        }
        const stripFields = this.resolveMode(context.ConfigEntity, context.Config) === 'StripFields';
        const conditions: string[] = [];
        for (const fieldName of fieldsToCheck) {
            const condition = this.holdsValueCondition(context.EntityInfo.FieldByName(fieldName), stripFields);
            if (!condition) {
                return null;
            }
            conditions.push(condition);
        }
        return conditions.join(' OR ');
    }

    /**
     * Archives a single record.
     *
     * Store run (any StorageMode other than 'Purge'):
     * 1. Builds the archive document with field values
     * 2. Writes the document to external storage
     * 3. Applies the post-archive action based on mode:
     *    - StripFields: nullifies configured fields on the source record
     *    - HardDelete: writes one cascade batch file per dependent entity, deletes the
     *      dependent records leaf-first, then deletes the source record
     *    - ArchiveOnly: no changes to the source record
     *
     * Purge run: writes no archive document and no cascade batch file; applies only
     * StripFields or HardDelete to the source record (and its dependents for HardDelete).
     */
    public async ArchiveRecord(context: ArchiveRecordContext): Promise<ArchiveRecordResult> {
        try {
            if (IsPurgeStorageMode(context.StorageMode)) {
                return await this.purgeRecord(context);
            }
            const versionStamp = new Date();
            const document = this.BuildArchiveDocument(context, versionStamp);
            const storagePath = this.BuildStoragePath(
                context.BasePath,
                context.Record.EntityInfo.Name,
                document.recordId,
                versionStamp
            );

            const writeResult = await this.writeDocumentToStorage(context, storagePath, document);
            if (!writeResult.Success) {
                return writeResult;
            }

            const postArchiveResult = await this.applyPostArchiveAction(context);
            if (!postArchiveResult.Success) {
                return postArchiveResult;
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
     * Applies the post-archive action (StripFields or HardDelete) to the source record
     * without writing an archive document to storage.
     */
    private async purgeRecord(context: ArchiveRecordContext): Promise<ArchiveRecordResult> {
        const result = await this.applyPostArchiveAction(context);
        if (!result.Success) {
            return result;
        }
        return { Success: true, StoragePath: null, BytesArchived: 0 };
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

            const document = await this.readDocumentFromStorage(context, storagePath);
            const restoredFields = await this.applyArchivedFieldsToRecord(context, document);

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
    // ShouldArchive Helpers
    // ========================================

    /**
     * Determines which fields to check for the "should archive" decision.
     * Uses SkipIfAllNullFields if configured, otherwise all active field names.
     */
    private getFieldsToCheck(fieldConfig: ArchiveFieldConfiguration): string[] {
        if (fieldConfig.SkipIfAllNullFields && fieldConfig.SkipIfAllNullFields.length > 0) {
            return fieldConfig.SkipIfAllNullFields;
        }
        return fieldConfig.Fields
            .filter(f => f.IsActive !== false)
            .map(f => f.FieldName);
    }

    /**
     * True when the field holds a value: not null and, in StripFields mode, not the empty
     * string that StripFields writes to a NOT NULL column.
     */
    private fieldHoldsValue(record: BaseEntity, fieldName: string, stripFields: boolean): boolean {
        const value = record.Get(fieldName);
        if (value == null) {
            return false;
        }
        if (!stripFields || value !== '') {
            return true;
        }
        const fieldInfo = record.EntityInfo.FieldByName(fieldName);
        return !fieldInfo || fieldInfo.AllowsNull;
    }

    /**
     * The SQL condition for "this field holds a value", or null when it cannot be written
     * or is always true. Uses the metadata field name in square brackets, never the
     * configured string.
     */
    private holdsValueCondition(fieldInfo: EntityFieldInfo | undefined, stripFields: boolean): string | null {
        if (!fieldInfo || /[[\]]/.test(fieldInfo.Name)) {
            return null;
        }
        if (fieldInfo.AllowsNull) {
            return `[${fieldInfo.Name}] IS NOT NULL`;
        }
        if (stripFields && fieldInfo.TSType === EntityFieldTSType.String) {
            return `[${fieldInfo.Name}] LIKE '_%'`;
        }
        return null;
    }

    // ========================================
    // Storage Write
    // ========================================

    /**
     * Returns the context's storage driver, or throws when the run has none.
     */
    private requireStorageDriver(context: ArchiveRecordContext): FileStorageBase {
        if (!context.StorageDriver) {
            throw new Error(`No storage driver is available for StorageMode '${context.StorageMode}'`);
        }
        return context.StorageDriver;
    }

    /**
     * Serializes the archive document and writes it to storage.
     */
    private async writeDocumentToStorage(
        context: ArchiveRecordContext,
        storagePath: string,
        document: ArchiveDocument
    ): Promise<{ Success: boolean; BytesArchived: number; StoragePath: string | null; ErrorMessage?: string }> {
        const jsonContent = JSON.stringify(document, null, 2);
        const buffer = Buffer.from(jsonContent, 'utf8');

        const success = await this.requireStorageDriver(context).PutObject(storagePath, buffer, 'application/json');
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

    // ========================================
    // Post-Archive Mode Handling
    // ========================================

    /**
     * Resolves the effective archive mode: the entity configuration's Mode, else the
     * configuration's DefaultMode, else StripFields.
     */
    private resolveMode(configEntity: BaseEntity, config: BaseEntity): string {
        return (configEntity.Get('Mode') as string | null)
            ?? (config.Get('DefaultMode') as string | null)
            ?? 'StripFields';
    }

    /**
     * Applies the appropriate post-archive action based on the resolved mode.
     */
    private async applyPostArchiveAction(
        context: ArchiveRecordContext
    ): Promise<{ Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string }> {
        const mode = this.resolveMode(context.ConfigEntity, context.Config);

        switch (mode) {
            case 'StripFields':
                return this.nullifyArchivedFields(context);
            case 'HardDelete':
                return this.hardDeleteRecord(context);
            case 'ArchiveOnly':
                return { Success: true, StoragePath: null, BytesArchived: 0 };
            default:
                return {
                    Success: false,
                    StoragePath: null,
                    BytesArchived: 0,
                    ErrorMessage: `Unknown archive mode: ${mode}`,
                };
        }
    }

    // ========================================
    // StripFields Mode
    // ========================================

    /**
     * Sets all configured archive fields to their empty value on the source record and saves it.
     * Uses null for nullable columns and empty string for NOT NULL string columns.
     */
    private async nullifyArchivedFields(
        context: ArchiveRecordContext
    ): Promise<{ Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string }> {
        for (const fieldConfig of context.FieldConfig.Fields) {
            if (fieldConfig.IsActive !== false) {
                const emptyValue = this.getEmptyValueForField(context, fieldConfig.FieldName);
                context.Record.Set(fieldConfig.FieldName, emptyValue);
            }
        }

        const saveResult = await context.Record.Save();
        if (!saveResult) {
            return {
                Success: false,
                StoragePath: null,
                BytesArchived: 0,
                ErrorMessage: `Failed to save record after nullifying archived fields: ${context.Record.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
            };
        }

        return { Success: true, StoragePath: null, BytesArchived: 0 };
    }

    /**
     * Returns the appropriate empty value for a field based on its nullability.
     * NOT NULL string fields get empty string; nullable fields get null.
     */
    private getEmptyValueForField(context: ArchiveRecordContext, fieldName: string): string | null {
        const fieldInfo = context.Record.EntityInfo.FieldByName(fieldName);
        if (fieldInfo && !fieldInfo.AllowsNull) {
            return '';
        }
        return null;
    }

    // ========================================
    // HardDelete Mode (with Cascade)
    // ========================================

    /**
     * Deletes the source record from the database. First cascades to dependent (child)
     * records via One To Many relationships discovered from entity metadata: on a Store run
     * the children are written to storage in cascade batch files before they are deleted;
     * on a Purge run they are deleted with no copy.
     */
    private async hardDeleteRecord(
        context: ArchiveRecordContext
    ): Promise<{ Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string }> {
        const cascadeResult = await this.archiveAndDeleteDependentRecords(context);
        if (!cascadeResult.Success) {
            return cascadeResult;
        }

        const deleteResult = await context.Record.Delete();
        if (!deleteResult) {
            return {
                Success: false,
                StoragePath: null,
                BytesArchived: 0,
                ErrorMessage: `Failed to delete record after archiving: ${context.Record.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
            };
        }

        return { Success: true, StoragePath: null, BytesArchived: 0 };
    }

    /**
     * Collects all dependent records depth-first, then deletes them leaf-first. On a Store
     * run it first writes one batch archive file per entity to storage (fewer storage calls
     * than per-record writes); on a Purge run it writes no batch file.
     */
    private async archiveAndDeleteDependentRecords(
        context: ArchiveRecordContext
    ): Promise<{ Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string }> {
        // 1. Collect all dependent records depth-first (leaves first in the resulting array)
        const collectedRecords: BaseEntity[] = [];
        await this.collectDependentsDepthFirst(context.Record, context.ContextUser, collectedRecords, new Set<string>());

        if (collectedRecords.length === 0) {
            return { Success: true, StoragePath: null, BytesArchived: 0 };
        }

        LogStatus(`HardDelete cascade: collected ${collectedRecords.length} dependent record(s) across ${new Set(collectedRecords.map(r => r.EntityInfo.Name)).size} entity type(s)`);

        // 2. Batch-archive (Store only): group records by entity name and write one file per entity
        if (!IsPurgeStorageMode(context.StorageMode)) {
            const archiveResult = await this.batchArchiveDependents(collectedRecords, context);
            if (!archiveResult.Success) {
                return archiveResult;
            }
        }

        // 3. Delete all records (already in leaf-first order from depth-first collection)
        for (const record of collectedRecords) {
            const deleted = await record.Delete();
            if (!deleted) {
                return {
                    Success: false,
                    StoragePath: null,
                    BytesArchived: 0,
                    ErrorMessage: `Failed to cascade-delete ${record.EntityInfo.Name} record ${record.PrimaryKey.Values()}: ${record.LatestResult?.CompleteMessage ?? 'Unknown error'}`,
                };
            }
        }

        return { Success: true, StoragePath: null, BytesArchived: 0 };
    }

    /**
     * Recursively collects all dependent records depth-first. Leaves (deepest
     * children) are added to the array first, so deleting in array order
     * respects FK constraints. Uses a visited set to prevent infinite loops
     * from circular references.
     */
    private async collectDependentsDepthFirst(
        parentRecord: BaseEntity,
        contextUser: UserInfo,
        collected: BaseEntity[],
        visited: Set<string>
    ): Promise<void> {
        const entityInfo = parentRecord.EntityInfo;
        const recordKey = `${entityInfo.ID}:${parentRecord.PrimaryKey.Values()}`;

        if (visited.has(recordKey)) return;
        visited.add(recordKey);

        const cascadeRels = entityInfo.RelatedEntities.filter(r =>
            r.Type?.trim() === 'One To Many' && r.RelatedEntityID !== entityInfo.ID
        );

        for (const rel of cascadeRels) {
            const childEntityName = rel.RelatedEntity;
            const joinField = rel.RelatedEntityJoinField;
            if (!childEntityName || !joinField) continue;

            const childRecords = await this.loadChildRecords(childEntityName, joinField, parentRecord.PrimaryKey.Values(), contextUser);

            for (const child of childRecords) {
                // Recurse into grandchildren first (depth-first)
                await this.collectDependentsDepthFirst(child, contextUser, collected, visited);
                // Then add this child (so it appears after its own dependents)
                const childKey = `${child.EntityInfo.ID}:${child.PrimaryKey.Values()}`;
                if (!visited.has(childKey)) {
                    visited.add(childKey);
                }
                collected.push(child);
            }
        }
    }

    /**
     * Groups collected records by entity name and writes one batch archive
     * document per entity to storage. A batch document contains all records
     * of that entity type in a single JSON array, dramatically reducing
     * the number of storage API calls.
     */
    private async batchArchiveDependents(
        records: BaseEntity[],
        context: ArchiveRecordContext
    ): Promise<{ Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string }> {
        // Group by entity name
        const byEntity = new Map<string, BaseEntity[]>();
        for (const record of records) {
            const name = record.EntityInfo.Name;
            if (!byEntity.has(name)) {
                byEntity.set(name, []);
            }
            byEntity.get(name)!.push(record);
        }

        const versionStamp = new Date();
        const parentRecordId = context.Record.PrimaryKey.Values();

        for (const [entityName, entityRecords] of byEntity) {
            const batchDocument = {
                archiveVersion: 1,
                batchType: 'cascade-delete',
                parentEntityName: context.Record.EntityInfo.Name,
                parentRecordId: parentRecordId,
                entityName: entityName,
                archivedAt: versionStamp.toISOString(),
                recordCount: entityRecords.length,
                records: entityRecords.map(r => ({
                    recordId: r.PrimaryKey.Values(),
                    primaryKey: r.PrimaryKey.KeyValuePairs.map(kv => ({
                        FieldName: kv.FieldName,
                        Value: String(kv.Value),
                    })),
                    fullRecord: r.GetAll(),
                })),
            };

            const sanitizedEntity = entityName.replace(/[^a-zA-Z0-9]/g, '_');
            const sanitizedParent = parentRecordId.replace(/[^a-zA-Z0-9-]/g, '_');
            const storagePath = `${context.BasePath}/${sanitizedEntity}/cascade_${sanitizedParent}_${versionStamp.toISOString().replace(/[:.]/g, '_')}.json`;

            const jsonContent = JSON.stringify(batchDocument, null, 2);
            const batchBuffer = Buffer.from(jsonContent, 'utf8');

            const writeSuccess = await this.requireStorageDriver(context).PutObject(storagePath, batchBuffer, 'application/json');
            if (!writeSuccess) {
                return {
                    Success: false,
                    StoragePath: null,
                    BytesArchived: 0,
                    ErrorMessage: `Failed to batch-archive ${entityRecords.length} ${entityName} record(s) to storage`,
                };
            }

            LogStatus(`Cascade batch-archived ${entityRecords.length} ${entityName} record(s) to ${storagePath} (${batchBuffer.byteLength} bytes)`);
        }

        return { Success: true, StoragePath: null, BytesArchived: 0 };
    }

    /**
     * Loads all records from a child entity that reference a parent record via a join field.
     */
    private async loadChildRecords(
        entityName: string,
        joinField: string,
        parentRecordId: string,
        contextUser: UserInfo
    ): Promise<BaseEntity[]> {
        const rv = new RunView();
        const escapedId = parentRecordId.replace(/'/g, "''");
        const result = await rv.RunView<BaseEntity>({
            EntityName: entityName,
            ExtraFilter: `${joinField}='${escapedId}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            LogError(`Failed to load dependent ${entityName} records for cascade delete: ${result.ErrorMessage}`);
            return [];
        }

        return result.Results;
    }

    // ========================================
    // Restore Helpers
    // ========================================

    /**
     * Reads and parses an archive document from storage.
     */
    private async readDocumentFromStorage(context: RestoreRecordContext, storagePath: string): Promise<ArchiveDocument> {
        const buffer = await context.StorageDriver.GetObject({ fullPath: storagePath });
        const jsonContent = buffer.toString('utf8');
        return JSON.parse(jsonContent) as ArchiveDocument;
    }

    /**
     * Applies the archived field values from the document back onto the entity record and saves.
     */
    private async applyArchivedFieldsToRecord(
        context: RestoreRecordContext,
        document: ArchiveDocument
    ): Promise<string[]> {
        const entityName = document.entityName;
        const md = this.Provider;
        const record = await md.GetEntityObject(entityName, context.ContextUser);

        const compositeKey = new CompositeKey(
            document.primaryKey.map(pk => ({ FieldName: pk.FieldName, Value: pk.Value }))
        );

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
            throw new Error(`Failed to save restored record: ${record.LatestResult?.CompleteMessage ?? 'Unknown error'}`);
        }

        LogStatus(`Restored ${restoredFields.length} fields for ${entityName} record ${document.recordId}`);
        return restoredFields;
    }
}
