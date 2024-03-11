import { Arg, Ctx, Field, Float, InputType, Int, ObjectType, Query, Resolver } from "type-graphql";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, PotentialDuplicate, Metadata, PrimaryKeyValue, LogError } from '@memberjunction/core';
import {PrimaryKeyValueInputType, PrimaryKeyValueOutputType} from './MergeRecordsResolver'
import { AppContext } from "../types";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

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

      LogError("RESOLVER: Current User: " + user.Email);
      const result = await md.GetRecordDuplicates(params, user);
      return result;
    }
}