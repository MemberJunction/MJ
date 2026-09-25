/**
 * @file types.ts
 * Client-safe contracts and types for MemberJunction Entity Record Cloning.
 * @see plans/record-cloning/README.md §3.4, §4.1
 */

import type { FieldRuleSet } from '@memberjunction/global';

/**
 * Key-value pair representing a composite or single-column key component.
 */
export interface CompositeKeyKVP {
    FieldName: string;
    Value: unknown;
}

/**
 * Abstract representation of a record primary key.
 * Compatible with MemberJunction's CompositeKey class.
 */
export interface CompositeKeyLike {
    KeyValuePairs: CompositeKeyKVP[];
}

/**
 * Edge traversal policy for graph expansion.
 */
export type CloneEdgePolicy = 'Deep' | 'Reference' | 'Skip';

/**
 * Action determined for an individual record node in the plan.
 */
export type CloneNodeAction = 'Create' | 'Reference' | 'Skip' | 'Blocked';

/**
 * Structural kind of relationship edge in the entity graph.
 */
export type CloneEdgeKind =
    | 'IsASubtype'
    | 'Collection'
    | 'Embedded'
    | 'Relationship'
    | 'InboundFK'
    | 'ForwardFK'
    | 'SoftLink'
    | 'Hierarchy'
    | 'SelfPointer';

/**
 * Provenance / classification category for field modifications.
 */
export type CloneFieldChangeKind =
    | 'Copy'
    | 'Reset'
    | 'Ownership'
    | 'Rename'
    | 'Remap'
    | 'RemapJSON'
    | 'Rule'
    | 'Override'
    | 'Prompt'
    | 'Excluded'
    | 'DeniedRead'
    | 'DeniedCreate'
    | 'NotWritable';

/**
 * Standard warning and diagnostic codes emitted during planning or execution.
 */
export type CloneWarningCode =
    | 'UNMAPPABLE_REFERENCE_DROPPED'
    | 'PAYLOAD_DROPPED'
    | 'ROW_DISABLED'
    | 'UNIQUE_RENAMED'
    | 'UNIQUE_PROMPT_REQUIRED'
    | 'CAP_EXCEEDED'
    | 'NO_CREATE_PERMISSION'
    | 'NOT_CLONEABLE'
    | 'WRITE_ONCE_ENTITY'
    | 'SERVER_HOOK_SIDE_EFFECT'
    | 'CONSTRAINT_FORCED_DEEP'
    | 'LOCKED_EDGE_OVERRIDE_IGNORED'
    | 'EMBEDDING_REGENERATED'
    | 'SOURCE_ROW_INVISIBLE'
    | 'SERVER_GENERATED_CHILD_SKIPPED'
    | 'INTRA_PLAN_COLLISION'
    | 'REQUIRED_USER_TYPE_MISMATCH'
    | 'PLAN_CHANGED'
    /** The user lacks the clone authorization for this entity (plan §9.1). */
    | 'FORBIDDEN'
    /** A request changed whether Entity Actions / AI Actions run without `Clone Records: Fire Hooks`; the configured behavior applies. */
    | 'HOOKS_FORBIDDEN'
    /** A request option was ignored because the entity's `UserEditable` does not allow it. */
    | 'OPTION_OVERRIDE_IGNORED'
    /** A request tried to widen scope without the `Clone Records: Override Scope` authorization; it was ignored. */
    | 'SCOPE_OVERRIDE_FORBIDDEN'
    /** A row's new primary key would equal its source key (no key column is remapped), so the copy would collide. */
    | 'TARGET_KEY_UNCHANGED'
    /** Rows the relationship's `ExcludeRows` leaves out, e.g. device tokens or drafts on a user clone. */
    | 'ROWS_EXCLUDED'
    /** The root entity's clone configuration failed validation; the plan is blocked. */
    | 'CONFIG_INVALID';

/**
 * Warning or notification emitted by the planning or execution engine.
 */
export interface CloneWarning {
    Code: CloneWarningCode;
    Severity: 'Info' | 'Warning' | 'Error';
    NodeKey?: string;
    Field?: string;
    Message: string;
}

/**
 * Granular ledger entry recording one modification to a specific field.
 */
export interface CloneFieldChange {
    Field: string;
    Kind: CloneFieldChangeKind;
    OldValue: unknown;
    NewValue: unknown;
    Reason: string;
    /**
     * The field is stored encrypted. The server-side plan keeps the real values so Execute can write them;
     * `MaskSensitiveFieldChange` replaces them before the plan is returned, logged or hashed.
     */
    Sensitive?: boolean;
}

/**
 * Options passed to the clone engine to govern graph expansion and execution.
 */
export interface CloneRequestOptions {
    DryRun?: boolean;
    Preset?: string;
    MaxDepth?: number;
    MaxRecords?: number;
    Subtypes?: 'include' | 'exclude';
    Hierarchy?: 'subtree' | 'node';
    SoftLinks?: 'skip' | 'include';
    EntityActions?: 'suppress' | 'fire';
    AIActions?: 'suppress' | 'fire';
    Embeddings?: 'copy' | 'regenerate';
    FieldOverrides?: Record<string, unknown>;
    PromptedValues?: Record<string, unknown>;
    FieldRules?: FieldRuleSet;
    Retarget?: Array<{ EntityName: string; Field: string; Value: unknown }>;
    Naming?: {
        Template?: string;
        Strategy?: 'suffix' | 'increment' | 'prompt' | 'none';
    };
    NamingTemplate?: string;
    NamingStrategy?: 'suffix' | 'increment' | 'prompt' | 'none';
    Reason?: string;
    NewParentKey?: string | null;
}

/**
 * Per-edge policy override provided by user review.
 */
export interface CloneEdgeOverride {
    FromKey?: string;
    ToKey?: string;
    RelationshipID?: string;
    Policy: CloneEdgePolicy;
}

/**
 * Full clone request submitted to the engine.
 */
export interface RecordCloneRequest {
    Roots?: Array<{ EntityName: string; Key: CompositeKeyLike }>;
    EntityName?: string;
    SourceRecordKey?: CompositeKeyLike | Record<string, unknown>;
    Preset?: string;
    Options?: CloneRequestOptions;
    EdgeOverrides?: CloneEdgeOverride[];
    FieldOverrides?: Record<string, unknown>;
    PromptedValues?: Record<string, unknown>;
    ExpectedPlanHash?: string;
}

/**
 * Graph edge connecting two plan nodes.
 */
export interface ClonePlanEdge {
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

/**
 * Graph node representing an entity record discovered or planned for cloning.
 */
export interface ClonePlanNode {
    Key: string;
    NodeKey?: string;
    EntityName: string;
    SourceKey: CompositeKeyLike | string;
    TargetKey: CompositeKeyLike | string | null;
    Action: CloneNodeAction;
    Reason: string;
    Depth: number;
    ParentKey: string | null;
    Via: ClonePlanEdge | null;
    DisplayName: string;
    IsSubtypeRow?: boolean;
    FieldChanges: CloneFieldChange[];
    Warnings: CloneWarning[];
    Route: 'RootSave' | 'Collection' | 'Embedded' | 'IsAChain' | 'Sidecar';
}

/**
 * Full execution plan for a record clone operation.
 */
export interface ClonePlan {
    PlanVersion: 1;
    Hash: string;
    PlanHash?: string;
    Roots: string[];
    RootEntityName?: string;
    RootSourceKey?: string;
    RootTargetKey?: string;
    Nodes: ClonePlanNode[];
    Edges: ClonePlanEdge[];
    Excluded?: unknown[];
    Counts: {
        ByEntity: Record<string, { Create: number; Reference: number; Skip: number }>;
        Create: number;
        Total: number;
    };
    Warnings: CloneWarning[];
    Blocked: boolean;
    /** Options widened beyond the entity's configuration through `Clone Records: Override Scope`. */
    Overrides?: string[];
    /** Why the user is cloning (`Options.Reason`); recorded on the clone log and each row's clone context. */
    Reason?: string;
    EffectiveOptions: Required<
        Pick<
            CloneRequestOptions,
            'MaxDepth' | 'MaxRecords' | 'Subtypes' | 'Hierarchy' | 'SoftLinks' | 'EntityActions' | 'AIActions' | 'Embeddings'
        >
    >;
}

/**
 * Result returned upon clone plan creation or execution.
 */
export interface RecordCloneResult {
    Success: boolean;
    ResultCode?: 'SUCCESS' | 'PLAN_CHANGED' | 'BLOCKED' | 'FORBIDDEN' | 'EXECUTION_ERROR';
    CloneLogID?: string | null;
    RootRecordKey?: string;
    RecordsCloned?: number;
    Roots?: Array<{ EntityName: string; SourceKey: CompositeKeyLike; TargetKey: CompositeKeyLike }>;
    Created?: Array<{ EntityName: string; SourceKey: CompositeKeyLike; TargetKey: CompositeKeyLike; Depth: number }>;
    Skipped?: Array<{ EntityName: string; SourceKey: CompositeKeyLike; Reason: string }>;
    Counts?: ClonePlan['Counts'];
    Warnings: CloneWarning[];
    Plan?: ClonePlan;
    ErrorMessage?: string;
}

/**
 * JSON remap specification for nested documents.
 */
export interface JsonRemapSpec {
    Path: string;
    Mode: 'remap' | 'reuse' | 'regenerate' | 'null' | 'drop';
    TargetEntityName?: string;
    OnMissing?: 'reuse' | 'drop';
    CleanEmptyContainers?: boolean;
}

/**
 * Helper to produce a compact deterministic string from a CompositeKeyLike.
 */
export function FormatCompositeKey(key: CompositeKeyLike | string): string {
    if (!key) {
        return '';
    }
    if (typeof key === 'string') {
        return key;
    }
    if (!key.KeyValuePairs || key.KeyValuePairs.length === 0) {
        return '';
    }
    const sorted = [...key.KeyValuePairs].sort((a, b) => a.FieldName.localeCompare(b.FieldName));
    if (sorted.length === 1) {
        return String(sorted[0].Value ?? '');
    }
    return sorted.map((kv) => `${kv.FieldName}=${String(kv.Value ?? '')}`).join('|');
}

/**
 * Helper to format a canonical node key in the format: "<EntityName>::<compactKey>".
 */
export function MakeNodeKey(entityName: string, key: CompositeKeyLike | string): string {
    return `${entityName}::${FormatCompositeKey(key)}`;
}
