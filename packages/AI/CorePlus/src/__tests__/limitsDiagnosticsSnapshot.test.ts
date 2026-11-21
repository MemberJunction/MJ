import { describe, it, expect, beforeEach } from 'vitest';
import { LimitsConfigResolver } from '@memberjunction/core';
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
    ParseLimitsDiagnosticsSnapshot,
    ResolveAgentRunLimits,
    SerializeLimitsDiagnosticsSnapshot,
    type AgentLimitsMetadataInput,
    type UserPolicyLimitsMetadataInput,
} from '../limits-diagnostics';

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

    it('applies Tier 4 UserAgentPolicy only when policy status is Active', () => {
        const activePolicy = makePolicyStub({ Status: 'Active' });
        const pausedPolicy = makePolicyStub({ Status: 'Paused' });

        expect(
            ExtractUserPolicyLimitsOverride(activePolicy, { AgentAbsoluteIterations: 25_000 }),
        ).toEqual({ AgentAbsoluteIterations: 25_000 });

        expect(
            ExtractUserPolicyLimitsOverride(pausedPolicy, { AgentAbsoluteIterations: 25_000 }),
        ).toEqual({});
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
        const parsedMerged = JSON.parse(mergedJson) as Record<string, unknown>;

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
});
