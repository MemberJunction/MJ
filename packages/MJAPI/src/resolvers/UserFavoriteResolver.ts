import { Metadata } from '@memberjunction/core';
import { AppContext, Arg, Ctx, Field, InputType, Int, Mutation, ObjectType, Query, Resolver } from '@memberjunction/server';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { UserFavorite_, UserFavoriteResolverBase } from '../generated/generated';

//****************************************************************************
// INPUT TYPE for User Favorite Queries
//****************************************************************************
@InputType()
export class UserFavoriteSearchParams {
  @Field(() => Int)
  EntityID: number;

  @Field(() => Int)
  RecordID: number;

  @Field(() => Int)
  UserID: number;
}

@InputType()
export class UserFavoriteSetParams {
  @Field(() => Int)
  EntityID: number;

  @Field(() => Int)
  RecordID: number;

  @Field(() => Int)
  UserID: number;

  @Field(() => Boolean)
  IsFavorite: boolean;
}

@ObjectType()
export class UserFavoriteResult {
  @Field(() => Int)
  EntityID: number;

  @Field(() => Int)
  RecordID: number;

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
  UserFavoritesByUserID(@Arg('UserID', () => Int) UserID: number, @Ctx() { dataSource }: AppContext) {
    return dataSource.getRepository(UserFavorite_).findBy({ UserID });
  }

  @Query(() => [UserFavorite_])
  UserFavoriteSearchByParams(@Arg('params', () => Int) params: UserFavoriteSearchParams, @Ctx() { dataSource }: AppContext) {
    return dataSource.getRepository(UserFavorite_).findBy(params);
  }

  @Query(() => UserFavoriteResult)
  GetRecordFavoriteStatus(@Arg('params', () => UserFavoriteSearchParams) params: UserFavoriteSearchParams, @Ctx() {}: AppContext) {
    const md = new Metadata();
    const e = md.Entities.find((e) => e.ID === params.EntityID);
    if (e)
      return {
        EntityID: params.EntityID,
        UserID: params.UserID,
        RecordID: params.RecordID,
        IsFavorite: md.GetRecordFavoriteStatus(params.UserID, e.Name, params.RecordID),
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
      md.SetRecordFavoriteStatus(params.UserID, e.Name, params.RecordID, params.IsFavorite, u);
      return {
        Success: true,
        EntityID: params.EntityID,
        UserID: params.UserID,
        RecordID: params.RecordID,
        IsFavorite: params.IsFavorite,
      };
    } else throw new Error(`Entity ID:${params.EntityID} not found`);
  }

  @Mutation(() => UserFavorite_)
  AddUserFavorite(
    @Arg('input', () => UserFavoriteSearchParams) input: UserFavoriteSearchParams,
    @Ctx() { dataSource, userPayload }: AppContext
  ) {
    return dataSource.transaction(async (manager) => {
      const [existing] = await manager.getRepository(UserFavorite_).findBy(input);
      if (existing) return existing;

      const md = new Metadata();

      const ufEntity = await md.GetEntityObject('User Favorites', userPayload.userRecord);
      ufEntity.NewRecord();
      ufEntity.EntityID = input.EntityID;
      ufEntity.RecordID = input.RecordID;
      ufEntity.UserID = input.UserID;
      if (await ufEntity.Save()) return ufEntity.GetAll();
      else throw new Error('Error saving user favorite');
    });
  }
}

export default UserFavoriteResolver;
