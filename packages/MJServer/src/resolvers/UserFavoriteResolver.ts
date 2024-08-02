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
import { UserFavoriteEntity } from '@memberjunction/core-entities';

import { UserFavorite_, UserFavoriteResolverBase } from '../generated/generated.js';

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
    const pk = new CompositeKey(params.CompositeKey.KeyValuePairs);

    const e = md.Entities.find((e) => e.ID === params.EntityID);
    if (e)
      return {
        EntityID: params.EntityID,
        UserID: params.UserID,
        CompositeKey: pk,
        IsFavorite: await md.GetRecordFavoriteStatus(params.UserID, e.Name, pk),
        Success: true,
      };
    else throw new Error(`Entity ID:${params.EntityID} not found`);
  }

  @Mutation(() => UserFavoriteResult)
  SetRecordFavoriteStatus(@Arg('params', () => UserFavoriteSetParams) params: UserFavoriteSetParams, @Ctx() { userPayload }: AppContext) {
    const md = new Metadata();
    const pk = new CompositeKey(params.CompositeKey.KeyValuePairs);
    const e = md.Entities.find((e) => e.ID === params.EntityID);
    const u = UserCache.Users.find((u) => u.ID === userPayload.userRecord.ID);
    if (e) {
      md.SetRecordFavoriteStatus(params.UserID, e.Name, pk, params.IsFavorite, u);
      return {
        Success: true,
        EntityID: params.EntityID,
        UserID: params.UserID,
        CompositeKey: params.CompositeKey,
        IsFavorite: params.IsFavorite,
      };
    } else throw new Error(`Entity ID:${params.EntityID} not found`);
  }

  private GetTestData() {
    return [
      {
        firstName: 'John',
        lastName: 'Doe',
        title: 'Software Engineer II',
        email: 'amith+john.doe@nagarajan.org',
        age: 25,
        address: {
          street: '123 Main St',
          city: 'Springfield',
          state: 'IL',
          zip: '62701',
        },
        recommendedArticles: [
          {
            title: 'How to Write Better Code',
            url: 'https://example.com/article1',
          },
          {
            title: 'The Art of Debugging',
            url: 'https://example.com/article2',
          },
          {
            title: 'Using Templates Effectively',
            url: 'https://example.com/article3',
          },
        ],
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        title: 'Executive Vice President of Software Development',
        email: 'amith+jane.smith@nagarajan.org',
        age: 30,
        address: {
          street: '456 Elm St',
          city: 'Chicago',
          state: 'IL',
          zip: '62702',
        },
        recommendedArticles: [
          {
            title: 'Exemplifying the Importance of Code Reviews',
            url: 'https://example.com/article1',
          },
          {
            title: 'AI and Software Development: A New Frontier',
            url: 'https://example.com/article2',
          },
          {
            title: 'Gardening Tips for Fun Loving Software Developers',
            url: 'https://example.com/article3',
          },
        ],
      },
    ];
  }
}

export default UserFavoriteResolver;
