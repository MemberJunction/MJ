/** Single item in a record's clone lineage. */
export interface RecordCloneLineageItem {
    /** Entity name of the record. */
    EntityName: string;
    /** Primary key of the record. */
    RecordID: string;
    /** Human-readable display name of the record. */
    DisplayName?: string;
    /** ID of the MJ: Record Clone Logs header row that produced this clone, if known. */
    CloneLogID?: string;
    /** ISO timestamp when the clone occurred, if known. */
    ClonedAt?: string;
    /** User ID or display name who initiated the clone, if known. */
    ClonedBy?: string;
}

/** Output for `RecordClone.GetLineage`. */
export interface RecordCloneGetLineageOutput {
    /** Chain of ancestor records cloned from, ordered oldest to immediate parent. */
    Ancestors: RecordCloneLineageItem[];
    /** Direct descendant records cloned from this record. */
    Clones: RecordCloneLineageItem[];
    /** Total count of direct descendant clones. */
    TotalClones: number;
}
