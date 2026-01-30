import { CompositeKey, EntityInfo, EntityRelationshipInfo } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Label types
// ---------------------------------------------------------------------------

/**
 * The breadth of a version label.
 * - System: captures all tracked entities
 * - Entity: captures all records of one entity type
 * - Record: captures one record and its dependency graph
 */
export type VersionLabelScope = 'System' | 'Entity' | 'Record';

/**
 * Lifecycle state of a version label.
 * - Active: current / usable
 * - Archived: kept for reference, not usable for restore
 * - Restored: this label was the target of a restore operation
 */
export type VersionLabelStatus = 'Active' | 'Archived' | 'Restored';

/**
 * Parameters for creating a new version label.
 */
export interface CreateLabelParams {
    /** Human-readable name */
    Name: string;
    /** Optional longer description */
    Description?: string;
    /** Scope of the label (default: System) */
    Scope?: VersionLabelScope;
    /** When scope is Entity or Record, the target entity name */
    EntityName?: string;
    /** When scope is Record, the target record key */
    RecordKey?: CompositeKey;
    /** Optional external system reference (git SHA, release tag, etc.) */
    ExternalSystemID?: string;
    /**
     * Whether to include dependent records when scope is Record.
     * If true, walks the dependency graph and captures child/grandchild records.
     * Default: true
     */
    IncludeDependencies?: boolean;
    /**
     * Maximum depth of dependency graph traversal.
     * Only relevant when IncludeDependencies is true.
     * Default: 10
     */
    MaxDepth?: number;
    /**
     * Entity names to exclude from dependency graph traversal.
     * Only relevant when IncludeDependencies is true.
     */
    ExcludeEntities?: string[];
}

/**
 * Filter options for querying version labels.
 */
export interface LabelFilter {
    /** Filter by scope */
    Scope?: VersionLabelScope;
    /** Filter by status */
    Status?: VersionLabelStatus;
    /** Filter by entity name (for Entity/Record scope labels) */
    EntityName?: string;
    /** Filter by record ID */
    RecordID?: string;
    /** Filter by creator user ID */
    CreatedByUserID?: string;
    /** Filter by name (partial match) */
    NameContains?: string;
    /** Maximum number of results */
    MaxResults?: number;
    /** Order by field */
    OrderBy?: string;
}

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

/**
 * Result of a snapshot capture operation.
 */
export interface CaptureResult {
    /** Whether the capture succeeded */
    Success: boolean;
    /** The label that was created/populated */
    LabelID: string;
    /** Number of records captured */
    ItemsCaptured: number;
    /** Number of synthetic snapshots created (for records with no prior RecordChange) */
    SyntheticSnapshotsCreated: number;
    /** Any errors encountered during capture */
    Errors: CaptureError[];
}

export interface CaptureError {
    EntityName: string;
    RecordID: string;
    ErrorMessage: string;
}

/**
 * Represents a record's state at a specific point in time.
 */
export interface RecordSnapshot {
    /** Entity name */
    EntityName: string;
    /** Entity ID */
    EntityID: string;
    /** Record primary key as concatenated string */
    RecordID: string;
    /** The RecordChange ID this snapshot came from */
    RecordChangeID: string;
    /** When the snapshot was taken */
    ChangedAt: Date;
    /** Full record data as parsed JSON */
    FullRecordJSON: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dependency graph types
// ---------------------------------------------------------------------------

/**
 * A node in a record dependency graph.
 */
export interface DependencyNode {
    /** Entity name */
    EntityName: string;
    /** Entity metadata */
    EntityInfo: EntityInfo;
    /** The record's primary key */
    RecordKey: CompositeKey;
    /** The record's primary key as a concatenated string */
    RecordID: string;
    /** Current field values of the record */
    RecordData: Record<string, unknown>;
    /** Relationship from parent to this node (null for root) */
    Relationship: EntityRelationshipInfo | null;
    /** Child/dependent record nodes */
    Children: DependencyNode[];
    /** Depth in the graph (0 = root) */
    Depth: number;
}

/**
 * Options for walking the dependency graph.
 */
export interface WalkOptions {
    /** Maximum recursion depth (default: 10) */
    MaxDepth?: number;
    /** Only include these entities */
    EntityFilter?: string[];
    /** Skip these entities */
    ExcludeEntities?: string[];
    /** Include soft-deleted records (default: false) */
    IncludeDeleted?: boolean;
}

// ---------------------------------------------------------------------------
// Diff types
// ---------------------------------------------------------------------------

/**
 * The result of comparing two labels or a label to the current state.
 */
export interface DiffResult {
    /** The starting label */
    FromLabelID: string;
    FromLabelName: string;
    /** The ending label (null if comparing to current state) */
    ToLabelID: string | null;
    ToLabelName: string | null;
    /** Summary statistics */
    Summary: DiffSummary;
    /** Changes grouped by entity */
    EntityDiffs: EntityDiffGroup[];
}

export interface DiffSummary {
    TotalRecordsChanged: number;
    TotalRecordsAdded: number;
    TotalRecordsDeleted: number;
    TotalRecordsModified: number;
    EntitiesAffected: number;
}

/**
 * Changes within a single entity type.
 */
export interface EntityDiffGroup {
    EntityName: string;
    EntityID: string;
    Records: RecordDiff[];
    /** Counts for this entity */
    AddedCount: number;
    ModifiedCount: number;
    DeletedCount: number;
}

/**
 * The difference for a single record between two labels.
 */
export interface RecordDiff {
    RecordID: string;
    EntityName: string;
    DiffType: RecordDiffType;
    /** Field-level changes (only populated for Modified records) */
    FieldChanges: FieldChange[];
    /** Snapshot from the "from" label (null for Added records) */
    FromSnapshot: Record<string, unknown> | null;
    /** Snapshot from the "to" label or current state (null for Deleted records) */
    ToSnapshot: Record<string, unknown> | null;
}

export type RecordDiffType = 'Added' | 'Modified' | 'Deleted' | 'Unchanged';

/**
 * A single field-level change between two snapshots.
 */
export interface FieldChange {
    FieldName: string;
    OldValue: unknown;
    NewValue: unknown;
    ChangeType: 'Added' | 'Modified' | 'Removed';
}

// ---------------------------------------------------------------------------
// Restore types
// ---------------------------------------------------------------------------

/**
 * Status of a restore operation.
 */
export type RestoreStatus = 'Pending' | 'In Progress' | 'Complete' | 'Error' | 'Partial';

/**
 * Options for restoring to a version label.
 */
export interface RestoreOptions {
    /** Preview only, don't actually apply changes (default: false) */
    DryRun?: boolean;
    /** Restore all items or only selected records */
    Scope?: 'Full' | 'Selected';
    /** When Scope is Selected, the records to restore */
    SelectedRecords?: Array<{ EntityName: string; RecordID: string }>;
    /** Entities to exclude from restore */
    SkipEntities?: string[];
    /** Auto-create a "before restore" label as safety net (default: true) */
    CreatePreRestoreLabel?: boolean;
}

/**
 * The result of a restore operation.
 */
export interface RestoreResult {
    /** The restore audit record ID */
    RestoreID: string;
    /** The safety-net label created before restore (if CreatePreRestoreLabel was true) */
    PreRestoreLabelID: string | null;
    /** Overall status */
    Status: RestoreStatus;
    /** Number of records successfully restored */
    RestoredCount: number;
    /** Number of records that failed */
    FailedCount: number;
    /** Number of records skipped (e.g. already at target state) */
    SkippedCount: number;
    /** Per-record details */
    Details: RestoreItemResult[];
}

/**
 * Result for restoring a single record.
 */
export interface RestoreItemResult {
    EntityName: string;
    RecordID: string;
    Status: 'Restored' | 'Failed' | 'Skipped';
    ErrorMessage?: string;
}
