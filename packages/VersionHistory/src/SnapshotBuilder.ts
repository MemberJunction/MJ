import {
    CompositeKey,
    EntityInfo,
    Metadata,
    RunView,
    UserInfo,
    LogError,
    LogStatus,
} from '@memberjunction/core';
import { RecordChangeEntity, VersionLabelItemEntity } from '@memberjunction/core-entities';
import { CaptureError, CaptureResult, DependencyNode, WalkOptions } from './types';
import { DependencyGraphWalker } from './DependencyGraphWalker';
import {
    ENTITY_VERSION_LABEL_ITEMS,
    ENTITY_RECORD_CHANGES,
    buildCompositeKeyFromRecord,
    sqlEquals,
    escapeSqlString,
} from './constants';

/**
 * Captures the current state of records into VersionLabelItem entries,
 * linking each record to its most recent RecordChange snapshot.
 *
 * When a record has no RecordChange history (e.g. it predates change tracking
 * or was never modified), a synthetic "Snapshot" RecordChange is created so
 * the label can still reference it consistently.
 */
export class SnapshotBuilder {
    private Walker = new DependencyGraphWalker();

    /**
     * Capture a snapshot of a single record and optionally its full dependency graph.
     */
    public async CaptureRecord(
        labelId: string,
        entityName: string,
        recordKey: CompositeKey,
        includeDependencies: boolean,
        walkOptions: WalkOptions,
        contextUser: UserInfo
    ): Promise<CaptureResult> {
        const errors: CaptureError[] = [];
        let itemsCaptured = 0;
        let syntheticCount = 0;

        if (includeDependencies) {
            const root = await this.Walker.WalkDependents(entityName, recordKey, walkOptions, contextUser);
            const flatNodes = this.Walker.FlattenTopological(root);

            for (const node of flatNodes) {
                const captureItemResult = await this.captureNode(labelId, node, contextUser);
                if (captureItemResult.success) {
                    itemsCaptured++;
                    if (captureItemResult.wasSynthetic) syntheticCount++;
                } else {
                    errors.push({
                        EntityName: node.EntityName,
                        RecordID: node.RecordID,
                        ErrorMessage: captureItemResult.error ?? 'Unknown error',
                    });
                }
            }
        } else {
            const result = await this.captureSingleRecord(labelId, entityName, recordKey, contextUser);
            if (result.success) {
                itemsCaptured++;
                if (result.wasSynthetic) syntheticCount++;
            } else {
                errors.push({
                    EntityName: entityName,
                    RecordID: recordKey.ToConcatenatedString(),
                    ErrorMessage: result.error ?? 'Unknown error',
                });
            }
        }

        return {
            Success: errors.length === 0,
            LabelID: labelId,
            ItemsCaptured: itemsCaptured,
            SyntheticSnapshotsCreated: syntheticCount,
            Errors: errors,
        };
    }

    /**
     * Capture all records of a given entity type.
     */
    public async CaptureEntity(
        labelId: string,
        entityName: string,
        contextUser: UserInfo
    ): Promise<CaptureResult> {
        const md = new Metadata();
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo) {
            return this.failResult(labelId, `Entity '${escapeSqlString(entityName)}' not found`);
        }

        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: entityName,
            ExtraFilter: '',
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) {
            return this.failResult(labelId, `Failed to load records for entity '${escapeSqlString(entityName)}': ${result.ErrorMessage}`);
        }

        const errors: CaptureError[] = [];
        let itemsCaptured = 0;
        let syntheticCount = 0;

        for (const record of result.Results) {
            const key = buildCompositeKeyFromRecord(entityInfo, record);
            const captureItemResult = await this.captureSingleRecord(labelId, entityName, key, contextUser, record);
            if (captureItemResult.success) {
                itemsCaptured++;
                if (captureItemResult.wasSynthetic) syntheticCount++;
            } else {
                errors.push({
                    EntityName: entityName,
                    RecordID: key.ToConcatenatedString(),
                    ErrorMessage: captureItemResult.error ?? 'Unknown error',
                });
            }
        }

        const errorSuffix = errors.length > 0 ? ` (${errors.length} errors)` : '';
        LogStatus(`VersionHistory: Captured ${itemsCaptured} records for entity '${entityName}' into label ${labelId}${errorSuffix}`);
        return {
            Success: errors.length === 0,
            LabelID: labelId,
            ItemsCaptured: itemsCaptured,
            SyntheticSnapshotsCreated: syntheticCount,
            Errors: errors,
        };
    }

    /**
     * Capture all tracked entities (System scope).
     */
    public async CaptureSystem(
        labelId: string,
        contextUser: UserInfo
    ): Promise<CaptureResult> {
        const md = new Metadata();
        const trackedEntities = md.Entities.filter(e => e.TrackRecordChanges);

        const allErrors: CaptureError[] = [];
        let totalCaptured = 0;
        let totalSynthetic = 0;

        for (const entityInfo of trackedEntities) {
            const entityResult = await this.CaptureEntity(labelId, entityInfo.Name, contextUser);
            totalCaptured += entityResult.ItemsCaptured;
            totalSynthetic += entityResult.SyntheticSnapshotsCreated;
            allErrors.push(...entityResult.Errors);
        }

        LogStatus(`VersionHistory: System capture complete. ${totalCaptured} records across ${trackedEntities.length} entities.`);
        return {
            Success: allErrors.length === 0,
            LabelID: labelId,
            ItemsCaptured: totalCaptured,
            SyntheticSnapshotsCreated: totalSynthetic,
            Errors: allErrors,
        };
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Capture a DependencyNode (used when walking dependency graphs).
     */
    private async captureNode(
        labelId: string,
        node: DependencyNode,
        contextUser: UserInfo
    ): Promise<CaptureItemResult> {
        return this.captureSingleRecord(
            labelId,
            node.EntityName,
            node.RecordKey,
            contextUser,
            node.RecordData
        );
    }

    /**
     * Capture a single record: find its latest RecordChange or create a
     * synthetic snapshot, then create a VersionLabelItem linking them.
     */
    private async captureSingleRecord(
        labelId: string,
        entityName: string,
        recordKey: CompositeKey,
        contextUser: UserInfo,
        existingRecordData?: Record<string, unknown>
    ): Promise<CaptureItemResult> {
        try {
            const md = new Metadata();
            const entityInfo = md.EntityByName(entityName);
            if (!entityInfo) {
                return { success: false, wasSynthetic: false, error: `Entity '${entityName}' not found` };
            }

            const recordId = recordKey.ToConcatenatedString();
            let recordChangeId: string;
            let wasSynthetic = false;

            // Try to find the most recent RecordChange for this record
            const latestChange = await this.findLatestRecordChange(entityInfo.ID, recordId, contextUser);

            if (latestChange) {
                recordChangeId = latestChange.ID;
            } else {
                // No existing change — create a synthetic snapshot
                const recordData = existingRecordData ?? await this.loadCurrentRecord(entityName, recordKey, contextUser);
                if (!recordData || Object.keys(recordData).length === 0) {
                    return { success: false, wasSynthetic: false, error: 'Record not found or empty' };
                }

                const syntheticChange = await this.createSyntheticSnapshot(
                    entityInfo,
                    recordId,
                    recordData,
                    contextUser
                );
                if (!syntheticChange) {
                    return { success: false, wasSynthetic: false, error: 'Failed to create synthetic snapshot' };
                }
                recordChangeId = syntheticChange.ID;
                wasSynthetic = true;
            }

            // Create the VersionLabelItem
            const item = await md.GetEntityObject<VersionLabelItemEntity>(ENTITY_VERSION_LABEL_ITEMS, contextUser);
            item.VersionLabelID = labelId;
            item.RecordChangeID = recordChangeId;
            item.EntityID = entityInfo.ID;
            item.RecordID = recordId;

            const saved = await item.Save();
            if (!saved) {
                return { success: false, wasSynthetic, error: 'Failed to save VersionLabelItem' };
            }

            return { success: true, wasSynthetic };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`SnapshotBuilder: Error capturing ${entityName}/${recordKey.ToConcatenatedString()}: ${msg}`);
            return { success: false, wasSynthetic: false, error: msg };
        }
    }

    /**
     * Find the most recent RecordChange for a given entity + record.
     */
    private async findLatestRecordChange(
        entityId: string,
        recordId: string,
        contextUser: UserInfo
    ): Promise<RecordChangeEntity | null> {
        const rv = new RunView();
        const filter = `${sqlEquals('EntityID', entityId)} AND ${sqlEquals('RecordID', recordId)}`;
        const result = await rv.RunView<RecordChangeEntity>({
            EntityName: ENTITY_RECORD_CHANGES,
            ExtraFilter: filter,
            OrderBy: 'ChangedAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }

        return result.Results[0];
    }

    /**
     * Create a synthetic RecordChange entry of Type='Snapshot' for a record
     * that has no prior change history.
     */
    private async createSyntheticSnapshot(
        entityInfo: EntityInfo,
        recordId: string,
        recordData: Record<string, unknown>,
        contextUser: UserInfo
    ): Promise<RecordChangeEntity | null> {
        try {
            const md = new Metadata();
            const change = await md.GetEntityObject<RecordChangeEntity>(ENTITY_RECORD_CHANGES, contextUser);

            change.EntityID = entityInfo.ID;
            change.RecordID = recordId;
            change.UserID = contextUser.ID;
            change.Type = 'Snapshot';
            change.Source = 'Internal';
            change.ChangesJSON = '{}';
            change.ChangesDescription = 'Snapshot captured for version label';
            change.FullRecordJSON = JSON.stringify(recordData);
            change.Status = 'Complete';

            const saved = await change.Save();
            if (!saved) {
                LogError('SnapshotBuilder: Failed to save synthetic snapshot');
                return null;
            }
            return change;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`SnapshotBuilder: Error creating synthetic snapshot: ${msg}`);
            return null;
        }
    }

    /**
     * Load the current state of a single record.
     */
    private async loadCurrentRecord(
        entityName: string,
        key: CompositeKey,
        contextUser: UserInfo
    ): Promise<Record<string, unknown> | null> {
        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: entityName,
            ExtraFilter: key.ToWhereClause(),
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }
        return result.Results[0];
    }

    /**
     * Helper to create a failure CaptureResult.
     */
    private failResult(labelId: string, errorMessage: string): CaptureResult {
        return {
            Success: false,
            LabelID: labelId,
            ItemsCaptured: 0,
            SyntheticSnapshotsCreated: 0,
            Errors: [{ EntityName: '', RecordID: '', ErrorMessage: errorMessage }],
        };
    }
}

/**
 * Internal result type for single-record capture operations.
 */
interface CaptureItemResult {
    success: boolean;
    wasSynthetic: boolean;
    error?: string;
}
