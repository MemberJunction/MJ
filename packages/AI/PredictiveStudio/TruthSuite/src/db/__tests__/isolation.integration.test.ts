import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type sql from 'mssql';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { TruthCsv } from '../csv';
import { TruthConnection } from '../connection';
import { DatasetLoader, type DatasetLoadContext, type DatasetRow } from '../dataset-loader';
import { DatasetStamp } from '../stamp';

async function readTableCounts(pool: sql.ConnectionPool): Promise<Record<string, number>> {
  const res = await pool.request().query<{ tbl: string; cnt: number }>(`
    SELECT t.name AS tbl, SUM(p.rows) AS cnt
    FROM sys.tables t
    JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
    WHERE t.schema_id = SCHEMA_ID('pstruth')
    GROUP BY t.name
    ORDER BY t.name
  `);
  const out: Record<string, number> = {};
  for (const r of res.recordset) {
    out[r.tbl] = Number(r.cnt);
  }
  return out;
}

async function tableChecksum(pool: sql.ConnectionPool, table: string): Promise<number | null> {
  const res = await pool
    .request()
    .query<{ chk: number | null }>(`SELECT CHECKSUM_AGG(CHECKSUM(*)) AS chk FROM pstruth.[${table}]`);
  return res.recordset[0]?.chk ?? null;
}

/** The dataset's own `rows.csv` minus its last row, as a row source (one row short of the manifest). */
function allButLastRow(dir: string): () => AsyncIterable<DatasetRow> {
  const parsed = TruthCsv.Parse(readFileSync(path.join(dir, 'rows.csv'), 'utf8'));
  return async function* () {
    for (const row of parsed.Rows.slice(0, -1)) {
      yield Object.fromEntries(parsed.Header.map((c, i) => [c, row[i] ?? '']));
    }
  };
}

describe('per-dataset loader isolation (M4.4)', () => {
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

  it('loads W1 s42, W3 s42, and W1 s43 without touching any other dataset tables', async () => {
    const beforeCounts = await readTableCounts(pool);

    const load1 = await DatasetLoader.Load(ctx, { Kind: 'world', ID: 'W1-signal', Seed: 42 });
    expect(load1.RowCount).toBe(16776);
    const w1Stamp42 = await DatasetStamp.Read(pool, 'W1_MembershipYear');
    expect(w1Stamp42).toMatch(/^W1-signal\/seed-42#[0-9a-f]{64}$/);

    const afterW1s42Counts = await readTableCounts(pool);
    expect(afterW1s42Counts['W1_Person']).toBe(4999);
    for (const [tbl, cnt] of Object.entries(afterW1s42Counts)) {
      if (tbl === 'W1_Person' || tbl === 'W1_MembershipYear') continue;
      expect(cnt, `table ${tbl} changed during W1 s42 load`).toBe(beforeCounts[tbl]);
    }

    const load2 = await DatasetLoader.Load(ctx, { Kind: 'world', ID: 'W3-leak-row', Seed: 42 });
    expect(load2.RowCount).toBeGreaterThan(0);
    const w3Stamp42 = await DatasetStamp.Read(pool, 'W3_MembershipYear');
    expect(w3Stamp42).toMatch(/^W3-leak-row\/seed-42#[0-9a-f]{64}$/);
    const w3ChecksumBefore = await tableChecksum(pool, 'W3_MembershipYear');
    const w3PersonChecksumBefore = await tableChecksum(pool, 'W3_Person');

    const afterW3s42Counts = await readTableCounts(pool);
    expect(afterW3s42Counts['W1_MembershipYear']).toBe(16776);
    expect(await DatasetStamp.Read(pool, 'W1_MembershipYear')).toBe(w1Stamp42);
    for (const [tbl, cnt] of Object.entries(afterW3s42Counts)) {
      if (tbl === 'W3_Person' || tbl === 'W3_MembershipYear') continue;
      expect(cnt, `table ${tbl} changed during W3 s42 load`).toBe(afterW1s42Counts[tbl]);
    }

    const load3 = await DatasetLoader.Load(ctx, { Kind: 'world', ID: 'W1-signal', Seed: 43 });
    expect(load3.RowCount).toBeGreaterThan(0);
    const w1Stamp43 = await DatasetStamp.Read(pool, 'W1_MembershipYear');
    expect(w1Stamp43).toMatch(/^W1-signal\/seed-43#[0-9a-f]{64}$/);
    expect(w1Stamp43).not.toBe(w1Stamp42);

    // W3 tables are untouched by the W1 reload (stamp unchanged, same CHECKSUM_AGG(CHECKSUM(*))).
    expect(await DatasetStamp.Read(pool, 'W3_MembershipYear')).toBe(w3Stamp42);
    expect(await tableChecksum(pool, 'W3_MembershipYear')).toBe(w3ChecksumBefore);
    expect(await tableChecksum(pool, 'W3_Person')).toBe(w3PersonChecksumBefore);

    const afterW1s43Counts = await readTableCounts(pool);
    for (const [tbl, cnt] of Object.entries(afterW1s43Counts)) {
      if (tbl === 'W1_Person' || tbl === 'W1_MembershipYear') continue;
      expect(cnt, `table ${tbl} changed during W1 s43 reload`).toBe(afterW3s42Counts[tbl]);
    }
  });

  it('refuses a seed whose row count differs from its manifest, and keeps the rows it had', async () => {
    const good = await DatasetLoader.Load(ctx, { Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const stamp = await DatasetStamp.Read(pool, 'W1_MembershipYear');
    const short = DatasetLoader.LoadWithRowSource(ctx, { Kind: 'world', ID: 'W1-signal', Seed: 42 }, allButLastRow(good.Dir));
    await expect(short).rejects.toThrow(/16775.*16776/);
    expect(await DatasetStamp.Read(pool, 'W1_MembershipYear')).toBe(stamp);
    expect((await readTableCounts(pool))['W1_MembershipYear']).toBe(16776);
  });
});
