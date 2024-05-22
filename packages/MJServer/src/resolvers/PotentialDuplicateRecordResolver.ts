import { Arg, Ctx, Field, Float, InputType, Int, ObjectType, Query, Resolver } from "type-graphql";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, PotentialDuplicate, Metadata, KeyValuePair, LogError, CompositeKey, PotentialDuplicateResult } from '@memberjunction/core';
import {KeyValuePairInputType, KeyValuePairOutputType} from './MergeRecordsResolver'
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

  @Field(() => [CompositeKeyInputType])
  RecordIDs: CompositeKey[];

  @Field(() => Int, { nullable: true })
  EntityDocumentID: number;

  @Field(() => Int, { nullable: true })
  ProbabilityScore: number;
  
  @Field(() => Int)
  ListID: number;
}

@InputType()
export class CompositeKeyInputType extends CompositeKey {
  @Field(() => [KeyValuePairInputType])
  KeyValuePairs: KeyValuePair[];
}

@ObjectType()
export class CompositeKeyOutputType extends CompositeKey {
  @Field(() => [KeyValuePairOutputType])
  KeyValuePairs: KeyValuePair[];
}

@ObjectType()
export class PotentialDuplicateType extends PotentialDuplicate {
  @Field(() => Float)
  ProbabilityScore: number;

  @Field(() => [KeyValuePairOutputType])
  KeyValuePairs: KeyValuePairOutputType[];
}

@ObjectType()
export class PotentialDuplicateResultType extends PotentialDuplicateResult {
  @Field(() => Int, { nullable: true })
  EntityID: number;

  @Field(() => [PotentialDuplicateType])
  Duplicates: PotentialDuplicateType[];

  @Field(() => CompositeKeyOutputType)
  RecordPrimaryKeys: CompositeKey;

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