/**
 * Serialized execution plan for record cloning.
 *
 * Stored as JSON in `MJ: Record Clone Logs.PlanJSON`. CodeGen emits a typed
 * `PlanJSONObject` accessor on `MJRecordCloneLogEntity` that returns
 * `IClonePlan | null`.
 *
 * @see plans/record-cloning/README.md §3.4
 */

export interface ICloneCompositeKeyKVP {
    FieldName: string;
    Value: unknown;
}

export interface ICloneCompositeKeyLike {
    KeyValuePairs: ICloneCompositeKeyKVP[];
}

export type CloneEdgePolicy = 'Deep' | 'Reference' | 'Skip';
export type CloneNodeAction = 'Create' | 'Reference' | 'Skip' | 'Blocked';
export type CloneEdgeKind =
    | 'IsASubtype' | 'Collection' | 'Embedded' | 'Relationship' | 'InboundFK'
    | 'ForwardFK' | 'SoftLink' | 'Hierarchy' | 'SelfPointer';

export type CloneWarningCode =
    | 'UNMAPPABLE_REFERENCE_DROPPED' | 'PAYLOAD_DROPPED' | 'ROW_DISABLED' | 'UNIQUE_RENAMED' | 'UNIQUE_PROMPT_REQUIRED'
    | 'CAP_EXCEEDED' | 'NO_CREATE_PERMISSION' | 'NOT_CLONEABLE' | 'WRITE_ONCE_ENTITY' | 'SERVER_HOOK_SIDE_EFFECT'
    | 'CONSTRAINT_FORCED_DEEP' | 'LOCKED_EDGE_OVERRIDE_IGNORED' | 'EMBEDDING_REGENERATED' | 'SOURCE_ROW_INVISIBLE';

export interface ICloneWarning {
    Code: CloneWarningCode;
    Severity: 'Info' | 'Warning' | 'Error';
    NodeKey?: string;
    Field?: string;
    Message: string;
}

export interface ICloneFieldChange {
    Field: string;
    Kind: 'Copy' | 'Reset' | 'Ownership' | 'Rename' | 'Remap' | 'RemapJSON' | 'Rule' | 'Override' | 'Prompt' | 'Excluded' | 'DeniedRead' | 'DeniedCreate' | 'NotWritable';
    OldValue: unknown;
    NewValue: unknown;
    Reason: string;
}

export interface IClonePlanEdge {
    FromKey: string;
    ToKey: string;
    Kind: CloneEdgeKind;
    RelatedEntityName: string;
    JoinField: string;
    RelationshipID?: string;
    CollectionName?: string;
    IsSoftLink?: boolean;
    Policy: CloneEdgePolicy;
    Locked: boolean;
    PolicySource: 'BuiltIn' | 'Constraint' | 'Entity' | 'Relationship' | 'Descendant' | 'Request';
}

export interface IClonePlanNode {
    Key: string;
    EntityName: string;
    SourceKey: ICloneCompositeKeyLike;
    TargetKey: ICloneCompositeKeyLike | null;
    Action: CloneNodeAction;
    Reason: string;
    Depth: number;
    ParentKey: string | null;
    Via: IClonePlanEdge | null;
    DisplayName: string;
    IsSubtypeRow?: boolean;
    FieldChanges: ICloneFieldChange[];
    Warnings: ICloneWarning[];
    Route: 'RootSave' | 'Collection' | 'Embedded' | 'IsAChain' | 'Sidecar';
}

export interface IClonePlanCounts {
    ByEntity: Record<string, { Create: number; Reference: number; Skip: number }>;
    Create: number;
    Total: number;
}

export interface ICloneEffectiveOptions {
    MaxDepth: number;
    MaxRecords: number;
    Subtypes: 'include' | 'exclude';
    Hierarchy: 'subtree' | 'node';
    SoftLinks: 'skip' | 'include';
    EntityActions: 'suppress' | 'fire';
    AIActions: 'suppress' | 'fire';
    Embeddings: 'copy' | 'regenerate';
}

export interface IClonePlan {
    PlanVersion: 1;
    Hash: string;
    Roots: string[];
    Nodes: IClonePlanNode[];
    Edges: IClonePlanEdge[];
    Counts: IClonePlanCounts;
    Warnings: ICloneWarning[];
    Blocked: boolean;
    EffectiveOptions: ICloneEffectiveOptions;
}
