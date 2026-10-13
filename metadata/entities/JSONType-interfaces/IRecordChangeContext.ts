/**
 * Structured provenance context for RecordChange rows.
 *
 * Stored as JSON in `MJ: Record Changes.ChangeContext`. CodeGen emits a
 * typed `ChangeContextObject` accessor on `MJRecordChangeEntity` that
 * returns `MJRecordChangeEntity_IRecordChangeContext | null`.
 *
 * @see plans/record-cloning/README.md §10.2
 */

export interface IRecordChangeCloneContext {
    /** ID of the RecordCloneLog row coordinating this clone operation. */
    CloneLogID: string;
    /** Entity name of the record being cloned. */
    SourceEntityName: string;
    /** Compact URL segment of the source key (bare value for single-column keys). */
    SourceRecordID: string;
    /** Entity name of the root record of the clone graph. */
    RootEntityName: string;
    /** Source key of the root record. */
    RootSourceRecordID: string;
    /** Target key of the root record after insertion. */
    RootTargetRecordID: string;
    /** Depth within the record graph (0 for root). */
    Depth: number;
    /** Relationship route traversed to reach this record. */
    Route: 'RootSave' | 'Collection' | 'Embedded' | 'IsAChain' | 'Sidecar';
    /** Kinds and field names only. Values are already in FullRecordJSON and are subject to FLS projection there. */
    FieldChangeSummary: Array<{ Kind: string; Fields: string[] }>;
    /** Optional explanation entered at clone time. */
    Reason?: string;
}

export interface IRecordChangeContext {
    /** Shape version. */
    Version: 1;
    /** The process that produced the change. Restore keeps its dedicated columns; it is listed so future writers can carry both. */
    Kind: 'Clone' | 'Merge' | 'Import' | 'Process' | 'Replay' | 'Other';
    /** Populated when Kind === 'Clone'. */
    Clone?: IRecordChangeCloneContext;
    /** Free-form tags for future kinds; never values. */
    Tags?: string[];
}
