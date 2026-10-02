/** A single primary-key field/value pair identifying a record. */
export interface RecordCloneKeyValuePair {
    /** Primary-key field name (e.g. "ID"). */
    FieldName: string;
    /** Primary-key value as a string. */
    Value: string;
}

/** Record key expressed as composite key-value pairs. */
export interface RecordCloneKey {
    KeyValuePairs: RecordCloneKeyValuePair[];
}

/** Input for `RecordClone.GetLineage`. */
export interface RecordCloneGetLineageInput {
    /** Registered entity name. */
    EntityName: string;
    /** Composite key of the record whose clone lineage is being queried. */
    Key: RecordCloneKey;
    /** Direction of traversal: ancestors ('up'), descendants ('down'), or both ('both'). Defaults to 'both'. */
    Direction?: 'up' | 'down' | 'both';
}
