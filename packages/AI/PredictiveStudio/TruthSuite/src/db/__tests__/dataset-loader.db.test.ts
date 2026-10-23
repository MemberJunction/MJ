// Runs under vitest.db.config.ts against a provisioned private database (truth:provision), never the unit run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type sql from 'mssql';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { DatasetLoader, type DatasetLoadContext } from '../dataset-loader';
import { TruthConnection } from '../connection';
import { DatasetStamp } from '../stamp';

describe('DatasetLoader', () => {
  let server: IntegrationBootstrapContext;
  let pool: sql.ConnectionPool;
  let ctx: DatasetLoadContext;

  beforeAll(async () => {
    server = await BootstrapIntegrationServer();
    pool = await TruthConnection.OpenPool();
    ctx = { Provider: server.Provider, User: server.User, Pool: pool };
  });

  afterAll(async () => {
    await pool?.close();
    await server?.ClosePool();
  });

  it('a failed load leaves no stale stamp', async () => {
    await DatasetLoader.Load(ctx, { Kind: 'scenario', ID: 'C2', Seed: 42 });
    const bad = DatasetLoader.LoadWithRowSource(ctx, { Kind: 'scenario', ID: 'D1c', Seed: 42 }, async function* () {
      yield { ID: 'not-a-guid' };
    });
    await expect(bad).rejects.toThrow();
    expect(await DatasetStamp.Read(pool, 'Scn_D1c')).toBeNull();
  });

  it('a failed reload rolls back to the rows and stamp that were there', async () => {
    const good = await DatasetLoader.Load(ctx, { Kind: 'scenario', ID: 'C2', Seed: 42 });
    const stamp = await DatasetStamp.Read(pool, 'Scn_C2');
    expect(stamp).toMatch(/^C2\/seed-42#[0-9a-f]{64}$/);
    const bad = DatasetLoader.LoadWithRowSource(ctx, { Kind: 'scenario', ID: 'C2', Seed: 42 }, async function* () {
      yield { ID: 'not-a-guid' };
    });
    await expect(bad).rejects.toThrow();
    expect(await DatasetStamp.Read(pool, 'Scn_C2')).toBe(stamp);
    const count = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM pstruth.Scn_C2');
    expect(Number(count.recordset[0]?.cnt)).toBe(good.RowCount);
  });
});
