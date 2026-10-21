import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type sql from 'mssql';
import { CATALOG, DatasetCatalog } from '../../data/catalog';
import { TruthConnection } from '../connection';
import { DatasetStamp } from '../stamp';
import { WorldLoader } from '../world-loader';

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

describe('per-dataset loader isolation (M4.4)', () => {
  let pool: sql.ConnectionPool;

  beforeAll(async () => {
    pool = await TruthConnection.OpenPool();
  });

  afterAll(async () => {
    await pool?.close();
  });

  it('loads W1 s42, W3 s42, and W1 s43 without touching any other dataset tables', async () => {
    const w1Entry = CATALOG.find((d) => d.ID === 'W1-signal');
    const w3Entry = CATALOG.find((d) => d.ID === 'W3-leak-row');
    if (!w1Entry || !w3Entry) throw new Error('W1-signal or W3-leak-row missing from CATALOG');

    const beforeCounts = await readTableCounts(pool);

    const w1s42Dir = await DatasetCatalog.EnsureGenerated(w1Entry, 42);
    const load1 = await WorldLoader.LoadSeed(pool, 'W1-signal', w1s42Dir);
    expect(load1.Rows).toBe(16776);
    expect(load1.People).toBe(4999);
    const w1Stamp42 = await DatasetStamp.Read(pool, 'W1_MembershipYear');
    expect(w1Stamp42).toMatch(/^W1-signal\/seed-42#[0-9a-f]{64}$/);

    const afterW1s42Counts = await readTableCounts(pool);
    for (const [tbl, cnt] of Object.entries(afterW1s42Counts)) {
      if (tbl === 'W1_Person' || tbl === 'W1_MembershipYear') continue;
      expect(cnt, `table ${tbl} changed during W1 s42 load`).toBe(beforeCounts[tbl]);
    }

    const w3s42Dir = await DatasetCatalog.EnsureGenerated(w3Entry, 42);
    const load2 = await WorldLoader.LoadSeed(pool, 'W3-leak-row', w3s42Dir);
    expect(load2.Rows).toBeGreaterThan(0);
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

    const w1s43Dir = await DatasetCatalog.EnsureGenerated(w1Entry, 43);
    const load3 = await WorldLoader.LoadSeed(pool, 'W1-signal', w1s43Dir);
    expect(load3.Rows).toBeGreaterThan(0);
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

  it('refuses a seed whose row count differs from its manifest', async () => {
    const w1Entry = CATALOG.find((d) => d.ID === 'W1-signal');
    if (!w1Entry) throw new Error('W1-signal missing from CATALOG');
    const w1s42Dir = await DatasetCatalog.EnsureGenerated(w1Entry, 42);
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'pstruth-bad-rowcount-'));
    try {
      copyFileSync(path.join(w1s42Dir, 'manifest.json'), path.join(tmpDir, 'manifest.json'));
      copyFileSync(path.join(w1s42Dir, 'people.csv'), path.join(tmpDir, 'people.csv'));
      const rowsLines = readFileSync(path.join(w1s42Dir, 'rows.csv'), 'utf8').split('\n');
      writeFileSync(path.join(tmpDir, 'rows.csv'), rowsLines.slice(0, -1).join('\n'));
      await expect(WorldLoader.LoadSeed(pool, 'W1-signal', tmpDir)).rejects.toThrow(/16775.*16776/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      await WorldLoader.LoadSeed(pool, 'W1-signal', w1s42Dir);
    }
  });
});
