import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import {
    CODE_FALLBACK_LIMITS,
    CanUserRaiseEnforcedLimitsCeilings,
    DEFAULT_MJ_LIMITS_CONFIG,
    GetLimitsKeyRole,
    IsPolicyCeilingKey,
    LIMITS_CEILING_OVERRIDE_AUTHORIZATIONS,
    LIMITS_KEY_PATHS,
    LIMITS_KEY_ROLES,
    LIMITS_TIER_PRECEDENCE,
    LimitsConfigResolver,
    NormalizeLimitsInput,
    ValidateLimitsConfig,
    type MJLimitsConfig,
    type MJLimitsOverride,
} from '../generic/limitsConfig';
import type { IMetadataProvider } from '../generic/interfaces';
import type { AuthorizationInfo, UserInfo } from '../generic/securityInfo';

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
        // When mj.config.cjs has no limits block, resolver cleanly falls back to DEFAULT_MJ_LIMITS_CONFIG
        const mjConfig = require(repoConfigPath) as { limits?: MJLimitsOverride };

        const fallbackResult = LimitsConfigResolver.Resolve({
            MjConfig: mjConfig.limits ? NormalizeLimitsInput(mjConfig.limits) : null,
        });
        expect(fallbackResult.Limits).toEqual(DEFAULT_MJ_LIMITS_CONFIG);
        expect(fallbackResult.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe(
            mjConfig.limits ? 'MjConfig' : 'CodeFallback',
        );

        // When mj.config.cjs supplies a limits block, Tier 2 (MjConfig) overrides DEFAULT_MJ_LIMITS_CONFIG
        const sampleMjConfigLimits: MJLimitsOverride = {
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

    it('normalizes and resolves ResourceGuards and Tuning categories across precedence tiers', () => {
        const defaults = LimitsConfigResolver.Resolve();
        expect(defaults.Limits.ResourceGuards.MaxValidationRetries).toBe(10);
        expect(defaults.Limits.ResourceGuards.MaxHandoffHops).toBe(3);
        expect(defaults.Limits.ResourceGuards.PipelineDeadlineMs).toBe(120_000);
        expect(defaults.Limits.Tuning.QueryCacheDefaultMaxSize).toBe(1000);
        expect(defaults.Limits.Tuning.QueryCacheDefaultTtlMinutes).toBe(60);
        expect(defaults.Limits.Tuning.MaxAgentsOfferedInDraft).toBe(40);

        const normalized = NormalizeLimitsInput({
            resourceGuards: {
                maxValidationRetries: 4,
                maxHandoffHops: 2,
                clientToolTimeoutMs: 15_000,
            },
            tuning: {
                queryCacheDefaultMaxSize: 500,
                queryCacheDefaultTtlMinutes: 30,
                maxAgentsOfferedInDraft: 25,
            },
        });

        const resolved = LimitsConfigResolver.Resolve({
            MjConfig: normalized,
            RunOverride: {
                ResourceGuards: { MaxValidationRetries: 6 },
                Tuning: { QueryCacheDefaultMaxSize: 250 },
            },
        });

        expect(resolved.Limits.ResourceGuards.MaxValidationRetries).toBe(6);
        expect(resolved.Provenance['ResourceGuards.MaxValidationRetries'].SourceTier).toBe('RunOverride');
        expect(resolved.Limits.ResourceGuards.MaxHandoffHops).toBe(2);
        expect(resolved.Provenance['ResourceGuards.MaxHandoffHops'].SourceTier).toBe('MjConfig');
        expect(resolved.Limits.Tuning.QueryCacheDefaultMaxSize).toBe(250);
        expect(resolved.Provenance['Tuning.QueryCacheDefaultMaxSize'].SourceTier).toBe('RunOverride');
        expect(resolved.Limits.Tuning.QueryCacheDefaultTtlMinutes).toBe(30);
        expect(resolved.Provenance['Tuning.QueryCacheDefaultTtlMinutes'].SourceTier).toBe('MjConfig');
        expect(resolved.Limits.Tuning.MaxAgentsOfferedInDraft).toBe(25);
    });

    it('classifies every key path as PolicyCeiling vs OverridableDefault', () => {
        for (const key of LIMITS_KEY_PATHS) {
            const role = GetLimitsKeyRole(key);
            expect(role === 'PolicyCeiling' || role === 'OverridableDefault').toBe(true);
            expect(LIMITS_KEY_ROLES[key]).toBe(role);
            expect(IsPolicyCeilingKey(key)).toBe(role === 'PolicyCeiling');
        }

        expect(GetLimitsKeyRole('AgentAbsoluteIterations')).toBe('PolicyCeiling');
        expect(GetLimitsKeyRole('Budgets.PerRun.MaxCostUsd')).toBe('PolicyCeiling');
        expect(GetLimitsKeyRole('ResourceGuards.MaxValidationRetries')).toBe('PolicyCeiling');
        expect(GetLimitsKeyRole('ProgressDetector.FastJudgeMaxInputChars')).toBe('PolicyCeiling');

        expect(GetLimitsKeyRole('Budgets.PerUserPerDay.DayBoundaryTimezone')).toBe('OverridableDefault');
        expect(GetLimitsKeyRole('Budgets.CountPausedTimeTowardsWallClock')).toBe('OverridableDefault');
        expect(GetLimitsKeyRole('ProgressDetector.WindowSize')).toBe('OverridableDefault');
        expect(GetLimitsKeyRole('Tuning.QueryCacheDefaultMaxSize')).toBe('OverridableDefault');

        const resolved = LimitsConfigResolver.Resolve();
        expect(resolved.Provenance.AgentAbsoluteIterations.KeyRole).toBe('PolicyCeiling');
        expect(resolved.Provenance['Tuning.QueryCacheDefaultMaxSize'].KeyRole).toBe('OverridableDefault');
    });

    it('enforces server-side ContextUser authorization when raising PolicyCeiling values', () => {
        const standardUser = {
            ID: 'user-standard',
            Name: 'Standard User',
            Type: 'User',
            UserRoles: [{ RoleID: 'role-user', Role: 'UI User' }],
        } as Partial<UserInfo> as UserInfo;

        const ownerUser = {
            ID: 'user-owner',
            Name: 'Org Owner',
            Type: 'Owner',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;

        const agentAdminAuth = {
            ID: 'auth-ai-manage',
            Name: LIMITS_CEILING_OVERRIDE_AUTHORIZATIONS[1],
            ParentID: null,
            UserCanExecute: (u: UserInfo) => u.UserRoles.some((r) => r.RoleID === 'role-ai-admin'),
        } as Partial<AuthorizationInfo> as AuthorizationInfo;

        const diagnosticsReadAuth = {
            ID: 'auth-diag-read',
            Name: 'Diagnostics: Run Sessions',
            ParentID: null,
            UserCanExecute: () => true,
        } as Partial<AuthorizationInfo> as AuthorizationInfo;

        const provider = {
            Authorizations: [agentAdminAuth, diagnosticsReadAuth],
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const agentAdminUser = {
            ID: 'user-ai-admin',
            Name: 'Agent Admin',
            Type: 'User',
            UserRoles: [{ RoleID: 'role-ai-admin', Role: 'AI Admin' }],
        } as Partial<UserInfo> as UserInfo;

        // Fail-closed helper checks
        expect(CanUserRaiseEnforcedLimitsCeilings(null, provider)).toBe(false);
        expect(CanUserRaiseEnforcedLimitsCeilings(standardUser, provider)).toBe(false);
        expect(CanUserRaiseEnforcedLimitsCeilings(ownerUser, provider)).toBe(true);
        expect(CanUserRaiseEnforcedLimitsCeilings(agentAdminUser, provider)).toBe(true);

        const layers = {
            MjConfig: {
                Budgets: { PerRun: { MaxCostUsd: 25 } },
                MaxTasksPerGraph: 50_000,
            },
            AgentOrWorkflowMetadata: {
                MaxTasksPerAgentGraph: 5_000,
            },
            UserAgentPolicy: {
                Budgets: { PerRun: { MaxCostUsd: 10 } },
            },
            RunOverride: {
                // Attempts to raise PolicyCeilings across UserPolicy, Agent, MjConfig, and CodeFallback
                Budgets: { PerRun: { MaxCostUsd: 100 } },
                MaxTasksPerAgentGraph: 9_000,
                MaxTasksPerGraph: 80_000,
                AgentAbsoluteIterations: 250_000,
                // Tightening a PolicyCeiling is always allowed even for standard users
                WhileLoopMaxIterations: 1_000,
                // OverridableDefault changes are allowed without ceiling-raise privileges
                ProgressDetector: { WindowSize: 12 },
                Tuning: { QueryCacheDefaultMaxSize: 500 },
            },
        };

        // 1. Unauthorized standard user: widening PolicyCeilings clamps fail-closed, tightening & OverridableDefaults apply
        const denied = LimitsConfigResolver.Resolve(layers, {
            EnforceUserPolicyAsCeiling: true,
            EnforceConfiguredCeilings: true,
            AllowAuthorizedCeilingOverride: true,
            ContextUser: standardUser,
            Provider: provider,
        });
        expect(denied.Limits.Budgets.PerRun.MaxCostUsd).toBe(10);
        expect(denied.Provenance['Budgets.PerRun.MaxCostUsd'].WasClampedByPolicyCeiling).toBe(true);
        expect(denied.Limits.MaxTasksPerAgentGraph).toBe(5_000);
        expect(denied.Provenance.MaxTasksPerAgentGraph.SourceTier).toBe('AgentOrWorkflowMetadata');
        expect(denied.Provenance.MaxTasksPerAgentGraph.WasClampedByPolicyCeiling).toBe(true);
        expect(denied.Limits.MaxTasksPerGraph).toBe(50_000);
        expect(denied.Provenance.MaxTasksPerGraph.SourceTier).toBe('MjConfig');
        expect(denied.Limits.AgentAbsoluteIterations).toBe(100_000);
        expect(denied.Provenance.AgentAbsoluteIterations.SourceTier).toBe('CodeFallback');
        expect(denied.Limits.WhileLoopMaxIterations).toBe(1_000);
        expect(denied.Provenance.WhileLoopMaxIterations.WasClampedByPolicyCeiling).toBe(false);
        expect(denied.Limits.ProgressDetector.WindowSize).toBe(12);
        expect(denied.Limits.Tuning.QueryCacheDefaultMaxSize).toBe(500);
        expect(denied.ClampedKeys).toEqual([
            'AgentAbsoluteIterations',
            'MaxTasksPerAgentGraph',
            'MaxTasksPerGraph',
            'Budgets.PerRun.MaxCostUsd',
        ]);

        // 2. Authorized ContextUser (Owner or AI: Manage Agents): allowed to raise enforced ceilings
        const approved = LimitsConfigResolver.Resolve(layers, {
            EnforceUserPolicyAsCeiling: true,
            EnforceConfiguredCeilings: true,
            AllowAuthorizedCeilingOverride: true,
            ContextUser: agentAdminUser,
            Provider: provider,
        });
        expect(approved.Limits.Budgets.PerRun.MaxCostUsd).toBe(100);
        expect(approved.Limits.MaxTasksPerAgentGraph).toBe(9_000);
        expect(approved.Limits.MaxTasksPerGraph).toBe(80_000);
        expect(approved.Limits.AgentAbsoluteIterations).toBe(250_000);
        expect(approved.ClampedKeys).toEqual([]);
    });

    it('E2 (F1): clamps UserAgentPolicy attempts to raise or clear MjConfig org ceilings while allowing narrowing and admin overrides', () => {
        const standardUser = {
            ID: 'user-standard',
            Name: 'Standard User',
            Type: 'User',
            UserRoles: [{ RoleID: 'role-ui', Role: 'UI' }],
        } as Partial<UserInfo> as UserInfo;

        const ownerUser = {
            ID: 'user-owner',
            Name: 'Org Owner',
            Type: 'Owner',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;

        const layers = {
            MjConfig: {
                AgentAbsoluteIterations: 5_000,
                Budgets: {
                    PerRun: { MaxCostUsd: 10, MaxWallClockMs: 60_000 },
                    PerUserPerDay: { MaxCostUsd: 50 },
                },
            },
            UserAgentPolicy: {
                // Attempts to raise iterations, raise PerRun cost, clear PerUserPerDay to unlimited (null),
                // and narrow PerRun wall clock to 30s
                AgentAbsoluteIterations: 50_000,
                Budgets: {
                    PerRun: { MaxCostUsd: 25, MaxWallClockMs: 30_000 },
                    PerUserPerDay: { MaxCostUsd: null },
                },
            },
            RunOverride: {
                // Also tries to widen past MjConfig
                Budgets: { PerRun: { MaxCostUsd: 99 } },
            },
        };

        const clamped = LimitsConfigResolver.Resolve(layers, {
            EnforceUserPolicyAsCeiling: true,
            EnforceConfiguredCeilings: true,
            AllowAuthorizedCeilingOverride: true,
            ContextUser: standardUser,
        });

        expect(clamped.Limits.AgentAbsoluteIterations).toBe(5_000);
        expect(clamped.Provenance.AgentAbsoluteIterations.SourceTier).toBe('MjConfig');
        expect(clamped.Provenance.AgentAbsoluteIterations.WasClampedByPolicyCeiling).toBe(true);

        expect(clamped.Limits.Budgets.PerRun.MaxCostUsd).toBe(10);
        expect(clamped.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('MjConfig');
        expect(clamped.Provenance['Budgets.PerRun.MaxCostUsd'].WasClampedByPolicyCeiling).toBe(true);

        expect(clamped.Limits.Budgets.PerUserPerDay.MaxCostUsd).toBe(50);
        expect(clamped.Provenance['Budgets.PerUserPerDay.MaxCostUsd'].SourceTier).toBe('MjConfig');
        expect(clamped.Provenance['Budgets.PerUserPerDay.MaxCostUsd'].WasClampedByPolicyCeiling).toBe(true);

        // Narrowing below MjConfig is allowed
        expect(clamped.Limits.Budgets.PerRun.MaxWallClockMs).toBe(30_000);
        expect(clamped.Provenance['Budgets.PerRun.MaxWallClockMs'].SourceTier).toBe('UserAgentPolicy');
        expect(clamped.Provenance['Budgets.PerRun.MaxWallClockMs'].WasClampedByPolicyCeiling).toBe(false);

        // Authorized Owner can raise org ceilings when AllowAuthorizedCeilingOverride is enabled
        const adminResolved = LimitsConfigResolver.Resolve(layers, {
            EnforceUserPolicyAsCeiling: true,
            EnforceConfiguredCeilings: true,
            AllowAuthorizedCeilingOverride: true,
            ContextUser: ownerUser,
        });
        expect(adminResolved.Limits.AgentAbsoluteIterations).toBe(50_000);
        expect(adminResolved.Limits.Budgets.PerRun.MaxCostUsd).toBe(99);
        expect(adminResolved.Limits.Budgets.PerUserPerDay.MaxCostUsd).toBeNull();
        expect(adminResolved.ClampedKeys).toEqual([]);
    });
});
