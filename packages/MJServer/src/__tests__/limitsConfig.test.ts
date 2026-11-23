import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CODE_FALLBACK_LIMITS,
  DEFAULT_MJ_LIMITS_CONFIG,
  LimitsConfigResolver,
} from '@memberjunction/core';

const { mockConfigRef } = vi.hoisted(() => ({
  mockConfigRef: {
    current: {
      dbUsername: 'test-user',
      dbPassword: 'test-password',
      dbDatabase: 'test-db',
    } as {
      dbUsername: string;
      dbPassword: string;
      dbDatabase: string;
      limits?: object;
    },
  },
}));

vi.mock('cosmiconfig', () => ({
  cosmiconfigSync: () => ({
    search: () => ({
      filepath: '/test/mj.config.cjs',
      isEmpty: false,
      config: mockConfigRef.current,
    }),
  }),
}));

import { LimitsConfigSchema, LoadConfig } from '../config.js';

describe('MJServer mj.config.cjs limits schema & LimitsConfigResolver wiring', () => {
  beforeEach(() => {
    LimitsConfigResolver.Instance.ClearMjConfigLimits();
    mockConfigRef.current = {
      dbUsername: 'test-user',
      dbPassword: 'test-password',
      dbDatabase: 'test-db',
    };
  });

  it('falls back to DEFAULT_MJ_LIMITS_CONFIG when mj.config.cjs omits limits', () => {
    const loaded = LoadConfig();
    expect(loaded.limits).toBeUndefined();

    const resolved = LimitsConfigResolver.Resolve();
    expect(resolved.Limits).toEqual(DEFAULT_MJ_LIMITS_CONFIG);
    expect(resolved.Limits).toEqual(CODE_FALLBACK_LIMITS);
    expect(resolved.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe('CodeFallback');
  });

  it('parses limits from mj.config.cjs and registers Tier 2 (MjConfig) overrides on LimitsConfigResolver', () => {
    mockConfigRef.current = {
      dbUsername: 'test-user',
      dbPassword: 'test-password',
      dbDatabase: 'test-db',
      limits: {
        agentChannelConsecutiveTurns: 450,
        briefingContributorTimeoutMs: 7500,
        budgets: {
          perRun: {
            maxCostUsd: 18.5,
            maxWallClockMs: 1_800_000,
          },
          perUserPerDay: {
            dayBoundaryTimezone: 'America/New_York',
          },
        },
        progressDetector: {
          fastJudgeTimeoutMs: 160,
          fastJudgeFailureFallback: 'PauseForHuman',
        },
      },
    };

    const loaded = LoadConfig();
    expect(loaded.limits).toBeDefined();

    const resolved = LimitsConfigResolver.Resolve();
    expect(resolved.Limits.AgentChannelConsecutiveTurns).toBe(450);
    expect(resolved.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe('MjConfig');
    expect(resolved.Limits.BriefingContributorTimeoutMs).toBe(7500);
    expect(resolved.Limits.Budgets.PerRun.MaxCostUsd).toBe(18.5);
    expect(resolved.Limits.Budgets.PerRun.MaxWallClockMs).toBe(1_800_000);
    expect(resolved.Limits.Budgets.PerUserPerDay.DayBoundaryTimezone).toBe('America/New_York');
    expect(resolved.Limits.ProgressDetector.FastJudgeTimeoutMs).toBe(160);
    expect(resolved.Limits.ProgressDetector.FastJudgeFailureFallback).toBe('PauseForHuman');
    // Unspecified keys inherit DEFAULT_MJ_LIMITS_CONFIG
    expect(resolved.Limits.ForEachMaxIterations).toBe(DEFAULT_MJ_LIMITS_CONFIG.ForEachMaxIterations);
    expect(resolved.Provenance.ForEachMaxIterations.SourceTier).toBe('CodeFallback');
  });

  it('validates LimitsConfigSchema for both camelCase and PascalCase keys', () => {
    const parsed = LimitsConfigSchema.safeParse({
      AgentAbsoluteIterations: 50_000,
      Budgets: { PerRun: { MaxTokens: 120_000 } },
    });
    expect(parsed.success).toBe(true);
  });
});
