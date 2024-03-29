import { AppContext, Arg, Ctx, Int, Query, Resolver } from '@memberjunction/server';
import { User_, UserResolverBase } from '../generated/generated';

@Resolver(User_)
export class UserResolver extends UserResolverBase {
  @Query(() => User_)
  async CurrentUser(@Ctx() { dataSource, userPayload }: AppContext) {
    return await this.UserByEmail(userPayload.email, { dataSource, userPayload });
  }

  @Query(() => User_)
  async UserByID(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource }: AppContext) {
    return super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { ID }));
  }

  @Query(() => User_)
  async UserByEmployeeID(@Arg('EmployeeID', () => Int) EmployeeID: number, @Ctx() { dataSource }: AppContext) {
    return super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { EmployeeID }));
  }

  @Query(() => User_)
  async UserByEmail(@Arg('Email', () => String) Email: string, @Ctx() { dataSource }: AppContext) {
    // const searchEmail = userEmailMap[Email] ?? Email;
    const searchEmail = Email;
    const returnVal = super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { Email: searchEmail }));
    return returnVal;
  }
}
export default UserResolver;
