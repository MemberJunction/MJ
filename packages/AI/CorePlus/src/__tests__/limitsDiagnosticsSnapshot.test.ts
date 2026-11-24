import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    LimitsConfigResolver,
    type AuthorizationInfo,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { MJAIAgentRunEntityExtended } from '../MJAIAgentRunEntityExtended';
import {
    AttachLimitsDiagnosticsToAgentRun,
    AttachLimitsDiagnosticsToRunData,
    BuildLimitsDiagnosticsSnapshot,
    ExtractAgentMetadataLimitsOverride,
    ExtractLimitsDiagnosticsFromAgentRun,
    ExtractLimitsDiagnosticsFromRunData,
    ExtractRunOverrideLimits,
    ExtractUserPolicyLimitsOverride,
    LIMITS_DIAGNOSTICS_DATA_KEY,
    LIMITS_DIAGNOSTICS_SCHEMA_VERSION,
    MAX_DIAGNOSTICS_ENVELOPE_SCAN_CHARS,
    ParseLimitsDiagnosticsSnapshot,
    ResolveAgentRunLimits,
    SerializeLimitsDiagnosticsSnapshot,
    type AgentLimitsMetadataInput,
    type UserPolicyLimitsMetadataInput,
} from '../limits-diagnostics';

/**
 * Wall-clock ceiling for the pathological-input check. It guards against catastrophic or polynomial
 * backtracking (seconds), not machine speed: tight millisecond bounds fail on shared CI runners
 * (v6.3.0-edge.0's publish gate failed one at 211 ms vs 200 ms).
 */
const PATHOLOGICAL_INPUT_CEILING_MS = 2000;

function makeAgentStub(overrides: Partial<AgentLimitsMetadataInput> = {}): AgentLimitsMetadataInput {
    return {
        MaxCostPerRun: null,
        MaxTimePerRun: null,
        MaxTokensPerRun: null,
        TypeConfiguration: null,
        ...overrides,
    };
}

function makePolicyStub(overrides: Partial<UserPolicyLimitsMetadataInput> = {}): UserPolicyLimitsMetadataInput {
    return {
        Status: 'Active',
        ...overrides,
    };
}

function makeAgentRunStub(initialData: string | null = null): MJAIAgentRunEntityExtended {
    let dataValue = initialData;
    const stub = Object.create(MJAIAgentRunEntityExtended.prototype) as MJAIAgentRunEntityExtended;
    Object.defineProperty(stub, 'Data', {
        get: () => dataValue,
        set: (v: string | null) => {
            dataValue = v;
        },
        configurable: true,
        enumerable: true,
    });
    return stub;
}

describe('limitsDiagnosticsSnapshot & 5-tier AI agent resolution', () => {
    beforeEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('extracts Tier 3 AgentOrWorkflowMetadata from strongly-typed agent columns, TypeConfiguration, and workflow metadata', () => {
        const agent = makeAgentStub({
            MaxCostPerRun: 12.5,
            MaxTimePerRun: 300, // seconds -> 300_000 ms
            MaxTokensPerRun: 250_000,
            TypeConfiguration: JSON.stringify({
                limits: {
                    whileLoopMaxIterations: 5_000,
                    progressDetector: { fastJudgeTimeoutMs: 175 },
                },
            }),
        });

        const extracted = ExtractAgentMetadataLimitsOverride(agent, {
            MaxTasksPerAgentGraph: 2_000,
            ForEachMaxIterations: 25_000,
        });

        expect(extracted.Budgets?.PerRun?.MaxCostUsd).toBe(12.5);
        expect(extracted.Budgets?.PerRun?.MaxWallClockMs).toBe(300_000);
        expect(extracted.Budgets?.PerRun?.MaxTokens).toBe(250_000);
        expect(extracted.WhileLoopMaxIterations).toBe(5_000);
        expect(extracted.MaxTasksPerAgentGraph).toBe(2_000);
        expect(extracted.ForEachMaxIterations).toBe(25_000);
        expect(extracted.ProgressDetector?.FastJudgeTimeoutMs).toBe(175);
    });

    it('ignores null agent budget columns so lower MjConfig tier values remain intact', () => {
        const agent = makeAgentStub({
            MaxCostPerRun: null,
            MaxTimePerRun: null,
            MaxTokensPerRun: null,
        });
        const extracted = ExtractAgentMetadataLimitsOverride(agent);
        expect(extracted).toEqual({});

        const resolved = ResolveAgentRunLimits({
            MjConfigLimits: { Budgets: { PerRun: { MaxCostUsd: 40 } } },
            Agent: agent,
        });
        expect(resolved.Limits.Budgets.PerRun.MaxCostUsd).toBe(40);
        expect(resolved.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('MjConfig');
    });

    it('applies Tier 4 UserAgentPolicy only when policy status is Active, parses durable JSON envelopes, and clamps widening RunOverrides', () => {
        const activePolicy = makePolicyStub({ Status: 'Active' });
        const pausedPolicy = makePolicyStub({ Status: 'Paused', Settings: JSON.stringify({ Budgets: { PerRun: { MaxCostUsd: 5 } } }) });

        expect(
            ExtractUserPolicyLimitsOverride(activePolicy, { AgentAbsoluteIterations: 25_000 }),
        ).toEqual({ AgentAbsoluteIterations: 25_000 });

        expect(
            ExtractUserPolicyLimitsOverride(pausedPolicy, { AgentAbsoluteIterations: 25_000 }),
        ).toEqual({});

        const durablePolicy = makePolicyStub({
            Status: 'Active',
            InstructionsOverride: 'Follow company rules.\n<!-- mj-limits: {"Budgets":{"PerRun":{"MaxCostUsd":6.5},"PerUserPerDay":{"MaxCostUsd":25}},"AgentAbsoluteIterations":1200} -->',
        });
        expect(ExtractUserPolicyLimitsOverride(durablePolicy)).toEqual({
            Budgets: {
                PerRun: { MaxCostUsd: 6.5 },
                PerUserPerDay: { MaxCostUsd: 25 },
            },
            AgentAbsoluteIterations: 1200,
        });

        // Attempt to widen admin user policy ceiling via RunOverride must be clamped
        const clampedResolution = ResolveAgentRunLimits({
            UserPolicy: durablePolicy,
            RunParams: {
                absoluteMaxIterations: 50_000,
                maxTreeCost: 99,
            },
        });
        expect(clampedResolution.Limits.Budgets.PerRun.MaxCostUsd).toBe(6.5);
        expect(clampedResolution.Limits.AgentAbsoluteIterations).toBe(1200);
        expect(clampedResolution.Provenance['Budgets.PerRun.MaxCostUsd'].WasClampedByPolicyCeiling).toBe(true);
        expect(clampedResolution.Provenance.AgentAbsoluteIterations.WasClampedByPolicyCeiling).toBe(true);
    });

    it('extracts Tier 5 RunOverride from ExecuteAgentParams and explicit run overrides', () => {
        const extracted = ExtractRunOverrideLimits(
            {
                absoluteMaxIterations: 50_000,
                maxExecutionTimeMs: 45_000,
                maxTreeCost: 8.5,
                maxTreeTokens: 120_000,
                limitsOverride: {
                    BriefingContributorTimeoutMs: 5_000,
                },
            },
            {
                MaxTasksPerGraph: 50_000,
            },
        );

        expect(extracted.AgentAbsoluteIterations).toBe(50_000);
        expect(extracted.Budgets?.PerRun?.MaxWallClockMs).toBe(45_000);
        expect(extracted.Budgets?.PerRun?.MaxCostUsd).toBe(8.5);
        expect(extracted.Budgets?.PerRun?.MaxTokens).toBe(120_000);
        expect(extracted.BriefingContributorTimeoutMs).toBe(5_000);
        expect(extracted.MaxTasksPerGraph).toBe(50_000);
    });

    it('builds, serializes, and parses a LimitsDiagnosticsSnapshot with full provenance', () => {
        const resolution = ResolveAgentRunLimits({
            MjConfigLimits: {
                AgentChannelConsecutiveTurns: 900,
                Budgets: { PerUserPerDay: { MaxCostUsd: 100 } },
            },
            Agent: makeAgentStub({
                MaxCostPerRun: 20,
                MaxTimePerRun: 600,
            }),
            UserPolicy: makePolicyStub({ Status: 'Active' }),
            UserPolicyLimitsOverride: {
                Budgets: { PerRun: { MaxCostUsd: 15 }, PerUserPerDay: { MaxCostUsd: 50 } },
            },
            RunParams: {
                absoluteMaxIterations: 150_000,
            },
            Options: {
                ResolvedAtISO: '2026-11-21T12:30:00.000Z',
            },
        });

        const snapshot = BuildLimitsDiagnosticsSnapshot(resolution, {
            AgentID: 'agent-1',
            AgentName: 'Planner Agent',
            AgentRunID: 'run-123',
            UserID: 'user-1',
        });

        expect(snapshot.SchemaVersion).toBe(LIMITS_DIAGNOSTICS_SCHEMA_VERSION);
        expect(snapshot.CapturedAtISO).toBe('2026-11-21T12:30:00.000Z');
        expect(snapshot.Context).toEqual({
            AgentID: 'agent-1',
            AgentName: 'Planner Agent',
            AgentRunID: 'run-123',
            UserID: 'user-1',
        });
        expect(snapshot.ResolvedLimits.AgentAbsoluteIterations).toBe(150_000);
        expect(snapshot.Provenance.AgentAbsoluteIterations.SourceTier).toBe('RunOverride');
        expect(snapshot.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('UserAgentPolicy');
        expect(snapshot.Provenance['Budgets.PerRun.MaxWallClockMs'].SourceTier).toBe('AgentOrWorkflowMetadata');
        expect(snapshot.Provenance.AgentChannelConsecutiveTurns.SourceTier).toBe('MjConfig');
        expect(snapshot.Provenance.ForEachMaxIterations.SourceTier).toBe('CodeFallback');

        const serialized = SerializeLimitsDiagnosticsSnapshot(snapshot);
        const parsed = ParseLimitsDiagnosticsSnapshot(serialized);
        expect(parsed).toEqual(snapshot);
    });

    it('rejects absent, malformed, or schema-mismatched snapshot JSON cleanly', () => {
        expect(ParseLimitsDiagnosticsSnapshot(null)).toBeNull();
        expect(ParseLimitsDiagnosticsSnapshot('')).toBeNull();
        expect(ParseLimitsDiagnosticsSnapshot('{bad json')).toBeNull();
        expect(ParseLimitsDiagnosticsSnapshot(JSON.stringify({ SchemaVersion: 'wrong/v0' }))).toBeNull();
        expect(
            ParseLimitsDiagnosticsSnapshot(
                JSON.stringify({
                    SchemaVersion: LIMITS_DIAGNOSTICS_SCHEMA_VERSION,
                    CapturedAtISO: '2026-11-21T00:00:00.000Z',
                    ResolvedLimits: {},
                    Provenance: {},
                }),
            ),
        ).toBeNull();
    });

    it('attaches and extracts diagnostic snapshot on run Data JSON and MJAIAgentRunEntityExtended without clobbering existing Data keys', () => {
        const resolution = ResolveAgentRunLimits({
            RunParams: { absoluteMaxIterations: 42_000 },
            Options: { ResolvedAtISO: '2026-11-21T14:00:00.000Z' },
        });
        const snapshot = BuildLimitsDiagnosticsSnapshot(resolution, {
            AgentRunID: 'run-999',
        });

        const existingData = JSON.stringify({ conversationId: 'conv-1', topic: 'budgeting' });
        const mergedJson = AttachLimitsDiagnosticsToRunData(existingData, snapshot);
        const parsedMerged = JSON.parse(mergedJson) as Record<string, string | number | boolean | object | null>;

        expect(parsedMerged['conversationId']).toBe('conv-1');
        expect(parsedMerged['topic']).toBe('budgeting');
        expect(parsedMerged[LIMITS_DIAGNOSTICS_DATA_KEY]).toBeDefined();
        expect(ExtractLimitsDiagnosticsFromRunData(mergedJson)).toEqual(snapshot);

        const runEntity = makeAgentRunStub(existingData);
        AttachLimitsDiagnosticsToAgentRun(runEntity, snapshot);
        expect(runEntity.LimitsDiagnosticsSnapshot).toEqual(snapshot);
        expect(ExtractLimitsDiagnosticsFromAgentRun(runEntity)).toEqual(snapshot);

        // Fresh entity instance hydrated with persisted Data JSON reads snapshot lazily
        const reloadedEntity = makeAgentRunStub(runEntity.Data);
        expect(reloadedEntity.LimitsDiagnosticsSnapshot).toEqual(snapshot);
    });

    it('extracts comment, tag, and fenced envelopes in bounded linear time even with repeated openers', () => {
        const commentPolicy = makePolicyStub({
            Notes: 'Intro <!-- mj-limits: { "AgentAbsoluteIterations": 1234 } --> trailing',
        });
        expect(ExtractUserPolicyLimitsOverride(commentPolicy).AgentAbsoluteIterations).toBe(1234);

        const tagPolicy = makePolicyStub({
            InstructionsOverride: '<limits_json>\n{"Budgets":{"PerRun":{"MaxCostUsd":9.5}}}\n</limits_json>',
        });
        expect(ExtractUserPolicyLimitsOverride(tagPolicy).Budgets?.PerRun?.MaxCostUsd).toBe(9.5);

        const fencedPolicy = makePolicyStub({
            Configuration: '```limits\n{"ForEachMaxIterations":777}\n```',
        });
        expect(ExtractUserPolicyLimitsOverride(fencedPolicy).ForEachMaxIterations).toBe(777);

        // Adversarial repeated unclosed openers must resolve quickly without ReDoS backtracking
        const repeatedComments = '<!-- mj-limits: '.repeat(2_000) + ' no closing tag';
        const repeatedTags = '<limits> '.repeat(2_000) + '<limits_json> '.repeat(2_000);
        const repeatedFences = '```json\n'.repeat(2_000);
        const t0 = Date.now();
        expect(
            ExtractUserPolicyLimitsOverride(
                makePolicyStub({
                    Notes: repeatedComments,
                    InstructionsOverride: repeatedTags,
                    Configuration: repeatedFences,
                }),
            ),
        ).toEqual({});
        const elapsedMs = Date.now() - t0;
        expect(elapsedMs).toBeLessThan(PATHOLOGICAL_INPUT_CEILING_MS);

        // Valid envelope after earlier unclosed opener still succeeds when within scan budget
        const mixedPolicy = makePolicyStub({
            Notes: '<!-- mj-limits: broken\n<!-- mj-limits: { "AgentAbsoluteIterations": 321 } -->',
        });
        expect(ExtractUserPolicyLimitsOverride(mixedPolicy).AgentAbsoluteIterations).toBe(321);
    });

    it('CR-21: guarantees O(n) scan and bounded JSON.parse attempts on 2,000 nested/shared-closer openers and >64KB raw input', () => {
        const parseSpy = vi.spyOn(JSON, 'parse');
        try {
            const repeatedCommentSharedCloser = '<!--mj-limits:{'.repeat(2_000) + '}-->';
            const repeatedTagSharedCloser = '<limits>{'.repeat(2_000) + '}</limits>';
            const repeatedJsonTagSharedCloser = '<limits_json>{'.repeat(2_000) + '}</limits_json>';

            const t0 = Date.now();
            const extracted = ExtractUserPolicyLimitsOverride(
                makePolicyStub({
                    Notes: repeatedCommentSharedCloser,
                    InstructionsOverride: repeatedTagSharedCloser,
                    Configuration: repeatedJsonTagSharedCloser,
                }),
            );
            const elapsedMs = Date.now() - t0;

            expect(extracted).toEqual({});
            expect(elapsedMs).toBeLessThan(1000);
            // At most 1 parse attempt per shared closer (3 fields x 1 = 3, never 6,000!)
            expect(parseSpy.mock.calls.length).toBeLessThanOrEqual(6);

            // Size bound enforced BEFORE trim()/direct JSON.parse
            parseSpy.mockClear();
            const oversizedDirectJson =
                '   {' + ' '.repeat(MAX_DIAGNOSTICS_ENVELOPE_SCAN_CHARS + 500) + '"AgentAbsoluteIterations": 999 }';
            expect(ExtractUserPolicyLimitsOverride(makePolicyStub({ Notes: oversizedDirectJson }))).toEqual({});
            expect(parseSpy.mock.calls.length).toBeLessThanOrEqual(1);
        } finally {
            parseSpy.mockRestore();
        }
    });

    it('enforces server-side ContextUser ceiling authorization in ResolveAgentRunLimits', () => {
        const standardUser = {
            ID: 'u-std',
            Name: 'Standard User',
            Type: 'User',
            UserRoles: [],
        } as Partial<UserInfo> as UserInfo;

        const adminAuth = {
            ID: 'auth-sys-admin',
            Name: 'System Administrator',
            ParentID: null,
            UserCanExecute: (u: UserInfo) => u.UserRoles.some((r) => r.RoleID === 'role-sys-admin'),
        } as Partial<AuthorizationInfo> as AuthorizationInfo;

        const provider = {
            Authorizations: [adminAuth],
        } as Partial<IMetadataProvider> as IMetadataProvider;

        const adminUser = {
            ID: 'u-admin',
            Name: 'Sys Admin',
            Type: 'User',
            UserRoles: [{ RoleID: 'role-sys-admin', Role: 'Admin' }],
        } as Partial<UserInfo> as UserInfo;

        const agent = makeAgentStub({ MaxCostPerRun: 12 });

        // Unauthorized user trying to raise Agent MaxCostPerRun and CodeFallback AgentAbsoluteIterations is clamped
        const denied = ResolveAgentRunLimits({
            Agent: agent,
            RunParams: {
                maxTreeCost: 500,
                absoluteMaxIterations: 250_000,
            },
            ContextUser: standardUser,
            Provider: provider,
        });
        expect(denied.Limits.Budgets.PerRun.MaxCostUsd).toBe(12);
        expect(denied.Limits.AgentAbsoluteIterations).toBe(100_000);
        expect(denied.ClampedKeys).toEqual(['AgentAbsoluteIterations', 'Budgets.PerRun.MaxCostUsd']);

        // Authorized System Administrator user is permitted to raise the enforced ceiling
        const allowed = ResolveAgentRunLimits({
            Agent: agent,
            RunParams: {
                maxTreeCost: 500,
                absoluteMaxIterations: 250_000,
            },
            ContextUser: adminUser,
            Provider: provider,
        });
        expect(allowed.Limits.Budgets.PerRun.MaxCostUsd).toBe(500);
        expect(allowed.Limits.AgentAbsoluteIterations).toBe(250_000);
        expect(allowed.ClampedKeys).toEqual([]);
    });
});
