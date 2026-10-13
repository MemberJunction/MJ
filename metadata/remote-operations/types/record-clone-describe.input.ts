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

/** Input for `RecordClone.Describe`. */
export interface RecordCloneDescribeInput {
    /** Registered entity name to inspect for cloning capabilities. */
    EntityName: string;
    /** Optional specific record key to inspect. */
    Key?: RecordCloneKey;
}
