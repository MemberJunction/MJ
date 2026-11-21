import { BaseEntity, EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, ResolvePlatformKey, UserInfo } from '@memberjunction/core';
import { BaseArchiveDriver } from './BaseArchiveDriver';
import { ResolveArchiveDriver } from './ArchiveDriverResolver';
import { ArchiveStorageManager } from './ArchiveStorageManager';
import { ArchiveRecordPager } from './ArchiveRecordPager';
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
     * Processes all eligible records for a single entity configuration in one call. Records
     * are loaded one page of the batch size at a time, ordered by primary key, until a page
     * comes back empty, so memory holds at most one batch however many records are eligible.
     * Throws before any record is read when the configured DriverClass is not registered.
     *
     * Each page's counts are added to `runTotals` as soon as the page is processed, so when a
     * later page fails to load and this method throws, `runTotals` still holds every record
     * already archived, stripped or deleted. That matters on a Purge run, where the archive run
     * row is the only record of what was removed.
     *
     * @param configEntity - The ArchiveConfigurationEntity record defining which entity/fields to archive
     * @param config - The parent ArchiveConfiguration record
     * @param archiveRun - The current ArchiveRun record for logging
     * @param storageManager - Initialized storage manager for writing documents; null when StorageMode is 'Purge'
     * @param contextUser - User context for all database operations
     * @param runTotals - Optional running totals for the whole archive run; each page's counts are
     *        added to it as the page completes
     * @returns Aggregated counts and bytes for this entity
     */
    public async ProcessEntity(
        configEntity: MJArchiveConfigurationEntityEntity,
        config: MJArchiveConfigurationEntity,
        archiveRun: MJArchiveRunEntity,
        storageManager: ArchiveStorageManager | null,
        contextUser: UserInfo,
        runTotals?: EntityProcessingResult
    ): Promise<EntityProcessingResult> {
        const entityName = configEntity.Entity;
        const batchSize = this.getBatchSize(configEntity, config);

        LogStatus(`ArchiveProcessor: Starting processing for entity "${entityName}" (batch size: ${batchSize})`);

        const driver = ResolveArchiveDriver(configEntity.DriverClass);
        if (!driver) {
            throw new Error(`Archive driver "${configEntity.DriverClass}" is not registered`);
        }
        const fieldConfig = this.parseFieldConfiguration(configEntity);
        const entityInfo = this.requireEntityInfo(entityName);
        const eligibilityFilter = driver.BuildEligibilityFilter({ FieldConfig: fieldConfig, EntityInfo: entityInfo, ConfigEntity: configEntity, Config: config });
        const filter = this.buildRecordFilter(configEntity, config, entityInfo, eligibilityFilter);
        const pager = new ArchiveRecordPager(entityInfo, filter, batchSize, ResolvePlatformKey(this.Provider), contextUser);
        const job: EntityJob = {
            Driver: driver, FieldConfig: fieldConfig, ConfigEntity: configEntity, Config: config,
            ArchiveRun: archiveRun, StorageManager: storageManager, BasePath: config.RootPath ?? '', ContextUser: contextUser,
        };

        const totals = await this.processPages(pager, job, runTotals);
        LogStatus(`ArchiveProcessor: Processed ${totals.Archived + totals.Failed + totals.Skipped} eligible records for "${entityName}"`);
        return totals;
    }

    /**
     * Loads and processes pages until the pager returns an empty page, adding each page's
     * counts to the entity's totals and, when given, to the run's totals.
     */
    private async processPages(pager: ArchiveRecordPager, job: EntityJob, runTotals?: EntityProcessingResult): Promise<EntityProcessingResult> {
        const totals: EntityProcessingResult = { Archived: 0, Failed: 0, Skipped: 0, Bytes: 0 };
        for (let page = await pager.NextPage(); page.length > 0; page = await pager.NextPage()) {
            const pageResult = await this.processSingleBatch(page, job);
            this.addCounts(totals, pageResult);
            if (runTotals) {
                this.addCounts(runTotals, pageResult);
            }
        }
        return totals;
    }

    private addCounts(into: EntityProcessingResult, counts: EntityProcessingResult): void {
        into.Archived += counts.Archived;
        into.Failed += counts.Failed;
        into.Skipped += counts.Skipped;
        into.Bytes += counts.Bytes;
    }

    /**
     * Returns the entity's metadata, or throws when the entity is not in metadata.
     */
    private requireEntityInfo(entityName: string): EntityInfo {
        const entityInfo = this.Provider.EntityByName(entityName);
        if (!entityInfo) {
            throw new Error(`Entity "${entityName}" was not found in metadata`);
        }
        return entityInfo;
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
     * (the entity's RetentionDays, else the configuration's DefaultRetentionDays), the
     * driver's eligibility filter when it supplies one, and any custom filter expression,
     * all ANDed. Throws when the DateField is missing or is not a field of the entity, or
     * when the resolved retention period is negative.
     */
    private buildRecordFilter(
        configEntity: MJArchiveConfigurationEntityEntity,
        config: MJArchiveConfigurationEntity,
        entityInfo: EntityInfo,
        eligibilityFilter: string | null
    ): string {
        const dateField = this.requireDateField(configEntity, entityInfo);

        const retentionDays = configEntity.RetentionDays ?? config.DefaultRetentionDays;
        if (retentionDays < 0) {
            throw new Error(`Entity "${configEntity.Entity}" has a negative retention period (${retentionDays} days)`);
        }
        // Dialect-neutral retention cutoff: compute in JS and inject an ISO-8601
        // literal rather than DATEADD/GETUTCDATE, which don't exist on PostgreSQL.
        const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
        const filterParts = [`[${dateField}] < '${cutoffIso}'`];

        if (eligibilityFilter) {
            filterParts.push(`(${eligibilityFilter})`);
        }
        if (configEntity.FilterExpression) {
            filterParts.push(`(${configEntity.FilterExpression})`);
        }

        return filterParts.join(' AND ');
    }

    /**
     * Returns the metadata name of the configured DateField, or throws when it is missing
     * or is not a field of the entity.
     */
    private requireDateField(configEntity: MJArchiveConfigurationEntityEntity, entityInfo: EntityInfo): string {
        if (!configEntity.DateField) {
            throw new Error(`ArchiveConfigurationEntity ${configEntity.ID} has no DateField, so no retention cutoff can be applied`);
        }
        const field = entityInfo.FieldByName(configEntity.DateField);
        if (!field || /[[\]]/.test(field.Name)) {
            throw new Error(`DateField "${configEntity.DateField}" is not a field of entity "${entityInfo.Name}"`);
        }
        return field.Name;
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
     * Processes one page of records. An ArchiveRunDetail is logged for every record on
     * Store runs and only for failed records on Purge runs.
     */
    private async processSingleBatch(batch: BaseEntity[], job: EntityJob): Promise<EntityProcessingResult> {
        const result: EntityProcessingResult = { Archived: 0, Failed: 0, Skipped: 0, Bytes: 0 };

        for (const record of batch) {
            const recordResult = await this.processSingleRecord(record, job);
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
    private async processSingleRecord(record: BaseEntity, job: EntityJob): Promise<'skipped' | 'failed' | number> {
        const context: ArchiveRecordContext = {
            Record: record,
            FieldConfig: job.FieldConfig,
            ConfigEntity: job.ConfigEntity,
            Config: job.Config,
            StorageDriver: job.StorageManager ? job.StorageManager.Driver : null,
            StorageMode: job.Config.StorageMode,
            BasePath: job.BasePath,
            ContextUser: job.ContextUser,
            ArchiveRun: job.ArchiveRun,
        };

        if (!job.Driver.ShouldArchiveRecord(context)) {
            return 'skipped';
        }

        const archiveResult = await job.Driver.ArchiveRecord(context);
        if (this.shouldLogRunDetail(context.StorageMode, archiveResult.Success)) {
            await this.logArchiveRunDetail(job.ArchiveRun, record, archiveResult, job.ContextUser);
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

/**
 * Everything one entity's records are processed with, fixed for the whole entity.
 */
interface EntityJob {
    Driver: BaseArchiveDriver;
    FieldConfig: ArchiveFieldConfiguration;
    ConfigEntity: MJArchiveConfigurationEntityEntity;
    Config: MJArchiveConfigurationEntity;
    ArchiveRun: MJArchiveRunEntity;
    StorageManager: ArchiveStorageManager | null;
    BasePath: string;
    ContextUser: UserInfo;
}
