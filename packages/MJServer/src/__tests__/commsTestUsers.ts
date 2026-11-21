/**
 * User and authorization builders for the Communications V2 unit tests. Kept apart from
 * commsTestFakes.ts because these need `@memberjunction/core` at runtime (see the note there).
 */
import { AuthorizationInfo, AuthorizationRoleInfo, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { NewFakeID, type FakeMetadataProvider } from './commsTestFakes.js';

// ─── Users and authorizations ────────────────────────────────────────────────

/** MJ's baseline roles (metadata/roles): there is no role named "Administrator". */
export const DEVELOPER_ROLE_ID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E';
export const UI_ROLE_ID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E';
export const INTEGRATION_ROLE_ID = 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E';

/** The ID metadata/authorizations/.comms-authorizations.json seeds "Communications: Admin" under. */
export const COMMS_ADMIN_AUTHORIZATION_ID = '59024F63-B735-4A03-A904-47BC46A9BC5E';

/**
 * A user as the server holds one. `Type` is an `nchar(15)` column, so pass the padded value
 * (`'Owner          '`, `'User           '`) the database returns.
 */
export function MakeUser(fields: Pick<UserInfo, 'ID' | 'Name' | 'Email' | 'Type'>, roles: Array<{ RoleID: string; Role: string }> = []): UserInfo {
  return new UserInfo(null, {
    ...fields,
    UserRoles: roles.map((role) => new UserRoleInfo({ UserID: fields.ID, RoleID: role.RoleID, Role: role.Role })),
  });
}

/** An authorization owned by `provider`, so its role grants resolve from that provider. */
export function MakeAuthorization(
  provider: FakeMetadataProvider,
  fields: { ID: string; Name: string; IsActive?: boolean; ParentID?: string | null },
): AuthorizationInfo {
  return new AuthorizationInfo({ IsActive: true, ParentID: null, ...fields }, provider.AsProvider());
}

export function MakeGrant(type: 'Allow' | 'Deny', authorization: AuthorizationInfo, roleID: string): AuthorizationRoleInfo {
  return new AuthorizationRoleInfo({ ID: NewFakeID(), AuthorizationID: authorization.ID, RoleID: roleID, Type: type });
}
