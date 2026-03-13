/**
 * Unit tests for the MJCLI package.
 * Tests: config schema validation, getSkywayConfig.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks - must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('cosmiconfig', () => ({
  cosmiconfigSync: vi.fn().mockReturnValue({
    search: vi.fn().mockReturnValue({
      config: {
        dbHost: 'testhost',
        dbPort: 5433,
        dbDatabase: 'testdb',
        codeGenLogin: 'user',
        codeGenPassword: 'pass',
        coreSchema: '__mj',
        cleanDisabled: true,
        mjRepoUrl: 'https://github.com/MemberJunction/MJ.git',
        migrationsLocation: 'filesystem:./migrations',
        baselineOnMigrate: true,
      },
      filepath: '/fake/mj.config.cjs',
      isEmpty: false,
    }),
  }),
}));

vi.mock('@memberjunction/config', () => ({
  mergeConfigs: (defaults: Record<string, unknown>, overrides: Record<string, unknown>) => ({
    ...defaults,
    ...overrides,
  }),
  parseBooleanEnv: (val: string | undefined) => val === 'true',
}));

vi.mock('simple-git', () => ({
  simpleGit: vi.fn().mockReturnValue({
    clone: vi.fn().mockResolvedValue(undefined),
    raw: vi.fn().mockResolvedValue(''),
  }),
}));

vi.mock('node:fs', () => ({
  mkdtempSync: vi.fn().mockReturnValue('/tmp/mj-test-123'),
}));

vi.mock('node:os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getSkywayConfig, type MJConfig } from '../config';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const baseConfig: MJConfig = {
  dbHost: 'localhost',
  dbPort: 1433,
  dbDatabase: 'MemberJunction',
  codeGenLogin: 'codegen_user',
  codeGenPassword: 'secret',
  migrationsLocation: 'filesystem:./migrations',
  dbTrustServerCertificate: false,
  coreSchema: '__mj',
  cleanDisabled: true,
  mjRepoUrl: 'https://github.com/MemberJunction/MJ.git',
  baselineOnMigrate: true,
};

describe('getSkywayConfig', () => {
  it('should return valid Skyway config with database settings', async () => {
    const skyway = await getSkywayConfig(baseConfig);
    expect(skyway.Database.Server).toBe('localhost');
    expect(skyway.Database.Port).toBe(1433);
    expect(skyway.Database.Database).toBe('MemberJunction');
    expect(skyway.Database.User).toBe('codegen_user');
    expect(skyway.Database.Password).toBe('secret');
  });

  it('should set TrustServerCertificate from config', async () => {
    const skyway = await getSkywayConfig({ ...baseConfig, dbTrustServerCertificate: true });
    expect(skyway.Database.Options?.TrustServerCertificate).toBe(true);
  });

  it('should strip filesystem: prefix from migration locations', async () => {
    const skyway = await getSkywayConfig(baseConfig);
    expect(skyway.Migrations.Locations).toEqual(['./migrations']);
    expect(skyway.Migrations.Locations[0]).not.toContain('filesystem:');
  });

  it('should use custom schema as DefaultSchema', async () => {
    const skyway = await getSkywayConfig(baseConfig, undefined, 'custom_schema');
    expect(skyway.Migrations.DefaultSchema).toBe('custom_schema');
  });

  it('should use coreSchema as default DefaultSchema', async () => {
    const skyway = await getSkywayConfig(baseConfig);
    expect(skyway.Migrations.DefaultSchema).toBe('__mj');
  });

  it('should use custom dir and strip filesystem: prefix', async () => {
    const skyway = await getSkywayConfig(baseConfig, undefined, undefined, 'filesystem:./custom-migrations');
    expect(skyway.Migrations.Locations).toEqual(['./custom-migrations']);
  });

  it('should prepend filesystem: then strip it when dir lacks prefix', async () => {
    const skyway = await getSkywayConfig(baseConfig, undefined, undefined, './custom-migrations');
    expect(skyway.Migrations.Locations).toEqual(['./custom-migrations']);
  });

  it('should omit BaselineVersion when not set (Skyway auto-detects)', async () => {
    const skyway = await getSkywayConfig(baseConfig);
    expect(skyway.Migrations.BaselineVersion).toBeUndefined();
    expect(skyway.Migrations.BaselineOnMigrate).toBe(true);
  });

  it('should pass BaselineVersion when explicitly set in config', async () => {
    const skyway = await getSkywayConfig({ ...baseConfig, baselineVersion: '202602151200' });
    expect(skyway.Migrations.BaselineVersion).toBe('202602151200');
  });

  it('should always set flyway:defaultSchema placeholder', async () => {
    const skyway = await getSkywayConfig(baseConfig);
    expect(skyway.Placeholders).toBeDefined();
    expect(skyway.Placeholders!['flyway:defaultSchema']).toBe('__mj');
  });

  it('should set flyway:defaultSchema to custom schema when provided', async () => {
    const skyway = await getSkywayConfig(baseConfig, undefined, 'custom');
    expect(skyway.Placeholders!['flyway:defaultSchema']).toBe('custom');
  });

  it('should add mjSchema placeholder for non-core schemas', async () => {
    const skyway = await getSkywayConfig(baseConfig, undefined, 'custom');
    expect(skyway.Placeholders!['mjSchema']).toBe('__mj');
  });

  it('should not add mjSchema placeholder when schema matches coreSchema', async () => {
    const skyway = await getSkywayConfig(baseConfig, undefined, '__mj');
    expect(skyway.Placeholders!['mjSchema']).toBeUndefined();
  });

  it('should map schemaPlaceholders from config', async () => {
    const configWithPlaceholders: MJConfig = {
      ...baseConfig,
      SQLOutput: {
        schemaPlaceholders: [
          { schema: '__mj', placeholder: '${flyway:defaultSchema}' },
          { schema: '__bcsaas', placeholder: '${bcsaasSchema}' },
        ],
      },
    };
    const skyway = await getSkywayConfig(configWithPlaceholders);
    // flyway: prefixed placeholders should be skipped (handled separately)
    expect(skyway.Placeholders!['bcsaasSchema']).toBe('__bcsaas');
    // flyway:defaultSchema is always set
    expect(skyway.Placeholders!['flyway:defaultSchema']).toBe('__mj');
  });

  it('should clone remote repo when tag is provided', async () => {
    const { simpleGit } = await import('simple-git');
    const skyway = await getSkywayConfig(baseConfig, 'v1.0.0');
    expect(simpleGit).toHaveBeenCalled();
    // Location should use the temp directory (with filesystem: stripped)
    expect(skyway.Migrations.Locations[0]).toContain('/tmp/mj-test-123');
  });
});
