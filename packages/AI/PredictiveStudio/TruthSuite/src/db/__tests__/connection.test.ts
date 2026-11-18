import { describe, it, expect } from 'vitest';
import type { DbConfig } from '@memberjunction/testing-integration';
import { TruthConnection } from '../connection';

describe('TruthConnection.ResolvePoolConfig', () => {
  it('builds the mssql pool config from LoadDbConfig()', async () => {
    const fakeLoad = async (): Promise<DbConfig> => ({
      Host: 'sql.local',
      Port: 14330,
      User: 'sa',
      Password: 'secret',
      Database: 'MJ_PS_PR2_test',
      Schema: '__mj',
      Platform: 'sqlserver',
    });
    const cfg = await TruthConnection.ResolvePoolConfig(fakeLoad, {});
    expect(cfg).toEqual({
      server: 'sql.local',
      port: 14330,
      database: 'MJ_PS_PR2_test',
      user: 'sa',
      password: 'secret',
      requestTimeout: 120_000,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });
  });

  it('honors DB_TRUST_SERVER_CERTIFICATE=false and refuses non-sqlserver platforms', async () => {
    const fakeSql = async (): Promise<DbConfig> => ({
      Host: 'sql.local',
      Port: 1433,
      User: 'sa',
      Password: 'secret',
      Database: 'test',
      Schema: '__mj',
      Platform: 'sqlserver',
    });
    const cfg = await TruthConnection.ResolvePoolConfig(fakeSql, { DB_TRUST_SERVER_CERTIFICATE: 'false' });
    expect(cfg.options?.trustServerCertificate).toBe(false);

    const fakePg = async (): Promise<DbConfig> => ({
      Host: 'pg.local',
      Port: 5432,
      User: 'postgres',
      Password: 'secret',
      Database: 'test',
      Schema: '__mj',
      Platform: 'postgresql',
    });
    await expect(TruthConnection.ResolvePoolConfig(fakePg, {})).rejects.toThrow(/requires SQL Server/);
  });
});
