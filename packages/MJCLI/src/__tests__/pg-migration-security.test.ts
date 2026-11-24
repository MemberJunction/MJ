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

import { ResolvePostgresMigrationSecurity, type MJConfig } from '../config';

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
});
