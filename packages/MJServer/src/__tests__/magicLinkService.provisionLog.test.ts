import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// MagicLinkService is the imperative shell — importing it pulls the full
// data-provider and communication stacks in at module load. Stub those out;
// this suite only exercises provisioning's console-log behavior, so
// @memberjunction/core (the logging implementation) stays real.
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

import { Metadata, type IMetadataProvider, type RoleInfo, type UserInfo } from '@memberjunction/core';
import type { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import type { MagicLinkConfig } from '../config.js';
import { MagicLinkService } from '../auth/magicLink/MagicLinkService.js';

/** Minimal BaseEntity stand-in: NewRecord/Save/GetAll plus writable fields. */
interface MockEntity {
  NewRecord: () => void;
  Save: () => Promise<boolean>;
  GetAll: () => Record<string, unknown>;
  LatestResult?: { CompleteMessage: string };
  [field: string]: unknown;
}

function makeMockEntity(id: string): MockEntity {
  const entity: MockEntity = {
    NewRecord: () => {
      entity.ID = id;
    },
    Save: async () => true,
    GetAll: () => ({
      ID: entity.ID,
      Name: entity.Name,
      Email: entity.Email,
      FirstName: entity.FirstName,
      LastName: entity.LastName,
    }),
  };
  return entity;
}

describe('MagicLinkService provisioning log policy', () => {
  const originalVerbose = process.env.MJ_VERBOSE;
  let service: MagicLinkService;
  let invite: MJMagicLinkInviteEntity;
  let role: RoleInfo;
  let contextUser: UserInfo;

  beforeEach(() => {
    const provider = {
      BeginTransaction: async () => undefined,
      CommitTransaction: async () => undefined,
      RollbackTransaction: async () => undefined,
      GetEntityObject: async (entityName: string) => makeMockEntity(`mock-${entityName}`),
    };
    Metadata.Provider = provider as unknown as IMetadataProvider;

    service = new MagicLinkService('https://mj.example.com', {} as MagicLinkConfig);
    invite = {
      Email: 'guest@example.com',
      RoleID: 'role-1',
      ApplicationID: 'app-1',
    } as unknown as MJMagicLinkInviteEntity;
    role = { ID: 'role-1', Name: 'External Guest' } as RoleInfo;
    contextUser = { ID: 'ctx-user' } as UserInfo;
  });

  afterEach(() => {
    Metadata.Provider = null as unknown as IMetadataProvider;
    if (originalVerbose === undefined) {
      delete process.env.MJ_VERBOSE;
    } else {
      process.env.MJ_VERBOSE = originalVerbose;
    }
  });

  async function provisionAndCollectLogs(): Promise<{ success: boolean; provisionLines: string[] }> {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await service['createScopedUser'](invite, role, contextUser);
    const provisionLines = logSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes('[MagicLink] Provisioned'));
    return { success: result.success, provisionLines };
  }

  // Deliberate policy (do not verbose-gate this like the startup notices in 2ddb865e40):
  // magic-link redemption provisioning a new external account is a security-relevant
  // event and must stay visible in the DEFAULT server log, so operators see the vector
  // being exercised without needing MJ_VERBOSE.
  it('emits the provisioned-user notice on the default (non-verbose) server log', async () => {
    delete process.env.MJ_VERBOSE;
    const { success, provisionLines } = await provisionAndCollectLogs();
    expect(success).toBe(true);
    expect(provisionLines).toHaveLength(1);
    expect(provisionLines[0]).toContain("guest@example.com with role 'External Guest'");
  });
});
