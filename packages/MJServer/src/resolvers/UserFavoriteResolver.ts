import { Metadata, PrimaryKeyValue } from '@memberjunction/core';
import { AppContext, Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, PrimaryKeyValueInputType, PrimaryKeyValueOutputType, Query, Resolver } from '@memberjunction/server';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { UserFavoriteEntity } from '@memberjunction/core-entities';

import { UserFavorite_, UserFavoriteResolverBase } from '../generated/generated';

//****************************************************************************
// INPUT TYPE for User Favorite Queries
//****************************************************************************
@InputType()
export class UserFavoriteSearchParams {
  @Field(() => Int)
  EntityID: number;

  @Field(() => [PrimaryKeyValueInputType])
  PrimaryKeyValues: PrimaryKeyValue[];

  @Field(() => Int)
  UserID: number;
}

@InputType()
export class UserFavoriteSetParams {
  @Field(() => Int)
  EntityID: number;

  @Field(() => [PrimaryKeyValueInputType])
  PrimaryKeyValues: PrimaryKeyValue[];

  @Field(() => Int)
  UserID: number;

  @Field(() => Boolean)
  IsFavorite: boolean;
}

@ObjectType()
export class UserFavoriteResult {
  @Field(() => Int)
  EntityID: number;

  @Field(() => [PrimaryKeyValueOutputType])
  PrimaryKeyValues: PrimaryKeyValue[];

  @Field(() => Int)
  UserID: number;

  @Field(() => Boolean)
  IsFavorite: boolean;

  @Field(() => Boolean)
  Success: boolean;
}

@Resolver(UserFavorite_)
export class UserFavoriteResolver extends UserFavoriteResolverBase {
  @Query(() => [UserFavorite_])
  async UserFavoritesByUserID(@Arg('UserID', () => Int) UserID: number, @Ctx() { dataSource }: AppContext) {
    return await this.findBy(dataSource, 'User Favorites', { UserID });
  }

  @Query(() => [UserFavorite_])
  async UserFavoriteSearchByParams(@Arg('params', () => Int) params: UserFavoriteSearchParams, @Ctx() { dataSource }: AppContext) {
    return await this.findBy(dataSource, 'User Favorites', params);
  }

  @Query(() => UserFavoriteResult)
  async GetRecordFavoriteStatus(@Arg('params', () => UserFavoriteSearchParams) params: UserFavoriteSearchParams, @Ctx() {}: AppContext) {
    const md = new Metadata();
    const e = md.Entities.find((e) => e.ID === params.EntityID);
    if (e)
      return {
        EntityID: params.EntityID,
        UserID: params.UserID,
        PrimaryKeyValues: params.PrimaryKeyValues,
        IsFavorite: await md.GetRecordFavoriteStatus(params.UserID, e.Name, params.PrimaryKeyValues),
        Success: true,
      };
    else throw new Error(`Entity ID:${params.EntityID} not found`);
  }

  @Mutation(() => UserFavoriteResult)
  SetRecordFavoriteStatus(@Arg('params', () => UserFavoriteSetParams) params: UserFavoriteSetParams, @Ctx() { userPayload }: AppContext) {
    const md = new Metadata();
    const e = md.Entities.find((e) => e.ID === params.EntityID);
    const u = UserCache.Users.find((u) => u.ID === userPayload.userRecord.ID);
    if (e) {
      md.SetRecordFavoriteStatus(params.UserID, e.Name, params.PrimaryKeyValues, params.IsFavorite, u);
      return {
        Success: true,
        EntityID: params.EntityID,
        UserID: params.UserID,
        PrimaryKeyValues: params.PrimaryKeyValues,
        IsFavorite: params.IsFavorite,
      };
    } else throw new Error(`Entity ID:${params.EntityID} not found`);
  }
 
}

export default UserFavoriteResolver;
