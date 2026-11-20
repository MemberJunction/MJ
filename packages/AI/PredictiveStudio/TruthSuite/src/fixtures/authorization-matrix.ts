/**
 * A-FV-AUTHZ's grant matrix (Task M5b.2, D4-52): the cases over which `__mj.vwUserHeldAuthorizations` must hold exactly
 * what MJ's authorization rule grants. The oracle is the rule `EvaluateActionRunAuthorization` applies
 * (`packages/MJServer/src/auth/actionAuthorization.ts:46-111`, not exported, D4-52): an Owner holds every
 * authorization; anyone else holds a linked authorization when it is active, none of the user's roles is denied it, and
 * the user holds it or an ancestor directly (that node active, an Allow and no Deny among the user's roles). Each case
 * names the `it(...)` of `packages/MJServer/src/__tests__/actionAuthorization.test.ts` it mirrors (`Mirrors`), and the
 * matrix's unit test fails when a mirrored title leaves that file, so a change to the TypeScript rule re-opens this
 * matrix (A-FV-AUTHZ re-reads it at every refresh).
 */
import type { MJAuthorizationRoleEntity, MJUserEntity } from '@memberjunction/core-entities';

/** A grant's type, as `MJ: Authorization Roles.Type` stores it. */
export type MatrixGrantType = MJAuthorizationRoleEntity['Type'];

/** A user's type, as `MJ: Users.Type` stores it. */
export type MatrixUserType = MJUserEntity['Type'];

/** One authorization of a case's tree. */
export interface MatrixAuthorization {
  /** The case-local key (`leaf`, `mid`, `root`, …). */
  readonly Key: string;
  /** The parent's key, or null for a root. */
  readonly ParentKey: string | null;
  /** `IsActive`. */
  readonly IsActive: boolean;
}

/** One `MJ: Authorization Roles` grant of a case. */
export interface MatrixGrant {
  /** The granted authorization's key. */
  readonly AuthorizationKey: string;
  /** The role's key. */
  readonly RoleKey: string;
  /** Allow or Deny. */
  readonly Type: MatrixGrantType;
}

/** One case: a tree, roles with grants, a user, the authorization asked about and MJ's answer. */
export interface AuthorizationMatrixCase {
  /** What the case sets up, in words. */
  readonly Name: string;
  /** The `it(...)` title in `actionAuthorization.test.ts` the case mirrors. */
  readonly Mirrors: string;
  /** The user's `Type`. */
  readonly UserType: MatrixUserType;
  /** The authorization tree, parents before children. */
  readonly Authorizations: readonly MatrixAuthorization[];
  /** The roles the user holds (keys); every role a grant names is created, held or not. */
  readonly UserRoles: readonly string[];
  /** The role grants. */
  readonly Grants: readonly MatrixGrant[];
  /** The key of the authorization asked about (the binding's `ViewAuthorizationID`). */
  readonly Linked: string;
  /** Whether MJ's rule grants it. */
  readonly Expected: boolean;
}

/** The writes {@link AuthorizationMatrix.Seed} needs, each returning the new row's ID. */
export interface AuthorizationMatrixWriter {
  /** Creates an `MJ: Authorizations` row. */
  CreateAuthorization(name: string, parentId: string | null, isActive: boolean): Promise<string>;
  /** Creates an `MJ: Roles` row. */
  CreateRole(name: string): Promise<string>;
  /** Creates an active `MJ: Users` row. */
  CreateUser(name: string, email: string, type: MatrixUserType): Promise<string>;
  /** Creates an `MJ: User Roles` row. */
  AddUserRole(userId: string, roleId: string): Promise<string>;
  /** Creates an `MJ: Authorization Roles` row. */
  Grant(authorizationId: string, roleId: string, type: MatrixGrantType): Promise<string>;
}

/** The IDs a seeded case is read by. */
export interface SeededMatrixCase {
  /** The case's user. */
  readonly UserID: string;
  /** The linked authorization's ID. */
  readonly AuthorizationID: string;
}

/** A root authorization. */
const root = (key: string, isActive = true): MatrixAuthorization => ({ Key: key, ParentKey: null, IsActive: isActive });
/** A child authorization. */
const child = (key: string, parent: string, isActive = true): MatrixAuthorization => ({ Key: key, ParentKey: parent, IsActive: isActive });
/** A grant. */
const grant = (authorizationKey: string, roleKey: string, type: MatrixGrantType): MatrixGrant => ({ AuthorizationKey: authorizationKey, RoleKey: roleKey, Type: type });

/** The grant matrix and its seeding. */
export class AuthorizationMatrix {
  /** The mirrored test file, relative to the repository root. */
  public static readonly MirroredTestFile = 'packages/MJServer/src/__tests__/actionAuthorization.test.ts';

  /** Every case, each with MJ's answer. */
  public static readonly Cases: readonly AuthorizationMatrixCase[] = [
    {
      Name: 'an Owner with no role holds an active authorization nobody is granted', Mirrors: 'lets an Owner run any action, linked or not',
      UserType: 'Owner', Authorizations: [root('leaf')], UserRoles: [], Grants: [], Linked: 'leaf', Expected: true,
    },
    {
      Name: 'an Owner holds an inactive authorization', Mirrors: 'lets an Owner run any action, linked or not',
      UserType: 'Owner', Authorizations: [root('leaf', false)], UserRoles: [], Grants: [], Linked: 'leaf', Expected: true,
    },
    {
      Name: 'Allow on the linked authorization', Mirrors: 'runs for a user whose role holds a linked authorization',
      UserType: 'User', Authorizations: [root('leaf')], UserRoles: ['analyst'], Grants: [grant('leaf', 'analyst', 'Allow')], Linked: 'leaf', Expected: true,
    },
    {
      Name: 'Deny on the linked authorization', Mirrors: 'is refused when one of the user\'s roles is denied the linked authorization',
      UserType: 'User', Authorizations: [root('leaf')], UserRoles: ['blocked'], Grants: [grant('leaf', 'blocked', 'Deny')], Linked: 'leaf', Expected: false,
    },
    {
      Name: 'Deny on an ancestor while Allow on the leaf (the leaf is held directly)', Mirrors: 'runs for a user whose role holds a linked authorization',
      UserType: 'User', Authorizations: [root('root'), child('leaf', 'root')], UserRoles: ['analyst', 'blocked'],
      Grants: [grant('leaf', 'analyst', 'Allow'), grant('root', 'blocked', 'Deny')], Linked: 'leaf', Expected: true,
    },
    {
      Name: 'a three-level ParentID chain granted at the root', Mirrors: 'runs for a user whose role holds an ancestor of a linked authorization',
      UserType: 'User', Authorizations: [root('root'), child('mid', 'root'), child('leaf', 'mid')], UserRoles: ['auditor'],
      Grants: [grant('root', 'auditor', 'Allow')], Linked: 'leaf', Expected: true,
    },
    {
      Name: 'a three-level chain granted at the root with a Deny on the middle node (the walk continues past it)',
      Mirrors: 'runs for a user whose role holds an ancestor of a linked authorization',
      UserType: 'User', Authorizations: [root('root'), child('mid', 'root'), child('leaf', 'mid')], UserRoles: ['auditor', 'blocked'],
      Grants: [grant('root', 'auditor', 'Allow'), grant('mid', 'blocked', 'Deny')], Linked: 'leaf', Expected: true,
    },
    {
      Name: 'an inactive leaf with an active granted parent', Mirrors: 'is refused when the linked authorization is inactive, even to a holder of its parent',
      UserType: 'User', Authorizations: [root('root'), child('leaf', 'root', false)], UserRoles: ['auditor'],
      Grants: [grant('root', 'auditor', 'Allow')], Linked: 'leaf', Expected: false,
    },
    {
      Name: 'an inactive parent holding the only grant (an ancestor counts only when active)', Mirrors: 'walks to the parent within the authorizations it is given',
      UserType: 'User', Authorizations: [root('root', false), child('leaf', 'root')], UserRoles: ['auditor'],
      Grants: [grant('root', 'auditor', 'Allow')], Linked: 'leaf', Expected: false,
    },
    {
      Name: 'an inactive parent and an Allow on the active leaf', Mirrors: 'runs for a user whose role holds a linked authorization',
      UserType: 'User', Authorizations: [root('root', false), child('leaf', 'root')], UserRoles: ['analyst'],
      Grants: [grant('leaf', 'analyst', 'Allow')], Linked: 'leaf', Expected: true,
    },
    {
      Name: 'an inactive linked authorization with an Allow', Mirrors: 'is refused when the linked authorization is inactive',
      UserType: 'User', Authorizations: [root('leaf', false)], UserRoles: ['analyst'], Grants: [grant('leaf', 'analyst', 'Allow')], Linked: 'leaf', Expected: false,
    },
    {
      Name: 'two roles, one Allow and one Deny on the linked authorization', Mirrors: 'is refused when one of the user\'s roles is denied the linked authorization',
      UserType: 'User', Authorizations: [root('leaf')], UserRoles: ['analyst', 'blocked'],
      Grants: [grant('leaf', 'analyst', 'Allow'), grant('leaf', 'blocked', 'Deny')], Linked: 'leaf', Expected: false,
    },
    {
      Name: 'a Deny on the linked authorization and another role holding its parent',
      Mirrors: 'is refused when a role is denied the linked authorization, even if another role holds its parent',
      UserType: 'User', Authorizations: [root('root'), child('leaf', 'root')], UserRoles: ['auditor', 'blocked'],
      Grants: [grant('root', 'auditor', 'Allow'), grant('leaf', 'blocked', 'Deny')], Linked: 'leaf', Expected: false,
    },
    {
      Name: 'no grant to any of the user\'s roles (another role holds it)', Mirrors: 'is refused to a user whose roles hold none of the linked authorizations',
      UserType: 'User', Authorizations: [root('leaf')], UserRoles: ['other'], Grants: [grant('leaf', 'analyst', 'Allow')], Linked: 'leaf', Expected: false,
    },
  ];

  /**
   * Seeds one case under `tag`: its authorizations (parents first), every role a grant or the user names, the user
   * (`<tag>-<case index>@example.com`), the user's roles and the grants.
   *
   * @throws when the case names a parent, role or linked key it does not define
   */
  public static async Seed(writer: AuthorizationMatrixWriter, c: AuthorizationMatrixCase, tag: string): Promise<SeededMatrixCase> {
    const index = AuthorizationMatrix.Cases.indexOf(c);
    const prefix = `${tag} c${index}`;
    const authorizations = new Map<string, string>();
    for (const a of c.Authorizations) {
      const parentId = a.ParentKey === null ? null : AuthorizationMatrix.lookup(authorizations, a.ParentKey, c, 'parent');
      authorizations.set(a.Key, await writer.CreateAuthorization(`${prefix} ${a.Key}`, parentId, a.IsActive));
    }
    const roles = new Map<string, string>();
    for (const key of new Set([...c.UserRoles, ...c.Grants.map((g) => g.RoleKey)])) roles.set(key, await writer.CreateRole(`${prefix} ${key}`));
    const userId = await writer.CreateUser(`${prefix} user`, `${tag.toLowerCase()}-c${index}@example.com`, c.UserType);
    for (const key of c.UserRoles) await writer.AddUserRole(userId, AuthorizationMatrix.lookup(roles, key, c, 'role'));
    for (const g of c.Grants) {
      await writer.Grant(AuthorizationMatrix.lookup(authorizations, g.AuthorizationKey, c, 'authorization'), AuthorizationMatrix.lookup(roles, g.RoleKey, c, 'role'), g.Type);
    }
    return { UserID: userId, AuthorizationID: AuthorizationMatrix.lookup(authorizations, c.Linked, c, 'linked authorization') };
  }

  /** The ID of `key`; throws naming the case when it is not defined. */
  private static lookup(ids: ReadonlyMap<string, string>, key: string, c: AuthorizationMatrixCase, what: string): string {
    const id = ids.get(key);
    if (id === undefined) throw new Error(`AuthorizationMatrix: case "${c.Name}" names the ${what} '${key}', which it does not define`);
    return id;
  }
}
