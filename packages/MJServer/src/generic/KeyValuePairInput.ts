import { Field, InputType } from "type-graphql";

/**
 * GraphQL InputType for the KeyValuePairInput - used for various situations where an input
 * is required that has a combination of Key/Value pairs
 */
@InputType()
export class KeyValuePairInput {
    @Field(() => String)
    Key: string;
    
    @Field(() => String, { nullable: true})
    Value?: string;
}