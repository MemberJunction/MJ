import { Field, InputType } from "type-graphql";

/**
 * GraphQL InputType for the DeleteOptions 
 */
@InputType()
export class DeleteOptionsInput {
    @Field(() => Boolean)
    SkipEntityAIActions: boolean;
    
    @Field(() => Boolean) 
    SkipEntityActions: boolean;
}