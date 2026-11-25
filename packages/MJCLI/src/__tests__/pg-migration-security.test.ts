/**
 * `ResolvePostgresMigrationSecurity` with a token login: the caller gets the password source, so
 * each later connection can ask for its own token.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BasePgCredentialProvider } from '@memberjunction/postgresql-dataprovider';

vi.mock('cosmiconfig', () => ({
  cosmiconfigSync: vi.fn().mockReturnValue({ search: vi.fn().mockReturnValue(null) }),
}));

vi.mock('simple-git', () => ({
  simpleGit: vi.fn().mockReturnValue({}),
}));

import { GetSkywayConfig, ResolvePostgresMigrationSecurity, type MJConfig } from '../config';

const issued = { count: 0 };

@RegisterClass(BasePgCredentialProvider, 'test-cli-token-mode')
class CountingTokenProvider extends BasePgCredentialProvider {
  public async GetPassword(): Promise<string> {
    return `token-${++issued.count}`;
  }
}

const pgConfig: MJConfig = {
  dbPlatform: 'postgresql',
  dbHost: 'db.example.com',
  dbPort: 5432,
  dbDatabase: 'mj',
  codeGenLogin: 'mj_codegen',
  codeGenPassword: '',
  migrationsLocation: 'filesystem:./migrations',
  dbTrustServerCertificate: false,
  coreSchema: '__mj',
  cleanDisabled: true,
  mjRepoUrl: 'https://github.com/MemberJunction/MJ.git',
  baselineOnMigrate: true,
};

describe('ResolvePostgresMigrationSecurity — token login', () => {
  beforeEach(() => {
    issued.count = 0;
    vi.stubEnv('PG_AUTH_MODE', 'test-cli-token-mode');
    vi.stubEnv('PG_SSL_MODE', 'verify-full');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the password source, which gives a token each time it is asked', async () => {
    const security = await ResolvePostgresMigrationSecurity(pgConfig);
    expect(CountingTokenProvider).toBeDefined();
    expect(typeof security.PasswordSource).toBe('function');
    const first = await security.PasswordSource?.();
    const second = await security.PasswordSource?.();
    expect(first).not.toBe(second);
  });

  it('fetches no token up front', async () => {
    await ResolvePostgresMigrationSecurity(pgConfig);
    expect(issued.count).toBe(0);
  });

  it('hands the source to Skyway as its PasswordProvider, so each connection asks for its own token', async () => {
    const config = await GetSkywayConfig(pgConfig, undefined, undefined, './migrations-pg');
    expect(typeof config.Database.PasswordProvider).toBe('function');
    expect(issued.count).toBe(0);
    const first = await config.Database.PasswordProvider?.();
    const second = await config.Database.PasswordProvider?.();
    expect([first, second]).toEqual(['token-1', 'token-2']);
  });
});

describe('ResolvePostgresMigrationSecurity — password login', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('gives Skyway no PasswordProvider', async () => {
    vi.stubEnv('PG_AUTH_MODE', 'password');
    const config = await GetSkywayConfig({ ...pgConfig, codeGenPassword: 'secret' }, undefined, undefined, './migrations-pg');
    expect(config.Database.PasswordProvider).toBeUndefined();
    expect(config.Database.Password).toBe('secret');
  });
});
