import { AppContext, Arg, Ctx, Int, Query, Resolver } from '@memberjunction/server';
import { MJUser_, MJUserResolverBase } from '../generated/generated.js';
import { GetReadOnlyProvider } from '../util.js';

@Resolver(MJUser_)
export class UserResolver extends MJUserResolverBase {
  @Query(() => MJUser_)
  async CurrentUser(@Ctx() context: AppContext) {
    const result = await this.UserByEmail(context.userPayload.email, context);
    console.log('CurrentUser', result);
    return result;
  }

  @Query(() => MJUser_)
  async UserByID(@Arg('ID', () => Int) ID: number, @Ctx() { providers, userPayload }: AppContext) {
    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})    
    const retVal = super.safeFirstArrayElement(await this.findBy(provider, 'Users', { ID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('Users', retVal);
  }

  @Query(() => MJUser_)
  async UserByEmployeeID(@Arg('EmployeeID', () => Int) EmployeeID: number, @Ctx() { providers, userPayload }: AppContext) {
    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})    
    const retVal = super.safeFirstArrayElement(await this.findBy(provider, 'Users', { EmployeeID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('Users', retVal);
  }

  @Query(() => MJUser_)
  async UserByEmail(@Arg('Email', () => String) Email: string, @Ctx() { providers, userPayload }: AppContext) {
    // const searchEmail = userEmailMap[Email] ?? Email;
    const searchEmail = Email;
    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})    
    const returnVal = super.safeFirstArrayElement(await this.findBy(provider, 'Users', { Email: searchEmail }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('Users', returnVal);
  }
}
export default UserResolver;
