// Runs under vitest.db.config.ts against the PR's private database, never the unit run.
//
// A-FV-AUTHZ (Task M5b.2, D4-52): `__mj.vwUserHeldAuthorizations` holds exactly what MJ's authorization rule grants,
// case by case over the grant matrix (fixtures/authorization-matrix.ts, each case naming the MJServer test it
// mirrors). Each case seeds scratch authorizations, roles and a user through the generated entities, then reads the
// view by SQL. Teardown deletes every scratch row by the file's tag.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sql from 'mssql';
import type { BaseEntity, IMetadataProvider } from '@memberjunction/core';
import type { MJAuthorizationEntity, MJAuthorizationRoleEntity, MJRoleEntity, MJUserEntity, MJUserRoleEntity } from '@memberjunction/core-entities';
import { UUIDSet } from '@memberjunction/global';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthConnection } from '../db/connection';
import { AuthorizationMatrix, type AuthorizationMatrixWriter } from '../fixtures/authorization-matrix';
import { ConsoleCapture } from './fixtures/console-capture';

const TAG = `PSHeldAuth-${Date.now()}`;
const BOOTSTRAP_TIMEOUT_MS = 120_000;

let server: IntegrationBootstrapContext;
let pool: sql.ConnectionPool;

/** `[schema].[table]` of an entity, read from metadata so no schema name is written here. */
function tableOf(provider: IMetadataProvider, entityName: string): string {
  const entity = provider.EntityByName(entityName);
  if (!entity) throw new Error(`entity ${entityName} is not in metadata: run the migration and CodeGen`);
  return `[${entity.SchemaName}].[${entity.BaseTable}]`;
}

/** Save a new row of `entityName` with `fill` applied; throws with the provider's message when the save fails. */
async function createRow<T extends BaseEntity>(entityName: string, fill: (row: T) => void): Promise<T> {
  const row = await server.Provider.GetEntityObject<T>(entityName, server.User);
  row.NewRecord();
  fill(row);
  if (!(await row.Save())) throw new Error(`fixture ${entityName} did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** The matrix's writes through the generated entities, as the bootstrap user. */
const writer: AuthorizationMatrixWriter = {
  CreateAuthorization: async (name, parentId, isActive) => (await createRow<MJAuthorizationEntity>('MJ: Authorizations', (a) => {
    a.Name = name; a.ParentID = parentId; a.IsActive = isActive; a.UseAuditLog = false; a.Description = 'Predictive Studio truth suite A-FV-AUTHZ scratch (safe to delete)';
  })).ID,
  CreateRole: async (name) => (await createRow<MJRoleEntity>('MJ: Roles', (r) => { r.Name = name; r.Description = 'Predictive Studio truth suite A-FV-AUTHZ scratch (safe to delete)'; })).ID,
  CreateUser: async (name, email, type) => (await createRow<MJUserEntity>('MJ: Users', (u) => { u.Name = name; u.Email = email; u.Type = type; u.IsActive = true; })).ID,
  AddUserRole: async (userId, roleId) => (await createRow<MJUserRoleEntity>('MJ: User Roles', (ur) => { ur.UserID = userId; ur.RoleID = roleId; })).ID,
  Grant: async (authorizationId, roleId, type) => (await createRow<MJAuthorizationRoleEntity>('MJ: Authorization Roles', (ar) => {
    ar.AuthorizationID = authorizationId; ar.RoleID = roleId; ar.Type = type;
  })).ID,
};

/** The authorizations the view says `userId` holds. */
async function heldAuthorizations(userId: string): Promise<string[]> {
  const schema = server.Provider.EntityByName('MJ: Authorizations')?.SchemaName;
  if (!schema) throw new Error('MJ: Authorizations is not in metadata');
  const r = await pool.request().input('UserID', sql.UniqueIdentifier, userId)
    .query<{ AuthorizationID: string }>(`SELECT CAST(AuthorizationID AS NVARCHAR(36)) AS AuthorizationID FROM [${schema}].[vwUserHeldAuthorizations] WHERE UserID = @UserID`);
  return r.recordset.map((row) => row.AuthorizationID);
}

/** Deletes every scratch row of the file, children first, by the tag. */
async function deleteScratch(): Promise<void> {
  const t = (entityName: string): string => tableOf(server.Provider, entityName);
  await pool.request().input('Prefix', sql.NVarChar(255), `${TAG}%`).query(`
    DELETE FROM ${t('MJ: Authorization Roles')} WHERE AuthorizationID IN (SELECT ID FROM ${t('MJ: Authorizations')} WHERE Name LIKE @Prefix)
                                                  OR RoleID IN (SELECT ID FROM ${t('MJ: Roles')} WHERE Name LIKE @Prefix);
    DELETE FROM ${t('MJ: User Roles')} WHERE RoleID IN (SELECT ID FROM ${t('MJ: Roles')} WHERE Name LIKE @Prefix)
                                          OR UserID IN (SELECT ID FROM ${t('MJ: Users')} WHERE Name LIKE @Prefix);
    DELETE FROM ${t('MJ: Users')} WHERE Name LIKE @Prefix;
    DELETE FROM ${t('MJ: Roles')} WHERE Name LIKE @Prefix;
    UPDATE ${t('MJ: Authorizations')} SET ParentID = NULL WHERE Name LIKE @Prefix;
    DELETE FROM ${t('MJ: Authorizations')} WHERE Name LIKE @Prefix;`);
}

beforeAll(async () => {
  const boot = await ConsoleCapture.During('log', () => BootstrapIntegrationServer());
  expect(ConsoleCapture.UnexpectedBootstrapLines(boot.Lines)).toEqual([]);
  server = boot.Result;
  pool = await TruthConnection.OpenPool();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  if (pool && server) await deleteScratch();
  await pool?.close();
  await server?.ClosePool();
});

describe('A-FV-AUTHZ: vwUserHeldAuthorizations equals MJ\'s authorization rule', () => {
  it.each(AuthorizationMatrix.Cases)('$Name: the view holds exactly what MJ\'s rule grants ($Mirrors)', async (c) => {
    const seeded = await AuthorizationMatrix.Seed(writer, c, TAG);
    const held = await heldAuthorizations(seeded.UserID);
    expect(new UUIDSet(held).Has(seeded.AuthorizationID)).toBe(c.Expected);
  });
});
