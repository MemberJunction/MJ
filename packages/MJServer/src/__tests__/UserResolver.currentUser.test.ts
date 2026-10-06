import { describe, it, expect, vi, afterEach } from 'vitest';
import { LogError } from '@memberjunction/core';
import {
  AssertRoleLoadSucceeded,
  RequireContextUser,
  RequireLoadedUser,
  RequireRoleProvider,
  UserIdExtraFilter,
} from '../resolvers/currentUserRoles.js';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    LogError: vi.fn(),
  };
});

describe('CurrentUser role-load guards', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('RequireLoadedUser', () => {
    it('returns the user when ID is present', () => {
      const user = { ID: 'u-1', Email: 'a@b.com' };
      expect(RequireLoadedUser(user, 'a@b.com')).toBe(user);
    });

    it('throws when the email fallback finds no user', () => {
      expect(() => RequireLoadedUser(null, 'missing@example.com'))
        .toThrow("CurrentUser: no user found for email 'missing@example.com'");
      expect(() => RequireLoadedUser({ Email: 'x' }, undefined))
        .toThrow("CurrentUser: no user found for email ''");
    });
  });

  describe('RequireContextUser', () => {
    it('returns the session user when present', () => {
      const user = { ID: 'u-1' };
      expect(RequireContextUser(user)).toBe(user);
    });

    it('throws when GetUserFromPayload would have handed undefined to RunView', () => {
      expect(() => RequireContextUser(undefined))
        .toThrow('CurrentUser: authenticated context user is required to load roles');
    });
  });

  describe('RequireRoleProvider', () => {
    it('throws when no provider is available', () => {
      expect(() => RequireRoleProvider(null))
        .toThrow('CurrentUser: no data provider available to load roles');
    });
  });

  describe('UserIdExtraFilter', () => {
    it('wraps a UUID in a UserID equality filter', () => {
      expect(UserIdExtraFilter('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))
        .toBe("UserID='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'");
    });

    it('quote-escapes a value that contains a single quote', () => {
      expect(UserIdExtraFilter("O'Brien")).toBe("UserID='O''Brien'");
    });
  });

  describe('AssertRoleLoadSucceeded', () => {
    it('is a no-op on Success', () => {
      expect(() => AssertRoleLoadSucceeded({ Success: true }, 'u-1')).not.toThrow();
      expect(LogError).not.toHaveBeenCalled();
    });

    it('logs and throws on failure instead of returning an empty role set', () => {
      expect(() => AssertRoleLoadSucceeded({ Success: false, ErrorMessage: 'permission denied' }, 'u-1'))
        .toThrow('CurrentUser: failed to load roles: permission denied');
      expect(LogError).toHaveBeenCalledWith(
        'CurrentUser: failed to load roles for user u-1: permission denied',
      );
    });

    it('uses a fallback message when ErrorMessage is missing', () => {
      expect(() => AssertRoleLoadSucceeded({ Success: false }, 'u-1'))
        .toThrow('CurrentUser: failed to load roles: unknown error');
    });
  });
});
