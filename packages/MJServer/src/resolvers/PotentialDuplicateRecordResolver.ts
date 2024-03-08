import { Arg, Field, InputType, Int, ObjectType, Query, Resolver } from "type-graphql";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, PotentialDuplicate, Metadata, PrimaryKeyValue } from '@memberjunction/core';
import {PrimaryKeyValueInputType, PrimaryKeyValueOutputType} from './MergeRecordsResolver'

@InputType()
export class PotentialDuplicateRequestType extends PotentialDuplicateRequest {
  @Field(() => Int)
  EntityDocumentID: number;

  @Field(() => [PrimaryKeyValueInputType])
  PrimaryKeyValues: PrimaryKeyValueInputType[];

  @Field(() => Int, { nullable: true })
  EntitiyID: number;

  @Field(() => String, { nullable: true })
  EntityName: string;

  @Field(() => Int, { nullable: true })
  ProbabilityScore: number;

}

@ObjectType()
export class PotentialDuplicateType extends PotentialDuplicate {
  @Field(() => Int)
  ProbabilityScore: number;

  @Field(() => [PrimaryKeyValueOutputType])
  PrimaryKeyValues: PrimaryKeyValueOutputType[];
}

@ObjectType()
export class PotentialDuplicateResponseType extends PotentialDuplicateResponse{

  @Field(() => Int)
  EntityID: number;

  @Field(() => [PotentialDuplicateType])
  Duplicates: PotentialDuplicateType[];
}

@Resolver(PotentialDuplicateResponseType)
export class DuplicateRecordResolver {

  @Query(() => PotentialDuplicateResponseType)
  async GetRecordDuplicates(@Arg("params")params: PotentialDuplicateRequestType): Promise<PotentialDuplicateResponseType> {
      const md = new Metadata();
      const result = await md.GetRecordDuplicates(params);
      return result;
    }
}