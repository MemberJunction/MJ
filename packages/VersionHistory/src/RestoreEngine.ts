import {
    BaseEntity,
    CompositeKey,
    EntityInfo,
    Metadata,
    RunView,
    UserInfo,
    LogError,
    LogStatus,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJVersionLabelEntity,
    MJVersionLabelItemEntityType,
    MJVersionLabelRestoreEntity,
} from '@memberjunction/core-entities';
import {
    RestoreItemResult,
    RestoreOptions,
    RestoreResult,
    RestoreStatus,
    VersionLabelScope,
} from './types';
import { LabelManager } from './LabelManager';
import { SnapshotBuilder } from './SnapshotBuilder';
import {
    ENTITY_VERSION_LABEL_ITEMS,
    ENTITY_VERSION_LABEL_RESTORES,
    ENTITY_VERSION_LABELS,
    sqlEquals,
    sqlNotIn,
    loadRecordChangeSnapshot,
    loadEntityById,
    buildPrimaryKeyForLoad,
} from './constants';

/** Batch size for progress update writes — only persist every N items. */
const PROGRESS_UPDATE_INTERVAL = 10;

/**
 * Restores records to the state captured by a version label.
 *
 * Key behaviors:
 * - Automatically creates a "Pre-Restore" safety label before making changes
 * - Restores in topological order (parents before children) based on entity
 *   relationships to maintain referential integrity
 * - Tracks progress and errors in a VersionLabelRestore audit record
 * - Supports dry-run mode for previewing changes without applying them
 */
export class RestoreEngine {
    private LabelMgr = new LabelManager();
    private SnapshotBldr = new SnapshotBuilder();

    /**
     * Restore records to the state captured by a version label.
     */
    public async RestoreToLabel(
        labelId: string,
        options: RestoreOptions,
        contextUser: UserInfo
    ): Promise<RestoreResult> {
        const resolvedOptions = this.resolveDefaults(options);

        // Load the target label
        const label = await loadEntityById<MJVersionLabelEntity>(ENTITY_VERSION_LABELS, labelId, contextUser);
        if (!label) throw new Error(`Version label '${labelId}' not found`);

        const labelName = label.Name;
        const labelScope = label.Scope;
        LogStatus(`VersionHistory: Starting restore to label '${labelName}' (${labelId})`);

        // Load all label items to restore
        const items = await this.loadLabelItems(labelId, resolvedOptions, contextUser);
        if (items.length === 0) {
            LogStatus('VersionHistory: No items to restore');
            return this.emptyResult(resolvedOptions.DryRun);
        }

        // Create pre-restore safety label
        let preRestoreLabelId: string | null = null;
        if (resolvedOptions.CreatePreRestoreLabel && !resolvedOptions.DryRun) {
            preRestoreLabelId = await this.createPreRestoreLabel(labelName, labelScope, items, contextUser);
        }

        // Create the restore audit record
        let restoreAuditId: string | null = null;
        if (!resolvedOptions.DryRun) {
            restoreAuditId = await this.createRestoreAuditRecord(
                labelId,
                items.length,
                preRestoreLabelId,
                contextUser
            );
        }

        // Sort items by entity dependency order and process them
        const sortedItems = this.sortByDependencyOrder(items);
        const { details, restoredCount, failedCount, skippedCount } =
            await this.processRestoreItems(sortedItems, resolvedOptions.DryRun, restoreAuditId, contextUser);

        // Finalize the audit record
        const finalStatus = this.determineFinalStatus(restoredCount, failedCount, items.length);
        if (restoreAuditId && !resolvedOptions.DryRun) {
            await this.finalizeRestoreAudit(restoreAuditId, finalStatus, failedCount, details, contextUser);
        }

        // Mark the label as restored
        if (!resolvedOptions.DryRun && finalStatus !== 'Error') {
            await this.LabelMgr.MarkLabelRestored(labelId, contextUser);
        }

        LogStatus(`VersionHistory: Restore complete. ${restoredCount} restored, ${failedCount} failed, ${skippedCount} skipped.`);

        return {
            RestoreID: restoreAuditId ?? 'dry-run',
            PreRestoreLabelID: preRestoreLabelId,
            Status: finalStatus,
            RestoredCount: restoredCount,
            FailedCount: failedCount,
            SkippedCount: skippedCount,
            Details: details,
        };
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Process all restore items in order, tracking progress and updating the
     * audit record in batches.
     */
    private async processRestoreItems(
        sortedItems: MJVersionLabelItemEntityType[],
        dryRun: boolean,
        restoreAuditId: string | null,
        contextUser: UserInfo
    ): Promise<RestoreProgressTotals> {
        const details: RestoreItemResult[] = [];
        let restoredCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < sortedItems.length; i++) {
            const result = await this.restoreSingleItem(sortedItems[i], dryRun, contextUser);
            details.push(result);

            switch (result.Status) {
                case 'Restored':
                    restoredCount++;
                    break;
                case 'Failed':
                    failedCount++;
                    break;
                case 'Skipped':
                    skippedCount++;
                    break;
            }

            // Batch progress updates — only write every N items or on the last item
            const isLastItem = i === sortedItems.length - 1;
            const isBatchBoundary = (i + 1) % PROGRESS_UPDATE_INTERVAL === 0;
            if (restoreAuditId && !dryRun && (isBatchBoundary || isLastItem)) {
                await this.updateRestoreProgress(restoreAuditId, restoredCount, failedCount, contextUser);
            }
        }

        return { details, restoredCount, failedCount, skippedCount };
    }

    /**
     * Load all VersionLabelItems for a label, optionally filtered.
     */
    private async loadLabelItems(
        labelId: string,
        options: Required<RestoreOptions>,
        contextUser: UserInfo
    ): Promise<MJVersionLabelItemEntityType[]> {
        const rv = new RunView();

        let extraFilter = sqlEquals('VersionLabelID', labelId);

        // Apply entity exclusion
        if (options.SkipEntities && options.SkipEntities.length > 0) {
            const md = new Metadata();
            const excludeIds = options.SkipEntities
                .map(name => md.EntityByName(name)?.ID)
                .filter((id): id is string => id != null);
            if (excludeIds.length > 0) {
                extraFilter += ` AND ${sqlNotIn('EntityID', excludeIds)}`;
            }
        }

        const result = await rv.RunView<MJVersionLabelItemEntityType>({
            EntityName: ENTITY_VERSION_LABEL_ITEMS,
            ExtraFilter: extraFilter,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            LogError(`RestoreEngine: Failed to load label items: ${result.ErrorMessage}`);
            return [];
        }

        let items = result.Results;

        // Apply selected records filter
        if (options.Scope === 'Selected' && options.SelectedRecords && options.SelectedRecords.length > 0) {
            items = this.filterBySelectedRecords(items, options.SelectedRecords);
        }

        return items;
    }

    /**
     * Filter label items to only include those matching a set of selected records.
     */
    private filterBySelectedRecords(
        items: MJVersionLabelItemEntityType[],
        selectedRecords: Array<{ EntityName: string; RecordID: string }>
    ): MJVersionLabelItemEntityType[] {
        const selectedSet = new Set(
            selectedRecords.map(s => `${s.EntityName}::${s.RecordID}`)
        );
        const md = new Metadata();
        return items.filter(item => {
            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, item.EntityID));
            const entityName = entityInfo?.Name ?? '';
            return selectedSet.has(`${entityName}::${item.RecordID}`);
        });
    }

    /**
     * Sort label items by entity dependency order so parents are restored
     * before their children.
     */
    private sortByDependencyOrder(items: MJVersionLabelItemEntityType[]): MJVersionLabelItemEntityType[] {
        const md = new Metadata();

        // Build a map of entityId -> dependency level
        const levelMap = new Map<string, number>();
        const visited = new Set<string>();

        const computeLevel = (entityId: string): number => {
            if (levelMap.has(entityId)) return levelMap.get(entityId)!;
            if (visited.has(entityId)) return 0; // Cycle — break it
            visited.add(entityId);

            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityId));
            if (!entityInfo) {
                levelMap.set(entityId, 0);
                return 0;
            }

            // Find all FK fields pointing to other entities
            let maxParentLevel = -1;
            for (const field of entityInfo.Fields) {
                if (field.RelatedEntityID && !UUIDsEqual(field.RelatedEntityID, entityId)) {
                    const parentLevel = computeLevel(field.RelatedEntityID);
                    maxParentLevel = Math.max(maxParentLevel, parentLevel);
                }
            }

            const level = maxParentLevel + 1;
            levelMap.set(entityId, level);
            return level;
        };

        // Compute levels for all entities in the item set
        const entityIds = new Set(items.map(i => i.EntityID));
        for (const entityId of entityIds) {
            computeLevel(entityId);
        }

        // Sort: lower level (parents) first
        return [...items].sort((a, b) => {
            const levelA = levelMap.get(a.EntityID) ?? 0;
            const levelB = levelMap.get(b.EntityID) ?? 0;
            return levelA - levelB;
        });
    }

    /**
     * Restore a single record to its labeled state.
     */
    private async restoreSingleItem(
        item: MJVersionLabelItemEntityType,
        dryRun: boolean,
        contextUser: UserInfo
    ): Promise<RestoreItemResult> {
        const entityInfo = this.resolveEntityInfo(item.EntityID);
        if (!entityInfo) {
            return this.failedItemResult(`Unknown(${item.EntityID})`, item.RecordID,
                `Entity with ID '${item.EntityID}' not found in metadata`);
        }

        try {
            const snapshotData = await loadRecordChangeSnapshot(item.RecordChangeID, contextUser);
            if (!snapshotData) {
                return this.failedItemResult(entityInfo.Name, item.RecordID,
                    'Could not load snapshot from RecordChange');
            }

            if (dryRun) {
                return { EntityName: entityInfo.Name, RecordID: item.RecordID, Status: 'Restored' };
            }

            return await this.applyRestore(entityInfo, item.RecordID, snapshotData, contextUser);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`RestoreEngine: Error restoring ${entityInfo.Name}/${item.RecordID}: ${msg}`);
            return this.failedItemResult(entityInfo.Name, item.RecordID, msg);
        }
    }

    /**
     * Resolve entity metadata by ID.
     */
    private resolveEntityInfo(entityId: string): EntityInfo | null {
        const md = new Metadata();
        return md.Entities.find(e => UUIDsEqual(e.ID, entityId)) ?? null;
    }

    /**
     * Apply the snapshot data to an existing or new entity and save it.
     */
    private async applyRestore(
        entityInfo: EntityInfo,
        recordId: string,
        snapshotData: Record<string, unknown>,
        contextUser: UserInfo
    ): Promise<RestoreItemResult> {
        const entity = await this.loadOrCreateEntity(entityInfo, recordId, contextUser);
        if (!entity) {
            return this.failedItemResult(entityInfo.Name, recordId, 'Could not load entity for restore');
        }

        const changed = this.applySnapshotToEntity(entity, snapshotData, entityInfo);
        if (!changed) {
            return { EntityName: entityInfo.Name, RecordID: recordId, Status: 'Skipped' };
        }

        const saved = await entity.Save();
        if (!saved) {
            return this.failedItemResult(entityInfo.Name, recordId, 'Save failed');
        }

        return { EntityName: entityInfo.Name, RecordID: recordId, Status: 'Restored' };
    }

    /**
     * Build a failed RestoreItemResult.
     */
    private failedItemResult(entityName: string, recordId: string, errorMessage: string): RestoreItemResult {
        return { EntityName: entityName, RecordID: recordId, Status: 'Failed', ErrorMessage: errorMessage };
    }

    /**
     * Load an existing entity record, or create a new one if it doesn't exist.
     */
    private async loadOrCreateEntity(
        entityInfo: EntityInfo,
        recordId: string,
        contextUser: UserInfo
    ): Promise<BaseEntity | null> {
        const md = new Metadata();
        const entity = await md.GetEntityObject<BaseEntity>(entityInfo.Name, contextUser);

        // Try to load existing record using the entity's actual primary key
        try {
            const key = buildPrimaryKeyForLoad(entityInfo, recordId);
            const loaded = await entity.InnerLoad(key);
            if (loaded) return entity;
        } catch {
            // Record doesn't exist — fall through to create
        }

        // Record doesn't exist; return fresh entity for insert
        return await md.GetEntityObject<BaseEntity>(entityInfo.Name, contextUser);
    }

    /**
     * Apply snapshot data to an entity, setting each field from the snapshot.
     * Returns true if any field was changed.
     */
    private applySnapshotToEntity(
        entity: BaseEntity,
        snapshotData: Record<string, unknown>,
        entityInfo: EntityInfo
    ): boolean {
        let anyChanged = false;

        for (const field of entityInfo.Fields) {
            // Skip read-only, primary key, and system fields
            if (field.ReadOnly) continue;
            if (field.IsPrimaryKey) continue;
            if (field.Name.startsWith('__mj_')) continue;

            const snapshotValue = snapshotData[field.Name];
            if (snapshotValue === undefined) continue;

            const currentValue = entity.Get(field.Name);
            if (!this.valuesDiffer(currentValue, snapshotValue)) continue;

            entity.Set(field.Name, snapshotValue);
            anyChanged = true;
        }

        return anyChanged;
    }

    /**
     * Check if two values are meaningfully different.
     */
    private valuesDiffer(a: unknown, b: unknown): boolean {
        if (a === b) return false;
        if (a == null && b == null) return false;
        return String(a) !== String(b);
    }

    /**
     * Create a "Pre-Restore" safety label capturing current state of all
     * records that will be affected by the restore.
     */
    private async createPreRestoreLabel(
        targetLabelName: string,
        targetLabelScope: VersionLabelScope,
        items: MJVersionLabelItemEntityType[],
        contextUser: UserInfo
    ): Promise<string> {
        const label = await this.LabelMgr.CreateLabel({
            Name: `Pre-Restore: ${targetLabelName} (${new Date().toISOString()})`,
            Description: `Automatic safety snapshot created before restoring to label '${targetLabelName}'`,
            Scope: targetLabelScope,
        }, contextUser);

        const preRestoreLabelId = label.ID;
        const md = new Metadata();

        // Capture current state of each record that will be restored
        for (const item of items) {
            const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, item.EntityID));
            if (!entityInfo) continue;

            const key = new CompositeKey([{
                FieldName: entityInfo.FirstPrimaryKey.Name,
                Value: item.RecordID,
            }]);

            await this.SnapshotBldr.CaptureRecord(
                preRestoreLabelId,
                entityInfo.Name,
                key,
                false, // Don't walk dependencies — we already have the full item list
                {},
                contextUser
            );
        }

        LogStatus(`VersionHistory: Created pre-restore safety label (${preRestoreLabelId})`);
        return preRestoreLabelId;
    }

    /**
     * Create a VersionLabelRestore audit record.
     */
    private async createRestoreAuditRecord(
        labelId: string,
        totalItems: number,
        preRestoreLabelId: string | null,
        contextUser: UserInfo
    ): Promise<string> {
        const md = new Metadata();
        const restore = await md.GetEntityObject<MJVersionLabelRestoreEntity>(ENTITY_VERSION_LABEL_RESTORES, contextUser);

        restore.VersionLabelID = labelId;
        restore.Status = 'In Progress';
        restore.UserID = contextUser.ID;
        restore.TotalItems = totalItems;
        restore.CompletedItems = 0;
        restore.FailedItems = 0;
        if (preRestoreLabelId) {
            restore.PreRestoreLabelID = preRestoreLabelId;
        }

        const saved = await restore.Save();
        if (!saved) {
            throw new Error('Failed to create restore audit record');
        }

        return restore.ID;
    }

    /**
     * Update restore progress counters.
     */
    private async updateRestoreProgress(
        restoreId: string,
        completedItems: number,
        failedItems: number,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const restore = await loadEntityById<MJVersionLabelRestoreEntity>(ENTITY_VERSION_LABEL_RESTORES, restoreId, contextUser);
            if (!restore) return;

            restore.CompletedItems = completedItems;
            restore.FailedItems = failedItems;
            await restore.Save();
        } catch (e: unknown) {
            // Non-critical — progress update failure shouldn't stop the restore
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`RestoreEngine: Failed to update restore progress for ${restoreId}: ${msg}`);
        }
    }

    /**
     * Finalize the restore audit record.
     */
    private async finalizeRestoreAudit(
        restoreId: string,
        status: RestoreStatus,
        failedCount: number,
        details: RestoreItemResult[],
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const restore = await loadEntityById<MJVersionLabelRestoreEntity>(ENTITY_VERSION_LABEL_RESTORES, restoreId, contextUser);
            if (!restore) return;

            restore.Status = status;
            restore.EndedAt = new Date();

            if (failedCount > 0) {
                const errorItems = details
                    .filter(d => d.Status === 'Failed')
                    .map(d => `${d.EntityName}/${d.RecordID}: ${d.ErrorMessage ?? 'Unknown'}`)
                    .join('\n');
                restore.ErrorLog = errorItems;
            }

            await restore.Save();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`RestoreEngine: Error finalizing audit record: ${msg}`);
        }
    }

    /**
     * Determine the overall status based on counts.
     */
    private determineFinalStatus(
        restored: number,
        failed: number,
        _total: number
    ): RestoreStatus {
        if (failed === 0) return 'Complete';
        if (restored === 0) return 'Error';
        return 'Partial';
    }

    /**
     * Apply defaults to restore options.
     */
    private resolveDefaults(options: RestoreOptions): Required<RestoreOptions> {
        return {
            DryRun: options.DryRun ?? false,
            Scope: options.Scope ?? 'Full',
            SelectedRecords: options.SelectedRecords ?? [],
            SkipEntities: options.SkipEntities ?? [],
            CreatePreRestoreLabel: options.CreatePreRestoreLabel ?? true,
        };
    }

    /**
     * Create an empty result (used when there's nothing to restore).
     */
    private emptyResult(dryRun: boolean): RestoreResult {
        return {
            RestoreID: dryRun ? 'dry-run' : '',
            PreRestoreLabelID: null,
            Status: 'Complete',
            RestoredCount: 0,
            FailedCount: 0,
            SkippedCount: 0,
            Details: [],
        };
    }
}

/**
 * Progress totals returned from the item-processing loop.
 */
interface RestoreProgressTotals {
    details: RestoreItemResult[];
    restoredCount: number;
    failedCount: number;
    skippedCount: number;
}
