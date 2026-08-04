import { describe, it, expect } from 'vitest';
import {
  AuthorizationMetadataSource,
  AuthorizationUserLike,
  REALTIME_ADVANCED_SESSION_CONTROLS,
  UserHoldsAuthorization,
} from '../lib/services/user-authorization';

/**
 * Pure client-side authorization check — resolves the cached-metadata
 * Authorizations ↔ Authorization Roles ↔ user.UserRoles chain with
 * `AuthorizationInfo.UserCanExecute` semantics (Deny wins, Allow required,
 * inactive never grants) and is DEFENSIVE: every missing-data shape resolves
 * to false. This is the disclosure gate for the realtime advanced session
 * controls (model picker / config overrides); the server enforces the same
 * authorization on the mint mutation.
 */

const AUTH_ID = 'A0000000-0000-0000-0000-00000000000A';
const ROLE_ADMIN = 'B0000000-0000-0000-0000-00000000000B';
const ROLE_USER = 'C0000000-0000-0000-0000-00000000000C';

function source(overrides?: Partial<AuthorizationMetadataSource>): AuthorizationMetadataSource {
  return {
    Authorizations: [{ ID: AUTH_ID, Name: REALTIME_ADVANCED_SESSION_CONTROLS, IsActive: true }],
    AuthorizationRoles: [{ AuthorizationID: AUTH_ID, RoleID: ROLE_ADMIN, Type: 'Allow' }],
    ...overrides,
  };
}

function userWithRoles(...roleIds: string[]): AuthorizationUserLike {
  return { UserRoles: roleIds.map(RoleID => ({ RoleID })) };
}

describe('UserHoldsAuthorization', () => {
  describe('grants', () => {
    it('returns true when one of the user roles has an Allow row on the active authorization', () => {
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, source())).toBe(true);
    });

    it('matches the authorization name case-insensitively with surrounding whitespace', () => {
      expect(
        UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), '  realtime: ADVANCED session controls ', source())
      ).toBe(true);
    });

    it('matches role ids across SQL Server (upper) vs PostgreSQL (lower) UUID casing', () => {
      const user = userWithRoles(ROLE_ADMIN.toLowerCase());
      const src = source({
        Authorizations: [{ ID: AUTH_ID.toLowerCase(), Name: REALTIME_ADVANCED_SESSION_CONTROLS, IsActive: true }],
        AuthorizationRoles: [{ AuthorizationID: AUTH_ID.toUpperCase(), RoleID: ROLE_ADMIN.toUpperCase(), Type: 'allow' }],
      });
      expect(UserHoldsAuthorization(user, REALTIME_ADVANCED_SESSION_CONTROLS, src)).toBe(true);
    });

    it('grants when the user holds an unrelated role plus the allowed role', () => {
      expect(UserHoldsAuthorization(userWithRoles(ROLE_USER, ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, source())).toBe(true);
    });
  });

  describe('denials', () => {
    it('returns false when none of the user roles is mapped to the authorization', () => {
      expect(UserHoldsAuthorization(userWithRoles(ROLE_USER), REALTIME_ADVANCED_SESSION_CONTROLS, source())).toBe(false);
    });

    it('Deny on any user role vetoes an Allow on another role (Deny wins globally)', () => {
      const src = source({
        AuthorizationRoles: [
          { AuthorizationID: AUTH_ID, RoleID: ROLE_ADMIN, Type: 'Allow' },
          { AuthorizationID: AUTH_ID, RoleID: ROLE_USER, Type: 'Deny' },
        ],
      });
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN, ROLE_USER), REALTIME_ADVANCED_SESSION_CONTROLS, src)).toBe(false);
    });

    it('returns false when the authorization is inactive', () => {
      const src = source({
        Authorizations: [{ ID: AUTH_ID, Name: REALTIME_ADVANCED_SESSION_CONTROLS, IsActive: false }],
      });
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, src)).toBe(false);
    });

    it('returns false for an unknown authorization name', () => {
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), 'Some Other Authorization', source())).toBe(false);
    });

    it('treats a matching row with a null/blank Type as a Deny (missing data never grants)', () => {
      const src = source({
        AuthorizationRoles: [{ AuthorizationID: AUTH_ID, RoleID: ROLE_ADMIN, Type: null }],
      });
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, src)).toBe(false);
    });
  });

  describe('defensive missing-data shapes — always false', () => {
    it('null/undefined user', () => {
      expect(UserHoldsAuthorization(null, REALTIME_ADVANCED_SESSION_CONTROLS, source())).toBe(false);
      expect(UserHoldsAuthorization(undefined, REALTIME_ADVANCED_SESSION_CONTROLS, source())).toBe(false);
    });

    it('user with no roles', () => {
      expect(UserHoldsAuthorization({ UserRoles: [] }, REALTIME_ADVANCED_SESSION_CONTROLS, source())).toBe(false);
      expect(UserHoldsAuthorization({}, REALTIME_ADVANCED_SESSION_CONTROLS, source())).toBe(false);
    });

    it('null/undefined metadata source', () => {
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, null)).toBe(false);
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, undefined)).toBe(false);
    });

    it('metadata source missing either collection', () => {
      expect(
        UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, source({ Authorizations: [] }))
      ).toBe(false);
      expect(
        UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), REALTIME_ADVANCED_SESSION_CONTROLS, source({ AuthorizationRoles: null }))
      ).toBe(false);
    });

    it('empty authorization name', () => {
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), '', source())).toBe(false);
      expect(UserHoldsAuthorization(userWithRoles(ROLE_ADMIN), '   ', source())).toBe(false);
    });
  });
});
