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
import {
    RestoreItemResult,
    RestoreOptions,
    RestoreResult,
    RestoreStatus,
} from './types';
import { LabelManager } from './LabelManager';
import { SnapshotBuilder } from './SnapshotBuilder';

const ENTITY_VERSION_LABEL_ITEMS = 'MJ: Version Label Items';
const ENTITY_VERSION_LABEL_RESTORES = 'MJ: Version Label Restores';
const ENTITY_RECORD_CHANGES = 'Record Changes';

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
        const label = await this.LabelMgr.GetLabel(labelId, contextUser);
        const labelName = label.Get('Name') as string;
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
            preRestoreLabelId = await this.createPreRestoreLabel(labelName, items, contextUser);
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

        // Sort items by entity dependency order
        const sortedItems = this.sortByDependencyOrder(items);

        // Restore each item
        const details: RestoreItemResult[] = [];
        let restoredCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        for (const item of sortedItems) {
            const result = await this.restoreSingleItem(item, resolvedOptions.DryRun, contextUser);
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

            // Update audit record progress
            if (restoreAuditId && !resolvedOptions.DryRun) {
                await this.updateRestoreProgress(
                    restoreAuditId,
                    restoredCount,
                    failedCount,
                    contextUser
                );
            }
        }

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
     * Load all VersionLabelItems for a label, optionally filtered.
     */
    private async loadLabelItems(
        labelId: string,
        options: Required<RestoreOptions>,
        contextUser: UserInfo
    ): Promise<LabelItemRecord[]> {
        const rv = new RunView();

        let extraFilter = `VersionLabelID = '${labelId}'`;

        // Apply entity exclusion
        if (options.SkipEntities && options.SkipEntities.length > 0) {
            const md = new Metadata();
            const excludeIds = options.SkipEntities
                .map(name => md.EntityByName(name)?.ID)
                .filter((id): id is string => id != null);
            if (excludeIds.length > 0) {
                const idList = excludeIds.map(id => `'${id}'`).join(', ');
                extraFilter += ` AND EntityID NOT IN (${idList})`;
            }
        }

        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ENTITY_VERSION_LABEL_ITEMS,
            ExtraFilter: extraFilter,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            LogError(`RestoreEngine: Failed to load label items: ${result.ErrorMessage}`);
            return [];
        }

        let items: LabelItemRecord[] = result.Results.map(r => ({
            ID: r['ID'] as string,
            VersionLabelID: r['VersionLabelID'] as string,
            RecordChangeID: r['RecordChangeID'] as string,
            EntityID: r['EntityID'] as string,
            RecordID: r['RecordID'] as string,
        }));

        // Apply selected records filter
        if (options.Scope === 'Selected' && options.SelectedRecords && options.SelectedRecords.length > 0) {
            const selectedSet = new Set(
                options.SelectedRecords.map(s => `${s.EntityName}::${s.RecordID}`)
            );
            const md = new Metadata();
            items = items.filter(item => {
                const entityInfo = md.Entities.find(e => e.ID === item.EntityID);
                const entityName = entityInfo?.Name ?? '';
                return selectedSet.has(`${entityName}::${item.RecordID}`);
            });
        }

        return items;
    }

    /**
     * Sort label items by entity dependency order so parents are restored
     * before their children.
     */
    private sortByDependencyOrder(items: LabelItemRecord[]): LabelItemRecord[] {
        const md = new Metadata();

        // Build a map of entityId → dependency level
        const levelMap = new Map<string, number>();
        const computeLevel = (entityId: string, visited: Set<string>): number => {
            if (levelMap.has(entityId)) return levelMap.get(entityId)!;
            if (visited.has(entityId)) return 0; // Cycle — break it
            visited.add(entityId);

            const entityInfo = md.Entities.find(e => e.ID === entityId);
            if (!entityInfo) {
                levelMap.set(entityId, 0);
                return 0;
            }

            // Find all FK fields pointing to other entities
            let maxParentLevel = -1;
            for (const field of entityInfo.Fields) {
                if (field.RelatedEntityID && field.RelatedEntityID !== entityId) {
                    const parentLevel = computeLevel(field.RelatedEntityID, visited);
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
            computeLevel(entityId, new Set());
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
        item: LabelItemRecord,
        dryRun: boolean,
        contextUser: UserInfo
    ): Promise<RestoreItemResult> {
        const md = new Metadata();
        const entityInfo = md.Entities.find(e => e.ID === item.EntityID);
        if (!entityInfo) {
            return {
                EntityName: `Unknown(${item.EntityID})`,
                RecordID: item.RecordID,
                Status: 'Failed',
                ErrorMessage: `Entity with ID '${item.EntityID}' not found in metadata`,
            };
        }

        try {
            // Load the snapshot from the RecordChange
            const snapshotData = await this.loadRecordChangeSnapshot(item.RecordChangeID, contextUser);
            if (!snapshotData) {
                return {
                    EntityName: entityInfo.Name,
                    RecordID: item.RecordID,
                    Status: 'Failed',
                    ErrorMessage: 'Could not load snapshot from RecordChange',
                };
            }

            if (dryRun) {
                return {
                    EntityName: entityInfo.Name,
                    RecordID: item.RecordID,
                    Status: 'Restored', // Would be restored
                };
            }

            // Load or create the target entity
            const entity = await this.loadOrCreateEntity(entityInfo, item.RecordID, contextUser);
            if (!entity) {
                return {
                    EntityName: entityInfo.Name,
                    RecordID: item.RecordID,
                    Status: 'Failed',
                    ErrorMessage: 'Could not load entity for restore',
                };
            }

            // Apply snapshot fields
            const changed = this.applySnapshotToEntity(entity, snapshotData, entityInfo);
            if (!changed) {
                return {
                    EntityName: entityInfo.Name,
                    RecordID: item.RecordID,
                    Status: 'Skipped',
                };
            }

            // Save
            const saved = await entity.Save();
            if (!saved) {
                return {
                    EntityName: entityInfo.Name,
                    RecordID: item.RecordID,
                    Status: 'Failed',
                    ErrorMessage: 'Save failed',
                };
            }

            return {
                EntityName: entityInfo.Name,
                RecordID: item.RecordID,
                Status: 'Restored',
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`RestoreEngine: Error restoring ${entityInfo.Name}/${item.RecordID}: ${msg}`);
            return {
                EntityName: entityInfo.Name,
                RecordID: item.RecordID,
                Status: 'Failed',
                ErrorMessage: msg,
            };
        }
    }

    /**
     * Load the FullRecordJSON from a RecordChange and parse it.
     */
    private async loadRecordChangeSnapshot(
        recordChangeId: string,
        contextUser: UserInfo
    ): Promise<Record<string, unknown> | null> {
        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ENTITY_RECORD_CHANGES,
            ExtraFilter: `ID = '${recordChangeId}'`,
            Fields: ['ID', 'FullRecordJSON'],
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;

        const jsonStr = result.Results[0]['FullRecordJSON'] as string;
        try {
            return JSON.parse(jsonStr);
        } catch {
            return null;
        }
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

        // Try to load existing record
        try {
            const loaded = await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: recordId }]));
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
        items: LabelItemRecord[],
        contextUser: UserInfo
    ): Promise<string> {
        const label = await this.LabelMgr.CreateLabel({
            Name: `Pre-Restore: ${targetLabelName} (${new Date().toISOString()})`,
            Description: `Automatic safety snapshot created before restoring to label '${targetLabelName}'`,
            Scope: 'System',
        }, contextUser);

        const preRestoreLabelId = label.Get('ID') as string;
        const md = new Metadata();

        // Capture current state of each record that will be restored
        for (const item of items) {
            const entityInfo = md.Entities.find(e => e.ID === item.EntityID);
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
        const restore = await md.GetEntityObject<BaseEntity>(ENTITY_VERSION_LABEL_RESTORES, contextUser);

        restore.Set('VersionLabelID', labelId);
        restore.Set('Status', 'In Progress');
        restore.Set('UserID', contextUser.ID);
        restore.Set('TotalItems', totalItems);
        restore.Set('CompletedItems', 0);
        restore.Set('FailedItems', 0);
        if (preRestoreLabelId) {
            restore.Set('PreRestoreLabelID', preRestoreLabelId);
        }

        const saved = await restore.Save();
        if (!saved) {
            throw new Error('Failed to create restore audit record');
        }

        return restore.Get('ID') as string;
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
            const md = new Metadata();
            const restore = await md.GetEntityObject<BaseEntity>(ENTITY_VERSION_LABEL_RESTORES, contextUser);
            const loaded = await restore.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: restoreId }]));
            if (!loaded) return;

            restore.Set('CompletedItems', completedItems);
            restore.Set('FailedItems', failedItems);
            await restore.Save();
        } catch {
            // Non-critical — progress update failure shouldn't stop the restore
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
            const md = new Metadata();
            const restore = await md.GetEntityObject<BaseEntity>(ENTITY_VERSION_LABEL_RESTORES, contextUser);
            const loaded = await restore.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: restoreId }]));
            if (!loaded) return;

            restore.Set('Status', status);
            restore.Set('EndedAt', new Date());

            if (failedCount > 0) {
                const errorItems = details
                    .filter(d => d.Status === 'Failed')
                    .map(d => `${d.EntityName}/${d.RecordID}: ${d.ErrorMessage ?? 'Unknown'}`)
                    .join('\n');
                restore.Set('ErrorLog', errorItems);
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
        total: number
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
 * Internal representation of a VersionLabelItem row.
 */
interface LabelItemRecord {
    ID: string;
    VersionLabelID: string;
    RecordChangeID: string;
    EntityID: string;
    RecordID: string;
}
