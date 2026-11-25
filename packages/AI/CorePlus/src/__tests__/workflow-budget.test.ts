import { describe, it, expect } from 'vitest';
import {
    ComputeWorkflowBudgetHeadroom,
    CreateWorkflowBudget,
    EvaluateWorkflowBudgetCaps,
    RecordWorkflowBudgetUsage,
    ResolveEffectiveWorkflowCostCap,
    ResolveEffectiveWorkflowDurationCapMs,
    SynchronizeWorkflowBudget,
} from '../workflow-budget';
import { ExtractRunOverrideLimits } from '../limits-diagnostics';

describe('MJ-9 Whole-Workflow Budget Contracts & Accumulator (AI/CorePlus)', () => {
    it('initializes workflow budget with synchronized ceilings, start timestamp, and AbortController', () => {
        const startedAt = 1_700_000_000_000;
        const budget = CreateWorkflowBudget(
            {
                WorkflowMaxCostUsd: 2.5,
                WorkflowMaxDurationMs: 45_000,
                WorkflowStartedAtMs: startedAt,
            },
            startedAt + 500,
        );

        expect(budget.workflowMaxCostUsd).toBe(2.5);
        expect(budget.workflowMaxDurationMs).toBe(45_000);
        expect(budget.workflowStartedAtMs).toBe(startedAt);
        expect(budget.startedAtMs).toBe(startedAt);
        expect(budget.totalCost).toBe(0);
        expect(budget.cumulativeCostUsd).toBe(0);
        expect(budget.abortController).toBeDefined();
        expect(budget.abortController?.signal.aborted).toBe(false);
        expect(ResolveEffectiveWorkflowCostCap(budget)).toBe(2.5);
        expect(ResolveEffectiveWorkflowDurationCapMs(budget)).toBe(45_000);
    });

    it('takes the stricter ceiling when both workflowMax* and maxTree* caps are supplied', () => {
        const budget = CreateWorkflowBudget({
            MaxTreeCost: 1.0,
            WorkflowMaxCostUsd: 0.4,
            MaxTreeDurationMs: 10_000,
            WorkflowMaxDurationMs: 25_000,
        });

        expect(ResolveEffectiveWorkflowCostCap(budget)).toBe(0.4);
        expect(ResolveEffectiveWorkflowDurationCapMs(budget)).toBe(10_000);
    });

    it('accumulates cost atomically across concurrent updates and fires AbortSignal + diagnostic on USD cap breach', () => {
        const t0 = 1_700_000_000_000;
        const budget = CreateWorkflowBudget({
            WorkflowMaxCostUsd: 0.5,
            WorkflowMaxDurationMs: 30_000,
            WorkflowStartedAtMs: t0,
        });

        const first = RecordWorkflowBudgetUsage(
            budget,
            { CostUsd: 0.2, Tokens: 500, Steps: 1 },
            { SourceScope: 'Workflow', AgentName: 'RootAgent', RunID: 'run-1' },
            t0 + 100,
        );
        expect(first.Exceeded).toBe(false);
        expect(first.CumulativeCostUsd).toBeCloseTo(0.2, 6);
        expect(first.RemainingCostUsd).toBeCloseTo(0.3, 6);
        expect(first.RemainingWallClockMs).toBe(29_900);

        const second = RecordWorkflowBudgetUsage(
            budget,
            { CostUsd: 0.35, Tokens: 900, Steps: 1 },
            { SourceScope: 'AgentTree', AgentName: 'SubAgentA', RunID: 'run-2', TaskID: 'task-2' },
            t0 + 250,
        );
        expect(second.Exceeded).toBe(true);
        expect(second.Diagnostic?.Code).toBe('WORKFLOW_COST_LIMIT_EXCEEDED');
        expect(second.Diagnostic?.Dimension).toBe('CostUsd');
        expect(second.Diagnostic?.Limit).toBe(0.5);
        expect(second.Diagnostic?.CumulativeCostUsd).toBeCloseTo(0.55, 6);
        expect(second.Diagnostic?.ElapsedWallClockMs).toBe(250);
        expect(second.Diagnostic?.BreachingAgentName).toBe('SubAgentA');
        expect(second.Diagnostic?.BreachingRunID).toBe('run-2');
        expect(second.Diagnostic?.BreachingTaskID).toBe('task-2');
        expect(budget.abortController?.signal.aborted).toBe(true);
        expect(budget.breachDiagnostic).toEqual(second.Diagnostic);
    });

    it('evaluates wall-clock duration cap from workflowStartedAtMs and preserves legacy tree messages', () => {
        const t0 = 1_700_000_000_000;
        const budget = CreateWorkflowBudget({
            MaxTreeDurationMs: 1_000,
            WorkflowStartedAtMs: t0,
        });

        const preBreach = ComputeWorkflowBudgetHeadroom(budget, t0 + 400);
        expect(preBreach.ElapsedWallClockMs).toBe(400);
        expect(preBreach.RemainingWallClockMs).toBe(600);

        const check = EvaluateWorkflowBudgetCaps(budget, { SourceScope: 'AgentTree' }, t0 + 1_250);
        expect(check.Exceeded).toBe(true);
        expect(check.Diagnostic?.Code).toBe('WORKFLOW_DURATION_LIMIT_EXCEEDED');
        expect(check.Diagnostic?.Dimension).toBe('WallClockMs');
        expect(check.Diagnostic?.ElapsedWallClockMs).toBe(1_250);
        expect(check.Diagnostic?.Reason).toBe('Agent tree duration budget exceeded (1250ms/1000ms across tree)');
        expect(budget.abortController?.signal.aborted).toBe(true);
    });

    it('synchronizes in place without breaking shared reference equality across caller and sub-agents', () => {
        const legacyBudget = {
            maxTreeCost: 1.25,
            totalSteps: 2,
            totalTokens: 100,
            totalCost: 0.4,
            startedAtMs: 5_000,
        };
        const synced = SynchronizeWorkflowBudget(legacyBudget, {
            WorkflowMaxDurationMs: 20_000,
            WorkflowStartedAtMs: 4_000,
        });

        expect(synced).toBe(legacyBudget);
        expect(synced.startedAtMs).toBe(4_000);
        expect(synced.workflowStartedAtMs).toBe(4_000);
        expect(synced.cumulativeCostUsd).toBe(0.4);
        expect(synced.workflowMaxDurationMs).toBe(20_000);
        expect(synced.abortController).toBeDefined();
    });

    it('extracts workflowMaxCostUsd and workflowMaxDurationMs into Tier-5 RunOverride limits', () => {
        const extracted = ExtractRunOverrideLimits({
            workflowMaxCostUsd: 3.75,
            workflowMaxDurationMs: 15_000,
        });

        expect(extracted.Budgets?.PerRun?.MaxCostUsd).toBe(3.75);
        expect(extracted.Budgets?.PerRun?.MaxWallClockMs).toBe(15_000);
    });
});
