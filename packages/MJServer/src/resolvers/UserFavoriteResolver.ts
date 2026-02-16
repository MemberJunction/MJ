import { Metadata, KeyValuePair, CompositeKey, UserInfo } from '@memberjunction/core';
import {
  AppContext,
  Arg,
  CompositeKeyInputType,
  CompositeKeyOutputType,
  Ctx,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@memberjunction/server';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

import { MJUserFavorite_, MJUserFavoriteResolverBase } from '../generated/generated.js';
import { GetReadOnlyProvider } from '../util.js';

//****************************************************************************
// INPUT TYPE for User Favorite Queries
//****************************************************************************
@InputType()
export class UserFavoriteSearchParams {
  @Field(() => String)
  EntityID: string;

  @Field(() => CompositeKeyInputType)
  CompositeKey: CompositeKeyInputType;

  @Field(() => String)
  UserID: string;
}

@InputType()
export class UserFavoriteSetParams {
  @Field(() => String)
  EntityID: string;

  @Field(() => CompositeKeyInputType)
  CompositeKey: CompositeKeyInputType;

  @Field(() => String)
  UserID: string;

  @Field(() => Boolean)
  IsFavorite: boolean;
}

@ObjectType()
export class UserFavoriteResult {
  @Field(() => Int)
  EntityID: number;

  @Field(() => CompositeKeyOutputType)
  CompositeKey: CompositeKeyOutputType;

  @Field(() => Int)
  UserID: number;

  @Field(() => Boolean)
  IsFavorite: boolean;

  @Field(() => Boolean)
  Success: boolean;
}

@Resolver(MJUserFavorite_)
export class UserFavoriteResolver extends MJUserFavoriteResolverBase {
  @Query(() => [MJUserFavorite_])
  async UserFavoritesByUserID(@Arg('UserID', () => Int) UserID: number, @Ctx() { providers, userPayload }: AppContext) {
    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})    
    return await this.findBy(provider, 'MJ: User Favorites', { UserID }, userPayload.userRecord);
  }

  @Query(() => [MJUserFavorite_])
  async UserFavoriteSearchByParams(@Arg('params', () => Int) params: UserFavoriteSearchParams, @Ctx() { providers, userPayload }: AppContext) {
    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})    
    return await this.findBy(provider, 'MJ: User Favorites', params, userPayload.userRecord);
  }

  @Query(() => UserFavoriteResult)
  async GetRecordFavoriteStatus(@Arg('params', () => UserFavoriteSearchParams) params: UserFavoriteSearchParams, @Ctx() {providers, userPayload}: AppContext) {
    const p = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
    const pk = new CompositeKey(params.CompositeKey.KeyValuePairs);

    const e = p.Entities.find((e) => e.ID === params.EntityID);
    if (e)
      return {
        EntityID: params.EntityID,
        UserID: params.UserID,
        CompositeKey: pk,
        IsFavorite: await p.GetRecordFavoriteStatus(params.UserID, e.Name, pk, userPayload.userRecord),
        Success: true,
      };
    else throw new Error(`Entity ID:${params.EntityID} not found`);
  }

  @Mutation(() => UserFavoriteResult)
  async SetRecordFavoriteStatus(@Arg('params', () => UserFavoriteSetParams) params: UserFavoriteSetParams, @Ctx() { userPayload, providers }: AppContext) {
    const p = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true});
    const pk = new CompositeKey(params.CompositeKey.KeyValuePairs);
    const e = p.Entities.find((e) => e.ID === params.EntityID);
    const u = UserCache.Users.find((u) => u.ID === userPayload.userRecord.ID);
    if (e) {
      await p.SetRecordFavoriteStatus(params.UserID, e.Name, pk, params.IsFavorite, u);
      return {
        Success: true,
        EntityID: params.EntityID,
        UserID: params.UserID,
        CompositeKey: params.CompositeKey,
        IsFavorite: params.IsFavorite,
      };
    } else throw new Error(`Entity ID:${params.EntityID} not found`);
  }
}

export default UserFavoriteResolver;
