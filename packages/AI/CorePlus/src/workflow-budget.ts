/**
 * @fileoverview Strongly-typed whole-workflow USD cost and wall-clock duration budget
 * contracts and atomic in-memory accumulation/evaluation helpers.
 *
 * Designed to unify root-to-leaf AI Agent execution trees (`AgentTreeBudget`) and
 * multi-node `TaskGraph` workflows under a single deterministic budget contract without
 * breaking existing callers that omit workflow-level caps.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { AgentTreeBudget } from './agent-types';

/** Dimension breached by a whole-workflow or root-tree execution limit. */
export type WorkflowBudgetDimension = 'CostUsd' | 'WallClockMs' | 'Tokens' | 'Steps';

/** Machine-readable diagnostic code emitted on workflow/tree limit breach. */
export type WorkflowBudgetBreachCode =
    | 'WORKFLOW_COST_LIMIT_EXCEEDED'
    | 'WORKFLOW_DURATION_LIMIT_EXCEEDED'
    | 'WORKFLOW_TOKEN_LIMIT_EXCEEDED'
    | 'WORKFLOW_STEP_LIMIT_EXCEEDED';

/** Execution layer that detected or attributed the budget breach. */
export type WorkflowBudgetSourceScope = 'Workflow' | 'TaskGraph' | 'AgentTree';

/**
 * Whole-workflow USD cost and wall-clock duration cap configuration.
 */
export interface WorkflowBudgetCapsConfig {
    /** Maximum cumulative USD cost permitted across the entire workflow run. */
    MaxCostUsd?: number;
    /** Maximum wall-clock duration in milliseconds measured from workflow start. */
    MaxWallClockMs?: number;
    /** Explicit workflow start epoch timestamp (`Date.now()`); defaults to initialization time. */
    StartedAtMs?: number;
}

/**
 * Optional caller attribution metadata attached when recording usage or evaluating caps.
 */
export interface WorkflowBudgetAttributionContext {
    SourceScope?: WorkflowBudgetSourceScope;
    AgentName?: string;
    RunID?: string;
    TaskID?: string;
}

/**
 * Structured diagnostic payload returned whenever a whole-workflow or agent-tree
 * cost, wall-clock duration, token, or step limit is exceeded.
 */
export interface WorkflowBudgetBreachDiagnostic {
    Code: WorkflowBudgetBreachCode;
    Dimension: WorkflowBudgetDimension;
    Limit: number;
    CumulativeCostUsd: number;
    ElapsedWallClockMs: number;
    WorkflowStartedAtMs: number;
    BreachedAtMs: number;
    CurrentValue: number;
    SourceScope: WorkflowBudgetSourceScope;
    BreachingAgentName?: string;
    BreachingRunID?: string;
    BreachingTaskID?: string;
    Reason: string;
}

/**
 * Result of evaluating whole-workflow cost and wall-clock duration caps.
 */
export interface WorkflowBudgetCheckResult {
    Exceeded: boolean;
    CumulativeCostUsd: number;
    ElapsedWallClockMs: number;
    RemainingCostUsd?: number;
    RemainingWallClockMs?: number;
    Diagnostic?: WorkflowBudgetBreachDiagnostic;
}

/**
 * Options accepted by {@link CreateWorkflowBudget} and {@link SynchronizeWorkflowBudget}.
 */
export interface CreateWorkflowBudgetOptions {
    MaxTreeSteps?: number;
    MaxTreeTokens?: number;
    MaxTreeCost?: number;
    MaxTreeDurationMs?: number;
    WorkflowMaxCostUsd?: number;
    WorkflowMaxDurationMs?: number;
    WorkflowStartedAtMs?: number;
    CreateAbortController?: boolean;
}

/**
 * Usage delta passed to {@link RecordWorkflowBudgetUsage}.
 */
export interface WorkflowBudgetUsageDelta {
    CostUsd?: number;
    Tokens?: number;
    Steps?: number;
}

function minFiniteNonNegative(a: number | undefined, b: number | undefined): number | undefined {
    const validA = typeof a === 'number' && Number.isFinite(a) && a >= 0 ? a : undefined;
    const validB = typeof b === 'number' && Number.isFinite(b) && b >= 0 ? b : undefined;
    if (validA !== undefined && validB !== undefined) {
        return Math.min(validA, validB);
    }
    return validA ?? validB;
}

function minFinitePositive(a: number | undefined, b: number | undefined): number | undefined {
    const validA = typeof a === 'number' && Number.isFinite(a) && a > 0 ? a : undefined;
    const validB = typeof b === 'number' && Number.isFinite(b) && b > 0 ? b : undefined;
    if (validA !== undefined && validB !== undefined) {
        return Math.min(validA, validB);
    }
    return validA ?? validB;
}

/**
 * Resolves the effective whole-workflow USD cost cap from either `workflowMaxCostUsd`
 * or `maxTreeCost` (taking the stricter ceiling when both are present).
 */
export function ResolveEffectiveWorkflowCostCap(budget: AgentTreeBudget | null | undefined): number | undefined {
    if (!budget) {
        return undefined;
    }
    return minFiniteNonNegative(budget.workflowMaxCostUsd, budget.maxTreeCost);
}

/**
 * Resolves the effective whole-workflow wall-clock duration cap in milliseconds from
 * either `workflowMaxDurationMs` or `maxTreeDurationMs` (taking the stricter ceiling).
 */
export function ResolveEffectiveWorkflowDurationCapMs(budget: AgentTreeBudget | null | undefined): number | undefined {
    if (!budget) {
        return undefined;
    }
    return minFinitePositive(budget.workflowMaxDurationMs, budget.maxTreeDurationMs);
}

/**
 * Resolves the authoritative root workflow start timestamp in epoch milliseconds.
 */
export function ResolveWorkflowStartedAtMs(budget: AgentTreeBudget | null | undefined, fallbackNowMs: number = Date.now()): number {
    if (!budget) {
        return fallbackNowMs;
    }
    const wfStart = typeof budget.workflowStartedAtMs === 'number' && Number.isFinite(budget.workflowStartedAtMs)
        ? budget.workflowStartedAtMs
        : undefined;
    const treeStart = typeof budget.startedAtMs === 'number' && Number.isFinite(budget.startedAtMs)
        ? budget.startedAtMs
        : undefined;
    if (wfStart !== undefined && treeStart !== undefined) {
        return Math.min(wfStart, treeStart);
    }
    return wfStart ?? treeStart ?? fallbackNowMs;
}

/**
 * Resolves the authoritative cumulative USD cost accrued across the shared budget tracker.
 */
export function ResolveCumulativeWorkflowCostUsd(budget: AgentTreeBudget | null | undefined): number {
    if (!budget) {
        return 0;
    }
    const total = typeof budget.totalCost === 'number' && Number.isFinite(budget.totalCost) ? Math.max(0, budget.totalCost) : 0;
    const cumulative =
        typeof budget.cumulativeCostUsd === 'number' && Number.isFinite(budget.cumulativeCostUsd)
            ? Math.max(0, budget.cumulativeCostUsd)
            : 0;
    return Math.max(total, cumulative);
}

/**
 * Creates a new shared {@link AgentTreeBudget} instance carrying synchronized workflow-level
 * USD cost ceilings, wall-clock start timestamp, wall-clock duration caps, cumulative
 * accumulators, and an optional shared `AbortController` for concurrent branch cancellation.
 */
export function CreateWorkflowBudget(
    options: CreateWorkflowBudgetOptions = {},
    nowMs: number = Date.now(),
): AgentTreeBudget {
    const startedAtMs =
        typeof options.WorkflowStartedAtMs === 'number' && Number.isFinite(options.WorkflowStartedAtMs)
            ? options.WorkflowStartedAtMs
            : nowMs;
    const effectiveCost = minFiniteNonNegative(options.WorkflowMaxCostUsd, options.MaxTreeCost);
    const effectiveDuration = minFinitePositive(options.WorkflowMaxDurationMs, options.MaxTreeDurationMs);
    const hasCaps =
        effectiveCost !== undefined ||
        effectiveDuration !== undefined ||
        options.MaxTreeSteps !== undefined ||
        options.MaxTreeTokens !== undefined;
    const shouldCreateAbort = options.CreateAbortController ?? hasCaps;

    return {
        ...(options.MaxTreeSteps !== undefined ? { maxTreeSteps: options.MaxTreeSteps } : {}),
        ...(options.MaxTreeTokens !== undefined ? { maxTreeTokens: options.MaxTreeTokens } : {}),
        ...(options.MaxTreeCost !== undefined ? { maxTreeCost: options.MaxTreeCost } : {}),
        ...(options.MaxTreeDurationMs !== undefined ? { maxTreeDurationMs: options.MaxTreeDurationMs } : {}),
        ...(options.WorkflowMaxCostUsd !== undefined ? { workflowMaxCostUsd: options.WorkflowMaxCostUsd } : {}),
        ...(options.WorkflowMaxDurationMs !== undefined ? { workflowMaxDurationMs: options.WorkflowMaxDurationMs } : {}),
        workflowStartedAtMs: startedAtMs,
        totalSteps: 0,
        totalTokens: 0,
        totalCost: 0,
        cumulativeCostUsd: 0,
        startedAtMs,
        lastUpdatedAtMs: startedAtMs,
        ...(shouldCreateAbort ? { abortController: new AbortController() } : {}),
    };
}

/**
 * Synchronizes missing ceilings, start timestamp, cumulative accumulator parity, and optional
 * `AbortController` onto an existing {@link AgentTreeBudget} in place without replacing its
 * object reference.
 */
export function SynchronizeWorkflowBudget(
    budget: AgentTreeBudget,
    overrides: CreateWorkflowBudgetOptions = {},
): AgentTreeBudget {
    if (budget.maxTreeSteps === undefined && overrides.MaxTreeSteps !== undefined) {
        budget.maxTreeSteps = overrides.MaxTreeSteps;
    }
    if (budget.maxTreeTokens === undefined && overrides.MaxTreeTokens !== undefined) {
        budget.maxTreeTokens = overrides.MaxTreeTokens;
    }
    if (budget.maxTreeCost === undefined && overrides.MaxTreeCost !== undefined) {
        budget.maxTreeCost = overrides.MaxTreeCost;
    }
    if (budget.maxTreeDurationMs === undefined && overrides.MaxTreeDurationMs !== undefined) {
        budget.maxTreeDurationMs = overrides.MaxTreeDurationMs;
    }
    if (budget.workflowMaxCostUsd === undefined && overrides.WorkflowMaxCostUsd !== undefined) {
        budget.workflowMaxCostUsd = overrides.WorkflowMaxCostUsd;
    }
    if (budget.workflowMaxDurationMs === undefined && overrides.WorkflowMaxDurationMs !== undefined) {
        budget.workflowMaxDurationMs = overrides.WorkflowMaxDurationMs;
    }

    const earlierStart =
        typeof overrides.WorkflowStartedAtMs === 'number' && Number.isFinite(overrides.WorkflowStartedAtMs)
            ? Math.min(ResolveWorkflowStartedAtMs(budget), overrides.WorkflowStartedAtMs)
            : ResolveWorkflowStartedAtMs(budget);
    budget.workflowStartedAtMs = earlierStart;
    budget.startedAtMs = earlierStart;

    const syncedCost = ResolveCumulativeWorkflowCostUsd(budget);
    budget.totalCost = syncedCost;
    budget.cumulativeCostUsd = syncedCost;

    const hasCaps =
        ResolveEffectiveWorkflowCostCap(budget) !== undefined ||
        ResolveEffectiveWorkflowDurationCapMs(budget) !== undefined ||
        budget.maxTreeSteps !== undefined ||
        budget.maxTreeTokens !== undefined;
    if (!budget.abortController && (overrides.CreateAbortController || hasCaps)) {
        budget.abortController = new AbortController();
    }
    if (budget.breachedReason && budget.abortController && !budget.abortController.signal.aborted) {
        budget.abortController.abort(budget.breachedReason);
    }
    return budget;
}

/**
 * Computes current cumulative USD spend, elapsed wall-clock time, and remaining headroom.
 */
export function ComputeWorkflowBudgetHeadroom(
    budget: AgentTreeBudget,
    nowMs: number = Date.now(),
): {
    CumulativeCostUsd: number;
    ElapsedWallClockMs: number;
    RemainingCostUsd?: number;
    RemainingWallClockMs?: number;
} {
    const cumulativeCostUsd = ResolveCumulativeWorkflowCostUsd(budget);
    const startedAtMs = ResolveWorkflowStartedAtMs(budget, nowMs);
    const elapsedWallClockMs = Math.max(0, nowMs - startedAtMs);
    const costCap = ResolveEffectiveWorkflowCostCap(budget);
    const durationCap = ResolveEffectiveWorkflowDurationCapMs(budget);

    return {
        CumulativeCostUsd: cumulativeCostUsd,
        ElapsedWallClockMs: elapsedWallClockMs,
        ...(costCap !== undefined ? { RemainingCostUsd: Math.max(0, costCap - cumulativeCostUsd) } : {}),
        ...(durationCap !== undefined ? { RemainingWallClockMs: Math.max(0, durationCap - elapsedWallClockMs) } : {}),
    };
}

function stampBreach(
    budget: AgentTreeBudget,
    diagnostic: WorkflowBudgetBreachDiagnostic,
): WorkflowBudgetCheckResult {
    budget.breachDiagnostic = diagnostic;
    budget.breachedReason = diagnostic.Reason;
    if (budget.abortController && !budget.abortController.signal.aborted) {
        budget.abortController.abort(diagnostic.Reason);
    }
    return {
        Exceeded: true,
        CumulativeCostUsd: diagnostic.CumulativeCostUsd,
        ElapsedWallClockMs: diagnostic.ElapsedWallClockMs,
        RemainingCostUsd: ResolveEffectiveWorkflowCostCap(budget) !== undefined ? 0 : undefined,
        RemainingWallClockMs: ResolveEffectiveWorkflowDurationCapMs(budget) !== undefined ? 0 : undefined,
        Diagnostic: diagnostic,
    };
}

/**
 * Evaluates all whole-workflow and root-tree ceilings (steps, tokens, USD cost, wall-clock
 * duration) against `budget`, stamping `breachDiagnostic`, `breachedReason`, and triggering
 * `abortController.abort(...)` deterministically upon first breach.
 */
export function EvaluateWorkflowBudgetCaps(
    budget: AgentTreeBudget,
    context: WorkflowBudgetAttributionContext = {},
    nowMs: number = Date.now(),
): WorkflowBudgetCheckResult {
    const startedAtMs = ResolveWorkflowStartedAtMs(budget, nowMs);
    const headroom = ComputeWorkflowBudgetHeadroom(budget, nowMs);
    const sourceScope: WorkflowBudgetSourceScope = context.SourceScope ?? 'AgentTree';

    if (budget.breachDiagnostic) {
        if (budget.abortController && !budget.abortController.signal.aborted) {
            budget.abortController.abort(budget.breachDiagnostic.Reason);
        }
        return {
            Exceeded: true,
            CumulativeCostUsd: Math.max(headroom.CumulativeCostUsd, budget.breachDiagnostic.CumulativeCostUsd),
            ElapsedWallClockMs: Math.max(headroom.ElapsedWallClockMs, budget.breachDiagnostic.ElapsedWallClockMs),
            ...(headroom.RemainingCostUsd !== undefined ? { RemainingCostUsd: 0 } : {}),
            ...(headroom.RemainingWallClockMs !== undefined ? { RemainingWallClockMs: 0 } : {}),
            Diagnostic: budget.breachDiagnostic,
        };
    }

    if (budget.maxTreeSteps != null && budget.totalSteps >= budget.maxTreeSteps) {
        const reason =
            budget.breachedReason ??
            `Agent tree step budget exceeded (${budget.totalSteps}/${budget.maxTreeSteps} total steps across tree)`;
        return stampBreach(budget, {
            Code: 'WORKFLOW_STEP_LIMIT_EXCEEDED',
            Dimension: 'Steps',
            Limit: budget.maxTreeSteps,
            CumulativeCostUsd: headroom.CumulativeCostUsd,
            ElapsedWallClockMs: headroom.ElapsedWallClockMs,
            WorkflowStartedAtMs: startedAtMs,
            BreachedAtMs: nowMs,
            CurrentValue: budget.totalSteps,
            SourceScope: sourceScope,
            ...(context.AgentName ? { BreachingAgentName: context.AgentName } : {}),
            ...(context.RunID ? { BreachingRunID: context.RunID } : {}),
            ...(context.TaskID ? { BreachingTaskID: context.TaskID } : {}),
            Reason: reason,
        });
    }

    if (budget.maxTreeTokens != null && budget.totalTokens >= budget.maxTreeTokens) {
        const reason =
            budget.breachedReason ??
            `Agent tree token budget exceeded (${budget.totalTokens}/${budget.maxTreeTokens} total tokens across tree)`;
        return stampBreach(budget, {
            Code: 'WORKFLOW_TOKEN_LIMIT_EXCEEDED',
            Dimension: 'Tokens',
            Limit: budget.maxTreeTokens,
            CumulativeCostUsd: headroom.CumulativeCostUsd,
            ElapsedWallClockMs: headroom.ElapsedWallClockMs,
            WorkflowStartedAtMs: startedAtMs,
            BreachedAtMs: nowMs,
            CurrentValue: budget.totalTokens,
            SourceScope: sourceScope,
            ...(context.AgentName ? { BreachingAgentName: context.AgentName } : {}),
            ...(context.RunID ? { BreachingRunID: context.RunID } : {}),
            ...(context.TaskID ? { BreachingTaskID: context.TaskID } : {}),
            Reason: reason,
        });
    }

    const effectiveCostCap = ResolveEffectiveWorkflowCostCap(budget);
    if (effectiveCostCap !== undefined && headroom.CumulativeCostUsd >= effectiveCostCap) {
        const isExplicitWorkflowOnly = budget.workflowMaxCostUsd !== undefined && budget.maxTreeCost === undefined;
        const reason =
            budget.breachedReason ??
            (isExplicitWorkflowOnly
                ? `Workflow USD cost budget exceeded ($${headroom.CumulativeCostUsd.toFixed(4)}/$${effectiveCostCap.toFixed(4)}; elapsed ${headroom.ElapsedWallClockMs}ms)`
                : `Agent tree cost budget exceeded ($${headroom.CumulativeCostUsd.toFixed(4)}/$${effectiveCostCap.toFixed(4)} across tree)`);
        return stampBreach(budget, {
            Code: 'WORKFLOW_COST_LIMIT_EXCEEDED',
            Dimension: 'CostUsd',
            Limit: effectiveCostCap,
            CumulativeCostUsd: headroom.CumulativeCostUsd,
            ElapsedWallClockMs: headroom.ElapsedWallClockMs,
            WorkflowStartedAtMs: startedAtMs,
            BreachedAtMs: nowMs,
            CurrentValue: headroom.CumulativeCostUsd,
            SourceScope: isExplicitWorkflowOnly ? (context.SourceScope ?? 'Workflow') : sourceScope,
            ...(context.AgentName ? { BreachingAgentName: context.AgentName } : {}),
            ...(context.RunID ? { BreachingRunID: context.RunID } : {}),
            ...(context.TaskID ? { BreachingTaskID: context.TaskID } : {}),
            Reason: reason,
        });
    }

    const effectiveDurationCap = ResolveEffectiveWorkflowDurationCapMs(budget);
    if (effectiveDurationCap !== undefined && headroom.ElapsedWallClockMs >= effectiveDurationCap) {
        const isExplicitWorkflowOnly = budget.workflowMaxDurationMs !== undefined && budget.maxTreeDurationMs === undefined;
        const reason =
            budget.breachedReason ??
            (isExplicitWorkflowOnly
                ? `Workflow wall-clock duration budget exceeded (${headroom.ElapsedWallClockMs}ms/${effectiveDurationCap}ms; cumulative cost $${headroom.CumulativeCostUsd.toFixed(4)})`
                : `Agent tree duration budget exceeded (${headroom.ElapsedWallClockMs}ms/${effectiveDurationCap}ms across tree)`);
        return stampBreach(budget, {
            Code: 'WORKFLOW_DURATION_LIMIT_EXCEEDED',
            Dimension: 'WallClockMs',
            Limit: effectiveDurationCap,
            CumulativeCostUsd: headroom.CumulativeCostUsd,
            ElapsedWallClockMs: headroom.ElapsedWallClockMs,
            WorkflowStartedAtMs: startedAtMs,
            BreachedAtMs: nowMs,
            CurrentValue: headroom.ElapsedWallClockMs,
            SourceScope: isExplicitWorkflowOnly ? (context.SourceScope ?? 'Workflow') : sourceScope,
            ...(context.AgentName ? { BreachingAgentName: context.AgentName } : {}),
            ...(context.RunID ? { BreachingRunID: context.RunID } : {}),
            ...(context.TaskID ? { BreachingTaskID: context.TaskID } : {}),
            Reason: reason,
        });
    }

    if (budget.breachedReason) {
        return stampBreach(budget, {
            Code: 'WORKFLOW_COST_LIMIT_EXCEEDED',
            Dimension: 'CostUsd',
            Limit: effectiveCostCap ?? 0,
            CumulativeCostUsd: headroom.CumulativeCostUsd,
            ElapsedWallClockMs: headroom.ElapsedWallClockMs,
            WorkflowStartedAtMs: startedAtMs,
            BreachedAtMs: nowMs,
            CurrentValue: headroom.CumulativeCostUsd,
            SourceScope: sourceScope,
            ...(context.AgentName ? { BreachingAgentName: context.AgentName } : {}),
            ...(context.RunID ? { BreachingRunID: context.RunID } : {}),
            ...(context.TaskID ? { BreachingTaskID: context.TaskID } : {}),
            Reason: budget.breachedReason,
        });
    }

    return {
        Exceeded: false,
        CumulativeCostUsd: headroom.CumulativeCostUsd,
        ElapsedWallClockMs: headroom.ElapsedWallClockMs,
        ...(headroom.RemainingCostUsd !== undefined ? { RemainingCostUsd: headroom.RemainingCostUsd } : {}),
        ...(headroom.RemainingWallClockMs !== undefined ? { RemainingWallClockMs: headroom.RemainingWallClockMs } : {}),
    };
}

/**
 * Synchronously (atomically within the JS event-loop turn) records incremental cost, token,
 * and step deltas into the shared `budget` and immediately evaluates caps, firing
 * `budget.abortController` if a ceiling is breached.
 */
export function RecordWorkflowBudgetUsage(
    budget: AgentTreeBudget,
    delta: WorkflowBudgetUsageDelta,
    context: WorkflowBudgetAttributionContext = {},
    nowMs: number = Date.now(),
): WorkflowBudgetCheckResult {
    const costDelta = typeof delta.CostUsd === 'number' && Number.isFinite(delta.CostUsd) && delta.CostUsd > 0 ? delta.CostUsd : 0;
    const tokensDelta = typeof delta.Tokens === 'number' && Number.isFinite(delta.Tokens) && delta.Tokens > 0 ? delta.Tokens : 0;
    const stepsDelta = typeof delta.Steps === 'number' && Number.isFinite(delta.Steps) && delta.Steps > 0 ? delta.Steps : 0;

    const currentCost = ResolveCumulativeWorkflowCostUsd(budget);
    const nextCost = currentCost + costDelta;
    budget.totalCost = nextCost;
    budget.cumulativeCostUsd = nextCost;
    budget.totalTokens += tokensDelta;
    budget.totalSteps += stepsDelta;
    budget.lastUpdatedAtMs = nowMs;

    return EvaluateWorkflowBudgetCaps(budget, context, nowMs);
}
