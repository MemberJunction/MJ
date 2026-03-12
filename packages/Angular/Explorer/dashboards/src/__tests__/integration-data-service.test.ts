/**
 * Tests for IntegrationDataService
 * Covers pure logic methods (KPI computation, formatting, status calculation)
 */
import { describe, it, expect } from 'vitest';
import { IntegrationDataService, IntegrationSummary, IntegrationRunRow } from '../Integration/services/integration-data.service';
import { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

function createService(): IntegrationDataService {
  return new IntegrationDataService();
}

function createSummary(overrides: Partial<IntegrationSummary> = {}): IntegrationSummary {
  return {
    Integration: {
      ID: '1', Name: 'Test', IsActive: true, LastRunID: null,
      LastRunStartedAt: null, LastRunEndedAt: null, Company: 'TestCo',
      Integration: 'Test', DriverClassName: null
    } as unknown as MJCompanyIntegrationEntity,
    SourceType: null,
    LatestRun: null,
    RecentRuns: [],
    StatusColor: 'gray',
    RelativeTime: 'Never run',
    TotalRecordsSyncedToday: 0,
    TotalErrors: 0,
    DurationMs: null,
    ...overrides
  };
}

function createRun(overrides: Partial<IntegrationRunRow> = {}): IntegrationRunRow {
  return {
    ID: '1', CompanyIntegrationID: '1', StartedAt: null, EndedAt: null,
    TotalRecords: 0, Status: 'Success', ErrorLog: null,
    Integration: 'Test', Company: 'TestCo', RunByUser: 'Admin',
    ...overrides
  };
}

describe('IntegrationDataService', () => {
  describe('ComputeKPIs', () => {
    it('should return zeros for empty summaries', () => {
      const svc = createService();
      const kpis = svc.ComputeKPIs([]);
      expect(kpis.TotalIntegrations).toBe(0);
      expect(kpis.ActiveSyncs).toBe(0);
      expect(kpis.RecordsSyncedToday).toBe(0);
      expect(kpis.ErrorRate).toBe(0);
      expect(kpis.AverageSyncDurationMs).toBeNull();
    });

    it('should count total integrations', () => {
      const svc = createService();
      const summaries = [createSummary(), createSummary(), createSummary()];
      const kpis = svc.ComputeKPIs(summaries);
      expect(kpis.TotalIntegrations).toBe(3);
    });

    it('should count active syncs (In Progress and Pending)', () => {
      const svc = createService();
      const summaries = [
        createSummary({ LatestRun: createRun({ Status: 'In Progress' }) }),
        createSummary({ LatestRun: createRun({ Status: 'Pending' }) }),
        createSummary({ LatestRun: createRun({ Status: 'Success' }) }),
      ];
      const kpis = svc.ComputeKPIs(summaries);
      expect(kpis.ActiveSyncs).toBe(2);
    });

    it('should sum records synced today', () => {
      const svc = createService();
      const summaries = [
        createSummary({ TotalRecordsSyncedToday: 100 }),
        createSummary({ TotalRecordsSyncedToday: 250 }),
      ];
      const kpis = svc.ComputeKPIs(summaries);
      expect(kpis.RecordsSyncedToday).toBe(350);
    });

    it('should compute error rate from recent runs', () => {
      const svc = createService();
      const runs = [createRun(), createRun(), createRun(), createRun()];
      const summaries = [
        createSummary({ RecentRuns: runs, TotalErrors: 1 }),
      ];
      const kpis = svc.ComputeKPIs(summaries);
      expect(kpis.ErrorRate).toBe(25);
    });

    it('should compute average sync duration', () => {
      const svc = createService();
      const summaries = [
        createSummary({ DurationMs: 1000 }),
        createSummary({ DurationMs: 3000 }),
        createSummary({ DurationMs: null }),
      ];
      const kpis = svc.ComputeKPIs(summaries);
      expect(kpis.AverageSyncDurationMs).toBe(2000);
    });
  });

  describe('FormatDuration', () => {
    it('should return -- for null', () => {
      expect(createService().FormatDuration(null)).toBe('--');
    });

    it('should format seconds', () => {
      expect(createService().FormatDuration(45000)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(createService().FormatDuration(125000)).toBe('2m 5s');
    });

    it('should format hours and minutes', () => {
      expect(createService().FormatDuration(3720000)).toBe('1h 2m');
    });

    it('should format zero seconds', () => {
      expect(createService().FormatDuration(0)).toBe('0s');
    });
  });

  describe('ComputeRelativeTime', () => {
    it('should return "Never run" for null', () => {
      expect(createService().ComputeRelativeTime(null)).toBe('Never run');
    });

    it('should return "Just now" for recent dates', () => {
      const now = new Date().toISOString();
      expect(createService().ComputeRelativeTime(now)).toBe('Just now');
    });

    it('should return minutes for recent past', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(createService().ComputeRelativeTime(fiveMinAgo)).toBe('5m ago');
    });

    it('should return hours for hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      expect(createService().ComputeRelativeTime(threeHoursAgo)).toBe('3h ago');
    });

    it('should return days for days ago', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(createService().ComputeRelativeTime(twoDaysAgo)).toBe('2d ago');
    });
  });
});
