import { Arg, Ctx, Field, Float, InputType, Int, ObjectType, Query, Resolver } from "type-graphql";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, PotentialDuplicate, Metadata, PrimaryKeyValue, LogError, PrimaryKeyValueBase } from '@memberjunction/core';
import {PrimaryKeyValueInputType, PrimaryKeyValueOutputType} from './MergeRecordsResolver'
import { AppContext } from "../types";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

@InputType()
export class PotentialDuplicateRequestType extends PotentialDuplicateRequest {
  @Field(() => Int)
  EntityID: number;

  @Field(() => [PrimaryKeyValueBaseInputType])
  RecordIDs: PrimaryKeyValueBase[];

  @Field(() => Int, { nullable: true })
  EntityDocumentID: number;

  @Field(() => Int, { nullable: true })
  ProbabilityScore: number;
  
}

@InputType()
export class PrimaryKeyValueBaseInputType extends PrimaryKeyValueBase {
  @Field(() => [PrimaryKeyValueInputType])
  PrimaryKeyValues: PrimaryKeyValue[];
}

@ObjectType()
export class PotentialDuplicateType extends PotentialDuplicate {
  @Field(() => Float)
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
  async GetRecordDuplicates(@Ctx() { dataSource, userPayload }: AppContext, @Arg("params")params: PotentialDuplicateRequestType): Promise<PotentialDuplicateResponseType> {
      const md = new Metadata();
    
      const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase());
      if (!user) {
        throw new Error(`User ${userPayload.email} not found in UserCache`);
      }

      const result = await md.GetRecordDuplicates(params, user);
      return result;
    }
}