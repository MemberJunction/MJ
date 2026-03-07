import { CompositeKey, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationRunEntity,
    MJCompanyIntegrationRunDetailEntity,
    MJCompanyIntegrationRecordMapEntity,
    MJIntegrationEntity,
} from '@memberjunction/core-entities';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
} from './entity-types.js';
import type {
    SyncResult,
    MappedRecord,
    SyncTriggerType,
    SyncProgress,
    OnProgressCallback,
    OnNotificationCallback,
    SyncNotification,
    WatermarkType,
} from './types.js';
import { ClassifyError } from './types.js';
import { ConnectorFactory } from './ConnectorFactory.js';
import { FieldMappingEngine } from './FieldMappingEngine.js';
import { MatchEngine } from './MatchEngine.js';
import { WatermarkService } from './WatermarkService.js';
import type { BaseIntegrationConnector, FetchContext } from './BaseIntegrationConnector.js';

/** Default batch size for fetching records from external systems */
const DEFAULT_BATCH_SIZE = 200;

/**
 * Top-level orchestrator that runs an end-to-end integration sync.
 * Coordinates connector, field mapping, match resolution, and entity persistence.
 */
export class IntegrationOrchestrator {
    private readonly fieldMappingEngine = new FieldMappingEngine();
    private readonly matchEngine = new MatchEngine();
    private readonly watermarkService = new WatermarkService();

    /** In-process lock map to prevent concurrent syncs for the same CompanyIntegration */
    private static readonly activeSyncs = new Map<string, Promise<SyncResult>>();

    /** Configurable maximum batch size. Connector batches exceeding this are truncated. */
    public MaxBatchSize: number = DEFAULT_BATCH_SIZE;

    /**
     * Executes a full sync run for a company integration.
     * If a sync is already running for the same integration, waits for it to finish
     * and returns the existing result (concurrency lock).
     *
     * @param companyIntegrationID - ID of the CompanyIntegration to sync
     * @param contextUser - User context for all data operations
     * @param triggerType - What triggered this sync (defaults to 'Manual')
     * @param onProgress - Optional callback invoked with progress updates during sync
     * @param onNotification - Optional callback invoked with a notification when the sync completes or fails
     * @returns Aggregate sync result with record counts and errors
     */
    public async RunSync(
        companyIntegrationID: string,
        contextUser: UserInfo,
        triggerType: SyncTriggerType = 'Manual',
        onProgress?: OnProgressCallback,
        onNotification?: OnNotificationCallback
    ): Promise<SyncResult> {
        const lockKey = companyIntegrationID.toLowerCase();
        const existing = IntegrationOrchestrator.activeSyncs.get(lockKey);
        if (existing) {
            console.warn(`[IntegrationOrchestrator] Sync already running for ${lockKey}, waiting...`);
            return existing;
        }

        const syncPromise = this.executeSyncInternal(
            companyIntegrationID, contextUser, triggerType, onProgress, onNotification
        );
        IntegrationOrchestrator.activeSyncs.set(lockKey, syncPromise);
        try {
            return await syncPromise;
        } finally {
            IntegrationOrchestrator.activeSyncs.delete(lockKey);
        }
    }

    /**
     * Internal sync execution method. Contains the full orchestration logic.
     */
    private async executeSyncInternal(
        companyIntegrationID: string,
        contextUser: UserInfo,
        triggerType: SyncTriggerType,
        onProgress?: OnProgressCallback,
        onNotification?: OnNotificationCallback
    ): Promise<SyncResult> {
        const config = await this.LoadRunConfiguration(companyIntegrationID, contextUser);
        const run = await this.CreateRunRecord(config.companyIntegration, triggerType, contextUser);

        try {
            const result = await this.ExecuteEntityMaps(config, run, contextUser, onProgress);
            await this.FinalizeRun(run, result, contextUser, onNotification);
            return result;
        } catch (err) {
            await this.FailRun(run, err, contextUser, onNotification);
            throw err;
        }
    }

    /**
     * Loads all configuration needed for a sync run.
     */
    private async LoadRunConfiguration(
        companyIntegrationID: string,
        contextUser: UserInfo
    ): Promise<RunConfiguration> {
        const rv = new RunView();

        const [ciResult, entityMapsResult, integrationsResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Company Integrations',
                ExtraFilter: `ID='${companyIntegrationID}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: Company Integration Entity Maps',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND SyncEnabled=1 AND Status='Active'`,
                OrderBy: 'Priority ASC',
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: Integrations',
                ExtraFilter: '',
                ResultType: 'entity_object',
            },
        ], contextUser);

        const companyIntegration = (ciResult.Results as MJCompanyIntegrationEntity[])[0];
        if (!companyIntegration) {
            throw new Error(`CompanyIntegration not found: ${companyIntegrationID}`);
        }

        const integration = (integrationsResult.Results as MJIntegrationEntity[])
            .find(i => i.Get('ID') === companyIntegration.IntegrationID);
        if (!integration) {
            throw new Error(`Integration not found for CompanyIntegration: ${companyIntegrationID}`);
        }

        const connector = ConnectorFactory.Resolve(integration);

        return {
            companyIntegration,
            entityMaps: entityMapsResult.Results as ICompanyIntegrationEntityMap[],
            integration,
            connector,
        };
    }

    /**
     * Creates a new CompanyIntegrationRun record to track this sync.
     */
    private async CreateRunRecord(
        companyIntegration: MJCompanyIntegrationEntity,
        triggerType: SyncTriggerType,
        contextUser: UserInfo
    ): Promise<MJCompanyIntegrationRunEntity> {
        const md = new Metadata();
        const run = await md.GetEntityObject<MJCompanyIntegrationRunEntity>(
            'MJ: Company Integration Runs',
            contextUser
        );
        run.NewRecord();
        run.CompanyIntegrationID = companyIntegration.Get('ID');
        run.RunByUserID = contextUser.ID;
        run.StartedAt = new Date();
        run.Status = 'In Progress';
        run.TotalRecords = 0;
        run.ConfigData = JSON.stringify({ triggerType });

        const saved = await run.Save();
        if (!saved) {
            throw new Error('Failed to create CompanyIntegrationRun record');
        }
        return run;
    }

    /**
     * Processes all entity maps, aggregating results with progress tracking.
     */
    private async ExecuteEntityMaps(
        config: RunConfiguration,
        run: MJCompanyIntegrationRunEntity,
        contextUser: UserInfo,
        onProgress?: OnProgressCallback
    ): Promise<SyncResult> {
        const aggregate: SyncResult = {
            Success: true,
            RecordsProcessed: 0,
            RecordsCreated: 0,
            RecordsUpdated: 0,
            RecordsDeleted: 0,
            RecordsErrored: 0,
            RecordsSkipped: 0,
            Errors: [],
        };

        const totalMaps = config.entityMaps.length;

        for (let i = 0; i < totalMaps; i++) {
            const entityMap = config.entityMaps[i];
            try {
                const mapResult = await this.ProcessSingleEntityMap(
                    config, entityMap, run, contextUser, i, totalMaps, onProgress
                );
                this.MergeResult(aggregate, mapResult);
            } catch (err) {
                const objName = entityMap.ExternalObjectName ?? String(entityMap.Get('ID'));
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[IntegrationOrchestrator] Entity map '${objName}' failed: ${errMsg}`);
                aggregate.RecordsErrored++;
                aggregate.Errors.push({
                    ExternalID: objName,
                    ChangeType: 'Skip',
                    ErrorMessage: errMsg,
                    ErrorCode: 'CONNECTOR_ERROR',
                    Severity: 'Critical',
                    ExternalRecord: { ExternalID: objName, ObjectType: objName, Fields: {} },
                });
            }
        }

        return aggregate;
    }

    /**
     * Processes a single entity map: fetch → map → match → validate → apply.
     */
    private async ProcessSingleEntityMap(
        config: RunConfiguration,
        entityMap: ICompanyIntegrationEntityMap,
        run: MJCompanyIntegrationRunEntity,
        contextUser: UserInfo,
        entityMapIndex: number,
        totalEntityMaps: number,
        onProgress?: OnProgressCallback
    ): Promise<SyncResult> {
        const entityMapID = entityMap.Get('ID') as string;
        const fieldMaps = await this.LoadFieldMaps(entityMapID, contextUser);
        const watermark = await this.watermarkService.Load(entityMapID, contextUser);

        // A6: Validate watermark before using it
        let initialWatermark = watermark?.WatermarkValue ?? null;
        if (initialWatermark && watermark) {
            const watermarkType = (watermark.WatermarkType ?? 'Timestamp') as WatermarkType;
            if (!this.watermarkService.ValidateWatermark(initialWatermark, watermarkType)) {
                console.warn(
                    `[IntegrationOrchestrator] Invalid watermark '${initialWatermark}' for EntityMap ${entityMap.Get('ID')}, resetting to full fetch`
                );
                initialWatermark = null;
            }
        }

        const result: SyncResult = {
            Success: true,
            RecordsProcessed: 0,
            RecordsCreated: 0,
            RecordsUpdated: 0,
            RecordsDeleted: 0,
            RecordsErrored: 0,
            RecordsSkipped: 0,
            Errors: [],
        };

        let hasMore = true;
        let currentWatermark = initialWatermark;
        let recordsInMap = 0;

        while (hasMore) {
            const ctx: FetchContext = {
                CompanyIntegration: config.companyIntegration,
                ObjectName: entityMap.ExternalObjectName,
                WatermarkValue: currentWatermark,
                BatchSize: this.MaxBatchSize,
                ContextUser: contextUser,
            };

            const batch = await config.connector.FetchChanges(ctx);

            // A7: Batch size enforcement — truncate if connector returns more than MaxBatchSize
            let batchRecords = batch.Records;
            if (batchRecords.length > this.MaxBatchSize) {
                console.warn(
                    `[IntegrationOrchestrator] Connector returned ${batchRecords.length} records, exceeding MaxBatchSize of ${this.MaxBatchSize}. Truncating.`
                );
                batchRecords = batchRecords.slice(0, this.MaxBatchSize);
            }

            const mapped = this.fieldMappingEngine.Apply(
                batchRecords, fieldMaps, entityMap.Entity
            );
            const resolved = await this.matchEngine.Resolve(
                mapped, entityMap, fieldMaps, contextUser
            );

            await this.ApplyRecords(resolved, config.companyIntegration, entityMap, result, contextUser);

            recordsInMap += batchRecords.length;

            // A8: Progress tracking
            if (onProgress) {
                this.emitProgress(onProgress, entityMapIndex, totalEntityMaps, recordsInMap, recordsInMap);
            }

            if (batch.NewWatermarkValue) {
                currentWatermark = batch.NewWatermarkValue;
            }
            hasMore = batch.HasMore;
        }

        if (currentWatermark) {
            await this.watermarkService.Update(entityMapID, currentWatermark, contextUser);
            result.WatermarkAfter = currentWatermark;
        }

        await this.CreateRunDetail(run, entityMap, result, contextUser);
        return result;
    }

    /**
     * Emits a progress update via the callback.
     */
    private emitProgress(
        onProgress: OnProgressCallback,
        entityMapIndex: number,
        totalEntityMaps: number,
        processedInMap: number,
        totalInMap: number
    ): void {
        const mapProgress = totalEntityMaps > 0 ? entityMapIndex / totalEntityMaps : 0;
        const inMapProgress = totalInMap > 0 ? processedInMap / totalInMap : 0;
        const overallPercent = Math.round((mapProgress + inMapProgress / totalEntityMaps) * 100);

        const progress: SyncProgress = {
            EntityMapIndex: entityMapIndex,
            TotalEntityMaps: totalEntityMaps,
            RecordsProcessedInCurrentMap: processedInMap,
            TotalRecordsInCurrentMap: totalInMap,
            PercentComplete: Math.min(overallPercent, 100),
        };
        onProgress(progress);
    }

    /**
     * Loads active field maps for a given entity map.
     */
    private async LoadFieldMaps(
        entityMapID: string,
        contextUser: UserInfo
    ): Promise<ICompanyIntegrationFieldMap[]> {
        const rv = new RunView();
        const result = await rv.RunView<ICompanyIntegrationFieldMap>({
            EntityName: 'MJ: Company Integration Field Maps',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Status='Active'`,
            OrderBy: 'Priority ASC',
            ResultType: 'entity_object',
        }, contextUser);

        return result.Success ? result.Results : [];
    }

    /**
     * Applies resolved records to MJ, handling each individually for error isolation.
     */
    private async ApplyRecords(
        records: MappedRecord[],
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo
    ): Promise<void> {
        for (const record of records) {
            result.RecordsProcessed++;
            try {
                await this.ApplySingleRecord(record, companyIntegration, entityMap, result, contextUser);
            } catch (err) {
                const classified = ClassifyError(err);
                result.RecordsErrored++;
                result.Errors.push({
                    ExternalID: record.ExternalRecord.ExternalID,
                    ChangeType: record.ChangeType,
                    ErrorMessage: err instanceof Error ? err.message : String(err),
                    ErrorCode: classified.Code,
                    Severity: classified.Severity,
                    ExternalRecord: record.ExternalRecord,
                });
            }
        }
    }

    /**
     * Applies a single record change (Create, Update, Delete, or Skip).
     */
    private async ApplySingleRecord(
        record: MappedRecord,
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo
    ): Promise<void> {
        switch (record.ChangeType) {
            case 'Create':
                await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
                result.RecordsCreated++;
                break;
            case 'Update':
                await this.UpdateRecord(record, contextUser);
                result.RecordsUpdated++;
                break;
            case 'Delete':
                await this.DeleteRecord(record, entityMap, contextUser);
                result.RecordsDeleted++;
                break;
            case 'Skip':
                result.RecordsSkipped++;
                break;
        }
    }

    /**
     * Creates a new MJ record with pre-write validation and saves a record map entry.
     */
    private async CreateRecord(
        record: MappedRecord,
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        entity.NewRecord();
        this.SetEntityFields(entity, record.MappedFields);
        this.SetStandardIntegrationFields(entity, record);

        // A5: Pre-write validation
        this.validateEntity(entity, record.MJEntityName);

        const saved = await entity.Save();
        if (!saved) {
            throw new Error(`Failed to create ${record.MJEntityName} record`);
        }

        // Use the external ID as the entity record identifier in the record map
        await this.SaveRecordMap(
            companyIntegration.Get('ID'),
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            record.ExternalRecord.ExternalID,
            contextUser
        );
    }

    /**
     * Updates an existing MJ record with pre-write validation.
     */
    private async UpdateRecord(
        record: MappedRecord,
        contextUser: UserInfo
    ): Promise<void> {
        if (!record.MatchedMJRecordID) {
            throw new Error('Cannot update record without MatchedMJRecordID');
        }

        const md = new Metadata();
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        // Use the entity's actual PK field (SourceRecordID for integration tables, ID for __mj targets)
        const entityInfo = md.Entities.find(e => e.Name === record.MJEntityName);
        const pkFieldName = entityInfo?.FirstPrimaryKey?.Name ?? 'ID';
        const loaded = await entity.InnerLoad(this.BuildCompositeKey(record.MatchedMJRecordID, pkFieldName));
        if (!loaded) {
            throw new Error(`Failed to load ${record.MJEntityName} record ${record.MatchedMJRecordID}`);
        }

        this.SetEntityFields(entity, record.MappedFields);
        this.SetStandardIntegrationFields(entity, record);

        // A5: Pre-write validation
        this.validateEntity(entity, record.MJEntityName);

        const saved = await entity.Save();
        if (!saved) {
            throw new Error(`Failed to update ${record.MJEntityName} record ${record.MatchedMJRecordID}`);
        }
    }

    /**
     * Runs Validate() on an entity if the method exists.
     * Throws a validation error with details if validation fails.
     */
    private validateEntity(
        entity: { Validate?: () => ValidationResult | null },
        entityName: string
    ): void {
        if (typeof entity.Validate !== 'function') return;

        const validationResult = entity.Validate();
        if (validationResult && !validationResult.Success) {
            const messages = validationResult.Errors?.map(e => e.Message).join('; ') ?? 'Validation failed';
            throw new Error(`Validation failed for ${entityName}: ${messages}`);
        }
    }

    /**
     * Deletes (or soft-deletes) an MJ record based on the entity map's DeleteBehavior.
     */
    private async DeleteRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo
    ): Promise<void> {
        if (!record.MatchedMJRecordID) {
            throw new Error('Cannot delete record without MatchedMJRecordID');
        }

        if (entityMap.DeleteBehavior === 'DoNothing') return;

        const md = new Metadata();
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        const entityInfo = md.Entities.find(e => e.Name === record.MJEntityName);
        const pkFieldName = entityInfo?.FirstPrimaryKey?.Name ?? 'ID';
        const loaded = await entity.InnerLoad(this.BuildCompositeKey(record.MatchedMJRecordID, pkFieldName));
        if (!loaded) {
            throw new Error(`Failed to load ${record.MJEntityName} for deletion: ${record.MatchedMJRecordID}`);
        }

        const deleted = await entity.Delete();
        if (!deleted) {
            throw new Error(`Failed to delete ${record.MJEntityName} record ${record.MatchedMJRecordID}`);
        }
    }

    /**
     * Builds a CompositeKey for a record lookup.
     * Integration tables use the natural PK field from the source system.
     */
    private BuildCompositeKey(id: string, fieldName: string = 'ID'): CompositeKey {
        const key = new CompositeKey();
        key.KeyValuePairs.push({ FieldName: fieldName, Value: id });
        return key;
    }

    /**
     * Sets fields on a BaseEntity instance from a field value map.
     */
    private SetEntityFields(
        entity: { Set(fieldName: string, value: unknown): void },
        fields: Record<string, unknown>
    ): void {
        for (const [fieldName, value] of Object.entries(fields)) {
            entity.Set(fieldName, value);
        }
    }

    /**
     * Sets standard integration columns (__mj_integration_*) on target entities.
     * Silently skips if the entity doesn't have these columns (e.g., __mj targets).
     */
    private SetStandardIntegrationFields(
        entity: { Set(fieldName: string, value: unknown): void; Fields?: Array<{ Name: string }> },
        _record: MappedRecord
    ): void {
        const fieldNames = entity.Fields?.map(f => f.Name) ?? [];
        const hasField = (name: string) => fieldNames.includes(name);

        if (hasField('__mj_integration_LastSyncedAt')) {
            entity.Set('__mj_integration_LastSyncedAt', new Date().toISOString());
        }
        if (hasField('__mj_integration_SyncStatus')) {
            entity.Set('__mj_integration_SyncStatus', 'Active');
        }
    }

    /**
     * Creates or updates a CompanyIntegrationRecordMap entry to track the external↔MJ mapping.
     */
    private async SaveRecordMap(
        companyIntegrationID: string,
        externalID: string,
        entityID: string,
        entityRecordID: string,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();
        const recordMap = await md.GetEntityObject<MJCompanyIntegrationRecordMapEntity>(
            'MJ: Company Integration Record Maps',
            contextUser
        );
        recordMap.NewRecord();
        recordMap.CompanyIntegrationID = companyIntegrationID;
        recordMap.ExternalSystemRecordID = externalID;
        recordMap.EntityID = entityID;
        recordMap.EntityRecordID = entityRecordID;

        const saved = await recordMap.Save();
        if (!saved) {
            throw new Error(`Failed to save record map for external ID: ${externalID}`);
        }
    }

    /**
     * Creates a CompanyIntegrationRunDetail record for audit/reporting.
     */
    private async CreateRunDetail(
        run: MJCompanyIntegrationRunEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();
        const detail = await md.GetEntityObject<MJCompanyIntegrationRunDetailEntity>(
            'MJ: Company Integration Run Details',
            contextUser
        );
        detail.NewRecord();
        detail.CompanyIntegrationRunID = run.Get('ID');
        detail.EntityID = entityMap.EntityID;
        detail.RecordID = `Processed:${result.RecordsProcessed}`;
        detail.Action = result.RecordsCreated > 0 ? 'INSERT' : 'UPDATE';
        detail.IsSuccess = result.RecordsErrored === 0;

        await detail.Save();
    }

    /**
     * Merges an entity-map-level result into the aggregate result.
     */
    private MergeResult(aggregate: SyncResult, mapResult: SyncResult): void {
        aggregate.RecordsProcessed += mapResult.RecordsProcessed;
        aggregate.RecordsCreated += mapResult.RecordsCreated;
        aggregate.RecordsUpdated += mapResult.RecordsUpdated;
        aggregate.RecordsDeleted += mapResult.RecordsDeleted;
        aggregate.RecordsErrored += mapResult.RecordsErrored;
        aggregate.RecordsSkipped += mapResult.RecordsSkipped;
        aggregate.Errors.push(...mapResult.Errors);

        if (mapResult.RecordsErrored > 0) {
            aggregate.Success = false;
        }
    }

    /**
     * Finalizes a successful run with aggregate totals and emits a completion notification.
     */
    private async FinalizeRun(
        run: MJCompanyIntegrationRunEntity,
        result: SyncResult,
        _contextUser: UserInfo,
        onNotification?: OnNotificationCallback
    ): Promise<void> {
        run.EndedAt = new Date();
        run.TotalRecords = result.RecordsProcessed;
        run.Status = result.RecordsErrored > 0 ? 'Failed' : 'Success';
        if (result.Errors.length > 0) {
            run.ErrorLog = JSON.stringify(result.Errors.slice(0, 100));
        }
        await run.Save();

        if (onNotification) {
            const notification = this.buildCompletionNotification(run, result);
            this.safeNotify(onNotification, notification);
        }
    }

    /**
     * Marks a run as failed after an unrecoverable error and emits a failure notification.
     */
    private async FailRun(
        run: MJCompanyIntegrationRunEntity,
        err: unknown,
        _contextUser: UserInfo,
        onNotification?: OnNotificationCallback
    ): Promise<void> {
        run.EndedAt = new Date();
        run.Status = 'Failed';
        run.ErrorLog = err instanceof Error ? err.message : String(err);
        await run.Save();

        if (onNotification) {
            const failResult: SyncResult = {
                Success: false,
                RecordsProcessed: 0,
                RecordsCreated: 0,
                RecordsUpdated: 0,
                RecordsDeleted: 0,
                RecordsErrored: 0,
                RecordsSkipped: 0,
                Errors: [],
            };
            const notification = this.buildFailureNotification(run, err, failResult);
            this.safeNotify(onNotification, notification);
        }
    }

    /**
     * Builds a SyncNotification for a completed run (success or completed-with-errors).
     */
    private buildCompletionNotification(
        run: MJCompanyIntegrationRunEntity,
        result: SyncResult
    ): SyncNotification {
        const hasErrors = result.RecordsErrored > 0;
        const event = hasErrors ? 'SyncCompletedWithErrors' : 'SyncCompleted';
        const severity = hasErrors ? 'Warning' : 'Info';
        const integrationName = run.Get('Integration') ?? 'Unknown Integration';
        const subject = hasErrors
            ? `Integration Sync Completed with Errors: ${integrationName}`
            : `Integration Sync Completed: ${integrationName}`;

        const body = this.buildSyncResultBody(integrationName, result);

        return {
            Event: event,
            Severity: severity,
            CompanyIntegrationID: run.CompanyIntegrationID,
            RunID: run.Get('ID') as string,
            Subject: subject,
            Body: body,
            Result: result,
            OccurredAt: new Date(),
        };
    }

    /**
     * Builds a SyncNotification for a catastrophically failed run.
     */
    private buildFailureNotification(
        run: MJCompanyIntegrationRunEntity,
        err: unknown,
        result: SyncResult
    ): SyncNotification {
        const integrationName = run.Get('Integration') ?? 'Unknown Integration';
        const errorMessage = err instanceof Error ? err.message : String(err);
        const subject = `Integration Sync Failed: ${integrationName}`;
        const body = [
            `Integration: ${integrationName}`,
            `Status: Failed`,
            `Error: ${errorMessage}`,
            `Time: ${new Date().toISOString()}`,
        ].join('\n');

        return {
            Event: 'SyncFailed',
            Severity: 'Error',
            CompanyIntegrationID: run.CompanyIntegrationID,
            RunID: run.Get('ID') as string,
            Subject: subject,
            Body: body,
            Result: result,
            OccurredAt: new Date(),
        };
    }

    /**
     * Formats a human-readable sync result body for notification messages.
     */
    private buildSyncResultBody(integrationName: string, result: SyncResult): string {
        const lines = [
            `Integration: ${integrationName}`,
            `Status: ${result.RecordsErrored > 0 ? 'Completed with errors' : 'Success'}`,
            '',
            'Record Counts:',
            `  Processed:  ${result.RecordsProcessed}`,
            `  Created:    ${result.RecordsCreated}`,
            `  Updated:    ${result.RecordsUpdated}`,
            `  Deleted:    ${result.RecordsDeleted}`,
            `  Skipped:    ${result.RecordsSkipped}`,
        ];
        if (result.RecordsErrored > 0) {
            lines.push(`  Errors:     ${result.RecordsErrored}`);
            if (result.Errors.length > 0) {
                lines.push('', 'Error Summary (first 5):');
                for (const e of result.Errors.slice(0, 5)) {
                    lines.push(`  [${e.ErrorCode}] ${e.ExternalID}: ${e.ErrorMessage}`);
                }
            }
        }
        lines.push('', `Completed at: ${new Date().toISOString()}`);
        return lines.join('\n');
    }

    /**
     * Invokes the notification callback without propagating exceptions.
     */
    private safeNotify(callback: OnNotificationCallback, notification: SyncNotification): void {
        try {
            callback(notification);
        } catch (notifyErr) {
            console.warn('[IntegrationOrchestrator] Notification callback threw:', notifyErr);
        }
    }
}

/** Internal configuration bundle for a sync run */
interface RunConfiguration {
    companyIntegration: MJCompanyIntegrationEntity;
    entityMaps: ICompanyIntegrationEntityMap[];
    integration: MJIntegrationEntity;
    connector: BaseIntegrationConnector;
}

/** Shape of a validation result from BaseEntity.Validate() */
interface ValidationResult {
    Success: boolean;
    Errors?: ValidationError[];
}

/** Shape of a single validation error */
interface ValidationError {
    Message: string;
}
