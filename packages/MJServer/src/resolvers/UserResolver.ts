import { AppContext, Arg, Ctx, Int, Query, Resolver } from '@memberjunction/server';
import { User_, UserResolverBase } from '../generated/generated';

@Resolver(User_)
export class UserResolver extends UserResolverBase {
  @Query(() => User_)
  async CurrentUser(@Ctx() { dataSource, userPayload }: AppContext) {
    const result = await this.UserByEmail(userPayload.email, { dataSource, userPayload });
    console.log('CurrentUser', result);
    return result;
  }

  @Query(() => User_)
  async UserByID(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource }: AppContext) {
    const retVal = super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { ID }));
    return this.MapFieldNamesToCodeNames('Users', retVal);
  }

  @Query(() => User_)
  async UserByEmployeeID(@Arg('EmployeeID', () => Int) EmployeeID: number, @Ctx() { dataSource }: AppContext) {
    const retVal = super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { EmployeeID }));
    return this.MapFieldNamesToCodeNames('Users', retVal);
  }

  @Query(() => User_)
  async UserByEmail(@Arg('Email', () => String) Email: string, @Ctx() { dataSource }: AppContext) {
    // const searchEmail = userEmailMap[Email] ?? Email;
    const searchEmail = Email;
    const returnVal = super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { Email: searchEmail }));
    return this.MapFieldNamesToCodeNames('Users', returnVal);
  }
}
export default UserResolver;
