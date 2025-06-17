import { AppContext, Arg, Ctx, Int, Query, Resolver } from '@memberjunction/server';
import { User_, UserResolverBase } from '../generated/generated.js';

@Resolver(User_)
export class UserResolver extends UserResolverBase {
  @Query(() => User_)
  async CurrentUser(@Ctx() context: AppContext) {
    const result = await this.UserByEmail(context.userPayload.email, context);
    console.log('CurrentUser', result);
    return result;
  }

  @Query(() => User_)
  async UserByID(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext) {
    const retVal = super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { ID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('Users', retVal);
  }

  @Query(() => User_)
  async UserByEmployeeID(@Arg('EmployeeID', () => Int) EmployeeID: number, @Ctx() { dataSource, userPayload }: AppContext) {
    const retVal = super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { EmployeeID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('Users', retVal);
  }

  @Query(() => User_)
  async UserByEmail(@Arg('Email', () => String) Email: string, @Ctx() { dataSource, userPayload }: AppContext) {
    // const searchEmail = userEmailMap[Email] ?? Email;
    const searchEmail = Email;
    const returnVal = super.safeFirstArrayElement(await this.findBy(dataSource, 'Users', { Email: searchEmail }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('Users', returnVal);
  }
}
export default UserResolver;
