/**
 * `mj migrate --schema X` canonicalizes the target schema for the platform, the same way the
 * Open App engine does, so both install paths land in the same physical schema (#3548).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('cosmiconfig', () => ({
  cosmiconfigSync: vi.fn().mockReturnValue({ search: vi.fn().mockReturnValue(null) }),
}));

vi.mock('@memberjunction/config', () => ({
  mergeConfigs: (defaults: Record<string, unknown>, overrides: Record<string, unknown>) => ({ ...defaults, ...overrides }),
  parseBooleanEnv: (val: string | undefined) => val === 'true',
}));

vi.mock('@memberjunction/skyway-postgres', () => ({
  PostgresProvider: class {
    constructor(public readonly Config: unknown) {}
  },
}));

vi.mock('@memberjunction/skyway-sqlserver', () => ({
  SqlServerProvider: class {
    constructor(public readonly Config: unknown) {}
  },
}));

import { GetSkywayConfig, type MJConfig } from '../config';

const baseConfig: MJConfig = {
  dbHost: 'localhost',
  dbPort: 1433,
  dbDatabase: 'MemberJunction',
  codeGenLogin: 'codegen_user',
  codeGenPassword: 'secret',
  coreSchema: '__mj',
  cleanDisabled: true,
  mjRepoUrl: 'https://github.com/MemberJunction/MJ.git',
  migrationsLocation: 'filesystem:./migrations',
  dbTrustServerCertificate: false,
} as MJConfig;

const pgConfig: MJConfig = { ...baseConfig, dbPlatform: 'postgresql', dbPort: 5432 } as MJConfig;

describe('GetSkywayConfig — canonical target schema (#3548)', () => {
  it('lowercases an app schema on PostgreSQL for DefaultSchema and flyway:defaultSchema', async () => {
    const skyway = await GetSkywayConfig(pgConfig, undefined, '__mj_BizAppsCommon');
    expect(skyway.Migrations.DefaultSchema).toBe('__mj_bizappscommon');
    expect(skyway.Placeholders?.['flyway:defaultSchema']).toBe('__mj_bizappscommon');
  });

  it('lowercases a mixed-case core schema on PostgreSQL when no --schema is given', async () => {
    const skyway = await GetSkywayConfig({ ...pgConfig, coreSchema: '__MJ' } as MJConfig);
    expect(skyway.Migrations.DefaultSchema).toBe('__mj');
    expect(skyway.Placeholders?.['flyway:defaultSchema']).toBe('__mj');
  });

  it('keeps the configured casing on SQL Server', async () => {
    const skyway = await GetSkywayConfig(baseConfig, undefined, '__mj_BizAppsCommon');
    expect(skyway.Migrations.DefaultSchema).toBe('__mj_BizAppsCommon');
    expect(skyway.Placeholders?.['flyway:defaultSchema']).toBe('__mj_BizAppsCommon');
  });

  it('leaves the core __mj schema unchanged on both platforms', async () => {
    expect((await GetSkywayConfig(baseConfig)).Migrations.DefaultSchema).toBe('__mj');
    expect((await GetSkywayConfig(pgConfig)).Migrations.DefaultSchema).toBe('__mj');
  });

  it('leaves configured schemaPlaceholders values as written', async () => {
    const withPlaceholders = {
      ...pgConfig,
      SQLOutput: { schemaPlaceholders: [{ schema: '__mj_BizAppsCommon', placeholder: '${bizAppsCommon}' }] },
    } as MJConfig;
    const skyway = await GetSkywayConfig(withPlaceholders, undefined, '__mj_BizAppsCRM');
    expect(skyway.Migrations.DefaultSchema).toBe('__mj_bizappscrm');
    expect(skyway.Placeholders?.['bizAppsCommon']).toBe('__mj_BizAppsCommon');
  });

  it('still sets the legacy mjSchema placeholder for a non-core --schema', async () => {
    const skyway = await GetSkywayConfig(pgConfig, undefined, '__mj_BizAppsCommon');
    expect(skyway.Placeholders?.['mjSchema']).toBe('__mj');
  });
});
