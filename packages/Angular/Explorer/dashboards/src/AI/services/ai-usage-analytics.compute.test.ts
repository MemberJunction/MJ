import { describe, it, expect } from 'vitest';
import {
  computeCoverage,
  computeCoveragePercent,
  computeTotalCost,
  computeDailyCostBurn,
  computeCostPerToken,
  computeCacheHitRate,
  computeAverageExecutionTime,
  computeSuccessRate,
  computeTotalTokens,
  getBucketSizeMs,
  createHourlyBuckets,
  computeTrends,
  getTopModel,
  getTopAgent,
  computeCostByModel,
  computePerformanceMatrix,
  computeTokenEfficiency,
  computePeriodDelta,
  countActiveExecutions,
  computeLiveExecutions,
  computeKPIs,
  parseDate
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
  describe('parseDate', () => {
    it('returns null for null, undefined, or empty string', () => {
      expect(parseDate(null)).toBeNull();
      expect(parseDate(undefined)).toBeNull();
      expect(parseDate('')).toBeNull();
    });

    it('returns Date object as-is if already a Date', () => {
      const d = new Date('2026-09-01T12:00:00Z');
      expect(parseDate(d)).toBe(d);
    });

    it('parses valid ISO string', () => {
      const parsed = parseDate('2026-09-01T12:00:00Z');
      expect(parsed).not.toBeNull();
      expect(parsed?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
    });

    it('returns null for invalid date string', () => {
      expect(parseDate('not-a-date')).toBeNull();
    });
  });

  describe('computeCoverage', () => {
    it('returns zeroes for empty rows', () => {
      const cov = computeCoverage([]);
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

      const cov = computeCoverage(rows);
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

      const cov = computeCoverage(rows);
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

      const cov = computeCoverage(rows);
      expect(cov.PricedRuns).toBe(10);
      expect(cov.UnpricedRuns).toBe(10);
      expect(cov.PricedTokenShare).toBeCloseTo(0.8);
    });
  });

  describe('computeCoveragePercent', () => {
    it('returns 100 for null, undefined, or empty coverage', () => {
      expect(computeCoveragePercent(null)).toBe(100);
      expect(computeCoveragePercent(undefined)).toBe(100);
      expect(computeCoveragePercent({ PricedRuns: 0, UnpricedRuns: 0 })).toBe(100);
    });

    it('returns correct percentage for partial coverage', () => {
      expect(computeCoveragePercent({ PricedRuns: 8, UnpricedRuns: 2 })).toBe(80);
      expect(computeCoveragePercent({ PricedRuns: 1, UnpricedRuns: 3 })).toBe(25);
    });

    it('returns 0 when no runs are priced', () => {
      expect(computeCoveragePercent({ PricedRuns: 0, UnpricedRuns: 10 })).toBe(0);
    });

    it('returns 100 when all runs are priced', () => {
      expect(computeCoveragePercent({ PricedRuns: 10, UnpricedRuns: 0 })).toBe(100);
    });
  });

  describe('computeTotalCost', () => {
    it('returns 0 for empty rows', () => {
      expect(computeTotalCost([])).toBe(0);
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

      expect(computeTotalCost(rows)).toBeNull();
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

      expect(computeTotalCost(rows)).toBe(2.00);
    });
  });

  describe('computeDailyCostBurn', () => {
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

      expect(computeDailyCostBurn(rows, now)).toBe(5.5);
    });
  });

  describe('computeCostPerToken', () => {
    it('returns null if totalCost is null', () => {
      expect(computeCostPerToken(null, 1000)).toBeNull();
    });

    it('returns null if totalTokens is 0 or negative', () => {
      expect(computeCostPerToken(10, 0)).toBeNull();
      expect(computeCostPerToken(10, -5)).toBeNull();
    });

    it('calculates cost per token when both are valid', () => {
      expect(computeCostPerToken(2.0, 1000)).toBe(0.002);
    });
  });

  describe('computeCacheHitRate', () => {
    it('returns 0 when total input tokens is 0', () => {
      expect(computeCacheHitRate([])).toBe(0);
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
      expect(computeCacheHitRate(rows)).toBe(0.6);
    });
  });

  describe('computeAverageExecutionTime', () => {
    it('returns 0 when no runs', () => {
      expect(computeAverageExecutionTime([])).toBe(0);
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
      expect(computeAverageExecutionTime(rows)).toBe(175);
    });
  });

  describe('computeSuccessRate', () => {
    it('returns 1 when no runs', () => {
      expect(computeSuccessRate([])).toBe(1);
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
      expect(computeSuccessRate(rows)).toBe(0.8);
    });
  });

  describe('computeTotalTokens', () => {
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
      expect(computeTotalTokens(rows)).toBe(750);
    });
  });

  describe('bucketing and trends', () => {
    it('determines bucket size ms based on span', () => {
      const start = new Date('2026-09-01T00:00:00Z');
      const end24h = new Date('2026-09-02T00:00:00Z');
      expect(getBucketSizeMs(start, end24h)).toBe(3600000);

      const end5d = new Date('2026-09-06T00:00:00Z');
      expect(getBucketSizeMs(start, end5d)).toBe(4 * 3600000);

      const end14d = new Date('2026-09-15T00:00:00Z');
      expect(getBucketSizeMs(start, end14d)).toBe(24 * 3600000);
    });

    it('creates hourly buckets and computes trends', () => {
      const start = new Date('2026-09-01T00:00:00Z');
      const end = new Date('2026-09-01T03:00:00Z');
      const buckets = createHourlyBuckets(start, end);
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

      const trends = computeTrends(rows, start, end);
      expect(trends.length).toBe(3);
      expect(trends[0].executions).toBe(5);
      expect(trends[0].cost).toBe(0.05);
      expect(trends[0].tokens).toBe(150);
      expect(trends[0].errors).toBe(1);
      expect(trends[1].executions).toBe(0);
      expect(trends[1].cost).toBe(0);
    });
  });

  describe('getTopModel and getTopAgent', () => {
    it('returns N/A when rows are empty', () => {
      expect(getTopModel([])).toBe('N/A');
      expect(getTopAgent([])).toBe('N/A');
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

      expect(getTopModel(rows, modelNames)).toBe('Claude 3.5 Sonnet');
      expect(getTopAgent(rows, agentNames)).toBe('Reviewer');
    });
  });

  describe('computeCostByModel', () => {
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
      const result = computeCostByModel(rows, modelNames);
      expect(result.length).toBe(2);
      expect(result[0].model).toBe('Model B');
      expect(result[0].cost).toBe(1.50);
      expect(result[1].model).toBe('Model A');
      expect(result[1].cost).toBe(0.50);
    });
  });

  describe('computePerformanceMatrix', () => {
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

      const result = computePerformanceMatrix(rows);
      expect(result.length).toBe(1);
      expect(result[0].agent).toBe('a1');
      expect(result[0].model).toBe('m1');
      expect(result[0].avgTime).toBe(150);
      expect(result[0].successRate).toBe(0.9);
    });
  });

  describe('computeTokenEfficiency', () => {
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

      const eff = computeTokenEfficiency(rows);
      expect(eff.length).toBe(1);
      expect(eff[0].inputTokens).toBe(400);
      expect(eff[0].outputTokens).toBe(150);
      expect(eff[0].cost).toBe(0.02);
    });
  });

  describe('computePeriodDelta', () => {
    it('returns stable when either value is null or previous is 0', () => {
      expect(computePeriodDelta(null, 100)).toEqual({ percent: 0, direction: 'stable' });
      expect(computePeriodDelta(100, null)).toEqual({ percent: 0, direction: 'stable' });
      expect(computePeriodDelta(100, 0)).toEqual({ percent: 0, direction: 'stable' });
    });

    it('returns up for positive delta', () => {
      const delta = computePeriodDelta(150, 100);
      expect(delta.direction).toBe('up');
      expect(delta.percent).toBeCloseTo(50);
    });

    it('returns down for negative delta', () => {
      const delta = computePeriodDelta(75, 100);
      expect(delta.direction).toBe('down');
      expect(delta.percent).toBeCloseTo(25);
    });
  });

  describe('countActiveExecutions', () => {
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

      expect(countActiveExecutions(prompts, agents)).toBe(2);
    });
  });

  describe('computeLiveExecutions', () => {
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

      const live = computeLiveExecutions(prompts, agents);
      expect(live.length).toBe(2);
      expect(live[0].id).toBe('a1');
      expect(live[0].cost).toBe(0.08);
      expect(live[1].id).toBe('p1');
      expect(live[1].cost).toBeNull();
    });
  });

  describe('computeKPIs', () => {
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
      const kpis = computeKPIs(rows, 3, undefined, undefined, now);

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
  });
});
