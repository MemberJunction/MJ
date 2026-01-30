import {
    BaseEntity,
    CompositeKey,
    Metadata,
    RunView,
    UserInfo,
    LogError,
    LogStatus,
} from '@memberjunction/core';
import {
    DiffResult,
    DiffSummary,
    EntityDiffGroup,
    FieldChange,
    RecordDiff,
    RecordDiffType,
    RecordSnapshot,
} from './types';

const ENTITY_VERSION_LABEL_ITEMS = 'MJ: Version Label Items';
const ENTITY_VERSION_LABELS = 'MJ: Version Labels';
const ENTITY_RECORD_CHANGES = 'Record Changes';

/**
 * Map key: "entityId::recordId" → RecordChangeID
 */
type SnapshotIndex = Map<string, string>;

/**
 * Compares state between two version labels, or between a label and the
 * current live state, producing a structured diff grouped by entity.
 */
export class DiffEngine {
    /**
     * Compare two version labels.
     */
    public async DiffLabels(
        fromLabelId: string,
        toLabelId: string,
        contextUser: UserInfo
    ): Promise<DiffResult> {
        const [fromLabel, toLabel] = await Promise.all([
            this.loadLabel(fromLabelId, contextUser),
            this.loadLabel(toLabelId, contextUser),
        ]);

        const [fromIndex, toIndex] = await Promise.all([
            this.buildSnapshotIndex(fromLabelId, contextUser),
            this.buildSnapshotIndex(toLabelId, contextUser),
        ]);

        const entityDiffs = await this.computeDiffs(fromIndex, toIndex, contextUser);
        const summary = this.computeSummary(entityDiffs);

        return {
            FromLabelID: fromLabelId,
            FromLabelName: fromLabel.Get('Name') as string,
            ToLabelID: toLabelId,
            ToLabelName: toLabel.Get('Name') as string,
            Summary: summary,
            EntityDiffs: entityDiffs,
        };
    }

    /**
     * Compare a version label to the current live state.
     *
     * For each record in the label, we find its current latest RecordChange
     * and compare. Records that exist in the current state but not in the
     * label are reported as Added; records in the label but not currently
     * existing are reported as Deleted.
     */
    public async DiffLabelToCurrentState(
        labelId: string,
        contextUser: UserInfo
    ): Promise<DiffResult> {
        const label = await this.loadLabel(labelId, contextUser);
        const fromIndex = await this.buildSnapshotIndex(labelId, contextUser);

        // Build a "current" index: for each record in the from index, find
        // its most recent RecordChange
        const currentIndex = await this.buildCurrentIndex(fromIndex, contextUser);

        const entityDiffs = await this.computeDiffs(fromIndex, currentIndex, contextUser);
        const summary = this.computeSummary(entityDiffs);

        return {
            FromLabelID: labelId,
            FromLabelName: label.Get('Name') as string,
            ToLabelID: null,
            ToLabelName: null,
            Summary: summary,
            EntityDiffs: entityDiffs,
        };
    }

    /**
     * Get the snapshot of a specific record at a specific label.
     */
    public async GetRecordSnapshotAtLabel(
        entityName: string,
        recordId: string,
        labelId: string,
        contextUser: UserInfo
    ): Promise<RecordSnapshot | null> {
        const md = new Metadata();
        const entityInfo = md.EntityByName(entityName);
        if (!entityInfo) return null;

        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ENTITY_VERSION_LABEL_ITEMS,
            ExtraFilter: `VersionLabelID = '${labelId}' AND EntityID = '${entityInfo.ID}' AND RecordID = '${recordId}'`,
            Fields: ['ID', 'RecordChangeID', 'EntityID', 'RecordID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;

        const item = result.Results[0];
        return this.loadSnapshotFromRecordChange(
            item['RecordChangeID'] as string,
            entityName,
            entityInfo.ID,
            recordId,
            contextUser
        );
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Load a label entity by ID.
     */
    private async loadLabel(labelId: string, contextUser: UserInfo): Promise<BaseEntity> {
        const md = new Metadata();
        const label = await md.GetEntityObject<BaseEntity>(ENTITY_VERSION_LABELS, contextUser);
        const loaded = await label.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: labelId }]));
        if (!loaded) throw new Error(`Version label '${labelId}' not found`);
        return label;
    }

    /**
     * Build an index from VersionLabelItems: key → RecordChangeID.
     */
    private async buildSnapshotIndex(labelId: string, contextUser: UserInfo): Promise<SnapshotIndex> {
        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ENTITY_VERSION_LABEL_ITEMS,
            ExtraFilter: `VersionLabelID = '${labelId}'`,
            Fields: ['ID', 'RecordChangeID', 'EntityID', 'RecordID'],
            ResultType: 'simple',
        }, contextUser);

        const index: SnapshotIndex = new Map();
        if (!result.Success) {
            LogError(`DiffEngine: Failed to load label items for ${labelId}: ${result.ErrorMessage}`);
            return index;
        }

        for (const item of result.Results) {
            const key = `${item['EntityID']}::${item['RecordID']}`;
            index.set(key, item['RecordChangeID'] as string);
        }
        return index;
    }

    /**
     * Build a "current state" index by finding the latest RecordChange for
     * each record in the fromIndex.
     */
    private async buildCurrentIndex(
        fromIndex: SnapshotIndex,
        contextUser: UserInfo
    ): Promise<SnapshotIndex> {
        const currentIndex: SnapshotIndex = new Map();
        const rv = new RunView();

        // Group by entityId for efficient batch queries
        const byEntity = new Map<string, string[]>();
        for (const compositeKey of fromIndex.keys()) {
            const [entityId, recordId] = compositeKey.split('::');
            if (!byEntity.has(entityId)) byEntity.set(entityId, []);
            byEntity.get(entityId)!.push(recordId);
        }

        for (const [entityId, recordIds] of byEntity) {
            for (const recordId of recordIds) {
                const result = await rv.RunView<Record<string, unknown>>({
                    EntityName: ENTITY_RECORD_CHANGES,
                    ExtraFilter: `EntityID = '${entityId}' AND RecordID = '${recordId}'`,
                    OrderBy: 'ChangedAt DESC',
                    MaxRows: 1,
                    Fields: ['ID'],
                    ResultType: 'simple',
                }, contextUser);

                if (result.Success && result.Results.length > 0) {
                    const key = `${entityId}::${recordId}`;
                    currentIndex.set(key, result.Results[0]['ID'] as string);
                }
                // If no result, the record may have been deleted or never changed
            }
        }

        return currentIndex;
    }

    /**
     * Compute diffs between two snapshot indices.
     */
    private async computeDiffs(
        fromIndex: SnapshotIndex,
        toIndex: SnapshotIndex,
        contextUser: UserInfo
    ): Promise<EntityDiffGroup[]> {
        const allKeys = new Set([...fromIndex.keys(), ...toIndex.keys()]);
        const md = new Metadata();

        // Group by entity
        const entityGroups = new Map<string, { entityId: string; records: RecordDiff[] }>();

        for (const compositeKey of allKeys) {
            const [entityId, recordId] = compositeKey.split('::');
            const fromChangeId = fromIndex.get(compositeKey);
            const toChangeId = toIndex.get(compositeKey);

            const entityInfo = md.Entities.find(e => e.ID === entityId);
            const entityName = entityInfo?.Name ?? `Unknown(${entityId})`;

            if (!entityGroups.has(entityId)) {
                entityGroups.set(entityId, { entityId, records: [] });
            }
            const group = entityGroups.get(entityId)!;

            const diff = await this.diffSingleRecord(
                entityName,
                recordId,
                fromChangeId ?? null,
                toChangeId ?? null,
                contextUser
            );
            group.records.push(diff);
        }

        // Convert to EntityDiffGroup array
        const result: EntityDiffGroup[] = [];
        for (const [entityId, group] of entityGroups) {
            const entityInfo = md.Entities.find(e => e.ID === entityId);
            const entityName = entityInfo?.Name ?? `Unknown(${entityId})`;

            const addedCount = group.records.filter(r => r.DiffType === 'Added').length;
            const modifiedCount = group.records.filter(r => r.DiffType === 'Modified').length;
            const deletedCount = group.records.filter(r => r.DiffType === 'Deleted').length;

            // Skip unchanged-only groups
            if (addedCount === 0 && modifiedCount === 0 && deletedCount === 0) continue;

            result.push({
                EntityName: entityName,
                EntityID: entityId,
                Records: group.records.filter(r => r.DiffType !== 'Unchanged'),
                AddedCount: addedCount,
                ModifiedCount: modifiedCount,
                DeletedCount: deletedCount,
            });
        }

        return result;
    }

    /**
     * Diff a single record between two RecordChange snapshots.
     */
    private async diffSingleRecord(
        entityName: string,
        recordId: string,
        fromChangeId: string | null,
        toChangeId: string | null,
        contextUser: UserInfo
    ): Promise<RecordDiff> {
        // Record exists only in "to" → Added
        if (!fromChangeId && toChangeId) {
            const toSnapshot = await this.loadFullRecordJSON(toChangeId, contextUser);
            return {
                RecordID: recordId,
                EntityName: entityName,
                DiffType: 'Added',
                FieldChanges: [],
                FromSnapshot: null,
                ToSnapshot: toSnapshot,
            };
        }

        // Record exists only in "from" → Deleted
        if (fromChangeId && !toChangeId) {
            const fromSnapshot = await this.loadFullRecordJSON(fromChangeId, contextUser);
            return {
                RecordID: recordId,
                EntityName: entityName,
                DiffType: 'Deleted',
                FieldChanges: [],
                FromSnapshot: fromSnapshot,
                ToSnapshot: null,
            };
        }

        // Same RecordChange ID → Unchanged
        if (fromChangeId === toChangeId) {
            return {
                RecordID: recordId,
                EntityName: entityName,
                DiffType: 'Unchanged',
                FieldChanges: [],
                FromSnapshot: null,
                ToSnapshot: null,
            };
        }

        // Both exist but differ → compare field-by-field
        const [fromSnapshot, toSnapshot] = await Promise.all([
            this.loadFullRecordJSON(fromChangeId!, contextUser),
            this.loadFullRecordJSON(toChangeId!, contextUser),
        ]);

        const fieldChanges = this.compareSnapshots(fromSnapshot, toSnapshot);
        const diffType: RecordDiffType = fieldChanges.length > 0 ? 'Modified' : 'Unchanged';

        return {
            RecordID: recordId,
            EntityName: entityName,
            DiffType: diffType,
            FieldChanges: fieldChanges,
            FromSnapshot: fromSnapshot,
            ToSnapshot: toSnapshot,
        };
    }

    /**
     * Load the FullRecordJSON from a RecordChange entry and parse it.
     */
    private async loadFullRecordJSON(
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
            LogError(`DiffEngine: Failed to parse FullRecordJSON for RecordChange ${recordChangeId}`);
            return null;
        }
    }

    /**
     * Load a snapshot from a RecordChange entry.
     */
    private async loadSnapshotFromRecordChange(
        recordChangeId: string,
        entityName: string,
        entityId: string,
        recordId: string,
        contextUser: UserInfo
    ): Promise<RecordSnapshot | null> {
        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ENTITY_RECORD_CHANGES,
            ExtraFilter: `ID = '${recordChangeId}'`,
            Fields: ['ID', 'FullRecordJSON', 'ChangedAt'],
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;

        const row = result.Results[0];
        const jsonStr = row['FullRecordJSON'] as string;
        try {
            return {
                EntityName: entityName,
                EntityID: entityId,
                RecordID: recordId,
                RecordChangeID: recordChangeId,
                ChangedAt: new Date(row['ChangedAt'] as string),
                FullRecordJSON: JSON.parse(jsonStr),
            };
        } catch {
            return null;
        }
    }

    /**
     * Compare two parsed JSON snapshots field-by-field.
     */
    private compareSnapshots(
        fromSnapshot: Record<string, unknown> | null,
        toSnapshot: Record<string, unknown> | null
    ): FieldChange[] {
        if (!fromSnapshot || !toSnapshot) return [];

        const changes: FieldChange[] = [];
        const allFields = new Set([...Object.keys(fromSnapshot), ...Object.keys(toSnapshot)]);

        for (const field of allFields) {
            // Skip internal timestamp fields
            if (field.startsWith('__mj_')) continue;

            const oldVal = fromSnapshot[field];
            const newVal = toSnapshot[field];

            if (this.valuesEqual(oldVal, newVal)) continue;

            if (oldVal === undefined || oldVal === null) {
                changes.push({ FieldName: field, OldValue: oldVal, NewValue: newVal, ChangeType: 'Added' });
            } else if (newVal === undefined || newVal === null) {
                changes.push({ FieldName: field, OldValue: oldVal, NewValue: newVal, ChangeType: 'Removed' });
            } else {
                changes.push({ FieldName: field, OldValue: oldVal, NewValue: newVal, ChangeType: 'Modified' });
            }
        }

        return changes;
    }

    /**
     * Deep equality check for field values.
     */
    private valuesEqual(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;

        // Normalize string representations
        const strA = String(a);
        const strB = String(b);
        if (strA === strB) return true;

        // Date comparison
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }
        if (typeof a === 'string' && typeof b === 'string') {
            // Try date parse for ISO strings
            const dateA = Date.parse(a);
            const dateB = Date.parse(b);
            if (!isNaN(dateA) && !isNaN(dateB) && dateA === dateB) return true;
        }

        return false;
    }

    /**
     * Compute summary statistics from entity diffs.
     */
    private computeSummary(entityDiffs: EntityDiffGroup[]): DiffSummary {
        let added = 0;
        let modified = 0;
        let deleted = 0;

        for (const group of entityDiffs) {
            added += group.AddedCount;
            modified += group.ModifiedCount;
            deleted += group.DeletedCount;
        }

        return {
            TotalRecordsChanged: added + modified + deleted,
            TotalRecordsAdded: added,
            TotalRecordsModified: modified,
            TotalRecordsDeleted: deleted,
            EntitiesAffected: entityDiffs.length,
        };
    }
}
