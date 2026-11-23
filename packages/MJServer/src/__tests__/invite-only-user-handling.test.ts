import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JwtPayload } from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { ConnectionPool } from 'mssql';
import { Metadata, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type { DataSourceInfo } from '../types.js';

const mockState = vi.hoisted(() => {
  class _MockTokenExpiredError extends Error {
    constructor(public expiryDate: Date) {
      super('Token expired');
      this.name = 'TokenExpiredError';
    }
  }

  return {
    MockTokenExpiredError: _MockTokenExpiredError,
    configFile: {} as Record<string, unknown>,
    mockConfigInfo: {
      baseUrl: 'http://localhost',
      graphqlPort: 4001,
      graphqlRootPath: '/',
      databaseSettings: { metadataCacheRefreshInterval: 0 },
      userHandling: {
        autoCreateNewUsers: true,
        newUserLimitedToAuthorizedDomains: false,
        newUserAuthorizedDomains: [] as string[],
        newUserRoles: ['UI'] as string[],
        updateCacheWhenNotFound: false,
        updateCacheWhenNotFoundDelay: 0,
        contextUserForNewUserCreation: 'System',
        CreateUserApplicationRecords: false,
        UserApplications: [] as string[],
        inviteOnly: false,
        requireVerifiedEmail: false,
        verifiedEmailOptionalProviders: [] as string[],
      },
    },
    users: [] as UserInfo[],
    createNewUserSpy: vi.fn(),
    mockJwtDecode: vi.fn(),
    mockJwtVerify: vi.fn(),
    mockProvider: {
      name: 'auth0',
      extractUserInfo: vi.fn(),
      getSigningKey: vi.fn((_h: unknown, cb: (err: Error | null, key: string) => void) => cb(null, 'key')),
    },
  };
});

vi.mock('cosmiconfig', () => ({
  cosmiconfigSync: () => ({
    search: () => ({
      filepath: '/test/mj.config.cjs',
      isEmpty: false,
      config: {
        dbUsername: 'test-user',
        dbPassword: 'test-password',
        dbDatabase: 'test-db',
        ...mockState.configFile,
      },
    }),
  }),
}));

vi.mock('../util.js', () => ({
  GetReadOnlyDataSource: () => ({}) as ConnectionPool,
  GetReadWriteDataSource: () => ({}) as ConnectionPool,
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    decode: mockState.mockJwtDecode,
    verify: mockState.mockJwtVerify,
  },
}));

vi.mock('../cache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache.js')>();
  return {
    AuthCache: new Map<string, JwtPayload>(),
    get authCache() {
      return this.AuthCache;
    },
    HashAuthToken: actual.HashAuthToken,
  };
});

vi.mock('@memberjunction/auth-providers', () => ({
  TokenExpiredError: mockState.MockTokenExpiredError,
  AuthProviderFactory: {
    DiscoverFromEnvironment: () => [],
    get Instance() {
      return {
        clear: () => undefined,
        register: () => undefined,
        hasProviders: () => true,
        getByIssuer: () => mockState.mockProvider,
        getAllByIssuer: () => [mockState.mockProvider],
        getAllProviders: () => [mockState.mockProvider],
      };
    },
  },
}));

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
  return {
    ...actual,
    UserCache: {
      get Instance() {
        return {
          SYSTEM_USER_ID: 'system-user-id',
          Users: mockState.users,
          BlankEmailUserIDs: [],
          UsersByEmail: (email: string) =>
            mockState.users.filter((u) => u.Email?.trim().toLowerCase() === email.trim().toLowerCase()),
          FindUser: async ({ Email }: { Email?: string }) =>
            mockState.users.find((u) => u.Email?.trim().toLowerCase() === Email?.trim().toLowerCase()),
          AddOrUpdateUser: (u: UserInfo) => mockState.users.push(u),
          Refresh: vi.fn(),
          GetSystemUser: () => undefined,
        };
      },
    },
    resolveDbPlatformFromEnv: () => 'sqlserver',
  };
});

vi.mock('@memberjunction/api-keys', () => ({
  GetAPIKeyEngine: vi.fn(),
}));

import { MJGlobal } from '@memberjunction/global';
import { DEFAULT_SERVER_CONFIG, LoadConfig, configInfo } from '../config.js';
import {
  EvaluateExternalEmailVerification,
  IsInviteOnlyMode,
  IsVerifiedEmailRequired,
  NormalizeInviteOnlyUserHandling,
  ResolveEffectiveNewUserRoles,
} from '../auth/inviteOnlyPolicy.js';
import {
  InviteOnlyAuthenticationError,
  IsInviteOnlyAuthenticationError,
} from '../auth/inviteOnlyAuthError.js';
import { VerifyUserRecord } from '../auth/index.js';
import { NewUserBase } from '../auth/newUsers.js';
import { CreateUnifiedAuthMiddleware, GetUserPayload } from '../context.js';

function makeMockReq(headers: Record<string, string>): Request {
  return {
    method: 'POST',
    headers,
    path: '/graphql',
    url: '/graphql',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

function makeMockRes(): Response & { _status: number; _json: Record<string, unknown> | null } {
  const res = {
    _status: 0,
    _json: null as Record<string, unknown> | null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      res._json = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: Record<string, unknown> | null };
}

class SpyNewUserCreator extends NewUserBase {
  public override async createNewUser(firstName: string, lastName: string, email: string) {
    mockState.createNewUserSpy(firstName, lastName, email);
    const created = {
      ID: 'auto-created-user',
      Name: email,
      Email: email,
      IsActive: true,
      FirstName: firstName,
      LastName: lastName,
      GetAll: () => ({
        ID: 'auto-created-user',
        Name: email,
        Email: email,
        IsActive: true,
        FirstName: firstName,
        LastName: lastName,
      }),
    };
    return created as unknown as Awaited<ReturnType<NewUserBase['createNewUser']>>;
  }
}

describe('MJ-5 Invite-Only External User Config (userHandling)', () => {
  const dataSources: DataSourceInfo[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.length = 0;
    mockState.configFile = {};
    mockState.mockProvider.name = 'auth0';
    MJGlobal.Instance.ClassFactory.Register(NewUserBase, SpyNewUserCreator, undefined, 100, true);

    mockState.mockJwtVerify.mockImplementation(
      (_token: string, _keyFn: unknown, _options: unknown, cb: (err: Error | null, decoded: unknown) => void) => {
        cb(null, {});
      },
    );

    // Reset runtime configInfo.userHandling to default non-invite-only baseline before each test
    Object.assign(configInfo.userHandling, {
      ...DEFAULT_SERVER_CONFIG.userHandling,
      inviteOnly: false,
      requireVerifiedEmail: false,
      verifiedEmailOptionalProviders: [],
      updateCacheWhenNotFound: false,
    });
  });

  describe('configuration schema & normalization invariants', () => {
    it('keeps non-invite-only defaults unchanged for backwards compatibility', () => {
      const loaded = LoadConfig();
      expect(loaded.userHandling.inviteOnly).toBe(false);
      expect(loaded.userHandling.requireVerifiedEmail).toBe(false);
      expect(loaded.userHandling.verifiedEmailOptionalProviders).toEqual([]);
      expect(loaded.userHandling.autoCreateNewUsers).toBe(true);
      expect(loaded.userHandling.newUserRoles).toEqual(['UI']);
      expect(IsInviteOnlyMode(loaded.userHandling)).toBe(false);
      expect(IsVerifiedEmailRequired(loaded.userHandling)).toBe(false);
      expect(ResolveEffectiveNewUserRoles(loaded.userHandling)).toEqual(['UI']);
    });

    it('forces autoCreateNewUsers=false, requireVerifiedEmail=true, and newUserRoles=[] when inviteOnly=true', () => {
      mockState.configFile = {
        userHandling: {
          inviteOnly: true,
          autoCreateNewUsers: true,
          newUserRoles: ['UI', 'Developer'],
        },
      };
      const loaded = LoadConfig();
      expect(loaded.userHandling.inviteOnly).toBe(true);
      expect(loaded.userHandling.autoCreateNewUsers).toBe(false);
      expect(loaded.userHandling.requireVerifiedEmail).toBe(true);
      expect(loaded.userHandling.newUserRoles).toEqual([]);
      expect(ResolveEffectiveNewUserRoles(loaded.userHandling)).toEqual([]);
    });

    it('NormalizeInviteOnlyUserHandling preserves non-invite-only settings and strips UI role when inviteOnly=true', () => {
      const normal = NormalizeInviteOnlyUserHandling({
        inviteOnly: false,
        autoCreateNewUsers: true,
        requireVerifiedEmail: false,
        newUserRoles: ['UI'],
      });
      expect(normal.autoCreateNewUsers).toBe(true);
      expect(normal.newUserRoles).toEqual(['UI']);

      const hardened = NormalizeInviteOnlyUserHandling({
        inviteOnly: true,
        autoCreateNewUsers: true,
        requireVerifiedEmail: false,
        newUserRoles: ['UI'],
      });
      expect(hardened.autoCreateNewUsers).toBe(false);
      expect(hardened.requireVerifiedEmail).toBe(true);
      expect(hardened.newUserRoles).toEqual([]);
    });
  });

  describe('email verification policy', () => {
    it('allows tokens without email_verified when neither inviteOnly nor requireVerifiedEmail is enabled', () => {
      expect(
        EvaluateExternalEmailVerification({
          Payload: { iss: 'https://issuer.test/', sub: '1' },
          UserHandling: { inviteOnly: false, requireVerifiedEmail: false },
          ProviderName: 'auth0',
          Issuer: 'https://issuer.test/',
        }),
      ).toEqual({ Allowed: true });
    });

    it('refuses email_verified=false and missing email_verified in invite-only mode', () => {
      const policy = { inviteOnly: true, requireVerifiedEmail: true, verifiedEmailOptionalProviders: [] };

      const explicitFalse = EvaluateExternalEmailVerification({
        Payload: { iss: 'https://auth0.test/', sub: '1', email_verified: false },
        UserHandling: policy,
        ProviderName: 'auth0',
        Issuer: 'https://auth0.test/',
      });
      expect(explicitFalse.Allowed).toBe(false);

      const missingClaim = EvaluateExternalEmailVerification({
        Payload: { iss: 'https://auth0.test/', sub: '1' },
        UserHandling: policy,
        ProviderName: 'auth0',
        Issuer: 'https://auth0.test/',
      });
      expect(missingClaim.Allowed).toBe(false);

      const entraFalse = EvaluateExternalEmailVerification({
        Payload: { iss: 'https://login.microsoftonline.com/tenant/v2.0', sub: '1', xms_edov: false },
        UserHandling: { ...policy, verifiedEmailOptionalProviders: ['azure'] },
        ProviderName: 'azure',
        Issuer: 'https://login.microsoftonline.com/tenant/v2.0',
      });
      expect(entraFalse.Allowed).toBe(false);
    });

    it('supports explicitly configured verifiedEmailOptionalProviders (e.g. Entra ID) when email_verified is omitted', () => {
      const policy = {
        inviteOnly: true,
        requireVerifiedEmail: true,
        verifiedEmailOptionalProviders: ['azure'],
      };

      expect(
        EvaluateExternalEmailVerification({
          Payload: { iss: 'https://login.microsoftonline.com/tenant/v2.0', sub: '1' },
          UserHandling: policy,
          ProviderName: 'azure',
          Issuer: 'https://login.microsoftonline.com/tenant/v2.0',
        }),
      ).toEqual({ Allowed: true });

      expect(
        EvaluateExternalEmailVerification({
          Payload: { iss: 'https://login.microsoftonline.com/tenant/v2.0', sub: '1', xms_edov: true },
          UserHandling: { ...policy, verifiedEmailOptionalProviders: [] },
          ProviderName: 'azure',
          Issuer: 'https://login.microsoftonline.com/tenant/v2.0',
        }),
      ).toEqual({ Allowed: true });
    });
  });

  describe('end-to-end GetUserPayload & CreateUnifiedAuthMiddleware invite-only enforcement', () => {
    function setupJwt(token: string, claims: Record<string, unknown>, email: string): void {
      mockState.mockJwtDecode.mockReturnValue({
        iss: 'https://auth0.example.com/',
        sub: 'ext-sub-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
        email,
        ...claims,
      });
      mockState.mockProvider.extractUserInfo.mockReturnValue({
        email,
        firstName: 'External',
        lastName: 'User',
        fullName: 'External User',
        preferredUsername: email,
      });
      expect(token.length).toBeGreaterThan(0);
    }

    it('refuses uninvited sign-in with an explicit InviteOnlyAuthenticationError and never auto-creates a user', async () => {
      Object.assign(configInfo.userHandling, {
        inviteOnly: true,
        autoCreateNewUsers: true, // even if mistakenly left true in config, inviteOnly must block auto-create
        newUserRoles: ['UI'],
      });
      setupJwt('tok-uninvited', { email_verified: true }, 'uninvited@external.org');

      await expect(GetUserPayload('Bearer tok-uninvited', 's1', dataSources)).rejects.toThrow(
        /Invite-only sign-in refused: no invited user account exists/,
      );
      expect(mockState.createNewUserSpy).not.toHaveBeenCalled();

      const middleware = CreateUnifiedAuthMiddleware(dataSources);
      const res = makeMockRes();
      const next = vi.fn();
      await middleware(makeMockReq({ authorization: 'Bearer tok-uninvited' }), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(401);
      expect(String(res._json?.error)).toMatch(/Invite-only sign-in refused/);
    });

    it('refuses an invited user when external IdP email_verified is false or omitted', async () => {
      Object.assign(configInfo.userHandling, { inviteOnly: true, requireVerifiedEmail: true, newUserRoles: [] });
      const invited = new UserInfo(undefined, {
        ID: 'invited-1',
        Name: 'Invited User',
        Email: 'invited@external.org',
        IsActive: true,
        UserRoles: [],
      });
      mockState.users.push(invited);

      setupJwt('tok-unverified-false', { email_verified: false }, 'invited@external.org');
      let caught: unknown;
      try {
        await GetUserPayload('Bearer tok-unverified-false', 's1', dataSources);
      } catch (err) {
        caught = err;
      }
      expect(IsInviteOnlyAuthenticationError(caught)).toBe(true);
      expect(caught).toBeInstanceOf(InviteOnlyAuthenticationError);
      expect((caught as Error).message).toMatch(/unverified email claim/);

      setupJwt('tok-unverified-missing', {}, 'invited@external.org');
      await expect(GetUserPayload('Bearer tok-unverified-missing', 's1', dataSources)).rejects.toThrow(
        /missing a verified email claim/,
      );
    });

    it('admits an invited and verified external user with ZERO auto-granted UI roles', async () => {
      Object.assign(configInfo.userHandling, {
        inviteOnly: true,
        autoCreateNewUsers: true,
        newUserRoles: ['UI'],
      });
      const invited = new UserInfo(undefined, {
        ID: 'invited-2',
        Name: 'Invited Verified',
        Email: 'verified.guest@external.org',
        IsActive: true,
        UserRoles: [{ UserID: 'invited-2', RoleID: 'role-guest', Role: 'ExternalGuest' }],
      });
      mockState.users.push(invited);

      setupJwt('tok-invited-verified', { email_verified: true }, 'verified.guest@external.org');
      const payload = await GetUserPayload('Bearer tok-invited-verified', 's1', dataSources);
      expect(payload.userRecord.ID).toBe('invited-2');
      expect(payload.userRecord.UserRoles.map((r) => r.Role)).toEqual(['ExternalGuest']);
      expect(payload.userRecord.UserRoles.some((r) => r.Role === 'UI')).toBe(false);
    });

    it('preserves default auto-provisioning and UI role grant when inviteOnly=false', async () => {
      const prevProvider = Metadata.Provider;
      Metadata.Provider = {
        Roles: [{ ID: 'role-ui', Name: 'UI' }],
      } as unknown as IMetadataProvider;
      try {
        Object.assign(configInfo.userHandling, {
          inviteOnly: false,
          requireVerifiedEmail: false,
          autoCreateNewUsers: true,
          newUserRoles: ['UI'],
        });

        const created = await VerifyUserRecord('open@example.com', 'Open', 'User');
        expect(mockState.createNewUserSpy).toHaveBeenCalledOnce();
        expect(created?.UserRoles.map((r) => r.Role)).toEqual(['UI']);
      } finally {
        Metadata.Provider = prevProvider;
      }
    });
  });
});
