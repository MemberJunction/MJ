/**
 * Tests for SyncActivity filtering logic
 * Covers: date range cutoff computation, combined status + date filtering
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type StatusFilter = 'All' | 'Success' | 'Failed' | 'In Progress' | 'Pending';
type DateRange = 'all' | 'today' | '7d' | '30d' | '90d';

interface IntegrationRunRow {
  ID: string;
  CompanyIntegrationID: string;
  StartedAt: string | null;
  EndedAt: string | null;
  TotalRecords: number;
  Status: string;
  ErrorLog: string | null;
  Integration: string;
  Company: string;
  RunByUser: string;
}

/** Replicates the getDateRangeCutoff private method */
function getDateRangeCutoff(range: DateRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return today;
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

/** Replicates the applyFilters method */
function applyFilters(
  runs: IntegrationRunRow[],
  statusFilter: StatusFilter,
  dateRange: DateRange
): IntegrationRunRow[] {
  let filtered = runs;

  if (statusFilter !== 'All') {
    filtered = filtered.filter(r => r.Status === statusFilter);
  }

  const cutoff = getDateRangeCutoff(dateRange);
  if (cutoff) {
    filtered = filtered.filter(r => r.StartedAt && new Date(r.StartedAt) >= cutoff);
  }

  return filtered;
}

function createRun(overrides: Partial<IntegrationRunRow> = {}): IntegrationRunRow {
  return {
    ID: 'run-1',
    CompanyIntegrationID: 'ci-1',
    StartedAt: new Date().toISOString(),
    EndedAt: new Date().toISOString(),
    TotalRecords: 100,
    Status: 'Success',
    ErrorLog: null,
    Integration: 'Test',
    Company: 'TestCo',
    RunByUser: 'Admin',
    ...overrides
  };
}

describe('SyncActivity Filters', () => {

  describe('getDateRangeCutoff', () => {
    it('should return null for "all"', () => {
      expect(getDateRangeCutoff('all')).toBeNull();
    });

    it('should return midnight today for "today"', () => {
      const cutoff = getDateRangeCutoff('today')!;
      expect(cutoff).toBeInstanceOf(Date);
      expect(cutoff.getHours()).toBe(0);
      expect(cutoff.getMinutes()).toBe(0);
      expect(cutoff.getSeconds()).toBe(0);
      expect(cutoff.getMilliseconds()).toBe(0);
    });

    it('should return a date 7 days ago for "7d"', () => {
      const cutoff = getDateRangeCutoff('7d')!;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      // Allow 1 second tolerance for test execution time
      expect(Math.abs(cutoff.getTime() - sevenDaysAgo.getTime())).toBeLessThan(1000);
    });

    it('should return a date 30 days ago for "30d"', () => {
      const cutoff = getDateRangeCutoff('30d')!;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      expect(Math.abs(cutoff.getTime() - thirtyDaysAgo.getTime())).toBeLessThan(1000);
    });

    it('should return a date 90 days ago for "90d"', () => {
      const cutoff = getDateRangeCutoff('90d')!;
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      expect(Math.abs(cutoff.getTime() - ninetyDaysAgo.getTime())).toBeLessThan(1000);
    });
  });

  describe('applyFilters', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const runs: IntegrationRunRow[] = [
      createRun({ ID: '1', Status: 'Success', StartedAt: now.toISOString() }),
      createRun({ ID: '2', Status: 'Failed', StartedAt: yesterday.toISOString() }),
      createRun({ ID: '3', Status: 'Success', StartedAt: tenDaysAgo.toISOString() }),
      createRun({ ID: '4', Status: 'In Progress', StartedAt: sixtyDaysAgo.toISOString() }),
      createRun({ ID: '5', Status: 'Success', StartedAt: null }),
    ];

    it('should return all runs with no filters', () => {
      const result = applyFilters(runs, 'All', 'all');
      expect(result).toHaveLength(5);
    });

    it('should filter by status only', () => {
      const result = applyFilters(runs, 'Success', 'all');
      expect(result).toHaveLength(3);
      expect(result.every(r => r.Status === 'Success')).toBe(true);
    });

    it('should filter by date range only', () => {
      const result = applyFilters(runs, 'All', '7d');
      // Should include today and yesterday, exclude 10d ago, 60d ago, and null StartedAt
      expect(result).toHaveLength(2);
    });

    it('should apply both status and date filters', () => {
      const result = applyFilters(runs, 'Success', '7d');
      // Only run #1 (Success + today)
      expect(result).toHaveLength(1);
      expect(result[0].ID).toBe('1');
    });

    it('should exclude runs with null StartedAt when date filter is active', () => {
      const result = applyFilters(runs, 'All', 'today');
      expect(result.some(r => r.StartedAt === null)).toBe(false);
    });

    it('should filter by today correctly', () => {
      const result = applyFilters(runs, 'All', 'today');
      // Only run #1 (today)
      expect(result).toHaveLength(1);
      expect(result[0].ID).toBe('1');
    });

    it('should filter 30d to include runs up to 30 days old', () => {
      const result = applyFilters(runs, 'All', '30d');
      // Includes today, yesterday, 10 days ago; excludes 60 days ago and null
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no runs match', () => {
      const result = applyFilters(runs, 'Pending', 'all');
      expect(result).toHaveLength(0);
    });
  });
});
