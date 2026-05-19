import { Field, InputType } from 'type-graphql';

/**
 * GraphQL InputType carrying restore-lineage context across the network.
 *
 * Set as the `RestoreContext___` reserved field on any entity Create or
 * Update mutation input when the operation is a restore. The server-side
 * resolver detects it, calls `BaseEntity.SetRestoreContext()` on the
 * server-side entity instance before `Save()`, and the data provider then
 * writes the resulting RecordChange row with `Source='Restore'`,
 * `RestoredFromID = SourceChangeID`, and `RestoreReason = Reason`.
 *
 * Mirrors the pattern used by `OldValues___` (KeyValuePairInput[]) — a
 * non-field metadata blob carried alongside the regular field values
 * through the GraphQL mutation input.
 */
@InputType()
export class RestoreContextInput {
    /**
     * ID of the historical RecordChange row whose state is being restored.
     * Persisted to RecordChange.RestoredFromID on the new change row.
     */
    @Field(() => String)
    SourceChangeID: string;

    /**
     * Optional user-entered explanation for the restore. Persisted to
     * RecordChange.RestoreReason. NULL when the user did not enter one.
     */
    @Field(() => String, { nullable: true })
    Reason?: string | null;
}
