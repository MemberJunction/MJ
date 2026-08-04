/** A single primary-key field/value pair identifying a record to compare. */
export interface RecordComparisonKeyValuePair {
    /** Primary-key field name (e.g. "ID"). */
    FieldName: string;
    /** Primary-key value, as a string (UUIDs, ints, etc. are all sent as strings). */
    Value: string;
}

/**
 * One record to compare, expressed as its composite key (one pair for single-PK
 * entities, multiple for composite-PK entities).
 */
export interface RecordComparisonKey {
    /** The primary-key field/value pairs uniquely identifying this record. */
    KeyValuePairs: RecordComparisonKeyValuePair[];
}

/** Input for `RecordComparison.Compare`. */
export interface RecordComparisonCompareInput {
    /** Registered entity name (e.g. "Accounts"), NOT the physical table name. */
    EntityName: string;
    /**
     * The records to compare, in column order. By convention the first key is the
     * survivor candidate (the reference column); the rest are potential matches.
     */
    Keys: RecordComparisonKey[];
    /**
     * Optional include-list of field names to restrict the comparison to. When omitted,
     * all non-PK, non-system fields are compared (matched case-insensitively).
     */
    IncludeFields?: string[];
}
