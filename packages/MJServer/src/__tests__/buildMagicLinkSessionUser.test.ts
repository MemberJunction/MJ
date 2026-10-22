import { describe, it, expect, vi } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import type jwt from 'jsonwebtoken';

vi.mock('../config.js', () => ({
  userEmailMap: {},
  apiKey: 'test-api-key',
  mj_core_schema: '__mj',
  configInfo: {},
}));
vi.mock('../auth/index.js', () => ({
  GetSigningKeys: vi.fn(),
  GetSystemUser: vi.fn(),
  GetValidationOptions: vi.fn(),
  VerifyUserRecord: vi.fn(),
  ExtractUserInfoFromPayload: vi.fn(),
}));
vi.mock('../util.js', () => ({
  GetReadOnlyDataSource: vi.fn(),
  GetReadWriteDataSource: vi.fn(),
}));

import { BuildMagicLinkSessionUser, buildMagicLinkSessionUser } from '../context.js';

const uuid = (a: string, b: string) =>
  [a.repeat(8), b.repeat(4), '4' + b.repeat(3), '8' + b.repeat(3), b.repeat(12)].join('-');
const ANON_USER_ID = uuid('A', '0');
const NAMED_USER_ID = uuid('B', '1');

function makeUserRecord(id: string, email: string): UserInfo {
  return new UserInfo(null, {
    ID: id,
    Name: 'Session Test User',
    Email: email,
    IsActive: true,
    Type: 'User',
    UserRoles: [],
  });
}

describe('buildMagicLinkSessionUser', () => {
  it('sets AnonymousVisitorID from mj_sid for an anonymous magic-link token', () => {
    const baseUser = makeUserRecord(ANON_USER_ID, 'anonymous@magic-link.local');
    const payload: jwt.JwtPayload = {
      mj_magic_link: true,
      mj_anon: true,
      mj_sid: 'sid-visitor-123',
      mj_scopes: [{ inviteId: 'inv-1', appId: 'app-1', role: 'Widget Guest', resourceId: 'res-shared' }],
    };

    const result = buildMagicLinkSessionUser(baseUser, payload);

    expect(result).not.toBe(baseUser);
    expect(result.IsMagicLinkAnonymous).toBe(true);
    expect(result.AnonymousVisitorID).toBe('sid-visitor-123');
    expect(result.MagicLinkScope?.ResourceID).toBe('res-shared');
    expect(baseUser.AnonymousVisitorID).toBeUndefined();
  });

  it('rejects an anonymous magic-link token without mj_sid', () => {
    const baseUser = makeUserRecord(ANON_USER_ID, 'anonymous@magic-link.local');
    const missingSid: jwt.JwtPayload = {
      mj_magic_link: true,
      mj_anon: true,
      mj_scopes: [{ inviteId: 'inv-1', appId: 'app-1', role: 'Widget Guest', resourceId: 'res-shared' }],
    };
    const blankSid: jwt.JwtPayload = {
      mj_magic_link: true,
      mj_anon: true,
      mj_sid: '   ',
    };

    expect(() => BuildMagicLinkSessionUser(baseUser, missingSid)).toThrow(/mj_sid/);
    expect(() => buildMagicLinkSessionUser(baseUser, blankSid)).toThrow(/mj_sid/);
  });

  it('leaves AnonymousVisitorID undefined for a named magic-link token (with or without resource scope)', () => {
    const baseUser = makeUserRecord(NAMED_USER_ID, 'named@example.com');
    const unscopedNamed: jwt.JwtPayload = {
      mj_magic_link: true,
      mj_scopes: [{ inviteId: 'inv-named', appId: 'app-1', role: 'UI' }],
    };
    const scopedNamed: jwt.JwtPayload = {
      mj_magic_link: true,
      mj_scopes: [{ inviteId: 'inv-named-2', appId: 'app-1', role: 'UI', resourceId: 'res-named-1', resourceType: 'Report' }],
    };

    const unscopedResult = BuildMagicLinkSessionUser(baseUser, unscopedNamed);
    expect(unscopedResult.AnonymousVisitorID).toBeUndefined();

    const scopedResult = BuildMagicLinkSessionUser(baseUser, scopedNamed);
    expect(scopedResult.IsMagicLinkAnonymous).toBe(false);
    expect(scopedResult.MagicLinkScope?.ResourceID).toBe('res-named-1');
    expect(scopedResult.AnonymousVisitorID).toBeUndefined();
  });
});
