import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import type {
    MJActionEntity,
    MJAIAgentActionEntity,
    MJAIAgentPromptEntity,
    MJAIAgentRelationshipEntity,
    MJAIAgentTypeEntity,
} from '@memberjunction/core-entities';
import {
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
    BuildUnifiedSubAgents,
    ComputeAgentTelemetry,
    DefaultAgentIcon,
    FlowStepTypeIcon,
    FormatCostUsd,
    FormatDurationBetween,
    FormatDurationMs,
    FormatStringList,
    FormatTokenCount,
    GetRunResultPreview,
    HasRunResult,
    OrderFlowStepsForPreview,
    ParseStringList,
    PatchAgentConfig,
    ReadAgentConfig,
    ResolveAgentStudioDescriptor,
    ResolveEffectiveDisplayValues,
    ResolveLinkedPromptsAndActions,
} from './agent-form-helpers';

const AGENT_RUN_ENTITY = new EntityInfo({
    ID: 'agent-run-entity',
    Name: 'MJ: AI Agent Runs',
    Fields: ['ID', 'Status', 'Result', 'FinalPayload'].map((Name) => ({
        Name,
        Type: Name === 'ID' ? 'uniqueidentifier' : 'nvarchar',
        IsPrimaryKey: Name === 'ID',
        AllowUpdateAPI: Name !== 'ID',
        AllowsNull: true,
    })),
});

function makeRunEntity(cols: {
    Status: MJAIAgentRunEntityExtended['Status'];
    Result?: string;
    FinalPayload?: string;
}): MJAIAgentRunEntityExtended {
    const run = new MJAIAgentRunEntityExtended(AGENT_RUN_ENTITY);
    run.Status = cols.Status;
    if (cols.Result) run.Result = cols.Result;
    if (cols.FinalPayload) run.FinalPayload = cols.FinalPayload;
    return run;
}

describe('ResolveAgentStudioDescriptor', () => {
    const flowType = { Name: 'Flow', UIFormSectionKey: 'FlowAgentSection' } as unknown as MJAIAgentTypeEntity;
    const loopType = { Name: 'Loop', UIFormSectionKey: null } as unknown as MJAIAgentTypeEntity;
    const swarmType = { Name: 'Swarm', UIFormSectionKey: 'SwarmAgentSection' } as unknown as MJAIAgentTypeEntity;

    it('builds Flow Studio with diagram icon for Flow agent types on saved records', () => {
        const desc = ResolveAgentStudioDescriptor(flowType, true);
        expect(desc).toEqual({
            HasStudio: true,
            Title: 'Flow Studio',
            Icon: 'fa-solid fa-diagram-project',
            ClassFactoryKey: 'AI Agents.FlowAgentSection',
            TypeName: 'Flow',
        });
    });

    it('keys on UIFormSectionKey so any future custom agent type gets a Studio automatically', () => {
        const desc = ResolveAgentStudioDescriptor(swarmType, true);
        expect(desc.HasStudio).toBe(true);
        expect(desc.Title).toBe('Swarm Studio');
        expect(desc.ClassFactoryKey).toBe('AI Agents.SwarmAgentSection');
        expect(desc.Icon).not.toContain('diagram-project');
    });

    it('falls back to "Agent Studio" when the agent type name is blank', () => {
        const unnamed = { Name: '   ', UIFormSectionKey: 'CustomSection' } as unknown as MJAIAgentTypeEntity;
        expect(ResolveAgentStudioDescriptor(unnamed, true).Title).toBe('Agent Studio');
    });

    it('returns HasStudio: false for Loop agents (no UIFormSectionKey) and unsaved records', () => {
        expect(ResolveAgentStudioDescriptor(loopType, true).HasStudio).toBe(false);
        expect(ResolveAgentStudioDescriptor(flowType, false).HasStudio).toBe(false);
        expect(ResolveAgentStudioDescriptor(null, true).HasStudio).toBe(false);
    });
});

describe('ComputeAgentTelemetry', () => {
    it('handles empty runs gracefully', () => {
        expect(ComputeAgentTelemetry([], { MaxCostPerRun: 1, MaxTokensPerRun: 10000 })).toEqual({
            RunCount: 0,
            CompletedCount: 0,
            FailedCount: 0,
            SuccessRatePct: null,
            AvgDurationMs: null,
            AvgCost: null,
            P95Tokens: null,
            CostHeadroomPct: null,
            TokenHeadroomPct: null,
        });
    });

    it('computes success rate, avg duration, rollup-preferred avg cost, p95 tokens, and headroom %', () => {
        const t = ComputeAgentTelemetry(
            [
                {
                    ID: 'r1',
                    Status: 'Completed',
                    StartedAt: '2026-01-01T00:00:00.000Z',
                    CompletedAt: '2026-01-01T00:00:01.000Z',
                    TotalCost: 0.01,
                    TotalCostRollup: 0.04,
                    TotalTokensUsed: 500,
                    TotalTokensUsedRollup: 2000,
                },
                {
                    ID: 'r2',
                    Status: 'Completed',
                    StartedAt: '2026-01-01T00:00:00.000Z',
                    CompletedAt: '2026-01-01T00:00:03.000Z',
                    TotalCost: 0.06,
                    TotalCostRollup: null,
                    TotalTokensUsed: 5000,
                    TotalTokensUsedRollup: null,
                },
                {
                    ID: 'r3',
                    Status: 'Failed',
                    StartedAt: '2026-01-01T00:00:00.000Z',
                    CompletedAt: '2026-01-01T00:00:02.000Z',
                    TotalCost: 0.05,
                    TotalCostRollup: 0.05,
                    TotalTokensUsed: 3000,
                    TotalTokensUsedRollup: 3000,
                },
                {
                    // Running should not affect Completed/(Completed+Failed)
                    ID: 'r4',
                    Status: 'Running',
                    StartedAt: '2026-01-01T00:00:00.000Z',
                    CompletedAt: null,
                    TotalCost: null,
                    TotalCostRollup: null,
                    TotalTokensUsed: null,
                    TotalTokensUsedRollup: null,
                },
            ],
            { MaxCostPerRun: 0.1, MaxTokensPerRun: 10000 },
        );

        expect(t.RunCount).toBe(4);
        expect(t.CompletedCount).toBe(2);
        expect(t.FailedCount).toBe(1);
        expect(t.SuccessRatePct).toBe(66.7);
        expect(t.AvgDurationMs).toBe(2000);
        expect(t.AvgCost).toBeCloseTo(0.05, 5);
        expect(t.P95Tokens).toBe(5000);
        expect(t.CostHeadroomPct).toBe(50);
        expect(t.TokenHeadroomPct).toBe(50);
    });
});

describe('HasRunResult & GetRunResultPreview', () => {
    it('prefers FinalPayload over legacy Result on finished runs', () => {
        const run = makeRunEntity({
            Status: 'Completed',
            Result: '{"legacy":true}',
            FinalPayload: '{"answer":42}',
        });
        expect(HasRunResult(run)).toBe(true);
        expect(JSON.parse(GetRunResultPreview(run, false))).toEqual({ answer: 42 });
    });

    it('falls back to legacy Result when FinalPayload is absent', () => {
        const run = makeRunEntity({ Status: 'Completed', Result: '{"legacy":true}' });
        expect(HasRunResult(run)).toBe(true);
        expect(JSON.parse(GetRunResultPreview(run, false))).toEqual({ legacy: true });
    });

    it('hides results while Running even when a partial FinalPayload is already present', () => {
        const run = makeRunEntity({ Status: 'Running', FinalPayload: '{"partial":true}' });
        expect(HasRunResult(run)).toBe(false);
    });

    it('shows results for Cancelled runs and truncates long payloads when requested', () => {
        const longText = 'x'.repeat(400);
        const run = makeRunEntity({ Status: 'Cancelled', FinalPayload: longText });
        expect(HasRunResult(run)).toBe(true);
        const truncated = GetRunResultPreview(run, true);
        expect(truncated.length).toBe(303);
        expect(truncated.endsWith('...')).toBe(true);
    });

    it('returns "No result" when neither FinalPayload nor Result exists', () => {
        const run = makeRunEntity({ Status: 'Failed' });
        expect(HasRunResult(run)).toBe(false);
        expect(GetRunResultPreview(run, false)).toBe('No result');
    });
});

describe('ResolveLinkedPromptsAndActions', () => {
    const AGENT = 'aaaaaaaa-0000-0000-0000-000000000001';
    const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002';

    it("preserves engine order, matches UUIDs case-insensitively, and ignores other agents' links", () => {
        const prompts = [
            { ID: 'p1', Name: 'Summarize' },
            { ID: 'p2', Name: 'Classify' },
            { ID: 'p3', Name: 'Draft' },
        ] as unknown as MJAIPromptEntityExtended[];
        const agentPrompts = [
            { AgentID: AGENT.toUpperCase(), PromptID: 'P3' },
            { AgentID: OTHER, PromptID: 'p2' },
            { AgentID: AGENT, PromptID: 'p1' },
        ] as unknown as MJAIAgentPromptEntity[];
        const actions = [
            { ID: 'a1', Name: 'Send Email' },
            { ID: 'a2', Name: 'Web Search' },
        ] as unknown as MJActionEntity[];
        const agentActions = [
            { AgentID: AGENT, ActionID: 'A2' },
            { AgentID: OTHER, ActionID: 'a1' },
        ] as unknown as MJAIAgentActionEntity[];

        const res = ResolveLinkedPromptsAndActions(AGENT, prompts, agentPrompts, actions, agentActions);
        expect(res.Prompts.map((p) => p.Name)).toEqual(['Summarize', 'Draft']);
        expect(res.Actions.map((a) => a.Name)).toEqual(['Web Search']);
    });

    it('returns empty arrays when agentId is missing or has no links', () => {
        expect(ResolveLinkedPromptsAndActions(null, [], [], [], [])).toEqual({ Prompts: [], Actions: [] });
    });
});

describe('BuildUnifiedSubAgents', () => {
    const PARENT = 'aaaaaaaa-0000-0000-0000-000000000001';

    it('combines direct children and related sub-agents without duplicates', () => {
        const allAgents = [
            { ID: 'c1', Name: 'Direct Child', ParentID: PARENT },
            { ID: 'c2', Name: 'Related Specialist', ParentID: null },
            { ID: 'c3', Name: 'Unrelated', ParentID: 'other-parent' },
        ] as unknown as MJAIAgentEntityExtended[];

        const relationships = [
            // c1 is already a direct child -> should not duplicate
            { ID: 'r1', AgentID: PARENT, SubAgentID: 'C1' },
            { ID: 'r2', AgentID: PARENT.toUpperCase(), SubAgentID: 'c2' },
        ] as unknown as MJAIAgentRelationshipEntity[];

        const unified = BuildUnifiedSubAgents(PARENT, allAgents, relationships);
        expect(unified.map((u) => ({ name: u.Agent.Name, type: u.LinkType }))).toEqual([
            { name: 'Direct Child', type: 'child' },
            { name: 'Related Specialist', type: 'related' },
        ]);
    });
});

describe('OrderFlowStepsForPreview & Formatters', () => {
    it('places starting step first, sorts remaining alphabetically, and trims to maxCount', () => {
        const ordered = OrderFlowStepsForPreview(
            [
                { ID: 's1', Name: 'Format', StepType: 'Prompt', StartingStep: false },
                { ID: 's2', Name: 'Ingest', StepType: 'Action', StartingStep: true },
                { ID: 's3', Name: 'Branch', StepType: 'Sub-Agent', StartingStep: false },
            ],
            2,
        );
        expect(ordered.map((s) => s.Name)).toEqual(['Ingest', 'Branch']);
    });

    it('formats durations, tokens, costs, and icons cleanly', () => {
        expect(FormatDurationMs(420)).toBe('420ms');
        expect(FormatDurationMs(2450)).toBe('2.5s');
        expect(FormatDurationMs(134000)).toBe('2m 14s');
        expect(FormatDurationMs(null)).toBe('—');
        expect(FormatDurationBetween('2026-01-01T00:00:00Z', '2026-01-01T00:00:01.500Z')).toBe('1.5s');

        expect(FormatTokenCount(850)).toBe('850');
        expect(FormatTokenCount(12400)).toBe('12.4K');
        expect(FormatTokenCount(1500000)).toBe('1.5M');

        expect(FormatCostUsd(0)).toBe('$0.00');
        expect(FormatCostUsd(0.0042)).toBe('$0.0042');
        expect(FormatCostUsd(0.084)).toBe('$0.08');

        expect(FlowStepTypeIcon('Prompt')).toContain('comment-dots');
        expect(FlowStepTypeIcon('Action')).toContain('bolt');
        expect(FlowStepTypeIcon('Custom')).toContain('puzzle-piece');
        expect(DefaultAgentIcon(null, 'Flow')).toContain('diagram-project');
        expect(DefaultAgentIcon(null, 'Realtime')).toContain('tower-broadcast');
        expect(DefaultAgentIcon('fa-solid fa-star', 'Flow')).toBe('fa-solid fa-star');
    });
});

describe('IAgentConfiguration cascade & patch helpers (PR #6992)', () => {
    it('reads, patches, and cleans empty sections on Record.Configuration', () => {
        const rec: { Configuration: string | null } = { Configuration: null };
        expect(ReadAgentConfig(rec)).toEqual({});

        PatchAgentConfig(rec, (cfg) => {
            cfg.execution = { modelSelectionMode: 'Agent', requirePlanMode: true };
            cfg.scope = { searchScopeAccess: 'Assigned' };
        });

        expect(rec.Configuration).toBeTruthy();
        const parsed = ReadAgentConfig(rec);
        expect(parsed.execution?.modelSelectionMode).toBe('Agent');
        expect(parsed.execution?.requirePlanMode).toBe(true);
        expect(parsed.scope?.searchScopeAccess).toBe('Assigned');

        // Clearing all sections sets Configuration back to null
        PatchAgentConfig(rec, (cfg) => {
            delete cfg.execution;
            cfg.scope = {};
        });
        expect(rec.Configuration).toBeNull();
    });

    it('formats and parses comma/newline string lists for payload paths', () => {
        expect(FormatStringList(['customer.*', 'orderId'])).toBe('customer.*, orderId');
        expect(FormatStringList(null)).toBe('');
        expect(ParseStringList(' customer.*, orderId \n totals.net ')).toEqual(['customer.*', 'orderId', 'totals.net']);
        expect(ParseStringList('   ')).toBeNull();
    });

    it('resolves effective display values preferring local Configuration > EffectiveAgentProperties > legacy fallback', () => {
        const effective = {
            ModelSelectionMode: 'Agent Type',
            SupportsPlanMode: true,
            RequirePlanMode: true,
            DeclareActionsAsNativeTools: false,
            ExecutionMode: 'Parallel',
            AllowMemoryWrite: false,
            SearchScopeAccess: 'Assigned',
            SkillActivationMode: 'RequestedOnly',
            AllowEphemeralClientTools: false,
            AcceptUnregisteredFiles: false,
            ChatHandlingOption: 'Retry',
            MessageMode: 'Latest',
            MaxMessages: 20,
            RecordingDefault: 'Audio',
            ArtifactCreationMode: 'System Only',
            ContextWindowMaxTokens: 64000,
            CompactionTriggerPercent: 80,
            CompactionTargetPercent: 50,
            DefaultPromptEffortLevel: 50,
            MinExecutionsPerRun: null,
            MaxExecutionsPerRun: 3,
            MaxSubAgentConsultRounds: 2,
            InjectNotes: true,
            MaxNotesToInject: 5,
            NoteInjectionStrategy: 'Relevant',
            InjectExamples: false,
            MaxExamplesToInject: 3,
            ExampleInjectionStrategy: 'Semantic',
            HelperPlugins: [{ seam: 'messaging', driverClass: 'CustomMessagingHelper' }],
        } as unknown as Parameters<typeof ResolveEffectiveDisplayValues>[1];

        const rec = {
            Configuration: JSON.stringify({ execution: { modelSelectionMode: 'Agent' } }),
            ModelSelectionMode: 'Agent Type' as const,
            SearchScopeAccess: 'All' as const,
        };

        const out = ResolveEffectiveDisplayValues(rec, effective);
        // Local Configuration override wins over cascade
        expect(out.ModelSelectionMode).toBe('Agent');
        // Cascade wins over legacy column fallback
        expect(out.SearchScopeAccess).toBe('Assigned');
        expect(out.RequirePlanMode).toBe(true);
        expect(out.ExecutionMode).toBe('Parallel');
        expect(out.HelperPlugins).toEqual([{ seam: 'messaging', driverClass: 'CustomMessagingHelper' }]);
    });
});
