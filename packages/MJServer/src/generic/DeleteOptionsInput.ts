import { Field, InputType } from "type-graphql";

/**
 * GraphQL InputType for the DeleteOptions.
 * Must be kept in sync with EntityDeleteOptions in @memberjunction/core.
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
}