import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import {
    CODE_FALLBACK_LIMITS,
    DEFAULT_MJ_LIMITS_CONFIG,
    LIMITS_KEY_PATHS,
    LIMITS_TIER_PRECEDENCE,
    LimitsConfigResolver,
    NormalizeLimitsInput,
    ValidateLimitsConfig,
    type MJLimitsConfig,
    type MJLimitsOverride,
} from '../generic/limitsConfig';

const require = createRequire(import.meta.url);

describe('LimitsConfigResolver & CODE_FALLBACK_LIMITS', () => {
    beforeEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('defines all approved backstop defaults in CODE_FALLBACK_LIMITS', () => {
        expect(CODE_FALLBACK_LIMITS.AgentChannelConsecutiveTurns).toBe(1000);
        expect(CODE_FALLBACK_LIMITS.AgentChannelWakesPerHour).toBe(600);
        expect(CODE_FALLBACK_LIMITS.AgentAbsoluteIterations).toBe(100_000);
        expect(CODE_FALLBACK_LIMITS.MaxTasksPerAgentGraph).toBe(10_000);
        expect(CODE_FALLBACK_LIMITS.WhileLoopMaxIterations).toBe(1_000_000);
        expect(CODE_FALLBACK_LIMITS.ForEachMaxIterations).toBe(1_000_000);
        expect(CODE_FALLBACK_LIMITS.MaxTasksPerGraph).toBe(100_000);
        expect(CODE_FALLBACK_LIMITS.BriefingContributorTimeoutMs).toBe(10_000);
        expect(CODE_FALLBACK_LIMITS.BriefingMaxContributorChars).toBe(32_768);

        expect(CODE_FALLBACK_LIMITS.Budgets.PerRun.MaxCostUsd).toBeNull();
        expect(CODE_FALLBACK_LIMITS.Budgets.PerRun.MaxWallClockMs).toBe(7_200_000);
        expect(CODE_FALLBACK_LIMITS.Budgets.PerRun.MaxTokens).toBeNull();
        expect(CODE_FALLBACK_LIMITS.Budgets.PerRoutine.MaxCostUsd).toBeNull();
        expect(CODE_FALLBACK_LIMITS.Budgets.PerRoutine.MaxWallClockMs).toBeNull();
        expect(CODE_FALLBACK_LIMITS.Budgets.PerUserPerDay.MaxCostUsd).toBeNull();
        expect(CODE_FALLBACK_LIMITS.Budgets.PerUserPerDay.MaxWallClockMs).toBeNull();
        expect(CODE_FALLBACK_LIMITS.Budgets.PerUserPerDay.DayBoundaryTimezone).toBe('UTC');
        expect(CODE_FALLBACK_LIMITS.Budgets.CountPausedTimeTowardsWallClock).toBe(false);

        expect(CODE_FALLBACK_LIMITS.ProgressDetector.Enabled).toBe(true);
        expect(CODE_FALLBACK_LIMITS.ProgressDetector.FastJudgeTimeoutMs).toBe(200);
        expect(CODE_FALLBACK_LIMITS.ProgressDetector.AmbiguityLowScoreThreshold).toBeLessThan(
            CODE_FALLBACK_LIMITS.ProgressDetector.AmbiguityHighScoreThreshold,
        );
        expect(DEFAULT_MJ_LIMITS_CONFIG).toBe(CODE_FALLBACK_LIMITS);
        expect(ValidateLimitsConfig(CODE_FALLBACK_LIMITS).Valid).toBe(true);
    });

    it('falls back to DEFAULT_MJ_LIMITS_CONFIG when mj.config.cjs omits limits and applies MjConfig overrides when present', () => {
        const repoConfigPath = path.resolve(__dirname, '..', '..', '..', '..', 'mj.config.cjs');
        const mjConfig = require(repoConfigPath) as { limits?: Record<string, unknown> };

        // When mj.config.cjs has no limits block, resolver cleanly falls back to DEFAULT_MJ_LIMITS_CONFIG
        const fallbackResult = LimitsConfigResolver.Resolve({
            MjConfig: mjConfig.limits ? NormalizeLimitsInput(mjConfig.limits) : null,
        });
        expect(fallbackResult.Limits).toEqual(DEFAULT_MJ_LIMITS_CONFIG);
        expect(fallbackResult.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe(
            mjConfig.limits ? 'MjConfig' : 'CodeFallback',
        );

        // When mj.config.cjs supplies a limits block, Tier 2 (MjConfig) overrides DEFAULT_MJ_LIMITS_CONFIG
        const sampleMjConfigLimits: Record<string, unknown> = {
            agentChannelConsecutiveTurns: 1000,
            agentChannelWakesPerHour: 600,
            agentAbsoluteIterations: 100000,
            maxTasksPerAgentGraph: 10000,
            whileLoopMaxIterations: 1000000,
            forEachMaxIterations: 1000000,
            maxTasksPerGraph: 100000,
            briefingContributorTimeoutMs: 10000,
            briefingMaxContributorChars: 32768,
            budgets: {
                perRun: { maxCostUsd: 25, maxWallClockMs: 7200000, maxTokens: null },
                perRoutine: { maxCostUsd: null, maxWallClockMs: null },
                perUserPerDay: { maxCostUsd: null, maxWallClockMs: null, dayBoundaryTimezone: 'UTC' },
                countPausedTimeTowardsWallClock: false,
                allowedInFlightOvershootUsd: 0,
                allowedInFlightOvershootMs: 0,
            },
            progressDetector: {
                enabled: true,
                windowSize: 10,
                minIterationsBeforeCheck: 6,
                duplicateStepRatioThreshold: 0.75,
                noPayloadDeltaWindowCount: 5,
                repeatingErrorWindowCount: 4,
                ambiguityLowScoreThreshold: 0.25,
                ambiguityHighScoreThreshold: 0.65,
                fastJudgeEnabled: true,
                fastJudgeTimeoutMs: 200,
                fastJudgeMinIntervalIterations: 5,
                fastJudgeMaxInputChars: 8192,
                fastJudgeFailureFallback: 'ContinueWithWarning',
            },
        };

        const normalized = NormalizeLimitsInput(sampleMjConfigLimits);
        const result = LimitsConfigResolver.Resolve({ MjConfig: normalized });

        expect(result.Limits.AgentChannelConsecutiveTurns).toBe(1000);
        expect(result.Limits.AgentChannelWakesPerHour).toBe(600);
        expect(result.Limits.AgentAbsoluteIterations).toBe(100_000);
        expect(result.Limits.MaxTasksPerAgentGraph).toBe(10_000);
        expect(result.Limits.WhileLoopMaxIterations).toBe(1_000_000);
        expect(result.Limits.ForEachMaxIterations).toBe(1_000_000);
        expect(result.Limits.MaxTasksPerGraph).toBe(100_000);
        expect(result.Limits.BriefingContributorTimeoutMs).toBe(10_000);
        expect(result.Limits.BriefingMaxContributorChars).toBe(32_768);
        expect(result.Limits.Budgets.PerRun.MaxCostUsd).toBe(25);
        expect(result.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe('MjConfig');
        expect(result.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('MjConfig');
    });

    it('resolves all 5 precedence tiers deterministically with full provenance', () => {
        expect(LIMITS_TIER_PRECEDENCE).toEqual([
            'CodeFallback',
            'MjConfig',
            'AgentOrWorkflowMetadata',
            'UserAgentPolicy',
            'RunOverride',
        ]);

        const mjConfig: MJLimitsOverride = {
            AgentChannelConsecutiveTurns: 800,
            AgentChannelWakesPerHour: 500,
            AgentAbsoluteIterations: 80_000,
            MaxTasksPerAgentGraph: 8_000,
            WhileLoopMaxIterations: 500_000,
            Budgets: {
                PerRun: { MaxCostUsd: 25, MaxWallClockMs: 3_600_000 },
                PerUserPerDay: { MaxCostUsd: 100 },
            },
        };
        const agentMeta: MJLimitsOverride = {
            AgentChannelWakesPerHour: 400,
            AgentAbsoluteIterations: 60_000,
            MaxTasksPerAgentGraph: 5_000,
            Budgets: {
                PerRun: { MaxCostUsd: 15 },
                PerRoutine: { MaxCostUsd: 40, MaxWallClockMs: 1_800_000 },
            },
        };
        const userPolicy: MJLimitsOverride = {
            AgentAbsoluteIterations: 40_000,
            MaxTasksPerAgentGraph: 3_000,
            Budgets: {
                PerRun: { MaxCostUsd: 10 },
                PerUserPerDay: { MaxCostUsd: 50, DayBoundaryTimezone: 'America/Chicago' },
            },
        };
        const runOverride: MJLimitsOverride = {
            AgentAbsoluteIterations: 120_000,
            ProgressDetector: {
                FastJudgeTimeoutMs: 150,
            },
        };

        const resolved = LimitsConfigResolver.Resolve(
            {
                MjConfig: mjConfig,
                AgentOrWorkflowMetadata: agentMeta,
                UserAgentPolicy: userPolicy,
                RunOverride: runOverride,
            },
            { ResolvedAtISO: '2026-11-21T00:00:00.000Z' },
        );

        expect(resolved.ResolvedAtISO).toBe('2026-11-21T00:00:00.000Z');
        // Tier 1: CodeFallback (unmodified)
        expect(resolved.Limits.ForEachMaxIterations).toBe(1_000_000);
        expect(resolved.Provenance.ForEachMaxIterations.SourceTier).toBe('CodeFallback');
        expect(resolved.Provenance.ForEachMaxIterations.IsOverridden).toBe(false);

        // Tier 2: MjConfig
        expect(resolved.Limits.AgentChannelConsecutiveTurns).toBe(800);
        expect(resolved.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe('MjConfig');
        expect(resolved.Limits.WhileLoopMaxIterations).toBe(500_000);
        expect(resolved.Provenance.WhileLoopMaxIterations.SourceTier).toBe('MjConfig');

        // Tier 3: AgentOrWorkflowMetadata
        expect(resolved.Limits.AgentChannelWakesPerHour).toBe(400);
        expect(resolved.Provenance.AgentChannelWakesPerHour.SourceTier).toBe('AgentOrWorkflowMetadata');
        expect(resolved.Limits.Budgets.PerRoutine.MaxCostUsd).toBe(40);
        expect(resolved.Provenance['Budgets.PerRoutine.MaxCostUsd'].SourceTier).toBe('AgentOrWorkflowMetadata');

        // Tier 4: UserAgentPolicy
        expect(resolved.Limits.MaxTasksPerAgentGraph).toBe(3_000);
        expect(resolved.Provenance.MaxTasksPerAgentGraph.SourceTier).toBe('UserAgentPolicy');
        expect(resolved.Limits.Budgets.PerRun.MaxCostUsd).toBe(10);
        expect(resolved.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('UserAgentPolicy');
        expect(resolved.Limits.Budgets.PerUserPerDay.DayBoundaryTimezone).toBe('America/Chicago');
        expect(resolved.Provenance['Budgets.PerUserPerDay.DayBoundaryTimezone'].SourceTier).toBe('UserAgentPolicy');

        // Tier 5: RunOverride
        expect(resolved.Limits.AgentAbsoluteIterations).toBe(120_000);
        expect(resolved.Provenance.AgentAbsoluteIterations.SourceTier).toBe('RunOverride');
        expect(resolved.Provenance.AgentAbsoluteIterations.IsOverridden).toBe(true);
        expect(resolved.Provenance.AgentAbsoluteIterations.TierValues).toEqual({
            CodeFallback: 100_000,
            MjConfig: 80_000,
            AgentOrWorkflowMetadata: 60_000,
            UserAgentPolicy: 40_000,
            RunOverride: 120_000,
        });
        expect(resolved.Limits.ProgressDetector.FastJudgeTimeoutMs).toBe(150);
        expect(resolved.Provenance['ProgressDetector.FastJudgeTimeoutMs'].SourceTier).toBe('RunOverride');

        for (const key of LIMITS_KEY_PATHS) {
            expect(resolved.Provenance[key]).toBeDefined();
            expect(resolved.Provenance[key].Key).toBe(key);
        }
    });

    it('uses registered MjConfig limits on singleton unless explicitly overridden or nulled', () => {
        LimitsConfigResolver.Instance.RegisterMjConfigLimits({
            briefingContributorTimeoutMs: 15_000,
            briefingMaxContributorChars: 65_536,
        });

        const withRegistered = LimitsConfigResolver.Resolve();
        expect(withRegistered.Limits.BriefingContributorTimeoutMs).toBe(15_000);
        expect(withRegistered.Limits.BriefingMaxContributorChars).toBe(65_536);
        expect(withRegistered.Provenance.BriefingContributorTimeoutMs.SourceTier).toBe('MjConfig');

        const withNullBypass = LimitsConfigResolver.Resolve({ MjConfig: null });
        expect(withNullBypass.Limits.BriefingContributorTimeoutMs).toBe(10_000);
        expect(withNullBypass.Provenance.BriefingContributorTimeoutMs.SourceTier).toBe('CodeFallback');
    });

    it('distinguishes explicit null from undefined on nullable budget fields', () => {
        const result = LimitsConfigResolver.Resolve({
            MjConfig: { Budgets: { PerRun: { MaxCostUsd: 20 } } },
            RunOverride: { Budgets: { PerRun: { MaxCostUsd: null } } },
        });
        expect(result.Limits.Budgets.PerRun.MaxCostUsd).toBeNull();
        expect(result.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('RunOverride');
    });

    it('clamps RunOverride widening when EnforceUserPolicyAsCeiling is true', () => {
        const result = LimitsConfigResolver.Resolve(
            {
                UserAgentPolicy: {
                    AgentAbsoluteIterations: 2_000,
                    Budgets: { PerRun: { MaxCostUsd: 5 } },
                },
                RunOverride: {
                    AgentAbsoluteIterations: 50_000, // exceeds policy ceiling 2,000 -> clamped
                    Budgets: { PerRun: { MaxCostUsd: null, MaxWallClockMs: 10_000 } }, // null attempts unlimited -> clamped
                    WhileLoopMaxIterations: 500, // tighter than default, no policy limit -> allowed
                },
            },
            { EnforceUserPolicyAsCeiling: true },
        );

        expect(result.Limits.AgentAbsoluteIterations).toBe(2_000);
        expect(result.Provenance.AgentAbsoluteIterations.WasClampedByPolicyCeiling).toBe(true);
        expect(result.Provenance.AgentAbsoluteIterations.SourceTier).toBe('UserAgentPolicy');

        expect(result.Limits.Budgets.PerRun.MaxCostUsd).toBe(5);
        expect(result.Provenance['Budgets.PerRun.MaxCostUsd'].WasClampedByPolicyCeiling).toBe(true);

        expect(result.Limits.WhileLoopMaxIterations).toBe(500);
        expect(result.Provenance.WhileLoopMaxIterations.SourceTier).toBe('RunOverride');
        expect(result.ClampedKeys).toEqual(['AgentAbsoluteIterations', 'Budgets.PerRun.MaxCostUsd']);
    });

    it('normalizes camelCase, PascalCase, and legacy alias inputs while dropping invalid values', () => {
        const normalized = NormalizeLimitsInput({
            MaxConsecutiveAgentTurns: 900,
            MaxHourlyWakes: 300,
            absoluteMaxIterations: 75_000,
            MAX_TASKS_PER_AGENT_GRAPH: 2_500,
            whileLoopMaxIterations: -5, // invalid -> dropped
            forEachMaxIterations: Number.NaN, // invalid -> dropped
            MAX_TASKS_PER_GRAPH: 50_000,
            ContributorTimeoutMs: 12_000,
            MaxContributorChars: 40_000,
            budgets: {
                perRun: { maxCostUsd: 12.5, maxWallClockMs: 60_000, maxTokens: 500_000 },
                countPausedTimeTowardsWallClock: true,
            },
            progressDetector: {
                fastJudgeTimeoutMs: 180,
                fastJudgeFailureFallback: 'PauseForHuman',
            },
        });

        expect(normalized.AgentChannelConsecutiveTurns).toBe(900);
        expect(normalized.AgentChannelWakesPerHour).toBe(300);
        expect(normalized.AgentAbsoluteIterations).toBe(75_000);
        expect(normalized.MaxTasksPerAgentGraph).toBe(2_500);
        expect(normalized.WhileLoopMaxIterations).toBeUndefined();
        expect(normalized.ForEachMaxIterations).toBeUndefined();
        expect(normalized.MaxTasksPerGraph).toBe(50_000);
        expect(normalized.BriefingContributorTimeoutMs).toBe(12_000);
        expect(normalized.BriefingMaxContributorChars).toBe(40_000);
        expect(normalized.Budgets?.PerRun?.MaxCostUsd).toBe(12.5);
        expect(normalized.Budgets?.CountPausedTimeTowardsWallClock).toBe(true);
        expect(normalized.ProgressDetector?.FastJudgeTimeoutMs).toBe(180);
        expect(normalized.ProgressDetector?.FastJudgeFailureFallback).toBe('PauseForHuman');
    });

    it('validates cross-field invariants on resolved MJLimitsConfig', () => {
        const invalid: MJLimitsConfig = {
            ...CODE_FALLBACK_LIMITS,
            MaxTasksPerAgentGraph: 200_000,
            MaxTasksPerGraph: 100_000,
            ProgressDetector: {
                ...CODE_FALLBACK_LIMITS.ProgressDetector,
                AmbiguityLowScoreThreshold: 0.8,
                AmbiguityHighScoreThreshold: 0.5,
            },
        };
        const validation = ValidateLimitsConfig(invalid);
        expect(validation.Valid).toBe(false);
        expect(validation.Issues.map((i) => i.Key)).toEqual([
            'MaxTasksPerAgentGraph',
            'ProgressDetector.AmbiguityLowScoreThreshold',
        ]);
    });
});
