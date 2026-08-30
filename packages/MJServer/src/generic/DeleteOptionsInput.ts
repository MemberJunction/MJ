import { Field, InputType } from "type-graphql";

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
     */
    @Field(() => Boolean)
    SkipRecordChanges: boolean;
}