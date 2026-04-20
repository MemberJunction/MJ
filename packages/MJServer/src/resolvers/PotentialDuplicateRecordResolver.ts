import { Arg, Ctx, Field, Float, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import {
  PotentialDuplicateRequest,
  PotentialDuplicateResponse,
  PotentialDuplicate,
  Metadata,
  CompositeKey,
  PotentialDuplicateResult,
} from '@memberjunction/core';
import { AppContext } from '../types.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

import { CompositeKeyInputType, CompositeKeyOutputType, KeyValuePairOutputType } from '../generic/KeyInputOutputTypes.js';
import { GetReadOnlyProvider } from '../util.js';

@InputType()
export class PotentialDuplicateRequestType extends PotentialDuplicateRequest {
  @Field(() => String)
  declare EntityID: string;

  @Field(() => [CompositeKeyInputType])
  declare RecordIDs: CompositeKey[];

  @Field(() => String, { nullable: true })
  declare EntityDocumentID: string;

  @Field(() => Int, { nullable: true })
  declare ProbabilityScore: number;

  @Field(() => String)
  declare ListID: string;
}

@ObjectType()
export class PotentialDuplicateType extends PotentialDuplicate {
  @Field(() => Float)
  declare ProbabilityScore: number;

  @Field(() => [KeyValuePairOutputType])
  declare KeyValuePairs: KeyValuePairOutputType[];
}

@ObjectType()
export class PotentialDuplicateResultType extends PotentialDuplicateResult {
  @Field(() => String, { nullable: true })
  declare EntityID: string;

  @Field(() => [PotentialDuplicateType])
  declare Duplicates: PotentialDuplicateType[];

  @Field(() => CompositeKeyOutputType)
  RecordPrimaryKeys: CompositeKey;

  @Field(() => [String])
  declare DuplicateRunDetailMatchRecordIDs: string[];
}

@ObjectType()
export class PotentialDuplicateResponseType extends PotentialDuplicateResponse {
  @Field(() => String)
  declare Status: 'Inprogress' | 'Success' | 'Error';

  @Field(() => String, { nullable: true })
  declare ErrorMessage?: string;

  @Field(() => [PotentialDuplicateResultType])
  declare PotentialDuplicateResult: PotentialDuplicateResult[];
}

@Resolver(PotentialDuplicateResponseType)
export class DuplicateRecordResolver {
  @Query(() => PotentialDuplicateResponseType)
  async GetRecordDuplicates(
    @Ctx() { dataSource, userPayload, providers }: AppContext,
    @Arg('params') params: PotentialDuplicateRequestType
  ): Promise<PotentialDuplicateResponseType> {
    const md = GetReadOnlyProvider(providers);

    const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase());
    if (!user) {
      throw new Error(`User ${userPayload.email} not found in UserCache`);
    }

    const result = await md.GetRecordDuplicates(params, user);
    return result;
  }
}
