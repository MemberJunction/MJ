/**
 * Tests that ContextFunction surfaces the request's normalized Origin header on AppContext as
 * `RequestOrigin`. Database-facing dependencies are mocked; no connection is opened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorSubject } from 'rxjs';

const { mockProviderConfig } = vi.hoisted(() => ({
  mockProviderConfig: vi.fn(),
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
  SQLServerDataProvider: class {
    Config = mockProviderConfig;
  },
  SQLServerProviderConfigData: class {},
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
  resolveDbPlatformFromEnv: () => 'sqlserver',
  UserCache: { Instance: {} },
}));

vi.mock('@memberjunction/api-keys', () => ({
  GetAPIKeyEngine: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, Metadata: { Provider: { Entities: [{}] } } };
});

import { ContextFunction } from '../context.js';
import type { IncomingMessage } from 'http';
import type { ConnectionPool } from 'mssql';
import type { UserPayload } from '../types.js';

const MOCK_POOL = {} as ConnectionPool;
const MOCK_PAYLOAD = { email: 'user@example.com' } as UserPayload;

function makeReq(headers: IncomingMessage['headers']): IncomingMessage {
  return { headers, body: {}, ip: '127.0.0.1', userPayload: MOCK_PAYLOAD } as unknown as IncomingMessage;
}

async function contextFor(headers: IncomingMessage['headers']) {
  const build = ContextFunction({ setupComplete$: new BehaviorSubject<unknown>(true), dataSource: MOCK_POOL, dataSources: [] });
  return build({ req: makeReq(headers) });
}

describe('ContextFunction RequestOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProviderConfig.mockResolvedValue(true);
  });

  it('carries the normalized Origin header', async () => {
    const ctx = await contextFor({ origin: 'https://Embed.Example.com/' });
    expect(ctx.RequestOrigin).toBe('https://embed.example.com');
  });

  it('keeps an explicit port', async () => {
    const ctx = await contextFor({ origin: 'http://localhost:4200' });
    expect(ctx.RequestOrigin).toBe('http://localhost:4200');
  });

  it('is undefined when the request sent no Origin header', async () => {
    const ctx = await contextFor({});
    expect(ctx.RequestOrigin).toBeUndefined();
  });

  it('is undefined for a malformed or opaque Origin header', async () => {
    expect((await contextFor({ origin: 'null' })).RequestOrigin).toBeUndefined();
    expect((await contextFor({ origin: 'https://a.com/path' })).RequestOrigin).toBeUndefined();
  });

  it('leaves the existing context fields in place', async () => {
    const ctx = await contextFor({ origin: 'https://a.com' });
    expect(ctx.userPayload).toBe(MOCK_PAYLOAD);
    expect(ctx.ClientIp).toBe('127.0.0.1');
    expect(ctx.providers).toHaveLength(1);
  });
});
