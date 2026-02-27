import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, Metadata } from '@memberjunction/core';
import { GetReadOnlyProvider } from '../util.js';
import { ResolverBase } from '../generic/ResolverBase.js';

@ObjectType()
export class DatasetResultType {
  @Field(() => String)
  DatasetID: string;

  @Field(() => String)
  DatasetName: string;

  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string;

  @Field(() => Date)
  LatestUpdateDate: Date;

  @Field(() => String)
  Results: string;
}

@InputType()
export class DatasetItemFilterTypeGQL {
  @Field(() => String)
  ItemCode: string;

  @Field(() => String)
  Filter: string;
}


@Resolver(DatasetResultType)
export class DatasetResolverExtended extends ResolverBase {
  @Query(() => DatasetResultType)
  async GetDatasetByName(
    @Arg('DatasetName', () => String) DatasetName: string,
    @Ctx() { providers, userPayload }: AppContext,
    @Arg('ItemFilters', () => [DatasetItemFilterTypeGQL], { nullable: 'itemsAndList' }) ItemFilters?: DatasetItemFilterTypeGQL[]
  ) {
    // Check API key scope authorization for dataset read
    await this.CheckAPIKeyScopeAuthorization('dataset:read', DatasetName, userPayload);

    try {
      const md = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
      const result = await md.GetDatasetByName(DatasetName, ItemFilters);
      if (result) {
        return {
          DatasetID: result.DatasetID,
          DatasetName: result.DatasetName,
          Success: result.Success,
          Status: result.Status,
          LatestUpdateDate: result.LatestUpdateDate,
          Results: JSON.stringify(result.Results),
        };
      } else {
        throw new Error('Error retrieving Dataset: ' + DatasetName);
      }
    } catch (err) {
      LogError(err);
      throw new Error('Error retrieving Dataset: ' + DatasetName + '\n\n' + err);
    }
  }
}

@ObjectType()
export class DatasetStatusResultType {
  @Field(() => String)
  DatasetID: string;

  @Field(() => String)
  DatasetName: string;

  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string;

  @Field(() => Date)
  LatestUpdateDate: Date;

  @Field(() => String)
  EntityUpdateDates: string;
}

@Resolver(DatasetStatusResultType)
export class DatasetStatusResolver extends ResolverBase {
  @Query(() => DatasetStatusResultType)
  async GetDatasetStatusByName(
    @Arg('DatasetName', () => String) DatasetName: string,
    @Ctx() { providers, userPayload }: AppContext,
    @Arg('ItemFilters', () => [DatasetItemFilterTypeGQL], { nullable: 'itemsAndList' }) ItemFilters?: DatasetItemFilterTypeGQL[]
  ) {
    // Check API key scope authorization for dataset read
    await this.CheckAPIKeyScopeAuthorization('dataset:read', DatasetName, userPayload);

    try {
      const md = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
      const result = await md.GetDatasetStatusByName(DatasetName, ItemFilters);
      if (result) {
        return {
          DatasetID: result.DatasetID,
          DatasetName: result.DatasetName,
          Success: result.Success,
          Status: result.Status,
          LatestUpdateDate: result.LatestUpdateDate,
          EntityUpdateDates: JSON.stringify(result.EntityUpdateDates),
        };
      } else {
        throw new Error('Error retrieving Dataset Status: ' + DatasetName);
      }
    } catch (err) {
      LogError(err);
      throw new Error('Error retrieving Dataset Status: ' + DatasetName + '\n\n' + err);
    }
  }
}
