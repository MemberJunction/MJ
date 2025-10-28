import { KeyValuePair } from "@memberjunction/core";
import { Field, InputType, ObjectType } from "type-graphql";



@InputType()
export class KeyValuePairInputType {
  @Field(() => String)
  FieldName: string;

  @Field(() => String)
  Value: string;
}

@ObjectType()
export class KeyValuePairOutputType {
  @Field(() => String)
  FieldName: string;

  @Field(() => String)
  Value: string;
}
 

@InputType()
export class CompositeKeyInputType {
  @Field(() => [KeyValuePairInputType])
  KeyValuePairs: KeyValuePair[];
}

@ObjectType()
export class CompositeKeyOutputType {
  @Field(() => [KeyValuePairOutputType])
  KeyValuePairs: KeyValuePair[];
}