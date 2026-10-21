import { describe, it, expect } from 'vitest';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import type { AutoDocColumnStatistics } from '../types/driver';
import type { ColumnStatistics } from '../types/discovery';

/**
 * GetColumnStatisticsForDiscovery must report the table's real row count. It used to estimate it as
 * nullCount + distinctCount, which equals distinctCount for a column with no nulls, so every non-null
 * column looked 100% unique however many duplicates it had (found by @rkihm-BC reviewing #5618).
 */

/** Driver statistics as the SQL Server, PostgreSQL and MySQL drivers return them (nullPercentage is 0–100). */
function driverStats(totalRows: number, distinctCount: number, nullCount: number): AutoDocColumnStatistics {
  return {
    totalRows,
    distinctCount,
    uniquenessRatio: totalRows > 0 ? distinctCount / totalRows : 0,
    nullCount,
    nullPercentage: totalRows > 0 ? (nullCount / totalRows) * 100 : 0,
    sampleValues: []
  };
}

/** Runs the real base-class method against a stubbed getColumnStatistics. */
async function discoveryStats(stats: AutoDocColumnStatistics): Promise<ColumnStatistics> {
  const fakeDriver = { getColumnStatistics: async () => stats };
  return BaseAutoDocDriver.prototype.GetColumnStatisticsForDiscovery.call(fakeDriver as unknown as BaseAutoDocDriver, 'dbo', 'T', 'C', 'int');
}

/** Uniqueness as PKDetector computes it. */
const uniqueness = (s: ColumnStatistics) => (s.totalRows > 0 ? s.distinctCount / s.totalRows : 0);

describe('GetColumnStatisticsForDiscovery row count', () => {
  it('a column with duplicates and no nulls is not reported as unique', async () => {
    const s = await discoveryStats(driverStats(10, 5, 0));
    expect(s.totalRows).toBe(10);
    expect(uniqueness(s)).toBe(0.5);
  });

  it('a genuinely unique column stays unique', async () => {
    const s = await discoveryStats(driverStats(10, 10, 0));
    expect(s.totalRows).toBe(10);
    expect(uniqueness(s)).toBe(1);
  });

  it('keeps the real row count when the column has nulls (nullPercentage is a 0–100 percentage)', async () => {
    const s = await discoveryStats(driverStats(10, 4, 2));
    expect(s.totalRows).toBe(10);
    expect(s.nullCount).toBe(2);
    expect(uniqueness(s)).toBe(0.4);
  });

  it('reports an empty table as zero rows', async () => {
    const s = await discoveryStats(driverStats(0, 0, 0));
    expect(s.totalRows).toBe(0);
    expect(uniqueness(s)).toBe(0);
  });
});
