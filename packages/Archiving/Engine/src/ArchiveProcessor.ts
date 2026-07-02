import { BaseEntity, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseArchiveDriver } from './BaseArchiveDriver';
import { DefaultArchiveDriver } from './DefaultArchiveDriver';
import { ArchiveStorageManager } from './ArchiveStorageManager';
import { ArchiveFieldConfiguration, ArchiveRecordContext } from './types';

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
     *
     * @param configEntity - The ArchiveConfigurationEntity record defining which entity/fields to archive
     * @param config - The parent ArchiveConfiguration record
     * @param archiveRun - The current ArchiveRun record for logging
     * @param storageManager - Initialized storage manager for writing documents
     * @param contextUser - User context for all database operations
     * @returns Aggregated counts and bytes for this entity
     */
    public async ProcessEntity(
        configEntity: BaseEntity,
        config: BaseEntity,
        archiveRun: BaseEntity,
        storageManager: ArchiveStorageManager,
        contextUser: UserInfo
    ): Promise<EntityProcessingResult> {
        const entityName = configEntity.Get('Entity') as string;
        const driverClassName = configEntity.Get('DriverClass') as string | null;
        const batchSize = this.GetBatchSize(configEntity, config);
        const basePath = (config.Get('RootPath') as string) ?? '';

        LogStatus(`ArchiveProcessor: Starting processing for entity "${entityName}" (batch size: ${batchSize})`);

        const driver = this.ResolveDriver(driverClassName);
        const fieldConfig = this.ParseFieldConfiguration(configEntity);
        const filter = this.BuildRecordFilter(configEntity);
        const records = await this.LoadEligibleRecords(entityName, filter, contextUser);

        LogStatus(`ArchiveProcessor: Found ${records.length} eligible records for "${entityName}"`);

        return this.ProcessRecordBatches(
            records, driver, fieldConfig, configEntity, config,
            archiveRun, storageManager, basePath, batchSize, contextUser
        );
    }

    // ========================================
    // Driver Resolution
    // ========================================

    /**
     * Resolves the archive driver by class name via ClassFactory, falling back
     * to DefaultArchiveDriver if no class name is specified or resolution fails.
     */
    private ResolveDriver(driverClassName: string | null): BaseArchiveDriver {
        if (driverClassName) {
            const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArchiveDriver>(
                BaseArchiveDriver,
                driverClassName
            );
            if (driver) {
                return driver;
            }
            LogError(`Failed to resolve archive driver "${driverClassName}", falling back to DefaultArchiveDriver`);
        }
        return new DefaultArchiveDriver();
    }

    // ========================================
    // Field Configuration
    // ========================================

    /**
     * Parses the FieldConfiguration JSON column from the ArchiveConfigurationEntity record.
     * The FieldConfiguration column is NVARCHAR(MAX) storing JSON conforming to ArchiveFieldConfiguration.
     */
    private ParseFieldConfiguration(configEntity: BaseEntity): ArchiveFieldConfiguration {
        const fieldConfigJson = configEntity.Get('FieldConfiguration') as string;
        if (!fieldConfigJson) {
            throw new Error(`ArchiveConfigurationEntity ${configEntity.Get('ID')} has no FieldConfiguration`);
        }

        try {
            const parsed = JSON.parse(fieldConfigJson) as ArchiveFieldConfiguration;
            this.ValidateFieldConfiguration(parsed);
            return parsed;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid FieldConfiguration JSON on ArchiveConfigurationEntity ${configEntity.Get('ID')}: ${message}`);
        }
    }

    /**
     * Validates the parsed field configuration has the required structure.
     */
    private ValidateFieldConfiguration(config: ArchiveFieldConfiguration): void {
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
     * Builds the SQL filter expression for querying eligible records.
     * Combines the retention date filter with any custom filter expression.
     */
    private BuildRecordFilter(configEntity: BaseEntity): string {
        const retentionDays = configEntity.Get('RetentionDays') as number | null;
        const dateField = configEntity.Get('DateField') as string | null;
        const customFilter = configEntity.Get('FilterExpression') as string | null;

        const filterParts: string[] = [];

        if (retentionDays != null && dateField) {
            // Dialect-neutral retention cutoff: compute in JS and inject an ISO-8601
            // literal rather than DATEADD/GETUTCDATE, which don't exist on PostgreSQL.
            const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
            filterParts.push(`${dateField} < '${cutoffIso}'`);
        }

        if (customFilter) {
            filterParts.push(`(${customFilter})`);
        }

        return filterParts.length > 0 ? filterParts.join(' AND ') : '';
    }

    /**
     * Loads records matching the archive filter from the database.
     */
    private async LoadEligibleRecords(entityName: string, filter: string, contextUser: UserInfo): Promise<BaseEntity[]> {
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
    private GetBatchSize(configEntity: BaseEntity, config: BaseEntity): number {
        const entityBatchSize = configEntity.Get('BatchSize') as number | null;
        const defaultBatchSize = config.Get('DefaultBatchSize') as number | null;
        return entityBatchSize ?? defaultBatchSize ?? 100;
    }

    /**
     * Processes records in batches, calling the driver for each record and logging results.
     */
    private async ProcessRecordBatches(
        records: BaseEntity[],
        driver: BaseArchiveDriver,
        fieldConfig: ArchiveFieldConfiguration,
        configEntity: BaseEntity,
        config: BaseEntity,
        archiveRun: BaseEntity,
        storageManager: ArchiveStorageManager,
        basePath: string,
        batchSize: number,
        contextUser: UserInfo
    ): Promise<EntityProcessingResult> {
        const totals: EntityProcessingResult = { Archived: 0, Failed: 0, Skipped: 0, Bytes: 0 };

        for (let offset = 0; offset < records.length; offset += batchSize) {
            const batch = records.slice(offset, offset + batchSize);
            const batchResult = await this.ProcessSingleBatch(
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
    private async ProcessSingleBatch(
        batch: BaseEntity[],
        driver: BaseArchiveDriver,
        fieldConfig: ArchiveFieldConfiguration,
        configEntity: BaseEntity,
        config: BaseEntity,
        archiveRun: BaseEntity,
        storageManager: ArchiveStorageManager,
        basePath: string,
        contextUser: UserInfo
    ): Promise<EntityProcessingResult> {
        const result: EntityProcessingResult = { Archived: 0, Failed: 0, Skipped: 0, Bytes: 0 };

        for (const record of batch) {
            const recordResult = await this.ProcessSingleRecord(
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
     * Processes a single record: checks eligibility, archives, and logs the detail.
     * Returns 'skipped', 'failed', or the number of bytes archived.
     */
    private async ProcessSingleRecord(
        record: BaseEntity,
        driver: BaseArchiveDriver,
        fieldConfig: ArchiveFieldConfiguration,
        configEntity: BaseEntity,
        config: BaseEntity,
        archiveRun: BaseEntity,
        storageManager: ArchiveStorageManager,
        basePath: string,
        contextUser: UserInfo
    ): Promise<'skipped' | 'failed' | number> {
        const context: ArchiveRecordContext = {
            Record: record,
            FieldConfig: fieldConfig,
            ConfigEntity: configEntity,
            Config: config,
            StorageDriver: storageManager.Driver,
            BasePath: basePath,
            ContextUser: contextUser,
            ArchiveRun: archiveRun,
        };

        if (!driver.ShouldArchiveRecord(context)) {
            return 'skipped';
        }

        const archiveResult = await driver.ArchiveRecord(context);
        await this.LogArchiveRunDetail(archiveRun, record, archiveResult, contextUser);

        if (!archiveResult.Success) {
            LogError(`Failed to archive record ${record.PrimaryKey.Values()} of "${record.EntityInfo.Name}": ${archiveResult.ErrorMessage}`);
            return 'failed';
        }

        return archiveResult.BytesArchived;
    }

    /**
     * Creates an ArchiveRunDetail record to log the result of archiving a single record.
     */
    private async LogArchiveRunDetail(
        archiveRun: BaseEntity,
        record: BaseEntity,
        archiveResult: { Success: boolean; StoragePath: string | null; BytesArchived: number; ErrorMessage?: string; Skipped?: boolean },
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const md = this.Provider;
            const detail = await md.GetEntityObject('MJ: Archive Run Details', contextUser);

            detail.Set('ArchiveRunID', archiveRun.Get('ID'));
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
