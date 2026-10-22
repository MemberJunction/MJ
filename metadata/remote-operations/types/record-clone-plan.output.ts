/** A single field change in the planned record clone. */
export interface RecordClonePlanFieldChange {
    Field: string;
    Kind: string;
    OldValue: string | number | boolean | null;
    NewValue: string | number | boolean | null;
    Reason: string;
}

/** Warning or validation issue identified during planning. */
export interface RecordClonePlanWarning {
    Code: string;
    Severity: 'Info' | 'Warning' | 'Error';
    NodeKey?: string;
    Field?: string;
    Message: string;
}

/** Node in the planned record clone graph. */
export interface RecordClonePlanNode {
    Key: string;
    EntityName: string;
    SourceKey: string;
    TargetKey: string | null;
    Action: 'Create' | 'Reference' | 'Skip' | 'Blocked';
    Reason: string;
    Depth: number;
    ParentKey: string | null;
    DisplayName: string;
    IsSubtypeRow?: boolean;
    FieldChanges: RecordClonePlanFieldChange[];
    Warnings: RecordClonePlanWarning[];
    Route: string;
}

/** Relationship edge in the planned record clone graph. */
export interface RecordClonePlanEdge {
    FromKey: string;
    ToKey: string;
    Kind: string;
    RelatedEntityName: string;
    JoinField: string;
    RelationshipID?: string;
    CollectionName?: string;
    IsSoftLink?: boolean;
    Policy: 'Deep' | 'Reference' | 'Skip';
    Locked: boolean;
    PolicySource: string;
}

/** Execution options effectively applied to the plan. */
export interface RecordClonePlanEffectiveOptions {
    MaxDepth: number;
    MaxRecords: number;
    Subtypes: 'include' | 'exclude';
    Hierarchy: 'subtree' | 'node';
    SoftLinks: 'skip' | 'include';
    EntityActions: 'suppress' | 'fire';
    AIActions: 'suppress' | 'fire';
    Embeddings: 'copy' | 'regenerate';
}

/** Complete clone plan returned by RecordClone.Plan. */
export interface RecordClonePlanDetails {
    PlanVersion: 1;
    Hash: string;
    Roots: string[];
    Nodes: RecordClonePlanNode[];
    Edges: RecordClonePlanEdge[];
    Counts: {
        ByEntity: Record<string, { Create: number; Reference: number; Skip: number }>;
        Create: number;
        Total: number;
    };
    Warnings: RecordClonePlanWarning[];
    Blocked: boolean;
    EffectiveOptions: RecordClonePlanEffectiveOptions;
}

/** Output for `RecordClone.Plan`. */
export interface RecordClonePlanOutput {
    Plan: RecordClonePlanDetails;
}
