/**
 * @fileoverview Type definitions for the record cloning Angular UI layer.
 */

import type { BaseEntity } from '@memberjunction/core';
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

/** State of the clone slide panel. */
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

/** Navigation event emitted to the host container (e.g. Explorer) to open a record. */
export interface FormNavigationEvent {
    Kind: 'record';
    EntityName: string;
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

/** Helper to build a single-field RecordCloneKey from field name and value */
export function stringToRecordCloneKey(fieldName: string, value: string): RecordCloneKey {
    return {
        KeyValuePairs: [{ FieldName: fieldName, Value: value }],
    };
}

/** Helper to extract a RecordCloneKey from an active BaseEntity record */
export function entityToRecordCloneKey(record: BaseEntity): RecordCloneKey {
    const pairs = record.PrimaryKey?.KeyValuePairs || [];
    return {
        KeyValuePairs: pairs.map((p) => ({
            FieldName: p.FieldName,
            Value: String(p.Value ?? ''),
        })),
    };
}

/** Convert a RecordCloneKey to a pipe-delimited string representation */
export function recordCloneKeyToString(key?: RecordCloneKey | null): string {
    if (!key || !key.KeyValuePairs || key.KeyValuePairs.length === 0) return '';
    return key.KeyValuePairs.map((kvp) => kvp.Value).join('|');
}
