/**
 * Unit tests for the MJCLI package.
 * Tests: config schema validation, createFlywayUrl, getFlywayConfig.
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
        baselineVersion: '202602151200',
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

import { createFlywayUrl, getFlywayConfig, type MJConfig } from '../config';

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
  baselineVersion: '202602151200',
  baselineOnMigrate: true,
};

describe('createFlywayUrl', () => {
  it('should create JDBC URL without trustServerCertificate', () => {
    const url = createFlywayUrl(baseConfig);
    expect(url).toBe('jdbc:sqlserver://localhost:1433; databaseName=MemberJunction');
    expect(url).not.toContain('trustServerCertificate');
  });

  it('should append trustServerCertificate when enabled', () => {
    const url = createFlywayUrl({ ...baseConfig, dbTrustServerCertificate: true });
    expect(url).toContain('trustServerCertificate=true');
  });

  it('should use custom host and port', () => {
    const url = createFlywayUrl({ ...baseConfig, dbHost: 'db.example.com', dbPort: 5433 });
    expect(url).toContain('db.example.com:5433');
  });
});

describe('getFlywayConfig', () => {
  it('should return valid flyway config', async () => {
    const flyway = await getFlywayConfig(baseConfig);
    expect(flyway.url).toContain('localhost:1433');
    expect(flyway.user).toBe('codegen_user');
    expect(flyway.password).toBe('secret');
    expect(flyway.migrationLocations).toEqual(['filesystem:./migrations']);
    expect(flyway.advanced).toBeDefined();
    expect(flyway.advanced!.schemas).toEqual(['__mj']);
  });

  it('should use custom schema', async () => {
    const flyway = await getFlywayConfig(baseConfig, undefined, 'custom_schema');
    expect(flyway.advanced!.schemas).toEqual(['custom_schema']);
  });

  it('should use custom dir', async () => {
    const flyway = await getFlywayConfig(baseConfig, undefined, undefined, 'filesystem:./custom-migrations');
    expect(flyway.migrationLocations).toEqual(['filesystem:./custom-migrations']);
  });

  it('should prepend filesystem: when dir lacks it', async () => {
    const flyway = await getFlywayConfig(baseConfig, undefined, undefined, './custom-migrations');
    expect(flyway.migrationLocations).toEqual(['filesystem:./custom-migrations']);
  });

  it('should set baseline properties', async () => {
    const flyway = await getFlywayConfig(baseConfig);
    expect(flyway.advanced!.baselineVersion).toBe('202602151200');
    expect(flyway.advanced!.baselineOnMigrate).toBe(true);
  });

  it('should enable cleanDisabled by default (not set in advanced)', async () => {
    const flyway = await getFlywayConfig(baseConfig);
    // cleanDisabled=true means it should NOT appear in advanced config
    expect(flyway.advanced!.cleanDisabled).toBeUndefined();
  });

  it('should set cleanDisabled=false when explicitly disabled', async () => {
    const flyway = await getFlywayConfig({ ...baseConfig, cleanDisabled: false });
    expect(flyway.advanced!.cleanDisabled).toBe(false);
  });

  it('should add mjSchema placeholder for non-core schemas', async () => {
    const flyway = await getFlywayConfig(baseConfig, undefined, 'custom');
    expect(flyway.advanced!.placeHolderReplacement).toBe(true);
    expect(flyway.advanced!.placeHolders).toBeDefined();
  });
});
