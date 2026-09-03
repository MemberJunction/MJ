import { Field, InputType } from "type-graphql";
import { LogError } from "@memberjunction/core";

/**
 * GraphQL InputType for entity delete operations.
 *
 * SYNC REQUIREMENTS - Changes here require updates to:
 * 1. @memberjunction/core - EntityDeleteOptions class in interfaces.ts
 * 2. @memberjunction/graphql-dataprovider - Delete method default options in graphQLDataProvider.ts
 * 3. @memberjunction/graphql-dataprovider - DeleteQueryOptionsInput interface in graphQLSystemUserClient.ts
 *
 * TESTING: Schema sync tests in GraphQLDataProvider will fail if these files drift out of sync.
 * Run: cd packages/GraphQLDataProvider && npm run test
 *
 * @see packages/MJCore/src/generic/interfaces.ts - EntityDeleteOptions class
 * @see packages/GraphQLDataProvider/src/__tests__/schema-sync.test.ts - Automated sync verification
 */
@InputType()
export class DeleteOptionsInput {
    @Field(() => Boolean)
    SkipEntityAIActions: boolean;

    @Field(() => Boolean)
    SkipEntityActions: boolean;

    /**
     * When set to true, the delete operation will BYPASS Validate() and the actual
     * process of deleting the record from the database but WILL invoke any associated
     * actions (AI Actions, Entity Actions, etc...).
     */
    @Field(() => Boolean)
    ReplayOnly: boolean;

    /**
     * When true, this entity is being deleted as part of an IS-A parent chain
     * initiated by a child entity. The child deletes itself first (FK constraint),
     * then cascades deletion to its parent.
     */
    @Field(() => Boolean)
    IsParentEntityDelete: boolean;

    /**
     * When true, the delete skips writing its Record Change (audit) row even when the entity
     * has `TrackRecordChanges` on. Set by high-volume MACHINE writers (an integration sync
     * applying tens of thousands of records), never by interactive deletes — the suppression is
     * a property of the WRITER, not of the entity, so a human deleting the same record is still
     * audited.
     *
     * **NOT honoured over the wire.** This field exists on the InputType only because the
     * schema-sync gate requires `DeleteOptionsInput` to carry every `EntityDeleteOptions` field;
     * {@link DeleteOptionsInput.SanitizeFromWire} forces it back to false on every request. See
     * that method for why.
     */
    @Field(() => Boolean)
    SkipRecordChanges: boolean;

    /**
     * Strips wire-unreachable capabilities from client-supplied delete options.
     *
     * `SkipRecordChanges` suppresses an audit row, which is a strictly higher privilege than
     * "may delete" — and the only authorization a delete mutation performs is `entity:delete`.
     * Honouring the flag from the wire would let ANY caller permitted to delete override an
     * administrator's entity-level `TrackRecordChanges` decision, per call. The field is on this
     * InputType because the schema-sync gate mirrors every `EntityDeleteOptions` field onto it,
     * not because a client was ever meant to set it.
     *
     * This also restores parity with the save path, which has no `SaveOptionsInput` at all: its
     * twin (`EntitySaveOptions.SkipRecordChanges` / `SkipGeoCoding`) is inexpressible over
     * GraphQL. Suppression stays what it was designed to be — an IN-PROCESS capability that
     * `IntegrationEngine` sets on its own saves, never crossing a resolver.
     *
     * Downgrades rather than throws, deliberately: the thing being protected is the audit row,
     * so the right outcome is delete proceeds, audit is written, attempt is logged. Throwing
     * would yield no delete AND no audit row.
     *
     * Call this at EVERY wire entry point that accepts a `DeleteOptionsInput` — currently
     * `ResolverBase.DeleteRecord` (which every generated `DeleteX` mutation routes through) and
     * `FileCategoryResolver.DeleteFileCategory` (which builds its own delete and does not).
     */
    public static SanitizeFromWire(options: DeleteOptionsInput, entityName: string, userEmail?: string): DeleteOptionsInput {
        if (!options?.SkipRecordChanges) {
            return options;
        }
        LogError(
            `Ignoring SkipRecordChanges on a ${entityName} delete requested by ${userEmail ?? 'an unidentified caller'}: ` +
            `the Record Change (audit) row cannot be suppressed over the wire.`
        );
        return { ...options, SkipRecordChanges: false };
    }
}