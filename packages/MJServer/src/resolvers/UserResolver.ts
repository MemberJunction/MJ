import { AppContext, Arg, Ctx, FieldResolver, Int, PubSub, PubSubEngine, Query, Resolver, Root } from '@memberjunction/server';
import { UUIDsEqual } from '@memberjunction/global';
import { MJUser_, MJUserRole_, MJUserResolverBase } from '../generated/generated.js';
import { GetReadOnlyProvider } from '../util.js';

@Resolver(MJUser_)
export class UserResolver extends MJUserResolverBase {

  /**
   * Roles for the current user row.
   *
   * Overrides the generated field resolver to support ANONYMOUS magic-link sessions: those
   * resolve to a shared Anonymous principal that holds NO roles in the database (by design —
   * persisting them would let anonymous sessions accrete privileges across links). The roles
   * are synthesized per-request in {@link buildMagicLinkSessionUser} and live only on the
   * request's `UserInfo`. For the session's OWN user row we serve those synthesized roles
   * directly, skipping the generated DB query (which returns empty) and its `MJ: User Roles`
   * read-permission check (which the restricted anon role wouldn't pass). Every other case —
   * named users, named magic-link users, listing other users' roles — falls through to the
   * generated resolver unchanged, so there is no behavioral or security change off this path.
   */
  @FieldResolver(() => [MJUserRole_])
  async MJUserRoles_UserIDArray(@Root() mjuser_: MJUser_, @Ctx() context: AppContext, @PubSub() pubSub: PubSubEngine) {
    const sessionUser = context.userPayload?.userRecord;
    if (sessionUser?.IsMagicLinkAnonymous && UUIDsEqual(mjuser_.ID, sessionUser.ID)) {
      const now = new Date();
      // Build rows with the entity's RAW field names, then run them through the same
      // name→code-name mapping the generated resolver uses (e.g. __mj_CreatedAt →
      // _mj__CreatedAt). Returning raw names directly trips GraphQL's non-nullable check.
      const rows = (sessionUser.UserRoles ?? []).map((r: { UserID: string; RoleID: string; RoleName?: string; Role?: string }) => ({
        ID: sessionUser.ID,
        UserID: r.UserID,
        RoleID: r.RoleID,
        User: sessionUser.Name,
        Role: r.RoleName ?? r.Role,
        __mj_CreatedAt: now,
        __mj_UpdatedAt: now,
      }));
      return this.ArrayMapFieldNamesToCodeNames('MJ: User Roles', rows, sessionUser);
    }
    return super.MJUserRoles_UserIDArray(mjuser_, context, pubSub);
  }
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
