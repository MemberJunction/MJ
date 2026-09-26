import { describe, it, expect, afterEach } from 'vitest';
import {
  ComputeCoverage,
  ComputeCoveragePercent,
  ComputeTotalCost,
  ComputeDailyCostBurn,
  ComputeCostPerToken,
  ComputeCacheHitRate,
  ComputeAverageExecutionTime,
  ComputeSuccessRate,
  ComputeTotalTokens,
  GetBucketSizeMs,
  CreateHourlyBuckets,
  ComputeTrends,
  GetTopModel,
  GetTopAgent,
  ComputeCostByModel,
  ComputePerformanceMatrix,
  ComputeTokenEfficiency,
  ComputePeriodDelta,
  CountActiveExecutions,
  ComputeLiveExecutions,
  ComputeKPIs,
  ParseDate,
  ResolveCostCurrency,
  ToLiveExecutionStatus
} from './ai-usage-analytics.compute';
import { AIUsageHourlyRow } from './ai-usage-analytics.types';

function createHourlyRow(overrides: Partial<AIUsageHourlyRow> = {}): AIUsageHourlyRow {
  return {
    HourBucket: '2026-09-01T10:00:00Z',
    AgentID: null,
    PromptID: null,
    ModelID: null,
    VendorID: null,
    UserID: null,
    PrimaryScopeEntityID: null,
    PrimaryScopeRecordID: null,
    ConfigurationID: null,
    SourceKind: 'Prompt',
    CostCurrency: null,
    Runs: 0,
    SucceededRuns: 0,
    FailedRuns: 0,
    PricedRuns: 0,
    UnpricedRuns: 0,
    UnmeasuredRuns: 0,
    ParallelParents: 0,
    TokensPrompt: 0,
    TokensCompletion: 0,
    TokensCacheRead: 0,
    TokensCacheWrite: 0,
    OwnCost: null,
    LatencyP50: null,
    LatencyP95: null,
    AvgFirstTokenMS: null,
    ...overrides
  };
}

describe('ai-usage-analytics.compute', () => {
  describe('ParseDate', () => {
    it('returns null for null, undefined, or empty string', () => {
      expect(ParseDate(null)).toBeNull();
      expect(ParseDate(undefined)).toBeNull();
      expect(ParseDate('')).toBeNull();
    });

    it('returns Date object as-is if already a Date', () => {
      const d = new Date('2026-09-01T12:00:00Z');
      expect(ParseDate(d)).toBe(d);
    });

    it('parses valid ISO string', () => {
      const parsed = ParseDate('2026-09-01T12:00:00Z');
      expect(parsed).not.toBeNull();
      expect(parsed?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
    });

    it('returns null for invalid date string', () => {
      expect(ParseDate('not-a-date')).toBeNull();
    });
  });

  describe('ComputeCoverage', () => {
    it('returns zeroes for empty rows', () => {
      const cov = ComputeCoverage([]);
      expect(cov).toEqual({
        PricedRuns: 0,
        UnpricedRuns: 0,
        UnmeasuredRuns: 0,
        PricedTokenShare: 0
      });
    });

    it('handles 100% priced rows', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 1000,
          TokensCompletion: 500,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 200,
          LatencyP95: 400,
          OwnCost: 0.05
        })
      ];

      const cov = ComputeCoverage(rows);
      expect(cov.PricedRuns).toBe(10);
      expect(cov.UnpricedRuns).toBe(0);
      expect(cov.UnmeasuredRuns).toBe(0);
      expect(cov.PricedTokenShare).toBe(1);
    });

    it('handles 100% unpriced rows', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 5,
          PricedRuns: 0,
          UnpricedRuns: 5,
          UnmeasuredRuns: 0,
          TokensPrompt: 200,
          TokensCompletion: 100,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 5,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 150,
          OwnCost: null,
        })
      ];

      const cov = ComputeCoverage(rows);
      expect(cov.PricedRuns).toBe(0);
      expect(cov.UnpricedRuns).toBe(5);
      expect(cov.UnmeasuredRuns).toBe(0);
      expect(cov.PricedTokenShare).toBe(0);
    });

    it('calculates weighted token share across mixed rows', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 3000,
          TokensCompletion: 1000,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: 0.10,
        }),
        createHourlyRow({
          HourBucket: '2026-09-01T11:00:00Z',
          Runs: 10,
          PricedRuns: 0,
          UnpricedRuns: 10,
          UnmeasuredRuns: 0,
          TokensPrompt: 1000,
          TokensCompletion: 0,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: null,
        })
      ];

      const cov = ComputeCoverage(rows);
      expect(cov.PricedRuns).toBe(10);
      expect(cov.UnpricedRuns).toBe(10);
      expect(cov.PricedTokenShare).toBeCloseTo(0.8);
    });
  });

  describe('ComputeCoveragePercent', () => {
    it('returns 100 for null, undefined, or empty coverage', () => {
      expect(ComputeCoveragePercent(null)).toBe(100);
      expect(ComputeCoveragePercent(undefined)).toBe(100);
      expect(ComputeCoveragePercent({ PricedRuns: 0, UnpricedRuns: 0 })).toBe(100);
    });

    it('returns correct percentage for partial coverage', () => {
      expect(ComputeCoveragePercent({ PricedRuns: 8, UnpricedRuns: 2 })).toBe(80);
      expect(ComputeCoveragePercent({ PricedRuns: 1, UnpricedRuns: 3 })).toBe(25);
    });

    it('returns 0 when no runs are priced', () => {
      expect(ComputeCoveragePercent({ PricedRuns: 0, UnpricedRuns: 10 })).toBe(0);
    });

    it('returns 100 when all runs are priced', () => {
      expect(ComputeCoveragePercent({ PricedRuns: 10, UnpricedRuns: 0 })).toBe(100);
    });
  });

  describe('ComputeTotalCost', () => {
    it('returns 0 for empty rows', () => {
      expect(ComputeTotalCost([])).toBe(0);
    });

    it('returns null when all runs are unpriced', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 10,
          PricedRuns: 0,
          UnpricedRuns: 10,
          UnmeasuredRuns: 0,
          TokensPrompt: 100,
          TokensCompletion: 100,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: null,
        })
      ];

      expect(ComputeTotalCost(rows)).toBeNull();
    });

    it('sums only priced rows when priced runs exist', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 100,
          TokensCompletion: 100,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: 1.25,
        }),
        createHourlyRow({
          HourBucket: '2026-09-01T11:00:00Z',
          Runs: 5,
          PricedRuns: 0,
          UnpricedRuns: 5,
          UnmeasuredRuns: 0,
          TokensPrompt: 50,
          TokensCompletion: 50,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 5,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: null,
        }),
        createHourlyRow({
          HourBucket: '2026-09-01T12:00:00Z',
          Runs: 8,
          PricedRuns: 8,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 80,
          TokensCompletion: 80,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 8,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: 0.75,
        })
      ];

      expect(ComputeTotalCost(rows)).toBe(2.00);
    });

    it('returns null for raw { Cost } rows that are all unpriced, not 0', () => {
      // Live prompt-run rows carry no PricedRuns/UnpricedRuns counters: a null Cost is the only
      // unpriced signal, so a set with no priced cost is unpriced, never a confident $0.
      expect(ComputeTotalCost([{ Cost: null }, { Cost: null }])).toBeNull();
      expect(ComputeTotalCost([{ Cost: null }, { Cost: 0 }])).toBe(0);
      expect(ComputeTotalCost([{ Cost: null }, { Cost: 0.25 }])).toBe(0.25);
    });

    it('never sums across currencies — the total is in the primary currency only', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({ CostCurrency: 'USD', Runs: 10, PricedRuns: 10, OwnCost: 1.00 }),
        createHourlyRow({ CostCurrency: 'EUR', Runs: 2, PricedRuns: 2, OwnCost: 5.00 }),
        createHourlyRow({ CostCurrency: null, Runs: 3, UnpricedRuns: 3, OwnCost: null })
      ];

      const resolution = ResolveCostCurrency(rows);
      expect(resolution.Currency).toBe('USD');
      expect(resolution.IsMixed).toBe(true);
      expect(resolution.Currencies).toEqual(['USD', 'EUR']);

      expect(ComputeTotalCost(rows)).toBe(1.00);
      expect(ComputeTotalCost(rows, 'EUR')).toBe(5.00);
      // A group entirely in another currency has no figure in this one.
      expect(ComputeTotalCost([rows[1]], 'USD')).toBeNull();
    });

    it('does not let unpriced rows vote on the primary currency', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({ CostCurrency: 'USD', Runs: 50, UnpricedRuns: 50, OwnCost: 0 }),
        createHourlyRow({ CostCurrency: 'EUR', Runs: 1, PricedRuns: 1, OwnCost: 2.00 })
      ];
      expect(ResolveCostCurrency(rows).Currency).toBe('EUR');
      expect(ResolveCostCurrency(rows).IsMixed).toBe(false);
    });
  });

  describe('ComputeDailyCostBurn', () => {
    it('sums cost for rows within the current UTC day only', () => {
      const now = new Date('2026-09-14T15:00:00Z');
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-13T23:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 100,
          TokensCompletion: 100,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: 5.0,
        }),
        createHourlyRow({
          HourBucket: '2026-09-14T02:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 100,
          TokensCompletion: 100,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: 3.0,
        }),
        createHourlyRow({
          HourBucket: '2026-09-14T10:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 100,
          TokensCompletion: 100,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 200,
          OwnCost: 2.5,
        })
      ];

      expect(ComputeDailyCostBurn(rows, now)).toBe(5.5);
    });
  });

  describe('ComputeCostPerToken', () => {
    it('returns null if totalCost is null', () => {
      expect(ComputeCostPerToken(null, 1000)).toBeNull();
    });

    it('returns null if totalTokens is 0 or negative', () => {
      expect(ComputeCostPerToken(10, 0)).toBeNull();
      expect(ComputeCostPerToken(10, -5)).toBeNull();
    });

    it('calculates cost per token when both are valid', () => {
      expect(ComputeCostPerToken(2.0, 1000)).toBe(0.002);
    });
  });

  describe('ComputeCacheHitRate', () => {
    it('returns 0 when total input tokens is 0', () => {
      expect(ComputeCacheHitRate([])).toBe(0);
    });

    it('calculates ratio of cache read to total input', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 1,
          PricedRuns: 1,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 200,
          TokensCompletion: 100,
          TokensCacheRead: 600,
          TokensCacheWrite: 200,
          SucceededRuns: 1,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: 0.01,
        })
      ];
      expect(ComputeCacheHitRate(rows)).toBe(0.6);
    });
  });

  describe('ComputeAverageExecutionTime', () => {
    it('returns 0 when no runs', () => {
      expect(ComputeAverageExecutionTime([])).toBe(0);
    });

    it('weights latency by runs count', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 0,
          TokensCompletion: 0,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 150,
          OwnCost: null,
        }),
        createHourlyRow({
          HourBucket: '2026-09-01T11:00:00Z',
          Runs: 30,
          PricedRuns: 30,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 0,
          TokensCompletion: 0,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 30,
          FailedRuns: 0,
          LatencyP50: 200,
          LatencyP95: 250,
          OwnCost: null,
        })
      ];
      expect(ComputeAverageExecutionTime(rows)).toBe(175);
    });
  });

  describe('ComputeSuccessRate', () => {
    it('returns 1 when no runs', () => {
      expect(ComputeSuccessRate([])).toBe(1);
    });

    it('computes succeeded / total runs', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 0,
          TokensCompletion: 0,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 8,
          FailedRuns: 2,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: null,
        })
      ];
      expect(ComputeSuccessRate(rows)).toBe(0.8);
    });
  });

  describe('ComputeTotalTokens', () => {
    it('sums prompt and completion tokens', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T10:00:00Z',
          Runs: 1,
          PricedRuns: 1,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 500,
          TokensCompletion: 250,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 1,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: null,
        })
      ];
      expect(ComputeTotalTokens(rows)).toBe(750);
    });
  });

  describe('bucketing and trends', () => {
    it('determines bucket size ms based on span', () => {
      const start = new Date('2026-09-01T00:00:00Z');
      const end24h = new Date('2026-09-02T00:00:00Z');
      expect(GetBucketSizeMs(start, end24h)).toBe(3600000);

      const end5d = new Date('2026-09-06T00:00:00Z');
      expect(GetBucketSizeMs(start, end5d)).toBe(4 * 3600000);

      const end14d = new Date('2026-09-15T00:00:00Z');
      expect(GetBucketSizeMs(start, end14d)).toBe(24 * 3600000);
    });

    it('creates hourly buckets and computes trends', () => {
      const start = new Date('2026-09-01T00:00:00Z');
      const end = new Date('2026-09-01T03:00:00Z');
      const buckets = CreateHourlyBuckets(start, end);
      expect(buckets.length).toBe(3);

      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T00:00:00Z',
          Runs: 5,
          PricedRuns: 5,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 100,
          TokensCompletion: 50,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 4,
          FailedRuns: 1,
          LatencyP50: 120,
          LatencyP95: 200,
          OwnCost: 0.05,
        })
      ];

      const trends = ComputeTrends(rows, start, end);
      expect(trends.length).toBe(3);
      expect(trends[0].executions).toBe(5);
      expect(trends[0].cost).toBe(0.05);
      expect(trends[0].tokens).toBe(150);
      expect(trends[0].errors).toBe(1);
      expect(trends[1].executions).toBe(0);
      expect(trends[1].cost).toBe(0);
      expect(trends[0].avgTime).toBe(120);
      // A bucket with no runs has no latency: null (a gap on the chart), not 0s.
      expect(trends[1].avgTime).toBeNull();
    });

    describe('outside UTC', () => {
      // HourBucket/DayBucket are UTC, so bucket boundaries must not move with the viewer's zone.
      // Node re-reads process.env.TZ on assignment, so these run genuinely in the named zone.
      const originalTZ = process.env.TZ;
      afterEach(() => {
        if (originalTZ === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = originalTZ;
        }
      });

      it('starts daily buckets at UTC midnight west of UTC (America/Los_Angeles)', () => {
        process.env.TZ = 'America/Los_Angeles';
        expect(new Date('2026-09-01T00:00:00Z').getHours()).toBe(17); // proves the zone took effect

        const buckets = CreateHourlyBuckets(new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'));
        expect(buckets[0].toISOString()).toBe('2026-09-01T00:00:00.000Z');
        expect(buckets.length).toBe(30);
        expect(buckets[buckets.length - 1].toISOString()).toBe('2026-09-30T00:00:00.000Z');
      });

      it('aligns hourly buckets on :00Z in a half-hour zone (Asia/Kolkata)', () => {
        process.env.TZ = 'Asia/Kolkata';
        expect(new Date('2026-09-01T00:00:00Z').getMinutes()).toBe(30);

        const buckets = CreateHourlyBuckets(new Date('2026-09-01T10:15:00Z'), new Date('2026-09-02T10:15:00Z'));
        expect(buckets[0].toISOString()).toBe('2026-09-01T10:00:00.000Z');
        expect(buckets.every(b => b.getUTCMinutes() === 0)).toBe(true);
      });

      it('keeps a fixed 24h step across a DST transition', () => {
        process.env.TZ = 'America/Los_Angeles'; // DST ends 2026-11-01
        const buckets = CreateHourlyBuckets(new Date('2026-10-20T00:00:00Z'), new Date('2026-11-10T00:00:00Z'));
        const steps = new Set(buckets.slice(1).map((b, i) => (b.getTime() - buckets[i].getTime()) / 3600000));
        expect([...steps]).toEqual([24]);
      });

      it('puts a UTC row in its own trend point, not the one before the range', () => {
        process.env.TZ = 'America/Los_Angeles';
        const start = new Date('2026-09-01T00:00:00Z');
        const end = new Date('2026-09-08T12:00:00Z');
        const rows = [createHourlyRow({ HourBucket: '2026-09-01T00:00:00Z', Runs: 7, PricedRuns: 7, OwnCost: 0.7 })];
        const trends = ComputeTrends(rows, start, end);
        expect(trends[0].timestamp.toISOString()).toBe('2026-09-01T00:00:00.000Z');
        expect(trends[0].executions).toBe(7);
      });
    });
  });

  describe('GetTopModel and GetTopAgent', () => {
    it('returns N/A when rows are empty', () => {
      expect(GetTopModel([])).toBe('N/A');
      expect(GetTopAgent([])).toBe('N/A');
    });

    it('resolves top model and top agent with name mapping', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T00:00:00Z',
          ModelID: 'mod-1',
          AgentID: 'agent-1',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 0,
          TokensCompletion: 0,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: 0.1,
        }),
        createHourlyRow({
          HourBucket: '2026-09-01T01:00:00Z',
          ModelID: 'mod-2',
          AgentID: 'agent-2',
          Runs: 25,
          PricedRuns: 25,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 0,
          TokensCompletion: 0,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 25,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: 0.25,
        })
      ];

      const modelNames = new Map([['mod-1', 'GPT-4o'], ['mod-2', 'Claude 3.5 Sonnet']]);
      const agentNames = new Map([['agent-1', 'Coder'], ['agent-2', 'Reviewer']]);

      expect(GetTopModel(rows, modelNames)).toBe('Claude 3.5 Sonnet');
      expect(GetTopAgent(rows, agentNames)).toBe('Reviewer');
    });
  });

  describe('ComputeCostByModel', () => {
    it('groups costs and tokens by model and sorts descending by cost', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T00:00:00Z',
          ModelID: 'mod-1',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 100,
          TokensCompletion: 100,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: 0.50,
        }),
        createHourlyRow({
          HourBucket: '2026-09-01T00:00:00Z',
          ModelID: 'mod-2',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 200,
          TokensCompletion: 200,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 10,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: 1.50,
        })
      ];

      const modelNames = new Map([['mod-1', 'Model A'], ['mod-2', 'Model B']]);
      const result = ComputeCostByModel(rows, modelNames);
      expect(result.length).toBe(2);
      expect(result[0].model).toBe('Model B');
      expect(result[0].cost).toBe(1.50);
      expect(result[1].model).toBe('Model A');
      expect(result[1].cost).toBe(0.50);
    });
  });

  describe('ComputePerformanceMatrix', () => {
    it('aggregates agent and model combinations', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T00:00:00Z',
          AgentID: 'a1',
          ModelID: 'm1',
          Runs: 10,
          PricedRuns: 10,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 0,
          TokensCompletion: 0,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 9,
          FailedRuns: 1,
          LatencyP50: 150,
          LatencyP95: 200,
          OwnCost: 0.1,
        })
      ];

      const result = ComputePerformanceMatrix(rows);
      expect(result.length).toBe(1);
      expect(result[0].agent).toBe('a1');
      expect(result[0].model).toBe('m1');
      expect(result[0].avgTime).toBe(150);
      expect(result[0].successRate).toBe(0.9);
      expect(result[0].FailedRuns).toBe(1);
    });

    it('sums failed runs across the hours of one agent x model pair', () => {
      const hour = (h: string, failed: number) => createHourlyRow({ HourBucket: h, AgentID: 'a1', ModelID: 'm1', Runs: 10, SucceededRuns: 10 - failed, FailedRuns: failed });
      const result = ComputePerformanceMatrix([hour('2026-09-01T00:00:00Z', 2), hour('2026-09-01T01:00:00Z', 3)]);
      expect(result).toHaveLength(1);
      expect(result[0].FailedRuns).toBe(5);
    });
  });

  describe('ComputeTokenEfficiency', () => {
    it('computes input vs output tokens and cost by model', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-01T00:00:00Z',
          ModelID: 'm1',
          Runs: 1,
          PricedRuns: 1,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 400,
          TokensCompletion: 150,
          TokensCacheRead: 0,
          TokensCacheWrite: 0,
          SucceededRuns: 1,
          FailedRuns: 0,
          LatencyP50: 100,
          LatencyP95: 100,
          OwnCost: 0.02,
        })
      ];

      const eff = ComputeTokenEfficiency(rows);
      expect(eff.length).toBe(1);
      expect(eff[0].inputTokens).toBe(400);
      expect(eff[0].outputTokens).toBe(150);
      expect(eff[0].cost).toBe(0.02);
    });
  });

  describe('ComputePeriodDelta', () => {
    it('returns stable when either value is null or previous is 0', () => {
      expect(ComputePeriodDelta(null, 100)).toEqual({ percent: 0, direction: 'stable' });
      expect(ComputePeriodDelta(100, null)).toEqual({ percent: 0, direction: 'stable' });
      expect(ComputePeriodDelta(100, 0)).toEqual({ percent: 0, direction: 'stable' });
    });

    it('returns up for positive delta', () => {
      const delta = ComputePeriodDelta(150, 100);
      expect(delta.direction).toBe('up');
      expect(delta.percent).toBeCloseTo(50);
    });

    it('returns down for negative delta', () => {
      const delta = ComputePeriodDelta(75, 100);
      expect(delta.direction).toBe('down');
      expect(delta.percent).toBeCloseTo(25);
    });
  });

  describe('CountActiveExecutions', () => {
    it('counts uncompleted prompts and running agents', () => {
      const prompts = [
        { CompletedAt: null, Success: true },
        { CompletedAt: '2026-09-01T00:01:00Z', Success: true },
        { CompletedAt: null, Success: false }
      ];
      const agents = [
        { Status: 'Running' },
        { Status: 'Completed' }
      ];

      expect(CountActiveExecutions(prompts, agents)).toBe(2);
    });
  });

  describe('ComputeLiveExecutions', () => {
    it('preserves null cost without coalescing to 0 and sorts descending by start time', () => {
      const prompts = [
        {
          ID: 'p1',
          RunAt: '2026-09-01T10:00:00Z',
          CompletedAt: null,
          Success: true,
          Cost: null,
          TokensUsed: 120,
          Prompt: 'Generate code'
        }
      ];
      const agents = [
        {
          ID: 'a1',
          StartedAt: '2026-09-01T10:05:00Z',
          CompletedAt: '2026-09-01T10:06:00Z',
          Status: 'Completed',
          Success: true,
          TotalCost: 0.08,
          TotalTokensUsed: 500,
          Agent: 'Coding Agent'
        }
      ];

      const live = ComputeLiveExecutions(prompts, agents);
      expect(live.length).toBe(2);
      expect(live[0].id).toBe('a1');
      expect(live[0].cost).toBe(0.08);
      expect(live[1].id).toBe('p1');
      expect(live[1].cost).toBeNull();
    });

    it('maps every agent-run status into the LiveExecution union', () => {
      const agent = (Status: string, CompletedAt: string | null) => ({
        ID: Status, StartedAt: '2026-09-01T10:00:00Z', CompletedAt, Status, Success: false, TotalCost: null
      });
      const live = ComputeLiveExecutions([], [
        agent('Running', null),
        agent('Paused', null),
        agent('AwaitingFeedback', null),
        agent('Completed', '2026-09-01T10:01:00Z'),
        agent('Failed', '2026-09-01T10:01:00Z'),
        agent('Cancelled', '2026-09-01T10:01:00Z')
      ]);
      const byId = new Map(live.map(l => [l.id, l.status]));
      expect(byId.get('Running')).toBe('running');
      expect(byId.get('Paused')).toBe('paused');
      expect(byId.get('AwaitingFeedback')).toBe('paused');
      expect(byId.get('Completed')).toBe('completed');
      expect(byId.get('Failed')).toBe('failed');
      expect(byId.get('Cancelled')).toBe('cancelled');
    });

    it('falls back on completion for a status this build does not know', () => {
      expect(ToLiveExecutionStatus('SomeFutureStatus', null)).toBe('running');
      expect(ToLiveExecutionStatus('SomeFutureStatus', '2026-09-01T10:01:00Z')).toBe('completed');
    });
  });

  describe('ComputeKPIs', () => {
    it('computes full DashboardKPIs contract including Coverage', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({
          HourBucket: '2026-09-14T01:00:00Z',
          Runs: 20,
          PricedRuns: 20,
          UnpricedRuns: 0,
          UnmeasuredRuns: 0,
          TokensPrompt: 2000,
          TokensCompletion: 1000,
          TokensCacheRead: 500,
          TokensCacheWrite: 200,
          SucceededRuns: 19,
          FailedRuns: 1,
          LatencyP50: 250,
          LatencyP95: 400,
          OwnCost: 1.50,
        })
      ];

      const now = new Date('2026-09-14T12:00:00Z');
      const kpis = ComputeKPIs(rows, 3, undefined, undefined, now);

      expect(kpis.totalExecutions).toBe(20);
      expect(kpis.activeExecutions).toBe(3);
      expect(kpis.totalCost).toBe(1.50);
      expect(kpis.costCurrency).toBe('USD');
      expect(kpis.totalTokens).toBe(3000);
      expect(kpis.costPerToken).toBeCloseTo(1.50 / 3000);
      expect(kpis.dailyCostBurn).toBe(1.50);
      expect(kpis.Coverage).toEqual({
        PricedRuns: 20,
        UnpricedRuns: 0,
        UnmeasuredRuns: 0,
        PricedTokenShare: 1
      });
    });

    it('reports cost in the primary currency and flags a mixed-currency period', () => {
      const rows: AIUsageHourlyRow[] = [
        createHourlyRow({ HourBucket: '2026-09-14T01:00:00Z', CostCurrency: 'USD', Runs: 10, PricedRuns: 10, OwnCost: 1.00, TokensPrompt: 1000 }),
        createHourlyRow({ HourBucket: '2026-09-14T02:00:00Z', CostCurrency: 'EUR', Runs: 2, PricedRuns: 2, OwnCost: 9.00, TokensPrompt: 1000 })
      ];
      const kpis = ComputeKPIs(rows, 0, undefined, undefined, new Date('2026-09-14T12:00:00Z'));
      expect(kpis.costCurrency).toBe('USD');
      expect(kpis.IsMixedCurrency).toBe(true);
      expect(kpis.totalCost).toBe(1.00);
      // Per-token cost divides USD cost by USD tokens only.
      expect(kpis.costPerToken).toBeCloseTo(1.00 / 1000);
      expect(kpis.dailyCostBurn).toBe(1.00);
    });
  });
});
