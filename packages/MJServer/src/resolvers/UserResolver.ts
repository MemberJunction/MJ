import { AppContext, Arg, Ctx, Int, Query, Resolver } from '@memberjunction/server';
import { MJUser_, MJUserResolverBase } from '../generated/generated.js';
import { GetReadOnlyProvider } from '../util.js';

@Resolver(MJUser_)
export class UserResolver extends MJUserResolverBase {
  @Query(() => MJUser_)
  async CurrentUser(@Ctx() context: AppContext) {
    // Check API key scope authorization for user read (self)
    await this.CheckAPIKeyScopeAuthorization('user:read', '*', context.userPayload);

    // If userRecord is already available (e.g., from API key auth or system auth),
    // use it directly instead of looking up by email again
    if (context.userPayload.userRecord) {
      // Convert UserInfo to the GraphQL response format
      const userRecord = context.userPayload.userRecord;
      const userData = {
        ID: userRecord.ID,
        Name: userRecord.Name,
        FirstName: userRecord.FirstName,
        LastName: userRecord.LastName,
        Title: userRecord.Title,
        Email: userRecord.Email,
        Type: userRecord.Type,
        IsActive: userRecord.IsActive,
        LinkedRecordType: userRecord.LinkedRecordType,
        EmployeeID: userRecord.EmployeeID,
        LinkedEntityID: userRecord.LinkedEntityID,
        LinkedEntityRecordID: userRecord.LinkedEntityRecordID,
        __mj_CreatedAt: userRecord.__mj_CreatedAt,
        __mj_UpdatedAt: userRecord.__mj_UpdatedAt,
        // Include the UserRoles sub-array for the GraphQL response
        MJUserRoles_UserIDArray: userRecord.UserRoles?.map((r: { ID: string; UserID: string; RoleID: string; RoleName?: string; __mj_CreatedAt?: Date; __mj_UpdatedAt?: Date }) => ({
          ID: r.ID,
          UserID: r.UserID,
          RoleID: r.RoleID,
          User: userRecord.Name,
          Role: r.RoleName,
          __mj_CreatedAt: r.__mj_CreatedAt,
          __mj_UpdatedAt: r.__mj_UpdatedAt,
        })) || [],
      };
      console.log('CurrentUser (from userRecord)', userData.Email);
      return this.MapFieldNamesToCodeNames('MJ: Users', userData);
    }

    // Fall back to email lookup for JWT-based auth
    const result = await this.UserByEmail(context.userPayload.email, context);
    console.log('CurrentUser (from email lookup)', result?.Email);
    return result;
  }

  @Query(() => MJUser_)
  async UserByID(@Arg('ID', () => Int) ID: number, @Ctx() { providers, userPayload }: AppContext) {
    // Check API key scope authorization for user read
    await this.CheckAPIKeyScopeAuthorization('user:read', ID.toString(), userPayload);

    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})
    const retVal = super.safeFirstArrayElement(await this.findBy(provider, 'MJ: Users', { ID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('MJ: Users', retVal);
  }

  @Query(() => MJUser_)
  async UserByEmployeeID(@Arg('EmployeeID', () => Int) EmployeeID: number, @Ctx() { providers, userPayload }: AppContext) {
    // Check API key scope authorization for user read
    await this.CheckAPIKeyScopeAuthorization('user:read', EmployeeID.toString(), userPayload);

    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})
    const retVal = super.safeFirstArrayElement(await this.findBy(provider, 'MJ: Users', { EmployeeID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('MJ: Users', retVal);
  }

  @Query(() => MJUser_)
  async UserByEmail(@Arg('Email', () => String) Email: string, @Ctx() { providers, userPayload }: AppContext) {
    // Check API key scope authorization for user read
    await this.CheckAPIKeyScopeAuthorization('user:read', Email, userPayload);

    // const searchEmail = userEmailMap[Email] ?? Email;
    const searchEmail = Email;
    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})
    const returnVal = super.safeFirstArrayElement(await this.findBy(provider, 'MJ: Users', { Email: searchEmail }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('MJ: Users', returnVal);
  }
}
export default UserResolver;
