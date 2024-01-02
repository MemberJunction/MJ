/* eslint-disable @typescript-eslint/no-explicit-any */
import { Metadata } from '@memberjunction/core';
import { AppContext, Arg, Ctx, Int, Query, Resolver, UserPayload } from '@memberjunction/server';
import { DataSource } from 'typeorm';
import { UserView_, UserViewResolverBase } from '../generated/generated';
import { UserResolver } from './UserResolver';

@Resolver(UserView_)
export class UserViewResolver extends UserViewResolverBase {
  @Query(() => [UserView_])
  UserViewsByUserID(@Arg('UserID', () => Int) UserID: number, @Ctx() { dataSource }: AppContext) {
    return dataSource.getRepository(UserView_).findBy({ UserID });
  }

  @Query(() => [UserView_])
  async DefaultViewByUserAndEntity(
    @Arg('UserID', () => Int) UserID: number,
    @Arg('EntityID', () => Int) EntityID: number,
    @Ctx() { dataSource }: AppContext
  ) {
    return dataSource.getRepository(UserView_).findBy({ UserID, EntityID, IsDefault: true });
  }

  @Query(() => [UserView_])
  async CurrentUserDefaultViewByEntityID(@Arg('EntityID', () => Int) EntityID: number, @Ctx() { dataSource, userPayload }: AppContext) {
    return dataSource.getRepository(UserView_).findBy({
      UserID: await this.getCurrentUserID(dataSource, userPayload),
      EntityID,
      IsDefault: true,
    });
  }

  protected async getCurrentUserID(dataSource: DataSource, userPayload: UserPayload): Promise<number> {
    const userResolver = new UserResolver();
    const user = await userResolver.UserByEmail(userPayload.email, { dataSource, userPayload });
    return user.ID;
  }

  @Query(() => [UserView_])
  async CurrentUserUserViewsByEntityID(@Arg('EntityID', () => Int) EntityID: number, @Ctx() { dataSource, userPayload }: AppContext) {
    return dataSource.getRepository(UserView_).findBy({ UserID: await this.getCurrentUserID(dataSource, userPayload), EntityID });
  }

  @Query(() => [UserView_])
  async UpdateWhereClause(@Arg('ID', () => Int) ID: number, @Ctx() { userPayload }: AppContext) {
    // in this query we want to update the uesrView record in the DB with a new where clause
    // this should normally not be a factor but we have this exposed in the GraphQL API so that
    // a dev can force the update if desired from the client. The normal path is just to update
    // filter state which in turn will be used to update the where clause in the entity sub-class.
    const md = new Metadata();
    const u = this.GetUserFromPayload(userPayload);
    const viewEntity = await md.GetEntityObject('User Views', u);
    await viewEntity.Load(ID);
    viewEntity.UpdateWhereClause();
    if (await viewEntity.Save()) {
      return viewEntity.GetAll();
    } else {
      throw new Error('Failed to update where clause');
    }
  }
}

export default UserViewResolver;
