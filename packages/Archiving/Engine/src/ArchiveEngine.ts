import { BaseEntity, CompositeKey, EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { ArchiveProcessor } from './ArchiveProcessor';
import { ArchiveRecovery } from './ArchiveRecovery';
import { ArchiveStorageManager } from './ArchiveStorageManager';
import { ArchiveRunResult, IsPurgeStorageMode, RestoreRecordResult } from './types';
import type { MJArchiveConfigurationEntity, MJArchiveConfigurationEntityEntity, MJArchiveRunEntity } from '@memberjunction/core-entities';
import { ResolveArchiveDriver } from './ArchiveDriverResolver';

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
     * 1. Validates the configuration is active and not already running
     * 2. Loads the ArchiveConfiguration and its entity configurations (by Priority)
     * 3. For a Purge configuration, refuses entities that cannot be purged safely
     * 4. Creates an ArchiveRun record carrying the configuration's StorageMode
     * 5. Initializes the storage driver (Store only)
     * 6. Processes each entity via ArchiveProcessor
     * 7. Updates the ArchiveRun with final totals
     *
     * @param configId - ID of the ArchiveConfiguration to execute
     * @param contextUser - User context for authorization and database operations
     * @returns Summary result of the archive run
     */
    public async RunArchive(configId: string, contextUser: UserInfo): Promise<ArchiveRunResult> {
        try {
            const config = await this.loadConfiguration(configId, contextUser);
            if (!config) {
                return this.buildFailureResult('', `ArchiveConfiguration not found: ${configId}`);
            }

            const isActive = config.Get('IsActive') as boolean;
            if (!isActive) {
                return this.buildFailureResult('', `ArchiveConfiguration "${config.Get('Name')}" is not active. Set IsActive to true before running.`);
            }

            const status = config.Get('Status') as string;
            if (status === 'Running') {
                return this.buildFailureResult('', `ArchiveConfiguration "${config.Get('Name')}" is already running. Wait for the current run to complete.`);
            }

            const configEntities = await this.loadConfigurationEntities(configId, contextUser);
            if (configEntities.length === 0) {
                return this.buildFailureResult('', 'No entity configurations found for this archive configuration');
            }

            const purgeBlocker = this.findPurgeBlocker(config, configEntities);
            if (purgeBlocker) {
                return this.buildFailureResult('', purgeBlocker);
            }

            const archiveRun = await this.createArchiveRun(config, contextUser);
            const storageManager = IsPurgeStorageMode(config.StorageMode)
                ? null
                : await this.initializeStorage(config, contextUser);

            LogStatus(`ArchiveEngine: Starting ${config.StorageMode} run ${archiveRun.ID} with ${configEntities.length} entities`);

            const totals = await this.processAllEntities(configEntities, config, archiveRun, storageManager, contextUser);
            await this.finalizeArchiveRun(archiveRun, totals, contextUser);

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
            return this.buildFailureResult('', message);
        }
    }

    // ========================================
    // Configuration Loading
    // ========================================

    /**
     * Loads the ArchiveConfiguration record by ID.
     */
    private async loadConfiguration(configId: string, contextUser: UserInfo): Promise<MJArchiveConfigurationEntity | null> {
        const md = this.Provider;
        const config = await md.GetEntityObject<MJArchiveConfigurationEntity>('MJ: Archive Configurations', contextUser);
        const loaded = await config.InnerLoad(CompositeKey.FromID(configId));
        return loaded ? config : null;
    }

    /**
     * Loads all ArchiveConfigurationEntity records for the given configuration,
     * ordered by Priority for controlled execution sequence.
     */
    private async loadConfigurationEntities(configId: string, contextUser: UserInfo): Promise<MJArchiveConfigurationEntityEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJArchiveConfigurationEntityEntity>({
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
     * Creates a new ArchiveRun record to track this execution, carrying the
     * configuration's StorageMode.
     */
    private async createArchiveRun(config: MJArchiveConfigurationEntity, contextUser: UserInfo): Promise<MJArchiveRunEntity> {
        const md = this.Provider;
        const run = await md.GetEntityObject<MJArchiveRunEntity>('MJ: Archive Runs', contextUser);

        run.ArchiveConfigurationID = config.ID;
        run.UserID = contextUser.ID;
        run.Status = 'Running';
        run.StartedAt = new Date();
        run.StorageMode = config.StorageMode;

        const saved = await run.Save();
        if (!saved) {
            throw new Error(`Failed to create ArchiveRun record: ${run.LatestResult?.CompleteMessage ?? 'Unknown error'}`);
        }

        LogStatus(`ArchiveEngine: Created ArchiveRun ${run.ID}`);
        return run;
    }

    /**
     * Updates the ArchiveRun record with final totals and completion status.
     */
    private async finalizeArchiveRun(
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
    private async initializeStorage(config: BaseEntity, contextUser: UserInfo): Promise<ArchiveStorageManager> {
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
    private async processAllEntities(
        configEntities: MJArchiveConfigurationEntityEntity[],
        config: MJArchiveConfigurationEntity,
        archiveRun: BaseEntity,
        storageManager: ArchiveStorageManager | null,
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
    // Purge Validation
    // ========================================

    /**
     * Returns why a Purge configuration cannot run, or null when it can (Store
     * configurations always can). A purge keeps no copy, so every entity must change
     * its source rows, must not copy the old values into Record Changes (also for every
     * entity its HardDelete cascade reaches), and must use a registered driver that
     * supports purging. One blocked entity refuses the whole run.
     */
    private findPurgeBlocker(
        config: MJArchiveConfigurationEntity,
        configEntities: MJArchiveConfigurationEntityEntity[]
    ): string | null {
        if (!IsPurgeStorageMode(config.StorageMode)) {
            return null;
        }
        for (const configEntity of configEntities) {
            const blocker = this.findEntityPurgeBlocker(config, configEntity);
            if (blocker) {
                return blocker;
            }
        }
        return null;
    }

    /**
     * Returns why one entity configuration cannot be purged, or null when it can.
     * Checks run in order: metadata, ArchiveOnly mode, Record Changes tracking, driver
     * registration, driver purge support, and (for HardDelete) the delete cascade.
     */
    private findEntityPurgeBlocker(
        config: MJArchiveConfigurationEntity,
        configEntity: MJArchiveConfigurationEntityEntity
    ): string | null {
        const entityName = configEntity.Entity;
        const entityInfo = this.Provider.EntityByName(entityName);
        if (!entityInfo) {
            return `Entity "${entityName}" was not found in metadata`;
        }
        const mode = configEntity.Mode ?? config.DefaultMode;
        if (mode === 'ArchiveOnly') {
            return `Entity "${entityName}" uses ArchiveOnly mode, which changes nothing when StorageMode is Purge. Use StripFields or HardDelete.`;
        }
        if (entityInfo.TrackRecordChanges) {
            return `Entity "${entityName}" tracks Record Changes, so purging it would copy the cleared values into Record Changes. Turn off TrackRecordChanges for the entity or use StorageMode Store.`;
        }

        const driver = ResolveArchiveDriver(configEntity.DriverClass);
        if (!driver) {
            return `Archive driver "${configEntity.DriverClass}" for entity "${entityName}" is not registered. Register the driver class or clear DriverClass to use the default driver.`;
        }
        if (!driver.SupportsPurge) {
            return `The archive driver for entity "${entityName}" does not support StorageMode Purge.`;
        }

        return mode === 'HardDelete' ? this.findCascadeBlocker(entityInfo) : null;
    }

    /**
     * Returns why a HardDelete purge of the entity cannot run because of its delete
     * cascade, or null when no entity the cascade reaches tracks Record Changes.
     */
    private findCascadeBlocker(entityInfo: EntityInfo): string | null {
        const found = this.findTrackedCascadeEntity(entityInfo);
        if (!found) {
            return null;
        }
        const prefix = `Entity "${entityInfo.Name}" cannot be purged with HardDelete: dependent entity "${found.Name}"`;
        if (!found.Info) {
            return `${prefix} was not found in metadata, so its rows cannot be checked before they are deleted.`;
        }
        return `${prefix} tracks Record Changes, so deleting it would copy its rows into Record Changes. Turn off TrackRecordChanges for the dependent entity, use Mode StripFields, or use StorageMode Store.`;
    }

    /**
     * Walks the HardDelete cascade of the entity (the same One To Many relationships the
     * default driver deletes, excluding self references) and returns the first reachable
     * entity that tracks Record Changes or that is missing from metadata, or null.
     */
    private findTrackedCascadeEntity(entityInfo: EntityInfo, visited: Set<string> = new Set<string>()): CascadeEntityMatch | null {
        visited.add(entityInfo.ID);
        const cascadeRels = entityInfo.RelatedEntities.filter(r =>
            r.Type?.trim() === 'One To Many' && r.RelatedEntityID !== entityInfo.ID
        );
        for (const rel of cascadeRels) {
            if (!rel.RelatedEntity || !rel.RelatedEntityJoinField || visited.has(rel.RelatedEntityID)) {
                continue;
            }
            const child = this.Provider.EntityByName(rel.RelatedEntity);
            if (!child) {
                return { Name: rel.RelatedEntity, Info: null };
            }
            if (child.TrackRecordChanges) {
                return { Name: child.Name, Info: child };
            }
            const deeper = this.findTrackedCascadeEntity(child, visited);
            if (deeper) {
                return deeper;
            }
        }
        return null;
    }

    // ========================================
    // Helpers
    // ========================================

    /**
     * Builds a failure ArchiveRunResult with zero counts.
     */
    private buildFailureResult(archiveRunId: string, errorMessage: string): ArchiveRunResult {
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

/**
 * Internal type for an entity found in a HardDelete cascade: Info is null when the
 * entity is missing from metadata.
 */
interface CascadeEntityMatch {
    Name: string;
    Info: EntityInfo | null;
}
