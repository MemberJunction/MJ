import { AppContext, Arg, Ctx, Field, Int, ObjectType, PubSub, PubSubEngine, Query, Resolver } from '@memberjunction/server';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJUser_, MJUserRole_, MJUserResolverBase } from '../generated/generated.js';
import { GetReadOnlyProvider } from '../util.js';

/**
 * CurrentUser payload. Extends the generated user type with a first-class `Roles`
 * field — child-array FieldResolvers (`MJUserRoles_UserIDArray`) are no longer
 * generated. Roles come from the request's `UserInfo` (so magic-link anonymous
 * sessions keep their synthesized roles) or from a RunView on `MJ: User Roles`.
 */
@ObjectType()
export class CurrentUserType extends MJUser_ {
  @Field(() => [MJUserRole_])
  Roles: MJUserRole_[];
}

type RoleSource = {
  ID?: string;
  UserID: string;
  RoleID: string;
  RoleName?: string;
  Role?: string;
  __mj_CreatedAt?: Date;
  __mj_UpdatedAt?: Date;
};

@Resolver(MJUser_)
export class UserResolver extends MJUserResolverBase {

  @Query(() => CurrentUserType)
  async CurrentUser(@Ctx() context: AppContext): Promise<CurrentUserType> {
    await this.CheckAPIKeyScopeAuthorization('user:read', '*', context.userPayload);

    if (context.userPayload.userRecord) {
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
      };
      console.log('CurrentUser (from userRecord)', userData.Email);
      const mapped = await this.MapFieldNamesToCodeNames('MJ: Users', userData) as MJUser_;
      return {
        ...mapped,
        Roles: await this.mapRolesFromUserInfo(userRecord.UserRoles ?? [], userRecord),
      };
    }

    const result = await this.UserByEmail(context.userPayload.email, context);
    console.log('CurrentUser (from email lookup)', result?.Email);
    const roles = await this.loadRolesForUser(result, context);
    return {
      ...(result as MJUser_),
      Roles: roles,
    };
  }

  @Query(() => MJUser_)
  async UserByID(@Arg('ID', () => Int) ID: number, @Ctx() { providers, userPayload }: AppContext) {
    await this.CheckAPIKeyScopeAuthorization('user:read', ID.toString(), userPayload);

    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})
    const retVal = super.safeFirstArrayElement(await this.findBy(provider, 'MJ: Users', { ID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('MJ: Users', retVal);
  }

  @Query(() => MJUser_)
  async UserByEmployeeID(@Arg('EmployeeID', () => Int) EmployeeID: number, @Ctx() { providers, userPayload }: AppContext) {
    await this.CheckAPIKeyScopeAuthorization('user:read', EmployeeID.toString(), userPayload);

    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})
    const retVal = super.safeFirstArrayElement(await this.findBy(provider, 'MJ: Users', { EmployeeID }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('MJ: Users', retVal);
  }

  @Query(() => MJUser_)
  async UserByEmail(@Arg('Email', () => String) Email: string, @Ctx() { providers, userPayload }: AppContext) {
    await this.CheckAPIKeyScopeAuthorization('user:read', Email, userPayload);

    const searchEmail = Email;
    const provider = GetReadOnlyProvider(providers, {allowFallbackToReadWrite: true})
    const returnVal = super.safeFirstArrayElement(await this.findBy(provider, 'MJ: Users', { Email: searchEmail }, userPayload.userRecord));
    return this.MapFieldNamesToCodeNames('MJ: Users', returnVal);
  }

  /**
   * Magic-link anonymous sessions hold synthesized roles on UserInfo that are
   * not persisted. Always prefer those when the requested row is the session
   * user. Everyone else loads `MJ: User Roles` via RunView.
   */
  private async loadRolesForUser(user: MJUser_ | null, context: AppContext): Promise<MJUserRole_[]> {
    if (!user?.ID) {
      return [];
    }
    const sessionUser = context.userPayload?.userRecord;
    if (sessionUser?.IsMagicLinkAnonymous && UUIDsEqual(user.ID, sessionUser.ID)) {
      return await this.mapRolesFromUserInfo(sessionUser.UserRoles ?? [], sessionUser);
    }

    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<RoleSource>({
      EntityName: 'MJ: User Roles',
      ExtraFilter: `UserID='${user.ID}'`,
      ResultType: 'simple',
    }, sessionUser);

    if (!result.Success || !result.Results) {
      return [];
    }
    return await this.ArrayMapFieldNamesToCodeNames('MJ: User Roles', result.Results, sessionUser) as MJUserRole_[];
  }

  private async mapRolesFromUserInfo(roles: RoleSource[], user: { ID: string; Name?: string }): Promise<MJUserRole_[]> {
    const now = new Date();
    const rows = roles.map((r) => ({
      ID: r.ID ?? user.ID,
      UserID: r.UserID,
      RoleID: r.RoleID,
      User: user.Name,
      Role: r.RoleName ?? r.Role,
      __mj_CreatedAt: r.__mj_CreatedAt ?? now,
      __mj_UpdatedAt: r.__mj_UpdatedAt ?? now,
    }));
    return await this.ArrayMapFieldNamesToCodeNames('MJ: User Roles', rows) as MJUserRole_[];
  }
}
export default UserResolver;
