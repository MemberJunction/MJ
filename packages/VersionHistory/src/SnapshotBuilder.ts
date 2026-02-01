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
import { CaptureError, CaptureResult, CreateLabelProgressCallback, DependencyNode, WalkOptions } from './types';
import { DependencyGraphWalker } from './DependencyGraphWalker';
import {
    ENTITY_VERSION_LABEL_ITEMS,
    ENTITY_RECORD_CHANGES,
    buildCompositeKeyFromRecord,
    sqlEquals,
    escapeSqlString,
} from './constants';

// =============================================================================
// Internal Types
// =============================================================================

/** Result of capturing a single record. */
interface CaptureItemResult {
    Success: boolean;
    WasSynthetic: boolean;
    Error?: string;
}

/** A record change lookup entry from batched queries. */
interface RecordChangeLookup {
    RecordChangeID: string;
    ChangedAt: Date;
}

// =============================================================================
// SnapshotBuilder
// =============================================================================

/**
 * Captures the current state of records into VersionLabelItem entries,
 * linking each record to its most recent RecordChange snapshot.
 *
 * ## Batched approach
 *
 * When capturing a dependency graph, the builder:
 * 1. Groups all nodes by EntityID
 * 2. For each entity group, runs ONE batched query to find the latest
 *    RecordChange for all records in the group
 * 3. Creates synthetic snapshots for records with no change history
 * 4. Creates VersionLabelItem entries for all records
 *
 * This reduces hundreds/thousands of individual RunView calls down to
 * a handful of batched queries (one per unique entity type).
 */
export class SnapshotBuilder {
    private Walker = new DependencyGraphWalker();

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Capture a snapshot of a single record and optionally its full dependency graph.
     */
    public async CaptureRecord(
        labelId: string,
        entityName: string,
        recordKey: CompositeKey,
        includeDependencies: boolean,
        walkOptions: WalkOptions,
        contextUser: UserInfo,
        onProgress?: CreateLabelProgressCallback
    ): Promise<CaptureResult> {
        if (includeDependencies) {
            return this.captureWithDependencies(labelId, entityName, recordKey, walkOptions, contextUser, onProgress);
        }
        return this.captureSingleRecordAsResult(labelId, entityName, recordKey, contextUser);
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
            if (captureItemResult.Success) {
                itemsCaptured++;
                if (captureItemResult.WasSynthetic) syntheticCount++;
            } else {
                errors.push({
                    EntityName: entityName,
                    RecordID: key.ToConcatenatedString(),
                    ErrorMessage: captureItemResult.Error ?? 'Unknown error',
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

    // =========================================================================
    // Batched Dependency Capture
    // =========================================================================

    /**
     * Walk the dependency graph and capture all nodes using batched queries.
     *
     * Steps:
     * 1. Walk the dependency graph to get all nodes
     * 2. Batch-lookup the latest RecordChange for all nodes (grouped by entity)
     * 3. Create synthetic snapshots for nodes without a RecordChange
     * 4. Create VersionLabelItem entries for all nodes
     */
    private async captureWithDependencies(
        labelId: string,
        entityName: string,
        recordKey: CompositeKey,
        walkOptions: WalkOptions,
        contextUser: UserInfo,
        onProgress?: CreateLabelProgressCallback
    ): Promise<CaptureResult> {
        // Step 1: Walk the dependency graph
        this.emitProgress(onProgress, {
            Step: 'walking_dependencies',
            Message: `Walking dependency graph for ${entityName}...`,
            Percentage: 10,
        });

        const root = await this.Walker.WalkDependents(entityName, recordKey, walkOptions, contextUser);
        const flatNodes = this.Walker.FlattenTopological(root);

        // Step 2: Batch-lookup RecordChanges for all nodes
        this.emitProgress(onProgress, {
            Step: 'capturing_snapshots',
            Message: `Found ${flatNodes.length} records. Looking up change history...`,
            Percentage: 30,
            TotalRecords: flatNodes.length,
            RecordsProcessed: 0,
        });

        const changeLookup = await this.batchLookupLatestChanges(flatNodes, contextUser);

        // Steps 3 & 4: Process each node — create synthetics where needed, then label items
        const errors: CaptureError[] = [];
        let itemsCaptured = 0;
        let syntheticCount = 0;
        const totalNodes = flatNodes.length;

        // Track current entity for progress reporting
        let lastEntityName = '';

        for (let i = 0; i < flatNodes.length; i++) {
            const node = flatNodes[i];

            // Emit progress periodically (every 5 items or on entity change)
            if (node.EntityName !== lastEntityName || i % 5 === 0) {
                lastEntityName = node.EntityName;
                const pct = 35 + Math.round((i / totalNodes) * 55); // 35–90%
                this.emitProgress(onProgress, {
                    Step: 'capturing_snapshots',
                    Message: `Capturing ${node.EntityName}...`,
                    Percentage: pct,
                    RecordsProcessed: i,
                    TotalRecords: totalNodes,
                    CurrentEntity: node.EntityName,
                });
            }

            const result = await this.captureNodeWithLookup(
                labelId, node, changeLookup, contextUser
            );
            if (result.Success) {
                itemsCaptured++;
                if (result.WasSynthetic) syntheticCount++;
            } else {
                errors.push({
                    EntityName: node.EntityName,
                    RecordID: node.RecordID,
                    ErrorMessage: result.Error ?? 'Unknown error',
                });
            }
        }

        // Final snapshot progress
        this.emitProgress(onProgress, {
            Step: 'capturing_snapshots',
            Message: `Captured ${itemsCaptured} records`,
            Percentage: 90,
            RecordsProcessed: totalNodes,
            TotalRecords: totalNodes,
        });

        return {
            Success: errors.length === 0,
            LabelID: labelId,
            ItemsCaptured: itemsCaptured,
            SyntheticSnapshotsCreated: syntheticCount,
            Errors: errors,
        };
    }

    /** Safely invoke the progress callback if provided. */
    private emitProgress(
        callback: CreateLabelProgressCallback | undefined,
        update: { Step: import('./types').CreateLabelStep; Message: string; Percentage: number; RecordsProcessed?: number; TotalRecords?: number; CurrentEntity?: string }
    ): void {
        if (callback) {
            try {
                callback(update);
            } catch (_e) {
                // Never let a callback error break the capture
            }
        }
    }

    // =========================================================================
    // Batched RecordChange Lookup
    // =========================================================================

    /**
     * Batch-lookup the latest RecordChange for a list of dependency nodes.
     *
     * Groups nodes by EntityID, then runs ONE query per entity group with an
     * IN clause for all RecordIDs. Returns a map keyed by "entityId::recordId"
     * with the latest RecordChange ID and timestamp.
     *
     * This replaces N individual RunView calls with ~K calls (K = unique entity types).
     */
    private async batchLookupLatestChanges(
        nodes: DependencyNode[],
        contextUser: UserInfo
    ): Promise<Map<string, RecordChangeLookup>> {
        const lookup = new Map<string, RecordChangeLookup>();

        // Group nodes by EntityID
        const entityGroups = this.groupNodesByEntity(nodes);

        // For each entity group, run a single batched query
        for (const [entityId, recordIds] of entityGroups.entries()) {
            const groupResults = await this.lookupChangesForEntityGroup(
                entityId, recordIds, contextUser
            );

            // Merge results into the main lookup
            for (const [key, value] of groupResults.entries()) {
                lookup.set(key, value);
            }
        }

        return lookup;
    }

    /**
     * Group dependency nodes by EntityID, collecting unique RecordIDs per entity.
     * Returns a Map of entityId → Set of recordIds.
     */
    private groupNodesByEntity(nodes: DependencyNode[]): Map<string, Set<string>> {
        const groups = new Map<string, Set<string>>();
        for (const node of nodes) {
            const entityId = node.EntityInfo.ID;
            if (!groups.has(entityId)) {
                groups.set(entityId, new Set());
            }
            groups.get(entityId)!.add(node.RecordID);
        }
        return groups;
    }

    /**
     * Query Record Changes for a single entity group.
     * Uses an IN clause to find the latest change for each record in one query.
     *
     * Returns a Map of "entityId::recordId" → RecordChangeLookup.
     */
    private async lookupChangesForEntityGroup(
        entityId: string,
        recordIds: Set<string>,
        contextUser: UserInfo
    ): Promise<Map<string, RecordChangeLookup>> {
        const results = new Map<string, RecordChangeLookup>();
        const recordIdArray = Array.from(recordIds);

        // SQL Server has a practical limit on IN clause size (~2100 params).
        // Batch into chunks if needed.
        const chunkSize = 500;
        for (let i = 0; i < recordIdArray.length; i += chunkSize) {
            const chunk = recordIdArray.slice(i, i + chunkSize);
            const chunkResults = await this.lookupChangesChunk(entityId, chunk, contextUser);

            for (const [key, value] of chunkResults.entries()) {
                results.set(key, value);
            }
        }

        return results;
    }

    /**
     * Query Record Changes for a chunk of RecordIDs within a single entity.
     * Loads all matching changes ordered by RecordID and ChangedAt DESC,
     * then picks the latest change per record.
     */
    private async lookupChangesChunk(
        entityId: string,
        recordIds: string[],
        contextUser: UserInfo
    ): Promise<Map<string, RecordChangeLookup>> {
        const results = new Map<string, RecordChangeLookup>();

        const escapedIds = recordIds.map(id => `'${escapeSqlString(id)}'`).join(', ');
        const filter = `${sqlEquals('EntityID', entityId)} AND RecordID IN (${escapedIds})`;

        try {
            const rv = new RunView();
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: ENTITY_RECORD_CHANGES,
                ExtraFilter: filter,
                OrderBy: 'RecordID, ChangedAt DESC',
                Fields: ['ID', 'RecordID', 'ChangedAt'],
                ResultType: 'simple',
            }, contextUser);

            if (!result.Success) {
                LogError(`SnapshotBuilder: Batch RecordChange lookup failed: ${result.ErrorMessage}`);
                return results;
            }

            // Pick the first (most recent) change per RecordID
            for (const row of result.Results) {
                const recordId = String(row['RecordID']);
                const key = `${entityId}::${recordId}`;

                // Only take the first occurrence (most recent due to ORDER BY)
                if (!results.has(key)) {
                    results.set(key, {
                        RecordChangeID: String(row['ID']),
                        ChangedAt: new Date(String(row['ChangedAt'])),
                    });
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`SnapshotBuilder: Error in batch RecordChange lookup: ${msg}`);
        }

        return results;
    }

    // =========================================================================
    // Node Capture (with batched lookup)
    // =========================================================================

    /**
     * Capture a single dependency node using the pre-built change lookup.
     * If no existing RecordChange is found, creates a synthetic snapshot.
     */
    private async captureNodeWithLookup(
        labelId: string,
        node: DependencyNode,
        changeLookup: Map<string, RecordChangeLookup>,
        contextUser: UserInfo
    ): Promise<CaptureItemResult> {
        try {
            const lookupKey = `${node.EntityInfo.ID}::${node.RecordID}`;
            const existingChange = changeLookup.get(lookupKey);
            let recordChangeId: string;
            let wasSynthetic = false;

            if (existingChange) {
                recordChangeId = existingChange.RecordChangeID;
            } else {
                // No existing change — create a synthetic snapshot
                const syntheticChange = await this.createSyntheticSnapshot(
                    node.EntityInfo, node.RecordID, node.RecordData, contextUser
                );
                if (!syntheticChange) {
                    return { Success: false, WasSynthetic: false, Error: 'Failed to create synthetic snapshot' };
                }
                recordChangeId = syntheticChange.ID;
                wasSynthetic = true;
            }

            // Create the VersionLabelItem
            return this.createLabelItem(labelId, node.EntityInfo, node.RecordID, recordChangeId, wasSynthetic, contextUser);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`SnapshotBuilder: Error capturing ${node.EntityName}/${node.RecordID}: ${msg}`);
            return { Success: false, WasSynthetic: false, Error: msg };
        }
    }

    // =========================================================================
    // Single Record Capture (non-batched, for CaptureEntity / single record)
    // =========================================================================

    /**
     * Capture a single record without batching. Used by CaptureEntity and
     * the non-dependency CaptureRecord path.
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
                return { Success: false, WasSynthetic: false, Error: `Entity '${entityName}' not found` };
            }

            const recordId = recordKey.ToConcatenatedString();
            let recordChangeId: string;
            let wasSynthetic = false;

            // Look up the latest RecordChange for this record
            const latestChange = await this.findLatestRecordChange(entityInfo.ID, recordId, contextUser);

            if (latestChange) {
                recordChangeId = String(latestChange['ID']);
            } else {
                const recordData = existingRecordData ?? await this.loadCurrentRecord(entityName, recordKey, contextUser);
                if (!recordData || Object.keys(recordData).length === 0) {
                    return { Success: false, WasSynthetic: false, Error: 'Record not found or empty' };
                }

                const syntheticChange = await this.createSyntheticSnapshot(entityInfo, recordId, recordData, contextUser);
                if (!syntheticChange) {
                    return { Success: false, WasSynthetic: false, Error: 'Failed to create synthetic snapshot' };
                }
                recordChangeId = syntheticChange.ID;
                wasSynthetic = true;
            }

            return this.createLabelItem(labelId, entityInfo, recordId, recordChangeId, wasSynthetic, contextUser);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`SnapshotBuilder: Error capturing ${entityName}/${recordKey.ToConcatenatedString()}: ${msg}`);
            return { Success: false, WasSynthetic: false, Error: msg };
        }
    }

    /**
     * Wrapper for captureSingleRecord that returns a CaptureResult.
     */
    private async captureSingleRecordAsResult(
        labelId: string,
        entityName: string,
        recordKey: CompositeKey,
        contextUser: UserInfo
    ): Promise<CaptureResult> {
        const result = await this.captureSingleRecord(labelId, entityName, recordKey, contextUser);
        if (result.Success) {
            return {
                Success: true,
                LabelID: labelId,
                ItemsCaptured: 1,
                SyntheticSnapshotsCreated: result.WasSynthetic ? 1 : 0,
                Errors: [],
            };
        }
        return {
            Success: false,
            LabelID: labelId,
            ItemsCaptured: 0,
            SyntheticSnapshotsCreated: 0,
            Errors: [{ EntityName: entityName, RecordID: recordKey.ToConcatenatedString(), ErrorMessage: result.Error ?? 'Unknown error' }],
        };
    }

    // =========================================================================
    // Shared Helpers
    // =========================================================================

    /**
     * Find the most recent RecordChange for a single entity + record.
     * Used by the non-batched capture path.
     */
    private async findLatestRecordChange(
        entityId: string,
        recordId: string,
        contextUser: UserInfo
    ): Promise<Record<string, unknown> | null> {
        const rv = new RunView();
        const filter = `${sqlEquals('EntityID', entityId)} AND ${sqlEquals('RecordID', recordId)}`;
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ENTITY_RECORD_CHANGES,
            ExtraFilter: filter,
            OrderBy: 'ChangedAt DESC',
            Fields: ['ID', 'RecordID', 'ChangedAt'],
            MaxRows: 1,
            ResultType: 'simple',
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
     * Create a VersionLabelItem linking a record to its RecordChange.
     */
    private async createLabelItem(
        labelId: string,
        entityInfo: EntityInfo,
        recordId: string,
        recordChangeId: string,
        wasSynthetic: boolean,
        contextUser: UserInfo
    ): Promise<CaptureItemResult> {
        const md = new Metadata();
        const item = await md.GetEntityObject<VersionLabelItemEntity>(ENTITY_VERSION_LABEL_ITEMS, contextUser);
        item.VersionLabelID = labelId;
        item.RecordChangeID = recordChangeId;
        item.EntityID = entityInfo.ID;
        item.RecordID = recordId;

        const saved = await item.Save();
        if (!saved) {
            return { Success: false, WasSynthetic: wasSynthetic, Error: 'Failed to save VersionLabelItem' };
        }
        return { Success: true, WasSynthetic: wasSynthetic };
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

    /** Create a failure CaptureResult. */
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
