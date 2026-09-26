import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// MagicLinkService is the imperative shell — importing it pulls the full
// data-provider and communication stacks in at module load. Stub those out;
// @memberjunction/core stays real (Metadata, RunView, LogError).
vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { Users: [] } },
}));
vi.mock('@memberjunction/communication-engine', () => ({
  CommunicationEngine: { Instance: {} },
}));
vi.mock('@memberjunction/communication-types', () => ({
  Message: class {},
}));
vi.mock('../config.js', () => ({
  configInfo: {},
}));

import { Metadata, RunView, type DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import type { MagicLinkConfig } from '../config.js';
import { MagicLinkService } from '../auth/magicLink/MagicLinkService.js';
import { MAGIC_LINK_TOKEN_PREFIX } from '../auth/magicLink/magicLinkCore.js';

type Platform = 'sqlserver' | 'postgresql';

/** Provider surface consumeInvite/RedeemInvite touch, with real-shaped dialect behavior. */
interface FakeProvider {
  PlatformKey: Platform;
  MJCoreSchemaName: string;
  Roles: { ID: string; Name: string }[];
  Applications: { ID: string; Name: string; Path: string }[];
  Dialect: { ProcedureCallSyntax: (schema: string, name: string, params: string[]) => string };
  BuildParameterPlaceholder: (index: number) => string;
  ExecuteSQL: Mock;
}

function makeProvider(platform: Platform): FakeProvider {
  const isPg = platform === 'postgresql';
  return {
    PlatformKey: platform,
    MJCoreSchemaName: '__mj',
    Roles: [{ ID: 'role-1', Name: 'Magic Link Baseline' }],
    Applications: [],
    Dialect: {
      ProcedureCallSyntax: isPg
        ? (s, n, p) => `SELECT * FROM ${s}."${n}"(${p.join(', ')})`
        : (s, n, p) => `EXEC [${s}].[${n}] ${p.join(', ')}`,
    },
    BuildParameterPlaceholder: isPg ? (i) => `$${i + 1}` : (i) => `@p${i}`,
    ExecuteSQL: vi.fn(),
  };
}

const INVITE_ID = '11111111-2222-3333-4444-555555555555';

function makeInvite(): MJMagicLinkInviteEntity {
  return {
    ID: INVITE_ID,
    Status: 'Active',
    UseCount: 0,
    MaxUses: 1,
    ExpiresAt: new Date(Date.now() + 3600_000),
    RoleID: 'role-1',
    CreatedByUserID: 'inviter-1',
    ApplicationID: 'app-1',
    Email: 'g@example.com',
  } as unknown as MJMagicLinkInviteEntity;
}

/** Private surface of MagicLinkService the tests drive or stub. */
interface ServicePrivates {
  consumeInvite: (invite: MJMagicLinkInviteEntity, provider: DatabaseProviderBase, contextUser: UserInfo) => Promise<string>;
  resolveProvisioningContextUser: () => UserInfo | null;
  isInviterActive: (id: string) => boolean;
  recordRedemption: () => Promise<void>;
  provisionUser: () => Promise<{ success: boolean; error?: string }>;
}

describe('MagicLinkService.consumeInvite (#4753)', () => {
  let service: MagicLinkService;
  let privates: ServicePrivates;
  let invite: MJMagicLinkInviteEntity;
  const contextUser = { ID: 'ctx-user' } as UserInfo;

  beforeEach(() => {
    service = new MagicLinkService('https://mj.example.com', {} as MagicLinkConfig);
    privates = service as unknown as ServicePrivates;
    invite = makeInvite();
  });

  afterEach(() => {
    Metadata.Provider = null as unknown as IMetadataProvider;
  });

  async function consume(provider: FakeProvider): Promise<string> {
    return privates.consumeInvite(invite, provider as unknown as DatabaseProviderBase, contextUser);
  }

  it('SQL Server: calls spConsumeMagicLinkInvite with the ID bound by name, never interpolated', async () => {
    const provider = makeProvider('sqlserver');
    provider.ExecuteSQL.mockResolvedValue([{ ID: INVITE_ID }]);
    await consume(provider);

    expect(provider.ExecuteSQL).toHaveBeenCalledTimes(1);
    const [sql, params, options, user] = provider.ExecuteSQL.mock.calls[0];
    expect(sql).toBe('EXEC [__mj].[spConsumeMagicLinkInvite] @ID=@p0');
    expect(params).toEqual([INVITE_ID]);
    expect(options).toEqual(expect.objectContaining({ isMutation: true }));
    expect(user).toBe(contextUser);
    expect(sql).not.toContain(INVITE_ID);
    expect(String(sql).toUpperCase()).not.toContain('UPDATE');
  });

  it('PostgreSQL: calls the procedure positionally', async () => {
    const provider = makeProvider('postgresql');
    provider.ExecuteSQL.mockResolvedValue([{ ID: INVITE_ID }]);
    await consume(provider);

    const [sql, params] = provider.ExecuteSQL.mock.calls[0];
    expect(sql).toBe('SELECT * FROM __mj."spConsumeMagicLinkInvite"($1)');
    expect(params).toEqual([INVITE_ID]);
  });

  it("returns 'won' when exactly one row comes back", async () => {
    const provider = makeProvider('sqlserver');
    provider.ExecuteSQL.mockResolvedValue([{ ID: INVITE_ID }]);
    expect(await consume(provider)).toBe('won');
  });

  it("returns 'lost' when zero rows come back", async () => {
    const provider = makeProvider('sqlserver');
    provider.ExecuteSQL.mockResolvedValue([]);
    expect(await consume(provider)).toBe('lost');
  });

  it("returns 'failed' and logs the invite ID when ExecuteSQL throws", async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = makeProvider('sqlserver');
    provider.ExecuteSQL.mockRejectedValue(new Error("The EXECUTE permission was denied on the object 'spConsumeMagicLinkInvite'"));

    expect(await consume(provider)).toBe('failed');
    const logged = errorSpy.mock.calls.map((call) => call.map(String).join(' '));
    expect(logged.some((line) => line.includes(INVITE_ID) && line.includes('spConsumeMagicLinkInvite'))).toBe(true);
  });

  it("returns 'failed' when ExecuteSQL returns a non-array", async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = makeProvider('sqlserver');
    provider.ExecuteSQL.mockResolvedValue(undefined);

    expect(await consume(provider)).toBe('failed');
    const logged = errorSpy.mock.calls.map((call) => call.map(String).join(' '));
    expect(logged.some((line) => line.includes(INVITE_ID))).toBe(true);
  });
});

describe('MagicLinkService.RedeemInvite consume outcome mapping (#4753)', () => {
  let service: MagicLinkService;
  let provider: FakeProvider;
  let provisionUser: Mock;
  const contextUser = { ID: 'ctx-user' } as UserInfo;
  const rawToken = MAGIC_LINK_TOKEN_PREFIX + 'x';

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    provider = makeProvider('sqlserver');
    Metadata.Provider = provider as unknown as IMetadataProvider;

    service = new MagicLinkService('https://mj.example.com', {} as MagicLinkConfig);
    const privates = service as unknown as ServicePrivates;
    vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: [makeInvite()] } as Awaited<ReturnType<RunView['RunView']>>);
    vi.spyOn(privates, 'resolveProvisioningContextUser').mockReturnValue(contextUser);
    vi.spyOn(privates, 'isInviterActive').mockReturnValue(true);
    vi.spyOn(privates, 'recordRedemption').mockResolvedValue(undefined);
    provisionUser = vi.fn().mockResolvedValue({ success: false, error: 'stop-here' });
    privates.provisionUser = provisionUser;
  });

  afterEach(() => {
    Metadata.Provider = null as unknown as IMetadataProvider;
  });

  it('RedeemInvite maps a failed consume to server_error, not consumed, and never provisions', async () => {
    provider.ExecuteSQL.mockRejectedValue(new Error("The EXECUTE permission was denied on the object 'spConsumeMagicLinkInvite'"));
    const result = await service.RedeemInvite(rawToken);

    expect(result).toEqual(expect.objectContaining({ success: false, errorCode: 'server_error' }));
    expect(provisionUser).not.toHaveBeenCalled();
  });

  it('RedeemInvite still reports consumed when the race is lost', async () => {
    provider.ExecuteSQL.mockResolvedValue([]);
    const result = await service.RedeemInvite(rawToken);

    expect(result).toEqual(expect.objectContaining({ success: false, errorCode: 'consumed' }));
    expect(provisionUser).not.toHaveBeenCalled();
  });

  it('RedeemInvite proceeds to provisioning when the consume wins', async () => {
    provider.ExecuteSQL.mockResolvedValue([{ ID: INVITE_ID }]);
    const result = await service.RedeemInvite(rawToken);

    expect(provisionUser).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ success: false, errorCode: 'provisioning_failed' }));
  });
});
