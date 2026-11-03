/**
 * Tests the debug log GetUserPayload writes for a freshly verified token. All auth and database
 * dependencies are mocked; no connection is opened.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({
  default: {
    decode: vi.fn(() => ({ iss: 'https://issuer.example.com/', exp: Math.floor(Date.now() / 1000) + 3600, sub: 'idp-subject' })),
    verify: vi.fn((_token: string, _keys: unknown, _opts: unknown, cb: (err: Error | null, decoded: unknown) => void) =>
      cb(null, { payload: { iss: 'https://issuer.example.com/', sub: 'idp-subject' } })
    ),
  },
}));

vi.mock('../auth/index.js', () => ({
  GetSigningKeys: vi.fn(() => vi.fn()),
  GetSystemUser: vi.fn(),
  GetValidationOptions: vi.fn(() => ({ audience: 'mjapi' })),
  ExtractUserInfoFromPayload: vi.fn(() => ({
    fullName: 'Alice Smith',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    preferredUsername: 'alice@example.com',
  })),
  VerifyUserRecord: vi.fn(async () => ({ ID: 'USER-ID-1', IsActive: true, Email: 'alice@example.com', UserRoles: [] })),
}));

vi.mock('@memberjunction/auth-providers', () => ({
  TokenExpiredError: class extends Error {},
  AuthProviderFactory: { Instance: { getByIssuer: vi.fn(() => ({})) } },
}));

vi.mock('../logging/StartupLogger.js', () => ({
  StartupLogger: { resolveLevelFromConfig: vi.fn(() => 'debug') },
}));

vi.mock('../util.js', () => ({
  GetReadOnlyDataSource: vi.fn(() => undefined),
  GetReadWriteDataSource: vi.fn(() => undefined),
}));

vi.mock('../config.js', () => ({
  configInfo: { databaseSettings: { metadataCacheRefreshInterval: 0 } },
  userEmailMap: {},
  apiKey: 'test-api-key',
  mj_core_schema: '__mj',
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
  SQLServerDataProvider: class {},
  SQLServerProviderConfigData: class {},
}));

vi.mock('@memberjunction/postgresql-dataprovider', () => ({
  PostgreSQLDataProvider: class {},
  PostgreSQLProviderConfigData: class {},
}));

vi.mock('@memberjunction/api-keys', () => ({
  GetAPIKeyEngine: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, Metadata: { Provider: undefined } };
});

import { GetUserPayload } from '../context.js';

describe('GetUserPayload valid-token debug log', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the user ID, not the name or email', async () => {
    const result = await GetUserPayload('Bearer token-for-log-test', 'session-1', []);

    expect(result.userRecord?.ID).toBe('USER-ID-1');
    const tokenLines = logged.filter((line) => line.includes('Valid token'));
    expect(tokenLines).toHaveLength(1);
    expect(tokenLines[0]).toContain('USER-ID-1');
    expect(tokenLines[0]).not.toContain('Alice');
    expect(tokenLines[0]).not.toContain('alice@example.com');
  });
});
