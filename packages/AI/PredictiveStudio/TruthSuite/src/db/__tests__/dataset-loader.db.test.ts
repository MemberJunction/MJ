// Runs under vitest.db.config.ts against a provisioned private database (truth:provision), never the unit run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type sql from 'mssql';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { DatasetLoader, type DatasetLoadContext } from '../dataset-loader';
import { TruthConnection } from '../connection';
import { DatasetStamp } from '../stamp';
import { DatasetSeeds } from '../../data/seeds';

/** A scenario's one base seed (the seed the gates load). */
function baseSeed(code: string): number {
  const seed = DatasetSeeds.SeedSet('scenario', code, 'base')[0];
  if (seed === undefined) throw new Error(`scenario ${code} has no base seed`);
  return seed;
}
const C2_SEED = baseSeed('C2');
const D1C_SEED = baseSeed('D1c');

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

  it('a failed load into an unstamped table leaves it unstamped', async () => {
    // Create the condition inside the test, whatever ran before (the gates load D1c): drop D1c's stamp, so the table
    // is unstamped. The finally block loads D1c again, which restores its rows and its stamp.
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM sys.extended_properties
                 WHERE major_id = OBJECT_ID(N'pstruth.Scn_D1c') AND minor_id = 0 AND name = N'pstruth_dataset')
        EXEC sys.sp_dropextendedproperty @name = N'pstruth_dataset', @level0type = N'SCHEMA', @level0name = N'pstruth',
             @level1type = N'TABLE', @level1name = N'Scn_D1c';`);
    try {
      expect(await DatasetStamp.Read(pool, 'Scn_D1c')).toBeNull();
      const bad = DatasetLoader.LoadWithRowSource(ctx, { Kind: 'scenario', ID: 'D1c', Seed: D1C_SEED }, async function* () {
        yield { ID: 'not-a-guid' };
      });
      await expect(bad).rejects.toThrow();
      expect(await DatasetStamp.Read(pool, 'Scn_D1c')).toBeNull();
    } finally {
      await DatasetLoader.Load(ctx, { Kind: 'scenario', ID: 'D1c', Seed: D1C_SEED });
    }
  });

  it('a failed reload rolls back to the rows and stamp that were there', async () => {
    const good = await DatasetLoader.Load(ctx, { Kind: 'scenario', ID: 'C2', Seed: C2_SEED });
    const stamp = await DatasetStamp.Read(pool, 'Scn_C2');
    expect(stamp).toMatch(new RegExp(`^C2/seed-${C2_SEED}#[0-9a-f]{64}$`));
    const bad = DatasetLoader.LoadWithRowSource(ctx, { Kind: 'scenario', ID: 'C2', Seed: C2_SEED }, async function* () {
      yield { ID: 'not-a-guid' };
    });
    await expect(bad).rejects.toThrow();
    expect(await DatasetStamp.Read(pool, 'Scn_C2')).toBe(stamp);
    const count = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM pstruth.Scn_C2');
    expect(Number(count.recordset[0]?.cnt)).toBe(good.RowCount);
  });
});
