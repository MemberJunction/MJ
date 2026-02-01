import {
    CompositeKey,
    UserInfo,
    LogStatus,
} from '@memberjunction/core';
import { VersionLabelEntity } from '@memberjunction/core-entities';
import {
    CaptureResult,
    CreateLabelParams,
    DependencyNode,
    DiffResult,
    LabelFilter,
    RecordSnapshot,
    RestoreOptions,
    RestoreResult,
    WalkOptions,
} from './types';
import { LabelManager } from './LabelManager';
import { SnapshotBuilder } from './SnapshotBuilder';
import { DependencyGraphWalker } from './DependencyGraphWalker';
import { DiffEngine } from './DiffEngine';
import { RestoreEngine } from './RestoreEngine';

/**
 * Main facade for the MemberJunction Version History system.
 *
 * Provides a unified API for:
 * - Creating named version labels (system-wide, entity-scoped, or record-scoped)
 * - Capturing record state snapshots linked to labels
 * - Comparing state between two labels or between a label and current state
 * - Restoring records to a labeled state with dependency ordering
 * - Walking entity dependency graphs
 *
 * Each method delegates to a specialized sub-engine:
 * - LabelManager: label CRUD and lifecycle
 * - SnapshotBuilder: captures record state into label items
 * - DiffEngine: compares snapshots between labels
 * - RestoreEngine: applies labeled state back to records
 * - DependencyGraphWalker: traverses entity relationships
 *
 * Usage:
 * ```typescript
 * const engine = new VersionHistoryEngine();
 *
 * // Create a label capturing a record and its dependencies
 * const label = await engine.CreateLabel({
 *   Name: 'Before Refactor',
 *   Scope: 'Record',
 *   EntityName: 'AI Prompts',
 *   RecordKey: promptKey,
 *   IncludeDependencies: true,
 * }, contextUser);
 *
 * // Later: see what changed since the label
 * const diff = await engine.DiffLabelToCurrentState(label.Label.ID, contextUser);
 *
 * // Restore if needed
 * const result = await engine.RestoreToLabel(label.Label.ID, {}, contextUser);
 * ```
 */
export class VersionHistoryEngine {
    private LabelMgr = new LabelManager();
    private SnapshotBldr = new SnapshotBuilder();
    private GraphWalker = new DependencyGraphWalker();
    private Differ = new DiffEngine();
    private Restorer = new RestoreEngine();

    // =======================================================================
    // Label operations
    // =======================================================================

    /**
     * Create a new version label and capture the appropriate snapshot based
     * on the label's scope.
     *
     * - System scope: captures all tracked entities
     * - Entity scope: captures all records of the specified entity
     * - Record scope: captures the specified record (and optionally its dependencies)
     */
    public async CreateLabel(
        params: CreateLabelParams,
        contextUser: UserInfo
    ): Promise<{ Label: VersionLabelEntity; CaptureResult: CaptureResult }> {
        // Create the label record
        const label = await this.LabelMgr.CreateLabel(params, contextUser);
        const labelId = label.ID;
        const scope = params.Scope ?? 'Record';

        // Track creation timing
        const startTime = Date.now();

        // Capture the snapshot based on scope
        let captureResult: CaptureResult;

        // Validation is handled by LabelManager.CreateLabel before persisting,
        // so we can safely proceed to capture here.
        switch (scope) {
            case 'Record': {
                const walkOptions: WalkOptions = {
                    MaxDepth: params.MaxDepth ?? 10,
                    ExcludeEntities: params.ExcludeEntities ?? [],
                };
                captureResult = await this.SnapshotBldr.CaptureRecord(
                    labelId,
                    params.EntityName!,
                    params.RecordKey!,
                    params.IncludeDependencies ?? true,
                    walkOptions,
                    contextUser
                );
                break;
            }
            case 'Entity': {
                captureResult = await this.SnapshotBldr.CaptureEntity(
                    labelId,
                    params.EntityName!,
                    contextUser
                );
                break;
            }
            case 'System': {
                captureResult = await this.SnapshotBldr.CaptureSystem(labelId, contextUser);
                break;
            }
            default:
                throw new Error(`Unknown scope: ${scope}`);
        }

        // Update label with metrics
        const durationMs = Date.now() - startTime;
        label.ItemCount = captureResult.ItemsCaptured;
        label.CreationDurationMS = durationMs;
        await label.Save();

        LogStatus(
            `VersionHistory: Label '${params.Name}' created with ${captureResult.ItemsCaptured} items ` +
            `in ${durationMs}ms (${captureResult.SyntheticSnapshotsCreated} synthetic snapshots)`
        );

        return { Label: label, CaptureResult: captureResult };
    }

    /**
     * Archive a label, marking it as no longer active.
     */
    public async ArchiveLabel(labelId: string, contextUser: UserInfo): Promise<boolean> {
        return this.LabelMgr.ArchiveLabel(labelId, contextUser);
    }

    /**
     * Load a single version label by ID.
     */
    public async GetLabel(labelId: string, contextUser: UserInfo): Promise<VersionLabelEntity> {
        return this.LabelMgr.GetLabel(labelId, contextUser);
    }

    /**
     * Query version labels with optional filters.
     */
    public async GetLabels(filter: LabelFilter, contextUser: UserInfo): Promise<VersionLabelEntity[]> {
        return this.LabelMgr.GetLabels(filter, contextUser);
    }

    // =======================================================================
    // Diff operations
    // =======================================================================

    /**
     * Compare the state captured by two version labels.
     * Returns a structured diff grouped by entity with field-level changes.
     */
    public async DiffLabels(
        fromLabelId: string,
        toLabelId: string,
        contextUser: UserInfo
    ): Promise<DiffResult> {
        return this.Differ.DiffLabels(fromLabelId, toLabelId, contextUser);
    }

    /**
     * Compare a version label's state to the current live state.
     * Useful for seeing "what has changed since this label was created?"
     */
    public async DiffLabelToCurrentState(
        labelId: string,
        contextUser: UserInfo
    ): Promise<DiffResult> {
        return this.Differ.DiffLabelToCurrentState(labelId, contextUser);
    }

    /**
     * Get the snapshot of a specific record at a specific label.
     */
    public async GetStateAtLabel(
        entityName: string,
        recordId: string,
        labelId: string,
        contextUser: UserInfo
    ): Promise<RecordSnapshot | null> {
        return this.Differ.GetRecordSnapshotAtLabel(entityName, recordId, labelId, contextUser);
    }

    // =======================================================================
    // Restore operations
    // =======================================================================

    /**
     * Restore records to the state captured by a version label.
     *
     * By default, creates a safety "Pre-Restore" label first, then applies
     * changes in dependency order. Supports dry-run mode for previewing.
     */
    public async RestoreToLabel(
        labelId: string,
        options: RestoreOptions,
        contextUser: UserInfo
    ): Promise<RestoreResult> {
        return this.Restorer.RestoreToLabel(labelId, options, contextUser);
    }

    // =======================================================================
    // Dependency graph operations
    // =======================================================================

    /**
     * Walk the dependency graph from a starting record, discovering all
     * dependent (child) records through One-To-Many relationships.
     */
    public async GetRecordDependencyGraph(
        entityName: string,
        recordKey: CompositeKey,
        options: WalkOptions,
        contextUser: UserInfo
    ): Promise<DependencyNode> {
        return this.GraphWalker.WalkDependents(entityName, recordKey, options, contextUser);
    }
}
