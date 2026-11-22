/**
 * @fileoverview Debug/runner state for a task graph — pause, single-step, breakpoints, and edge
 * overrides — expressed as durable, declarative state the dispatcher's claim filter consults.
 *
 * **Why state, not hooks.** The dispatcher is multi-instance and survives restarts; a callback
 * registered in one process gates nothing on the peer that actually wins a claim, and dies with the
 * process. A flag on the parent row gates every instance uniformly, works when "start paused" is set
 * before any dispatcher has seen the graph, and holds across a deploy. The debugger and the
 * dispatcher never talk directly — they rendezvous on the row, which is this engine's native
 * coordination idiom (the claim protocol itself is nothing but CAS'd shared state).
 *
 * **Why every control is a gate on CLAIMING, never on running.** A claimed task can never be
 * interrupted mid-flight anyway — only the next claim can be prevented. So `paused` means "nothing
 * new starts; in-flight work finishes and its completions land", a breakpoint is an authored hold
 * (the exact mechanism `holdTaskIDs` already implements for unevaluable conditions, driven by user
 * intent instead of a broken guard), and `step` is a one-shot claim allowance consumed CAS-style so
 * exactly one instance honors it.
 *
 * The state lives under `$.debug` in the parent Task's `InputPayload` bag, beside the continuation
 * marker, and is written only through `TaskClaimStore`'s guarded `JSON_MODIFY` statements — the same
 * two-writer discipline that protects the marker.
 *
 * @module @memberjunction/task-graph
 */
import { IsPlainObject, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import type {
    BudgetBreachDetail,
    BudgetDimension,
    BudgetScope,
    CumulativeBudgetLedger,
    RunawayJsonObject,
    RunawayJsonValue,
    RunawayPauseReason,
} from '@memberjunction/ai-core-plus';

/** What a step allowance permits: one task, the current frontier, or one named task. */
export type StepTarget = 'one' | 'wave' | string;

/** A user's answer for an edge whose condition they have overridden. */
export type EdgeOverrideVerdict = 'true' | 'false';

/** Pause reason identifying a governance-initiated pause (`'governance'` or `'governance:<detail>'`). */
export type GovernancePausedReason = 'governance' | `governance:${string}`;

/** Returns true when `reason` identifies a governance pause rather than an ordinary debugger pause. */
export function IsGovernancePausedReason(reason: RunawayJsonValue | undefined): reason is GovernancePausedReason {
    return reason === 'governance' || (typeof reason === 'string' && reason.startsWith('governance:'));
}

/**
 * Durable governance pause envelope serialized into `$.debug.pendingCheckpointContext`
 * whenever `$.debug.paused` is written while the submitting `MJ: AI Agent Runs` checkpoint
 * has not yet persisted (`checkpointPersisted === false`).
 */
export interface PendingGovernanceCheckpointContext {
    reason: RunawayPauseReason;
    reasonDetail: string;
    scope: BudgetScope | null;
    dimension: BudgetDimension | null;
    triggerValue: number | null;
    thresholdValue: number | null;
    pausedAtIso: string;
    pausedAtIteration: number;
    submittingAgentRunId: string | null;
    completedTaskIds: string[];
    cumulativeLedger?: CumulativeBudgetLedger;
    budgetBreach?: BudgetBreachDetail;
}

/**
 * The durable debug state of one graph.
 *
 * Everything optional: the empty object is "no debugging", and a graph submitted before this existed
 * parses to exactly that.
 */
export type TaskGraphDebugState = {
    /** Nothing new is claimed while true. In-flight tasks finish naturally. */
    paused?: boolean;
    /** Who paused it — informational, for the console and the frame. */
    pausedBy?: string | null;
    /** Whether a person paused it, a breakpoint did, or budget/runaway governance did. */
    pausedReason?: 'user' | 'breakpoint' | GovernancePausedReason;
    /**
     * Dedicated durable governance-approval-required marker set when governance pauses the graph
     * and cleared ONLY by `TaskGraphGovernanceCoordinator.ClearDebugPauseFields` inside `ApproveAndResumePausedGraph`.
     */
    governancePauseActive?: boolean;
    /** The task whose breakpoint fired, when `pausedReason` is `'breakpoint'`. */
    pausedAtTaskID?: string | null;
    /** Task IDs the dispatcher pauses the graph on, before claiming them. */
    breakpoints?: string[];
    /**
     * One-shot claim allowance while paused. Consumed atomically (CAS) by the instance that honors
     * it, so two dispatchers polling the same paused graph release work exactly once.
     */
    step?: StepTarget;
    /**
     * Continue from a breakpoint: this task's breakpoint is ignored for one claim so the stopped
     * step actually runs. Without this, Resume clears `paused` and the next poll re-hits the same
     * still-eligible breakpoint without claiming anything — a ForEach on the last step never starts.
     */
    skipBreakpointTaskID?: string | null;
    /**
     * Authored verdicts for edges whose conditions the user has overridden, keyed by
     * `MJ: Task Dependencies` row ID. `'false'` drops the edge (branch not taken → skip cascade);
     * `'true'` satisfies it. The operator-grade escape hatch for a held graph — durable, so it
     * survives restarts and is honored by every instance.
     */
    edgeOverrides?: Record<string, EdgeOverrideVerdict>;
    /**
     * For governance pauses (`pausedReason === 'governance'`), records whether the submitting
     * `MJ: AI Agent Runs` checkpoint has been durably persisted. When `false`, any replacement
     * dispatcher must reconstruct `PendingPauseContext`, keep claims blocked, suppress `GraphPaused`,
     * and flush the checkpoint before announcing `GraphPaused`.
     */
    checkpointPersisted?: boolean;
    /**
     * Durable serialized governance pause envelope written when `checkpointPersisted === false`.
     */
    pendingCheckpointContext?: PendingGovernanceCheckpointContext | null;
};

/** What the claim gate decided for one graph on one pass. */
export type ClaimGateDecision =
    /** Not paused, no breakpoint in the eligible set — claim normally. */
    | { mode: 'open' }
    /** Paused with no step allowance — claim nothing, notify nobody. */
    | { mode: 'closed' }
    /**
     * Paused with a step allowance — the caller may claim `taskIDs` this pass (after consuming the
     * marker CAS-style; a lost consume means another instance is stepping).
     */
    | { mode: 'step'; taskIDs: string[] }
    /**
     * An eligible task has a breakpoint — the caller should pause the graph (CAS), announce
     * `BreakpointHit`, and claim nothing this pass.
     */
    | { mode: 'breakpoint'; taskID: string };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_RUNAWAY_PAUSE_REASONS: ReadonlySet<RunawayPauseReason> = new Set<RunawayPauseReason>([
    'BudgetExceeded',
    'ProgressStalled',
    'LedgerUnavailable',
    'ManualPause',
    'FastJudgeStalled',
]);

const VALID_BUDGET_SCOPES: ReadonlySet<BudgetScope> = new Set<BudgetScope>([
    'PerRun',
    'PerRoutine',
    'PerUserPerDay',
]);

const VALID_BUDGET_DIMENSIONS: ReadonlySet<BudgetDimension> = new Set<BudgetDimension>([
    'CostUsd',
    'WallClockMs',
    'Tokens',
]);

/** True for values JSON round-trips or hand edits commonly produce for a boolean. */
function readBool(value: RunawayJsonValue | undefined): boolean {
    return value === true || value === 'true';
}

function readOptionalTriStateBool(value: RunawayJsonValue | undefined): boolean | undefined {
    if (value === true || value === 'true' || value === 1) return true;
    if (value === false || value === 'false' || value === 0) return false;
    return undefined;
}

function readFiniteNumber(value: RunawayJsonValue | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parsePendingCheckpointContext(
    raw: RunawayJsonValue | undefined,
): PendingGovernanceCheckpointContext | null {
    const obj = typeof raw === 'string'
        ? SafeJSONParse<RunawayJsonObject>(raw)
        : (IsPlainObject(raw) ? raw : null);
    if (!obj) return null;

    const reasonRaw = obj['reason'];
    if (typeof reasonRaw !== 'string' || !VALID_RUNAWAY_PAUSE_REASONS.has(reasonRaw as RunawayPauseReason)) {
        return null;
    }
    const reason = reasonRaw as RunawayPauseReason;
    const reasonDetail = typeof obj['reasonDetail'] === 'string' ? obj['reasonDetail'] : '';
    const scopeRaw = obj['scope'];
    const scope = typeof scopeRaw === 'string' && VALID_BUDGET_SCOPES.has(scopeRaw as BudgetScope)
        ? (scopeRaw as BudgetScope)
        : null;
    const dimRaw = obj['dimension'];
    const dimension = typeof dimRaw === 'string' && VALID_BUDGET_DIMENSIONS.has(dimRaw as BudgetDimension)
        ? (dimRaw as BudgetDimension)
        : null;
    const pausedAtIso = typeof obj['pausedAtIso'] === 'string' ? obj['pausedAtIso'] : new Date().toISOString();
    const iterRaw = obj['pausedAtIteration'];
    const pausedAtIteration = typeof iterRaw === 'number' && Number.isFinite(iterRaw) ? Math.max(0, Math.trunc(iterRaw)) : 1;
    const subRunRaw = obj['submittingAgentRunId'];
    const submittingAgentRunId = typeof subRunRaw === 'string' && subRunRaw.trim().length > 0 ? subRunRaw.trim() : null;
    const completedRaw = obj['completedTaskIds'];
    const completedTaskIds = Array.isArray(completedRaw)
        ? completedRaw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];

    const parsed: PendingGovernanceCheckpointContext = {
        reason,
        reasonDetail,
        scope,
        dimension,
        triggerValue: readFiniteNumber(obj['triggerValue']),
        thresholdValue: readFiniteNumber(obj['thresholdValue']),
        pausedAtIso,
        pausedAtIteration,
        submittingAgentRunId,
        completedTaskIds,
    };

    const ledgerRaw = obj['cumulativeLedger'];
    if (IsPlainObject(ledgerRaw) && typeof ledgerRaw['RunCostUsd'] === 'number') {
        parsed.cumulativeLedger = ledgerRaw as Partial<CumulativeBudgetLedger> as CumulativeBudgetLedger;
    }
    const breachRaw = obj['budgetBreach'];
    if (IsPlainObject(breachRaw) && typeof breachRaw['Scope'] === 'string' && typeof breachRaw['Reason'] === 'string') {
        parsed.budgetBreach = breachRaw as Partial<BudgetBreachDetail> as BudgetBreachDetail;
    }

    return parsed;
}

/**
 * Parses a parent Task's debug state from its `InputPayload` bag.
 *
 * Mirrors `ParseTaskGraphParentMetadata`'s posture exactly: unparseable input is a legitimate state
 * (a row predating this, a hand edit), and the right reading of "I don't know" is "not being
 * debugged" — never a throw, and never a guess that could gate real work on garbage.
 */
export function ParseTaskGraphDebugState(raw: string | null | undefined): TaskGraphDebugState {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as { debug?: RunawayJsonValue };
        const debug = parsed && typeof parsed === 'object' ? parsed.debug : undefined;
        if (!IsPlainObject(debug)) return {};
        const d = debug;
        const state: TaskGraphDebugState = {};
        if (readBool(d['paused'])) state.paused = true;
        if (typeof d['pausedBy'] === 'string') state.pausedBy = d['pausedBy'];
        const pr = d['pausedReason'];
        if (pr === 'user' || pr === 'breakpoint' || IsGovernancePausedReason(pr)) {
            state.pausedReason = pr;
        }
        if (readBool(d['governancePauseActive'])) {
            state.governancePauseActive = true;
        }
        if (typeof d['pausedAtTaskID'] === 'string') state.pausedAtTaskID = d['pausedAtTaskID'];
        if (typeof d['skipBreakpointTaskID'] === 'string') state.skipBreakpointTaskID = d['skipBreakpointTaskID'];
        if (Array.isArray(d['breakpoints'])) {
            const ids = d['breakpoints'].filter((b): b is string => typeof b === 'string' && UUID_SHAPE.test(b));
            if (ids.length > 0) state.breakpoints = ids;
        }
        const step = d['step'];
        if (step === 'one' || step === 'wave' || (typeof step === 'string' && UUID_SHAPE.test(step))) {
            state.step = step;
        }
        const edgeOverrides = d['edgeOverrides'];
        if (IsPlainObject(edgeOverrides)) {
            const overrides: Record<string, EdgeOverrideVerdict> = {};
            for (const [edgeID, verdict] of Object.entries(edgeOverrides)) {
                if (UUID_SHAPE.test(edgeID) && (verdict === 'true' || verdict === 'false')) {
                    overrides[edgeID] = verdict;
                }
            }
            if (Object.keys(overrides).length > 0) state.edgeOverrides = overrides;
        }
        const cpPersisted = readOptionalTriStateBool(d['checkpointPersisted']);
        if (cpPersisted !== undefined) {
            state.checkpointPersisted = cpPersisted;
        }
        const pendingCtx = parsePendingCheckpointContext(d['pendingCheckpointContext']);
        if (pendingCtx) {
            state.pendingCheckpointContext = pendingCtx;
        }
        return state;
    } catch {
        return {};
    }
}

/**
 * Returns true when `$.debug` carries any active durable governance pause marker
 * (`governancePauseActive === true`, a governance `pausedReason`, `checkpointPersisted === false`,
 * or a non-null `pendingCheckpointContext`), even if an ordinary debugger operation altered `paused`.
 */
export function IsGovernanceDebugPause(debug: TaskGraphDebugState): boolean {
    if (debug.governancePauseActive === true) {
        return true;
    }
    if (debug.pendingCheckpointContext != null || debug.checkpointPersisted === false) {
        return true;
    }
    return IsGovernancePausedReason(debug.pausedReason);
}

/**
 * Decides what the claim filter may do for one graph this pass, given its debug state and the tasks
 * that are otherwise eligible.
 *
 * Pure by design — the CAS writes (consuming the step marker, pausing at the breakpoint) stay with
 * the dispatcher, and this function only says which of them to attempt. Precedence:
 *
 *  1. **Paused** wins over everything, including breakpoints — a paused graph claims nothing unless
 *     a step allowance releases work, and a breakpoint inside a paused graph is moot.
 *  2. **Breakpoints** fire before any claim: the FIRST eligible task carrying one pauses the whole
 *     graph, so no sibling of the breakpointed task starts either. That is what "pause here" means
 *     on a parallel graph — the alternative (claim the siblings, hold only the one task) turns a
 *     breakpoint into a per-task hold, which `holdTaskIDs` already is.
 *  3. Otherwise the gate is open.
 *
 * A named-step target that is not currently eligible releases nothing — the allowance stays for the
 * caller to keep or clear; stepping a task that cannot run must not release an arbitrary other one.
 */
export function DecideClaimGate(debug: TaskGraphDebugState, eligibleTaskIDs: readonly string[]): ClaimGateDecision {
    if (debug.paused) {
        if (!debug.step) return { mode: 'closed' };
        if (debug.step === 'wave') return { mode: 'step', taskIDs: [...eligibleTaskIDs] };
        if (debug.step === 'one') {
            return eligibleTaskIDs.length > 0 ? { mode: 'step', taskIDs: [eligibleTaskIDs[0]] } : { mode: 'closed' };
        }
        // A named task steps only itself, and only when it is genuinely eligible.
        const named = eligibleTaskIDs.find((id) => UUIDsEqual(id, debug.step!));
        return named ? { mode: 'step', taskIDs: [named] } : { mode: 'closed' };
    }

    if (debug.breakpoints && debug.breakpoints.length > 0) {
        const bp = eligibleTaskIDs.find((id) => isArmedBreakpoint(debug, id));
        if (bp) return { mode: 'breakpoint', taskID: bp };
    }

    return { mode: 'open' };
}

function isArmedBreakpoint(debug: TaskGraphDebugState, taskID: string): boolean {
    if (debug.skipBreakpointTaskID && UUIDsEqual(debug.skipBreakpointTaskID, taskID)) return false;
    return (debug.breakpoints ?? []).some((id) => UUIDsEqual(id, taskID));
}

/**
 * The verdict an edge override dictates, if one exists for this edge.
 *
 * Consulted BEFORE the condition is evaluated: an override exists precisely because the condition
 * cannot be answered (or answered wrongly), so evaluating first would re-produce the hold the
 * override exists to end.
 */
export function OverrideVerdictFor(
    debug: TaskGraphDebugState,
    edgeID: string,
): EdgeOverrideVerdict | undefined {
    return debug.edgeOverrides?.[edgeID];
}
