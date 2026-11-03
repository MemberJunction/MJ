import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { AuthProviderFactory } from '@memberjunction/auth-providers';
import { UserInfo } from '@memberjunction/core';

vi.mock('../config.js', () => ({
  configInfo: {
    devAuth: { enabled: false },
    magicLink: {},
    authProviders: [],
  },
}));

import {
  AssertLocalDevAuthAllowed,
  IsLocalDevAuthEnabled,
  IsLoopbackAddress,
  MintLocalDevJwt,
  RegisterLocalDevAuthProvider,
  VerifyLocalhostRequest,
} from '../auth/localDevAuth.js';
import { MagicLinkKeyManager } from '../auth/magicLink/MagicLinkKeys.js';

function createMockRequest(overrides: {
  remoteAddress?: string;
  host?: string;
  origin?: string;
  referer?: string;
  xff?: string;
}): Request {
  const headers: Record<string, string | undefined> = {
    host: overrides.host ?? 'localhost:4000',
    origin: overrides.origin,
    referer: overrides.referer,
    'x-forwarded-for': overrides.xff,
  };
  return {
    headers,
    hostname: (overrides.host ?? 'localhost:4000').split(':')[0],
    ip: overrides.remoteAddress ?? '127.0.0.1',
    socket: {
      remoteAddress: overrides.remoteAddress ?? '127.0.0.1',
    },
  } as unknown as Request;
}

describe('localDevAuth security invariants', () => {
  beforeEach(() => {
    AuthProviderFactory.Instance.clear();
  });

  it('IsLocalDevAuthEnabled detects MJ_DEV_AUTH_ENABLED=true or 1', () => {
    expect(IsLocalDevAuthEnabled({})).toBe(false);
    expect(IsLocalDevAuthEnabled({ MJ_DEV_AUTH_ENABLED: 'false' })).toBe(false);
    expect(IsLocalDevAuthEnabled({ MJ_DEV_AUTH_ENABLED: 'true' })).toBe(true);
    expect(IsLocalDevAuthEnabled({ MJ_DEV_AUTH_ENABLED: '1' })).toBe(true);
  });

  it('AssertLocalDevAuthAllowed fails loudly when NODE_ENV=production', () => {
    expect(() =>
      AssertLocalDevAuthAllowed({
        MJ_DEV_AUTH_ENABLED: 'true',
        NODE_ENV: 'development',
      })
    ).not.toThrow();

    expect(() =>
      AssertLocalDevAuthAllowed({
        MJ_DEV_AUTH_ENABLED: 'true',
        NODE_ENV: 'production',
      })
    ).toThrow(/strictly forbidden when NODE_ENV=production/);
  });

  it('IsLoopbackAddress accepts loopback and conditional Docker local bridge IPs', () => {
    expect(IsLoopbackAddress('127.0.0.1', false)).toBe(true);
    expect(IsLoopbackAddress('::1', false)).toBe(true);
    expect(IsLoopbackAddress('::ffff:127.0.0.1', false)).toBe(true);
    expect(IsLoopbackAddress('192.168.65.1', false)).toBe(false);
    expect(IsLoopbackAddress('192.168.65.1', true)).toBe(true);
    expect(IsLoopbackAddress('172.18.0.1', true)).toBe(true);
    expect(IsLoopbackAddress('192.168.1.42', true)).toBe(false);
    expect(IsLoopbackAddress('203.0.113.10', true)).toBe(false);
  });

  it('VerifyLocalhostRequest allows genuine localhost requests and blocks non-localhost vectors', () => {
    // 1. Standard localhost IPv4 and IPv6
    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '127.0.0.1', host: 'localhost:4000', origin: 'http://localhost:4202' }),
        { NODE_ENV: 'development' }
      ).Allowed
    ).toBe(true);

    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '::1', host: '127.0.0.1:4000', origin: 'http://127.0.0.1:4202' }),
        { NODE_ENV: 'development' }
      ).Allowed
    ).toBe(true);

    // 2. Docker Desktop host-gateway when Host is localhost, inside container, and no XFF is present
    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '::ffff:192.168.65.1', host: 'localhost:4000' }),
        { NODE_ENV: 'development', MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE: 'true' }
      ).Allowed
    ).toBe(true);

    // 2b. Rejects Docker bridge IPs when NOT running inside a container
    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '172.18.0.1', host: 'localhost:4000' }),
        { NODE_ENV: 'development', MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE: 'false' }
      ).Allowed
    ).toBe(false);

    // 2c. Rejects non-gateway RFC1918 172.16.0.0/12 addresses even inside a container
    expect(IsLoopbackAddress('172.20.10.5', true)).toBe(false);

    // 3. Rejects in production even from 127.0.0.1
    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '127.0.0.1', host: 'localhost:4000' }),
        { NODE_ENV: 'production' }
      ).Allowed
    ).toBe(false);

    // 4. Rejects LAN IP on socket
    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '192.168.1.50', host: 'localhost:4000' }),
        { NODE_ENV: 'development' }
      ).Allowed
    ).toBe(false);

    // 5. Rejects non-localhost Host header
    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '127.0.0.1', host: '192.168.1.50:4000' }),
        { NODE_ENV: 'development' }
      ).Allowed
    ).toBe(false);

    // 6. Rejects external X-Forwarded-For
    expect(
      VerifyLocalhostRequest(
        createMockRequest({ remoteAddress: '127.0.0.1', host: 'localhost:4000', xff: '203.0.113.5' }),
        { NODE_ENV: 'development' }
      ).Allowed
    ).toBe(false);

    // 7. Rejects external Origin
    expect(
      VerifyLocalhostRequest(
        createMockRequest({
          remoteAddress: '127.0.0.1',
          host: 'localhost:4000',
          origin: 'https://attacker.example.com',
        }),
        { NODE_ENV: 'development' }
      ).Allowed
    ).toBe(false);
  });

  it('MintLocalDevJwt mints an RS256 token verifiable by the registered LocalDevProvider', () => {
    MagicLinkKeyManager.Instance.Initialize();
    RegisterLocalDevAuthProvider('http://localhost:4000');

    const mockUser = new UserInfo(undefined, {
      ID: '11111111-2222-3333-4444-555555555555',
      Name: 'Admin User',
      Email: 'admin@memberjunction.org',
      FirstName: 'Admin',
      LastName: 'User',
      IsActive: true,
      Type: 'Owner',
      UserRoles: [],
    });

    const { token, claims } = MintLocalDevJwt(mockUser, 'http://localhost:4000');
    expect(claims.iss).toBe('http://localhost:4000/local-dev');
    expect(claims.aud).toBe('mj-local-dev');
    expect(claims.email).toBe('admin@memberjunction.org');
    expect(claims['mj_magic_link']).toBeUndefined();

    const provider = AuthProviderFactory.Instance.getByIssuer('http://localhost:4000/local-dev');
    expect(provider).toBeDefined();
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    const userInfo = provider!.extractUserInfo(decoded);
    expect(userInfo.email).toBe('admin@memberjunction.org');
    expect(userInfo.firstName).toBe('Admin');
    expect(userInfo.lastName).toBe('User');
  });
});
