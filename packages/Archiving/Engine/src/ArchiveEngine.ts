import { BaseEntity, CompositeKey, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { ArchiveProcessor } from './ArchiveProcessor';
import { ArchiveRecovery } from './ArchiveRecovery';
import { ArchiveStorageManager } from './ArchiveStorageManager';
import { ArchiveRunResult, RestoreRecordResult } from './types';

/**
 * Main orchestrator for archive operations. Singleton that coordinates
 * loading configurations, initializing storage, processing entities,
 * and recording run results.
 *
 * Usage:
 * ```typescript
 * const result = await ArchiveEngine.Instance.RunArchive(configId, contextUser);
 * ```
 */
export class ArchiveEngine extends BaseSingleton<ArchiveEngine> {
    /**
     * Returns the global singleton instance of the ArchiveEngine.
     */
    public static get Instance(): ArchiveEngine {
        return super.getInstance<ArchiveEngine>();
    }

    protected constructor() {
        super();
    }

    private _recovery: ArchiveRecovery = new ArchiveRecovery();

    /** Optional metadata provider; falls back to Metadata.Provider when not explicitly set. */
    private _provider: IMetadataProvider | undefined;

    /** Set the metadata provider used by the archive engine and its subsystems. */
    public set Provider(value: IMetadataProvider | undefined) {
        this._provider = value;
        this._recovery.Provider = value;
    }

    /** Get the metadata provider, falling back to the global default. */
    public get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Provides access to the recovery subsystem for listing and restoring archived versions.
     */
    public get Recovery(): ArchiveRecovery {
        return this._recovery;
    }

    // ========================================
    // Main Archive Execution
    // ========================================

    /**
     * Executes a complete archive run for the given configuration.
     *
     * Steps:
     * 1. Validates user authorization
     * 2. Loads the ArchiveConfiguration and its entity configurations
     * 3. Sorts entities for safe processing order (children first for purge safety)
     * 4. Creates an ArchiveRun record
     * 5. Initializes the storage driver
     * 6. Processes each entity via ArchiveProcessor
     * 7. Updates the ArchiveRun with final totals
     *
     * @param configId - ID of the ArchiveConfiguration to execute
     * @param contextUser - User context for authorization and database operations
     * @returns Summary result of the archive run
     */
    public async RunArchive(configId: string, contextUser: UserInfo): Promise<ArchiveRunResult> {
        try {
            const config = await this.LoadConfiguration(configId, contextUser);
            if (!config) {
                return this.BuildFailureResult('', `ArchiveConfiguration not found: ${configId}`);
            }

            const isActive = config.Get('IsActive') as boolean;
            if (!isActive) {
                return this.BuildFailureResult('', `ArchiveConfiguration "${config.Get('Name')}" is not active. Set IsActive to true before running.`);
            }

            const status = config.Get('Status') as string;
            if (status === 'Running') {
                return this.BuildFailureResult('', `ArchiveConfiguration "${config.Get('Name')}" is already running. Wait for the current run to complete.`);
            }

            const configEntities = await this.LoadConfigurationEntities(configId, contextUser);
            if (configEntities.length === 0) {
                return this.BuildFailureResult('', 'No entity configurations found for this archive configuration');
            }

            const archiveRun = await this.CreateArchiveRun(config, contextUser);
            const storageManager = await this.InitializeStorage(config, contextUser);

            LogStatus(`ArchiveEngine: Starting run ${archiveRun.Get('ID')} with ${configEntities.length} entities`);

            const totals = await this.ProcessAllEntities(configEntities, config, archiveRun, storageManager, contextUser);
            await this.FinalizeArchiveRun(archiveRun, totals, contextUser);

            return {
                Success: totals.Failed === 0,
                ArchiveRunId: archiveRun.Get('ID') as string,
                TotalRecords: totals.Archived + totals.Failed + totals.Skipped,
                ArchivedRecords: totals.Archived,
                FailedRecords: totals.Failed,
                SkippedRecords: totals.Skipped,
                TotalBytesArchived: totals.Bytes,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ArchiveEngine.RunArchive failed: ${message}`);
            return this.BuildFailureResult('', message);
        }
    }

    // ========================================
    // Configuration Loading
    // ========================================

    /**
     * Loads the ArchiveConfiguration record by ID.
     */
    private async LoadConfiguration(configId: string, contextUser: UserInfo): Promise<BaseEntity | null> {
        const md = this.Provider;
        const config = await md.GetEntityObject('MJ: Archive Configurations', contextUser);
        const loaded = await config.InnerLoad(CompositeKey.FromKeyValuePair('ID', configId));
        return loaded ? config : null;
    }

    /**
     * Loads all ArchiveConfigurationEntity records for the given configuration,
     * ordered by Priority for controlled execution sequence.
     */
    private async LoadConfigurationEntities(configId: string, contextUser: UserInfo): Promise<BaseEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<BaseEntity>({
            EntityName: 'MJ: Archive Configuration Entities',
            ExtraFilter: `ArchiveConfigurationID='${configId}' AND IsActive=1`,
            OrderBy: 'Priority ASC',
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load configuration entities: ${result.ErrorMessage}`);
        }

        return result.Results;
    }

    // ========================================
    // Archive Run Lifecycle
    // ========================================

    /**
     * Creates a new ArchiveRun record to track this execution.
     */
    private async CreateArchiveRun(config: BaseEntity, contextUser: UserInfo): Promise<BaseEntity> {
        const md = this.Provider;
        const run = await md.GetEntityObject('MJ: Archive Runs', contextUser);

        run.Set('ArchiveConfigurationID', config.Get('ID'));
        run.Set('UserID', contextUser.ID);
        run.Set('Status', 'Running');
        run.Set('StartedAt', new Date().toISOString());

        const saved = await run.Save();
        if (!saved) {
            throw new Error(`Failed to create ArchiveRun record: ${run.LatestResult?.Message ?? 'Unknown error'}`);
        }

        LogStatus(`ArchiveEngine: Created ArchiveRun ${run.Get('ID')}`);
        return run;
    }

    /**
     * Updates the ArchiveRun record with final totals and completion status.
     */
    private async FinalizeArchiveRun(
        archiveRun: BaseEntity,
        totals: AggregatedTotals,
        contextUser: UserInfo
    ): Promise<void> {
        archiveRun.Set('Status', totals.Failed > 0 ? 'PartialSuccess' : 'Complete');
        archiveRun.Set('CompletedAt', new Date().toISOString());
        archiveRun.Set('TotalRecords', totals.Archived + totals.Failed + totals.Skipped);
        archiveRun.Set('ArchivedRecords', totals.Archived);
        archiveRun.Set('FailedRecords', totals.Failed);
        archiveRun.Set('SkippedRecords', totals.Skipped);
        archiveRun.Set('TotalBytesArchived', totals.Bytes);

        const saved = await archiveRun.Save();
        if (!saved) {
            LogError(`Failed to finalize ArchiveRun ${archiveRun.Get('ID')}: ${archiveRun.LatestResult?.Message ?? 'Unknown error'}`);
        }
    }

    // ========================================
    // Storage Initialization
    // ========================================

    /**
     * Initializes the ArchiveStorageManager from the configuration's storage account.
     */
    private async InitializeStorage(config: BaseEntity, contextUser: UserInfo): Promise<ArchiveStorageManager> {
        const storageAccountId = config.Get('StorageAccountID') as string;
        if (!storageAccountId) {
            throw new Error('ArchiveConfiguration has no StorageAccountID configured');
        }

        const manager = new ArchiveStorageManager();
        await manager.Initialize(storageAccountId, contextUser);
        return manager;
    }

    // ========================================
    // Entity Processing
    // ========================================

    /**
     * Processes all configured entities sequentially (order matters for dependency safety).
     */
    private async ProcessAllEntities(
        configEntities: BaseEntity[],
        config: BaseEntity,
        archiveRun: BaseEntity,
        storageManager: ArchiveStorageManager,
        contextUser: UserInfo
    ): Promise<AggregatedTotals> {
        const totals: AggregatedTotals = { Archived: 0, Failed: 0, Skipped: 0, Bytes: 0 };

        for (const configEntity of configEntities) {
            const processor = new ArchiveProcessor();
            const entityResult = await processor.ProcessEntity(
                configEntity, config, archiveRun, storageManager, contextUser
            );

            totals.Archived += entityResult.Archived;
            totals.Failed += entityResult.Failed;
            totals.Skipped += entityResult.Skipped;
            totals.Bytes += entityResult.Bytes;

            const entityName = configEntity.Get('Entity') as string;
            LogStatus(
                `ArchiveEngine: Entity "${entityName}" complete - ` +
                `archived: ${entityResult.Archived}, failed: ${entityResult.Failed}, ` +
                `skipped: ${entityResult.Skipped}, bytes: ${entityResult.Bytes}`
            );
        }

        return totals;
    }

    // ========================================
    // Helpers
    // ========================================

    /**
     * Builds a failure ArchiveRunResult with zero counts.
     */
    private BuildFailureResult(archiveRunId: string, errorMessage: string): ArchiveRunResult {
        return {
            Success: false,
            ArchiveRunId: archiveRunId,
            TotalRecords: 0,
            ArchivedRecords: 0,
            FailedRecords: 0,
            SkippedRecords: 0,
            TotalBytesArchived: 0,
            ErrorMessage: errorMessage,
        };
    }
}

/**
 * Internal type for aggregating processing totals across entities.
 */
interface AggregatedTotals {
    Archived: number;
    Failed: number;
    Skipped: number;
    Bytes: number;
}
