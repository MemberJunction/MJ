import { Arg, Ctx, Field, Float, InputType, Int, ObjectType, Query, Resolver } from "type-graphql";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, PotentialDuplicate, Metadata, PrimaryKeyValue, LogError, PrimaryKeyValueBase, PotentialDuplicateResult } from '@memberjunction/core';
import {PrimaryKeyValueInputType, PrimaryKeyValueOutputType} from './MergeRecordsResolver'
import { AppContext } from "../types";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

//load the default vectorDB and embedding model
import {LoadMistralEmbedding} from '@memberjunction/ai-mistral';
import {LoadPineconeVectorDB} from '@memberjunction/ai-vectors-pinecone';
LoadMistralEmbedding();
LoadPineconeVectorDB();

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
  
  @Field(() => Int)
  ListID: number;
}

@InputType()
export class PrimaryKeyValueBaseInputType extends PrimaryKeyValueBase {
  @Field(() => [PrimaryKeyValueInputType])
  PrimaryKeyValues: PrimaryKeyValue[];
}

@ObjectType()
export class PrimaryKeyValueBaseOutputType extends PrimaryKeyValueBase {
  @Field(() => [PrimaryKeyValueOutputType])
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
export class PotentialDuplicateResultType extends PotentialDuplicateResult {
  @Field(() => Int, { nullable: true })
  EntityID: number;

  @Field(() => [PotentialDuplicateType])
  Duplicates: PotentialDuplicateType[];

  @Field(() => PrimaryKeyValueBaseOutputType)
  RecordPrimaryKeys: PrimaryKeyValueBase;

  @Field(() => [Int])
  DuplicateRunDetailMatchRecordIDs: number[];
}

@ObjectType()
export class PotentialDuplicateResponseType extends PotentialDuplicateResponse{

  @Field(() => String)
  Status: 'Inprogress' | 'Success' | 'Error';

  @Field(() => String, { nullable: true })
  ErrorMessage?: string;

  @Field(() => [PotentialDuplicateResultType])
  PotentialDuplicateResult: PotentialDuplicateResult[]
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