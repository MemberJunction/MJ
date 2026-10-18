import { describe, it, expect, vi, afterEach } from 'vitest';
import { PostgreSQLDriver } from '../drivers/PostgreSQLDriver.js';
import { AutoDocQueryResult } from '../types/driver.js';

/**
 * PostgreSQLDriver.testValueOverlap feeds GATE 6 in FKDetector, which rejects any FK candidate under
 * 75% overlap. The query used to put ORDER BY RANDOM() on a SELECT DISTINCT, which PostgreSQL
 * rejects ("for SELECT DISTINCT, ORDER BY expressions must appear in select list"). The error came
 * back as 0% overlap, so every statistical FK candidate was rejected on PostgreSQL.
 */

type OverlapRow = { total_source: string; matching_count: string };

function driverReturning(result: AutoDocQueryResult<OverlapRow>): { driver: PostgreSQLDriver; queries: string[] } {
  const driver = new PostgreSQLDriver({ provider: 'postgresql', host: 'localhost', database: 'unused', user: 'u', password: 'p' });
  const queries: string[] = [];
  vi.spyOn(driver, 'executeQuery').mockImplementation(async (query: string) => {
    queries.push(query);
    return result;
  });
  return { driver, queries };
}

afterEach(() => vi.restoreAllMocks());

describe('PostgreSQLDriver.testValueOverlap', () => {
  it('randomises outside the DISTINCT, so PostgreSQL accepts the statement', async () => {
    const { driver, queries } = driverReturning({ success: true, data: [{ total_source: '10', matching_count: '10' }] });
    await driver.testValueOverlap('app.child', 'parent_id', 'app.parent', 'id', 500);

    const sql = queries[0].replace(/\s+/g, ' ');
    // The DISTINCT select is closed before ORDER BY RANDOM() applies.
    expect(sql).toMatch(/SELECT DISTINCT "parent_id"::text as value FROM "app"\."child" WHERE "parent_id" IS NOT NULL \) distinct_source ORDER BY RANDOM\(\) LIMIT 500/);
    // No ORDER BY inside the scope of a SELECT DISTINCT.
    expect(sql).not.toMatch(/SELECT DISTINCT[^()]*ORDER BY/);
  });

  it('compares both sides as text, so a text column can be checked against a uuid key', async () => {
    const { driver, queries } = driverReturning({ success: true, data: [{ total_source: '10', matching_count: '10' }] });
    await driver.testValueOverlap('app.uchild', 'uparent_ref', 'app.uparent', 'id', 500);

    expect(queries[0]).toContain('"uparent_ref"::text as value');
    expect(queries[0]).toContain('"id"::text as value');
  });

  it('returns matched over sampled', async () => {
    const { driver } = driverReturning({ success: true, data: [{ total_source: '400', matching_count: '300' }] });
    expect(await driver.testValueOverlap('app.child', 'parent_id', 'app.parent', 'id', 500)).toBe(0.75);
  });

  it('returns 0 for an empty source', async () => {
    const { driver } = driverReturning({ success: true, data: [{ total_source: '0', matching_count: '0' }] });
    expect(await driver.testValueOverlap('app.child', 'parent_id', 'app.parent', 'id', 500)).toBe(0);
  });

  it('warns when the query fails instead of returning a silent 0', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { driver } = driverReturning({ success: false, errorMessage: 'permission denied for table parent' });

    expect(await driver.testValueOverlap('app.child', 'parent_id', 'app.parent', 'id', 500)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('app.child.parent_id -> app.parent.id: permission denied for table parent'));
  });
});
