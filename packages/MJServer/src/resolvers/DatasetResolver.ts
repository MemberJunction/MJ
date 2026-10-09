import { Arg, Ctx, Field, InputType, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { DatabaseProviderBase, DatasetItemFilterType, DatasetItemResultType, LogError, Metadata, UserInfo } from '@memberjunction/core';
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

/**
 * Request handling shared by the dataset queries. Every read runs as the session's user, so the
 * provider applies that user's entity read permission and row-level security per item, and every
 * client ItemFilter passes the same AST screen as a RunView ExtraFilter before a provider sees it.
 */
export abstract class DatasetResolverBase extends ResolverBase {
  /** The session's user. A dataset read never runs without one: the provider applies no read checks then. */
  protected RequireDatasetUser(userPayload: UserPayload): UserInfo {
    const user = this.GetUserFromPayload(userPayload);
    if (!user) {
      throw new Error('Dataset request refused: the session resolves to no user');
    }
    return user;
  }

  /**
   * Screens every client ItemFilter: one statement, read-only, and subqueries only over entity base
   * views the user can read. Throws on the first refusal. Returns the filters without null entries.
   */
  protected ScreenItemFilters(
    itemFilters: DatasetItemFilterTypeGQL[] | undefined,
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): DatasetItemFilterType[] | undefined {
    if (!itemFilters) return undefined;
    itemFilters.forEach((itemFilter, index) => {
      if (itemFilter) {
        this.assertClientClauseUsesEntityBaseViews(itemFilter.Filter, `ItemFilters[${index}].Filter`, provider, user);
      }
    });
    return itemFilters.filter((itemFilter) => itemFilter != null);
  }

  /**
   * Applies the API encryption policy to each item's rows, as every other GraphQL read path does:
   * an encrypted field the entity does not allow decrypted over the API leaves as ciphertext or the
   * sentinel. Works on copies, because the rows can be the server cache's own frozen objects.
   */
  protected async ProtectEncryptedFields(
    items: DatasetItemResultType[],
    provider: DatabaseProviderBase,
    user: UserInfo,
  ): Promise<DatasetItemResultType[]> {
    return Promise.all(
      items.map(async (item) => {
        const entity = provider.EntityByName(item.EntityName);
        if (!item.Results?.length || !entity?.EncryptedFields.some((field) => !field.AllowDecryptInAPI)) {
          return item;
        }
        const rows = item.Results.map((row: Record<string, unknown>) => ({ ...row }));
        return { ...item, Results: await this.ArrayFilterEncryptedFieldsForAPI(item.EntityName, rows, user, provider, 'Name') };
      }),
    );
  }
}

@Resolver(DatasetResultType)
export class DatasetResolverExtended extends DatasetResolverBase {
  @Query(() => DatasetResultType)
  async GetDatasetByName(
    @Arg('DatasetName', () => String) DatasetName: string,
    @Ctx() { providers, userPayload }: AppContext,
    @Arg('ItemFilters', () => [DatasetItemFilterTypeGQL], { nullable: 'itemsAndList' }) ItemFilters?: DatasetItemFilterTypeGQL[]
  ) {
    // Check API key scope authorization for dataset read
    await this.CheckAPIKeyScopeAuthorization('dataset:read', DatasetName, userPayload);
    const md = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
    const user = this.RequireDatasetUser(userPayload);
    const itemFilters = this.ScreenItemFilters(ItemFilters, md, user);

    try {
      const result = await md.GetDatasetByName(DatasetName, itemFilters, user);
      if (result) {
        return {
          DatasetID: result.DatasetID,
          DatasetName: result.DatasetName,
          Success: result.Success,
          Status: result.Status,
          LatestUpdateDate: result.LatestUpdateDate,
          Results: JSON.stringify(await this.ProtectEncryptedFields(result.Results, md, user)),
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
export class DatasetStatusResolver extends DatasetResolverBase {
  @Query(() => DatasetStatusResultType)
  async GetDatasetStatusByName(
    @Arg('DatasetName', () => String) DatasetName: string,
    @Ctx() { providers, userPayload }: AppContext,
    @Arg('ItemFilters', () => [DatasetItemFilterTypeGQL], { nullable: 'itemsAndList' }) ItemFilters?: DatasetItemFilterTypeGQL[]
  ) {
    // Check API key scope authorization for dataset read
    await this.CheckAPIKeyScopeAuthorization('dataset:read', DatasetName, userPayload);
    const md = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
    const user = this.RequireDatasetUser(userPayload);
    const itemFilters = this.ScreenItemFilters(ItemFilters, md, user);

    try {
      const result = await md.GetDatasetStatusByName(DatasetName, itemFilters, user);
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

  /**
   * Batch version: fetch status for multiple datasets in a single round-trip.
   * Reduces N separate GetDatasetStatusByName calls to 1 network request.
   */
  @Query(() => [DatasetStatusResultType])
  async GetMultipleDatasetStatusByName(
    @Arg('DatasetNames', () => [String]) DatasetNames: string[],
    @Ctx() { providers, userPayload }: AppContext,
  ): Promise<DatasetStatusResultType[]> {
    const md = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
    const user = this.RequireDatasetUser(userPayload);
    const results: DatasetStatusResultType[] = [];

    // Execute all status checks in parallel
    const statusPromises = DatasetNames.map(async (name) => {
      await this.CheckAPIKeyScopeAuthorization('dataset:read', name, userPayload);
      return md.GetDatasetStatusByName(name, undefined, user);
    });

    const statuses = await Promise.all(statusPromises);

    for (const result of statuses) {
      if (result) {
        results.push({
          DatasetID: result.DatasetID,
          DatasetName: result.DatasetName,
          Success: result.Success,
          Status: result.Status,
          LatestUpdateDate: result.LatestUpdateDate,
          EntityUpdateDates: JSON.stringify(result.EntityUpdateDates),
        } as DatasetStatusResultType);
      }
    }

    return results;
  }
}
