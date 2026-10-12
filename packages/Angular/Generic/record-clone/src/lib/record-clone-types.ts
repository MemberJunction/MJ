/**
 * @fileoverview Type definitions for the record cloning Angular UI layer.
 */

import type { BaseEntity, CompositeKey } from '@memberjunction/core';
import type {
    RecordCloneKey,
    RecordCloneKeyValuePair,
    RecordClonePlanDetails,
    RecordClonePlanNode,
    RecordClonePlanEdge,
    RecordCloneExecuteOutput,
    RecordClonePlanWarning,
} from '@memberjunction/core-entities';

/** Active step in the clone wizard. */
export type RecordCloneStep = 'scope' | 'values' | 'review';

/** State of the clone wizard. */
export type RecordClonePanelState =
    | 'loading'
    | 'scope'
    | 'values'
    | 'review'
    | 'executing'
    | 'done'
    | 'blocked'
    | 'plan_changed'
    | 'failed'
    | 'not_cloneable';

/** Emitted when record cloning completes successfully. */
export interface CloneCompletedEvent {
    EntityName: string;
    TargetKey: string;
    CloneLogID: string | null;
    CreatedRecordsCount: number;
    Result?: RecordCloneExecuteOutput;
}

/** A branch policy the user changed in the plan tree; sent to the planner as an edge override. */
export interface CloneEdgePolicyChange {
    RelationshipID: string;
    Policy: 'Deep' | 'Reference' | 'Skip';
    /** Related entity of the branch, for labels such as the "Skipped branches" list. Not sent to the server. */
    RelatedEntityName?: string;
}

/** Emitted when describe, plan or execute fails. */
export interface CloneFailedEvent {
    EntityName: string;
    /** The message the panel shows; names the failing node when the server reports one. */
    Message: string;
    /** Server result code, e.g. `PLAN_CHANGED`, `FORBIDDEN`, `EXECUTION_ERROR`, when there is one. */
    ResultCode?: string;
}

/**
 * Asks the host to open a record. The clone widgets never navigate themselves; a host maps
 * this onto its own navigation (base-forms turns it into a `FormNavigationEvent`).
 */
export interface CloneNavigationEvent {
    Kind: 'record';
    EntityName: string;
    /** Record-id string in compact URL-segment form; parse with `CompositeKey.FromURLSegment`. */
    RecordKey: string;
}

/** View model representing a node in the visual clone plan tree. */
export interface CloneTreeNodeViewModel {
    Node: RecordClonePlanNode;
    ParentEdge: RecordClonePlanEdge | null;
    Children: CloneTreeNodeViewModel[];
    Expanded: boolean;
    Level: number;
}

/** Field prompt item required for the clone values step. */
export interface ClonePromptFieldItem {
    FieldName: string;
    DisplayName: string;
    Type: string;
    DefaultValue?: string | number | boolean | null;
    IsRequired: boolean;
    Description?: string;
}

/** Foreign key retarget item configured under UI.RetargetFields. */
export interface CloneRetargetFieldItem {
    FieldName: string;
    DisplayName: string;
    RelatedEntity: string;
    CurrentValue: string | null;
    NewValue: string | null;
    CurrentDisplayName?: string;
}

/** Progress update payload during long-running clone execution. */
export interface CloneProgressUpdate {
    Percent?: number;
    PercentComplete?: number;
    Processed?: number;
    CompletedRecords?: number;
    Total?: number;
    TotalRecords?: number;
    Message?: string;
    Phase?: string;
    CurrentNodeKey?: string;
    CurrentEntityName?: string;
    CloneLogID?: string;
}

/** Converts a CompositeKey (any number of primary key columns) to the wire-level RecordCloneKey. */
export function CompositeKeyToRecordCloneKey(key: CompositeKey): RecordCloneKey {
    return {
        KeyValuePairs: key.KeyValuePairs.map((p) => ({
            FieldName: p.FieldName,
            Value: String(p.Value ?? ''),
        })),
    };
}

/** Helper to extract a RecordCloneKey from an active BaseEntity record */
export function EntityToRecordCloneKey(record: BaseEntity): RecordCloneKey {
    const pairs = record.PrimaryKey?.KeyValuePairs || [];
    return {
        KeyValuePairs: pairs.map((p) => ({
            FieldName: p.FieldName,
            Value: String(p.Value ?? ''),
        })),
    };
}

/** Convert a RecordCloneKey to a pipe-delimited string representation */
export function RecordCloneKeyToString(key?: RecordCloneKey | null): string {
    if (!key || !key.KeyValuePairs || key.KeyValuePairs.length === 0) return '';
    return key.KeyValuePairs.map((kvp) => kvp.Value).join('|');
}
