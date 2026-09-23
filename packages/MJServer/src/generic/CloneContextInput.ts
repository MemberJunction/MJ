import { Field, InputType, Int } from 'type-graphql';

/**
 * GraphQL InputType carrying a category and array of field names for field change summary.
 */
@InputType()
export class FieldChangeSummaryInput {
    @Field(() => String)
    Kind: string;

    @Field(() => [String])
    Fields: string[];
}

/**
 * GraphQL InputType carrying clone-provenance context across the network.
 *
 * Set as the `CloneContext___` reserved field on any entity Create or
 * Update mutation input when the operation is a clone. The server-side
 * resolver detects it, calls `BaseEntity.SetCloneContext()` on the
 * server-side entity instance before `Save()`, and the data provider then
 * writes the resulting RecordChange row with `Source='Clone'` and the
 * structured `ChangeContext` JSON payload.
 *
 * Mirrors the pattern used by `RestoreContext___` (RestoreContextInput) and
 * `OldValues___` (KeyValuePairInput[]) — a non-field metadata blob carried
 * alongside the regular field values through the GraphQL mutation input.
 *
 * @see plans/record-cloning/README.md §10.3
 */
@InputType()
export class CloneContextInput {
    /** ID of the RecordCloneLog row coordinating this clone operation. */
    @Field(() => String)
    CloneLogID: string;

    /** Entity name of the record being cloned. */
    @Field(() => String)
    SourceEntityName: string;

    /** Compact URL segment of the source key (bare value for single-column keys). */
    @Field(() => String)
    SourceRecordID: string;

    /** Entity name of the root record of the clone graph. */
    @Field(() => String)
    RootEntityName: string;

    /** Source key of the root record. */
    @Field(() => String)
    RootSourceRecordID: string;

    /** Target key of the root record after insertion. */
    @Field(() => String)
    RootTargetRecordID: string;

    /** Depth within the record graph (0 for root). */
    @Field(() => Int)
    Depth: number;

    /** Relationship route traversed to reach this record. */
    @Field(() => String)
    Route: 'RootSave' | 'Collection' | 'Embedded' | 'IsAChain' | 'Sidecar';

    /** Kinds and field names only. Values are already in FullRecordJSON. */
    @Field(() => [FieldChangeSummaryInput])
    FieldChangeSummary: FieldChangeSummaryInput[];

    /** Optional explanation entered at clone time. */
    @Field(() => String, { nullable: true })
    Reason?: string | null;
}
