import { BaseEntity, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseArchiveDriver } from './BaseArchiveDriver';
import { ResolveArchiveDriver } from './ArchiveDriverResolver';
import { ArchiveStorageManager } from './ArchiveStorageManager';
import { ArchiveFieldConfiguration, ArchiveRecordContext, ArchiveStorageMode, IsPurgeStorageMode } from './types';
import type { MJArchiveConfigurationEntity, MJArchiveConfigurationEntityEntity, MJArchiveRunEntity } from '@memberjunction/core-entities';

/**
 * Result of processing a single entity within an archive run.
 */
export interface EntityProcessingResult {
    /** Number of records successfully archived */
    Archived: number;
    /** Number of records that failed to archive */
    Failed: number;
    /** Number of records intentionally skipped */
    Skipped: number;
    /** Total bytes written to storage for this entity */
    Bytes: number;
}

/**
 * Handles batch processing of records for a single entity within an archive run.
 * Resolves the appropriate driver, queries eligible records, and processes them
 * in configurable batch sizes.
 */
export class ArchiveProcessor {
    /** Optional metadata provider; falls back to Metadata.Provider when not set. */
    private _provider: IMetadataProvider | undefined;

    public set Provider(value: IMetadataProvider | undefined) {
        this._provider = value;
    }

    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Processes all eligible records for a single entity configuration.
     * Throws before any record is read when the configured DriverClass is not registered.
     *
     * @param configEntity - The ArchiveConfigurationEntity record defining which entity/fields to archive
     * @param config - The parent ArchiveConfiguration record
     * @param archiveRun - The current ArchiveRun record for logging
     * @param storageManager - Initialized storage manager for writing documents; null when StorageMode is 'Purge'
     * @param contextUser - User context for all database operations
     * @returns Aggregated counts and bytes for this entity
     */
    public async ProcessEntity(
        configEntity: MJArchiveConfigurationEntityEntity,
        config: MJArchiveConfigurationEntity,
        archiveRun: MJArchiveRunEntity,
        storageManager: ArchiveStorageManager | null,
        contextUser: UserInfo
    ): Promise<EntityProcessingResult> {
        const entityName = configEntity.Entity;
        const driverClassName = configEntity.DriverClass;
        const batchSize = this.getBatchSize(configEntity, config);
        const basePath = config.RootPath ?? '';

        LogStatus(`ArchiveProcessor: Starting processing for entity "${entityName}" (batch size: ${batchSize})`);

        const driver = ResolveArchiveDriver(driverClassName);
        if (!driver) {
            throw new Error(`Archive driver "${driverClassName}" is not registered`);
        }
        const fieldConfig = this.parseFieldConfiguration(configEntity);
        const filter = this.buildRecordFilter(configEntity, config);
        const records = await this.loadEligibleRecords(entityName, filter, contextUser);

        LogStatus(`ArchiveProcessor: Found ${records.length} eligible records for "${entityName}"`);

        return this.processRecordBatches(
            records, driver, fieldConfig, configEntity, config,
            archiveRun, storageManager, basePath, batchSize, contextUser
        );
    }

    // ========================================
    // Field Configuration
    // ========================================

    /**
     * Parses the FieldConfiguration JSON column from the ArchiveConfigurationEntity record.
     * The FieldConfiguration column is NVARCHAR(MAX) storing JSON conforming to ArchiveFieldConfiguration.
     */
    private parseFieldConfiguration(configEntity: MJArchiveConfigurationEntityEntity): ArchiveFieldConfiguration {
        const fieldConfigJson = configEntity.FieldConfiguration;
        if (!fieldConfigJson) {
            throw new Error(`ArchiveConfigurationEntity ${configEntity.ID} has no FieldConfiguration`);
        }

        try {
            const parsed = JSON.parse(fieldConfigJson) as ArchiveFieldConfiguration;
            this.validateFieldConfiguration(parsed);
            return parsed;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid FieldConfiguration JSON on ArchiveConfigurationEntity ${configEntity.ID}: ${message}`);
        }
    }

    /**
     * Validates the parsed field configuration has the required structure.
     */
    private validateFieldConfiguration(config: ArchiveFieldConfiguration): void {
        if (!config.Fields || !Array.isArray(config.Fields)) {
            throw new Error('FieldConfiguration must have a Fields array');
        }

        // Empty Fields array is only valid when ArchiveFullRecord is true
        if (config.Fields.length === 0 && !config.ArchiveFullRecord) {
            throw new Error('FieldConfiguration must have at least one field in the Fields array, or set ArchiveFullRecord to true');
        }

        for (const field of config.Fields) {
            if (!field.FieldName || typeof field.FieldName !== 'string') {
                throw new Error('Each field in FieldConfiguration.Fields must have a non-empty FieldName');
            }
        }
    }

    // ========================================
    // Record Querying
    // ========================================

    /**
     * Builds the SQL filter expression for querying eligible records: the retention cutoff
     * (the entity's RetentionDays, else the configuration's DefaultRetentionDays) plus any
     * custom filter expression. Throws when the resolved retention period is negative.
     */
    private buildRecordFilter(
        configEntity: MJArchiveConfigurationEntityEntity,
        config: MJArchiveConfigurationEntity
    ): string {
        const dateField = configEntity.DateField;
        if (!dateField) {
            throw new Error(`ArchiveConfigurationEntity ${configEntity.ID} has no DateField, so no retention cutoff can be applied`);
        }

        const retentionDays = configEntity.RetentionDays ?? config.DefaultRetentionDays;
        if (retentionDays < 0) {
            throw new Error(`Entity "${configEntity.Entity}" has a negative retention period (${retentionDays} days)`);
        }
        // Dialect-neutral retention cutoff: compute in JS and inject an ISO-8601
        // literal rather than DATEADD/GETUTCDATE, which don't exist on PostgreSQL.
        const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
        const filterParts = [`${dateField} < '${cutoffIso}'`];

        if (configEntity.FilterExpression) {
            filterParts.push(`(${configEntity.FilterExpression})`);
        }

        return filterParts.join(' AND ');
    }

    /**
     * Loads records matching the archive filter from the database.
     */
    private async loadEligibleRecords(entityName: string, filter: string, contextUser: UserInfo): Promise<BaseEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<BaseEntity>({
            EntityName: entityName,
            ExtraFilter: filter || undefined,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load records for entity "${entityName}": ${result.ErrorMessage}`);
        }

        return result.Results;
    }

    // ========================================
    // Batch Processing
    // ========================================

    /**
     * Determines the batch size from the entity config or parent config defaults.
     */
    private getBatchSize(configEntity: MJArchiveConfigurationEntityEntity, config: MJArchiveConfigurationEntity): number {
        const entityBatchSize = configEntity.BatchSize;
        const defaultBatchSize = config.DefaultBatchSize;
        return entityBatchSize ?? defaultBatchSize ?? 100;
    }

    /**
     * Processes records in batches, calling the driver for each record. An ArchiveRunDetail
     * is logged for every record on Store runs and only for failed records on Purge runs.
     */
    private async processRecordBatches(
        records: BaseEntity[],
        driver: BaseArchiveDriver,
        fieldConfig: ArchiveFieldConfiguration,
        configEntity: MJArchiveConfigurationEntityEntity,
        config: MJArchiveConfigurationEntity,
        archiveRun: MJArchiveRunEntity,
        storageManager: ArchiveStorageManager | null,
        basePath: string,
        batchSize: number,
        contextUser: UserInfo
    ): Promise<EntityProcessingResult> {
        const totals: EntityProcessingResult = { Archived: 0, Failed: 0, Skipped: 0, Bytes: 0 };

        for (let offset = 0; offset < records.length; offset += batchSize) {
            const batch = records.slice(offset, offset + batchSize);
            const batchResult = await this.processSingleBatch(
                batch, driver, fieldConfig, configEntity, config,
                archiveRun, storageManager, basePath, contextUser
            );
            totals.Archived += batchResult.Archived;
            totals.Failed += batchResult.Failed;
            totals.Skipped += batchResult.Skipped;
            totals.Bytes += batchResult.Bytes;
        }

        return totals;
    }

    /**
     * Processes a single batch of records.
     */
    private async processSingleBatch(
        batch: BaseEntity[],
        driver: BaseArchiveDriver,
        fieldConfig: ArchiveFieldConfiguration,
        configEntity: MJArchiveConfigurationEntityEntity,
        config: MJArchiveConfigurationEntity,
        archiveRun: MJArchiveRunEntity,
        storageManager: ArchiveStorageManager | null,
        basePath: string,
        contextUser: UserInfo
    ): Promise<EntityProcessingResult> {
        const result: EntityProcessingResult = { Archived: 0, Failed: 0, Skipped: 0, Bytes: 0 };

        for (const record of batch) {
            const recordResult = await this.processSingleRecord(
                record, driver, fieldConfig, configEntity, config,
                archiveRun, storageManager, basePath, contextUser
            );
            if (recordResult === 'skipped') {
                result.Skipped++;
            } else if (recordResult === 'failed') {
                result.Failed++;
            } else {
                result.Archived++;
                result.Bytes += recordResult;
            }
        }

        return result;
    }

    /**
     * Processes a single record: checks eligibility, archives, and logs an ArchiveRunDetail
     * (always on Store runs, only on failure on Purge runs).
     * Returns 'skipped', 'failed', or the number of bytes archived.
     */
    private async processSingleRecord(
        record: BaseEntity,
        driver: BaseArchiveDriver,
        fieldConfig: ArchiveFieldConfiguration,
        configEntity: MJArchiveConfigurationEntityEntity,
        config: MJArchiveConfigurationEntity,
        archiveRun: MJArchiveRunEntity,
        storageManager: ArchiveStorageManager | null,
        basePath: string,
        contextUser: UserInfo
    ): Promise<'skipped' | 'failed' | number> {
        const context: ArchiveRecordContext = {
            Record: record,
            FieldConfig: fieldConfig,
            ConfigEntity: configEntity,
            Config: config,
            StorageDriver: storageManager ? storageManager.Driver : null,
            StorageMode: config.StorageMode,
            BasePath: basePath,
            ContextUser: contextUser,
            ArchiveRun: archiveRun,
        };

        if (!driver.ShouldArchiveRecord(context)) {
            return 'skipped';
        }

        const archiveResult = await driver.ArchiveRecord(context);
        if (this.shouldLogRunDetail(context.StorageMode, archiveResult.Success)) {
            await this.logArchiveRunDetail(archiveRun, record, archiveResult, contextUser);
        }

        if (!archiveResult.Success) {
            LogError(`Failed to archive record ${record.PrimaryKey.Values()} of "${record.EntityInfo.Name}": ${archiveResult.ErrorMessage}`);
            return 'failed';
        }

        return archiveResult.BytesArchived;
    }

    /**
     * Store runs log a detail for every record. Purge runs keep no copy, so they log
     * failed records only. Any value other than Purge is treated as Store.
     */
    private shouldLogRunDetail(storageMode: ArchiveStorageMode, succeeded: boolean): boolean {
        return !IsPurgeStorageMode(storageMode) || !succeeded;
    }

    /**
     * Creates an ArchiveRunDetail record to log the result of archiving a single record.
     */
    private async logArchiveRunDetail(
        archiveRun: MJArchiveRunEntity,
        record: BaseEntity,
        archiveResult: { Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string; Skipped?: boolean },
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const md = this.Provider;
            const detail = await md.GetEntityObject('MJ: Archive Run Details', contextUser);

            detail.Set('ArchiveRunID', archiveRun.ID);
            detail.Set('EntityID', record.EntityInfo.ID);
            detail.Set('RecordID', record.PrimaryKey.Values());
            detail.Set('Status', archiveResult.Success ? 'Success' : 'Failed');
            detail.Set('StoragePath', archiveResult.StoragePath ?? '');
            detail.Set('BytesArchived', archiveResult.BytesArchived);
            detail.Set('ErrorMessage', archiveResult.ErrorMessage ?? null);

            const saved = await detail.Save();
            if (!saved) {
                LogError(`Failed to save ArchiveRunDetail for record ${record.PrimaryKey.Values()}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Failed to log ArchiveRunDetail: ${message}`);
        }
    }
}
