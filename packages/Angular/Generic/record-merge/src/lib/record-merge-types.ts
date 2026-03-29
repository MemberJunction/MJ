/**
 * @fileoverview Types for the record merge/comparison panel.
 *
 * Defines data contracts for field-by-field comparison of entity records,
 * including conflict detection, merge selection, and merge operations.
 */

/** Represents a field-level comparison between two records */
export interface FieldComparison {
    /** The field name */
    FieldName: string;
    /** Display label for the field */
    DisplayLabel: string;
    /** Value from the left (source) record */
    LeftValue: unknown;
    /** Value from the right (target) record */
    RightValue: unknown;
    /** Whether the values differ */
    HasConflict: boolean;
    /** Which side is selected for the merge result: 'left', 'right', or 'custom' */
    SelectedSide: 'left' | 'right' | 'custom';
    /** Custom value if the user provides one */
    CustomValue?: unknown;
    /** Whether this field is read-only (e.g., ID, computed fields) */
    IsReadOnly: boolean;
    /** The field data type for display formatting */
    DataType: string;
}

/** Merge configuration */
export interface MergeConfig {
    /** The entity name */
    EntityName: string;
    /** Record ID of the left (source) record */
    LeftRecordID: string;
    /** Record ID of the right (target) record */
    RightRecordID: string;
    /** Which record to keep as the survivor */
    SurvivorSide: 'left' | 'right';
    /** Display labels for each side */
    LeftLabel: string;
    RightLabel: string;
}

/** Result of a merge comparison */
export interface MergeComparisonResult {
    /** All field comparisons */
    Fields: FieldComparison[];
    /** Fields with conflicts */
    ConflictFields: FieldComparison[];
    /** Fields without conflicts */
    MatchingFields: FieldComparison[];
    /** Total number of fields */
    TotalFieldCount: number;
    /** Number of conflicts */
    ConflictCount: number;
}

/** Merge action result */
export interface MergeActionResult {
    /** Whether the merge succeeded */
    Success: boolean;
    /** The surviving record ID */
    SurvivorRecordID: string;
    /** The merged record ID (deleted if applicable) */
    MergedRecordID: string;
    /** Error message if merge failed */
    ErrorMessage?: string;
    /** Number of fields updated */
    UpdatedFieldCount: number;
}

/** Event emitted when the user confirms a merge */
export interface MergeConfirmedEvent {
    /** The merge configuration */
    Config: MergeConfig;
    /** The resolved field values */
    ResolvedFields: FieldComparison[];
}

/** Event emitted when the user selects a side for a field */
export interface FieldSelectionEvent {
    /** The field name */
    FieldName: string;
    /** Which side was selected */
    SelectedSide: 'left' | 'right' | 'custom';
    /** The selected value */
    Value: unknown;
}
