/** A scalar field value as loaded from the database. */
export type RecordComparisonFieldValue = string | number | boolean | null;

/** One loaded record in the comparison. Mirrors the engine's `RecordComparisonRecord`. */
export interface RecordComparisonRecord {
    /** Zero-based index aligned with the input `Keys` array (the comparison column). */
    ColumnIndex: number;
    /** The composite key identifying this record (as supplied in the input). */
    Key: unknown;
    /** A human-readable label for the record. */
    Label: string;
    /** Plain field-name → value map for this record (only the compared fields). */
    Values: Record<string, RecordComparisonFieldValue>;
}

/** Per-record value of a single field. Mirrors the engine's `RecordComparisonFieldCell`. */
export interface RecordComparisonFieldCell {
    /** Column index aligned with the record's `ColumnIndex`. */
    ColumnIndex: number;
    /** The field's value for this record. */
    Value: RecordComparisonFieldValue;
    /**
     * True when this cell's value equals (case-insensitive, trimmed) the reference
     * cell (column 0). Column 0 is always true.
     */
    EqualsReference: boolean;
}

/**
 * The delta for a single field across all compared records. Mirrors the engine's
 * `RecordComparisonFieldDelta`.
 */
export interface RecordComparisonFieldDelta {
    /** Field name (matches the entity field metadata Name). */
    FieldName: string;
    /** Display name for the field. */
    DisplayName: string;
    /** Optional grouping category from the field metadata. */
    Category: string | null;
    /** Per-record values for this field, in column order. */
    Cells: RecordComparisonFieldCell[];
    /** True when at least one record's value differs from the reference (column 0). */
    Differs: boolean;
}

/**
 * Output of `RecordComparison.Compare` — the loaded records plus the per-field delta
 * matrix. Logical success/failure is carried by the wrapping `RemoteOpResult` (a failed
 * comparison surfaces as `Success=false` + `ErrorMessage`), so this payload is the
 * success body only.
 */
export interface RecordComparisonCompareOutput {
    /** The registered entity name that was compared. */
    EntityName: string;
    /** The loaded records, in input column order. */
    Records: RecordComparisonRecord[];
    /** The per-field delta matrix. Only fields with at least one non-empty value. */
    Fields: RecordComparisonFieldDelta[];
}
