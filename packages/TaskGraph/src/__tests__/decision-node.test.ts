/**
 * A Decision node on the dispatcher, and what its answers mean to the edges that read them
 * (plan 4.2, 4.3 and 4.5).
 *
 * Three things are pinned here, and each is a way a judgment could silently become a wrong branch:
 *
 *  - the node makes ONE call for all its questions, and its answers reach both its output and the
 *    `decisions` condition root — a condition never calls a model;
 *  - an answer below its question's `minConfidence` makes the edges that read it unevaluable, so an
 *    ordinary edge holds and an exclusive group holds rather than guessing;
 *  - a failed decision holds too. It never reads as `false`, which is what a missing answer would
 *    otherwise do: `undefined === 'billing'` is a confident, wrong no.
 */
import { describe, it, expect, vi } from 'vitest';
import { UserInfo, type RunViewParams } from '@memberjunction/core';
import type { MJTaskDependencyEntity, MJTaskEntity } from '@memberjunction/core-entities';
import {
    CONDITION_ROOTS,
    ComputeEligibleTasks,
    ComputeTasksToBlock,
    DECISION_ANSWER_FIELDS,
    ResolveExclusiveGroups,
    TaskNode,
    type EdgeConditionOutcome,
    type EvaluatedEdge,
    type TaskGraphDecisionAnswer,
    type TaskGraphEdge,
    type TaskGraphNode,
    type TaskGraphNodeConfigMap,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { DispatcherConditionEvaluator } from '../DispatcherConditionEvaluator';
import {
    BuildConditionContext,
    DecideGate,
    DecisionHoldReason,
    EvaluateCondition,
    NO_DECISIONS,
    type ConditionInvocation,
    type ConditionVerdict,
    type GraphDecisions,
} from '../condition-gate';
import {
    BuildDecisionStepOutput,
    DecisionAnswerConfidence,
    DecisionStepOutputAnswers,
    DecisionsPayloadConflict,
    HeldDecisionAnswers,
    KeptDecisionAnswers,
    QuestionsToAsk,
    ReadDecisionStepConfiguration,
    ResolveDecisionState,
    ResolveGraphDecisions,
    StillHoldingDecisionOutput,
    type DecisionTaskRow,
} from '../decision-node';
import { SummarizeDecisionAnswers } from '../AIDecisionTaskRunner';
import {
    BuildStepConfiguration,
    DecisionPromptNameOf,
    FindUnrunnableKinds,
    PrepareTaskForRetry,
    RetryRefusal,
    type RetryableTask,
} from '../TaskGraphService';
import type { TaskDecisionRunner, TaskDecisionRunParams, TaskDecisionRunResult, TaskPromptRunner } from '../types';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────

const TRIAGE: TaskGraphNodeConfigMap['Decision'] = {
    state: 'payload.ticket',
    questions: {
        intent: {
            kind: 'Choice',
            instructions: 'Which team should handle this ticket?',
            options: [
                { value: 'billing', description: 'A question about an invoice or a charge.' },
                { value: 'refund', description: 'A request for money back.' },
                { value: 'other', description: 'Anything else.' },
            ],
            minConfidence: 0.7,
        },
        urgent: { kind: 'Likelihood', instructions: 'The customer cannot work until this is fixed.', minConfidence: 0.8 },
    },
};

const DECISION_PROMPT_ID = '8a1c2d33-0000-4000-8000-000000000001';
const PROMPT_RUN_ID = '8a1c2d33-0000-4000-8000-000000000002';
const SUBMITTING_RUN_ID = '8a1c2d33-0000-4000-8000-000000000003';

/** The stored Configuration of the `triage` step, as `BuildStepConfiguration` writes it. */
const TRIAGE_CONFIGURATION = JSON.stringify(BuildStepConfiguration(TaskNode.Decision(
    { tempId: 'triage', name: 'Triage the ticket', description: '', dependsOn: [] }, TRIAGE,
)));

const BILLING_CONFIDENT: Record<string, TaskGraphDecisionAnswer> = {
    intent: { value: 'billing', confidence: 0.92, probabilities: { billing: 0.92, refund: 0.05, other: 0.03 } },
    urgent: { probability: 0.1 },
};

/** The Task columns the dispatcher reads from a Decision step. */
type DecisionTaskFields = Pick<
    MJTaskEntity,
    'ID' | 'Name' | 'StepType' | 'PromptID' | 'ActionID' | 'AgentID' | 'ParentID' | 'Configuration' | 'ConfigurationObject' | 'OutputPayload'
>;

/** A Decision task row, the shape the dispatcher reads. A first run has no output yet. */
function decisionTask(
    over: Partial<Pick<DecisionTaskFields, 'ID' | 'Name' | 'Configuration' | 'PromptID' | 'ParentID' | 'OutputPayload'>> = {},
): DecisionTaskFields {
    return {
        ID: 'task-triage',
        Name: 'Triage the ticket',
        StepType: 'Decision',
        PromptID: DECISION_PROMPT_ID,
        ActionID: null,
        AgentID: null,
        ParentID: 'graph-1',
        Configuration: TRIAGE_CONFIGURATION,
        ConfigurationObject: null,
        OutputPayload: null,
        ...over,
    };
}

/** The row a Decision step leaves behind once it has run. */
function decisionRow(status: string, output: unknown, errorMessage: string | null = null): DecisionTaskRow {
    return {
        Name: 'Triage the ticket',
        Status: status,
        StepType: 'Decision',
        Configuration: TRIAGE_CONFIGURATION,
        OutputPayload: output === undefined ? null : JSON.stringify(output),
        ErrorMessage: errorMessage,
    };
}

/** The output `triage` writes when it answers with these, as the dispatcher builds it. */
const triageOutput = (answers: Record<string, TaskGraphDecisionAnswer>, payload: Record<string, unknown> = {}) =>
    BuildDecisionStepOutput(payload, 'triage', DecisionStepOutputAnswers('Triage the ticket', TRIAGE.questions, answers));

/** The graph's decisions after `triage` completed with these answers. */
const decided = (answers: Record<string, TaskGraphDecisionAnswer>): GraphDecisions =>
    ResolveGraphDecisions([decisionRow('Complete', triageOutput(answers))]);

/** A decision runner that records every call and answers with `result`. */
function decisionRunner(result: TaskDecisionRunResult): TaskDecisionRunner & { Calls: TaskDecisionRunParams[] } {
    const calls: TaskDecisionRunParams[] = [];
    return {
        Calls: calls,
        RunDecisionForTask: async (params: TaskDecisionRunParams) => { calls.push(params); return result; },
    };
}

/** An `AIAgentRunStep` as the fake provider hands it out: plain fields and a recording Save. */
class FakeRunStep {
    public AgentRunID = '';
    public StepNumber = 0;
    public StepType = '';
    public StepName = '';
    public TargetID: string | null = null;
    public TargetLogID: string | null = null;
    public ParentID: string | null = null;
    public Status = '';
    public StartedAt = new Date(0);
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public ErrorMessage: string | null = null;
    public InputData: string | null = null;
    public OutputData: string | null = null;
    constructor(private readonly saved: FakeRunStep[]) {}
    public NewRecord(): void { /* a fresh step needs nothing reset */ }
    public async Save(): Promise<boolean> { this.saved.push(this); return true; }
}

/** The graph's parent row as the fake provider hands it out: who submitted the graph. */
type FakeParentTask = { InputPayload: string | null; AgentRunID: string | null; Load: () => Promise<boolean> };

/** The provider calls a Decision step makes: the graph's parent, a new run step, and the run's highest step. */
type FakeProvider = {
    GetEntityObject(entityName: string): Promise<FakeParentTask | FakeRunStep>;
    RunView(params: RunViewParams): Promise<{ Success: boolean; Results: Array<{ StepNumber: number }> }>;
};

/**
 * A provider that knows the graph's parent, the run that submitted it, and that run's steps. The
 * highest step number includes every step saved through it, as a database would.
 */
function fakeProvider(submittingRunID: string | null, highestStepNumber = 0) {
    const saved: FakeRunStep[] = [];
    const runViews: RunViewParams[] = [];
    const provider: FakeProvider = {
        GetEntityObject: async (entityName: string) => {
            if (entityName === 'MJ: Tasks') {
                return { InputPayload: null, AgentRunID: submittingRunID, Load: async () => true };
            }
            return new FakeRunStep(saved);
        },
        RunView: async (params: RunViewParams) => {
            runViews.push(params);
            const highest = Math.max(highestStepNumber, ...saved.map((step) => step.StepNumber));
            return { Success: true, Results: highest ? [{ StepNumber: highest }] : [] };
        },
    };
    return { Provider: provider, Saved: saved, RunViews: runViews };
}

/** The origin columns a condition reads. */
type OriginFields = Pick<MJTaskEntity, 'ID' | 'Name' | 'Status' | 'ErrorMessage' | 'OutputPayload'>;

/** The dependency columns the gate reads. */
type EdgeFields = Pick<MJTaskDependencyEntity, 'ID' | 'TaskID' | 'DependsOnTaskID' | 'Condition' | 'ExclusiveGroup' | 'Priority' | 'Sequence'>;

/** A graph's child row, with every column `loadGraphState`, a Decision step and a retry read or reset. */
type GraphRow = DecisionTaskFields & Pick<
    MJTaskEntity,
    'Status' | 'ErrorMessage' | 'StartedAt' | 'CompletedAt' | 'PercentComplete' | 'ClaimedBy' | 'ClaimExpiresAt'
>;

/** A graph's edge, with the columns `loadGraphState` reads. */
type GraphEdgeRow = EdgeFields & Pick<MJTaskDependencyEntity, 'DependencyType'>;

/** A provider over one in-memory graph: its rows and edges by RunView, its parent by GetEntityObject. */
type GraphProvider = {
    GetEntityObject(entityName: string): Promise<FakeParentTask>;
    RunView(params: RunViewParams): Promise<{ Success: boolean; Results: ReadonlyArray<GraphRow> | ReadonlyArray<GraphEdgeRow> }>;
};

/** What `loadGraphState` hands propagation and claiming, as these tests read it. */
type GraphStateView = {
    nodes: TaskGraphNode[];
    edges: TaskGraphEdge[];
    holdTaskIDs: Set<string>;
    skipSeedTaskIDs: Set<string>;
    unreachableTaskIDs: Set<string>;
    cascadeSkipTaskIDs: Set<string>;
    handledFailureIDs: Set<string>;
};

/**
 * The private surface of the dispatcher these tests drive, typed by the columns and provider calls
 * those paths actually use.
 */
type DispatcherInternals = {
    runTaskBody(
        task: DecisionTaskFields,
        provider: FakeProvider | GraphProvider,
        inputPayload: unknown,
        dependencyOutputs: Map<string, unknown>,
    ): Promise<{ Success: boolean; Output?: unknown; ErrorMessage?: string; PromptRunID?: string }>;
    canActOn(entity: DecisionTaskFields): boolean;
    evaluateEdgeCondition(
        dep: EdgeFields,
        entityById: Map<string, OriginFields>,
        failureSemantics: 'block' | 'edges',
        invocation: ConditionInvocation,
        decisions: GraphDecisions,
    ): { outcome: 'keep' | 'drop' | 'hold'; reason?: string };
    evaluateExclusiveCondition(
        dep: EdgeFields,
        entityById: Map<string, OriginFields>,
        invocation: ConditionInvocation,
        decisions: GraphDecisions,
    ): EdgeConditionOutcome;
    loadGraphState(provider: GraphProvider, parentTaskID: string): Promise<GraphStateView>;
};

const DRIVEN_METHODS: ReadonlyArray<keyof DispatcherInternals> = [
    'runTaskBody', 'canActOn', 'evaluateEdgeCondition', 'evaluateExclusiveCondition', 'loadGraphState',
];

/** True when `value` has every method these tests drive — checked, so a renamed method fails loudly here. */
function drivesDispatcher(value: object): value is DispatcherInternals {
    return DRIVEN_METHODS.every((name) => typeof Reflect.get(value, name) === 'function');
}

/**
 * A dispatcher with only what these paths read. The real constructor stands up a claim store, timers
 * and a provider factory none of this touches; the methods under test come from the prototype.
 */
function dispatcherWith(runner: TaskDecisionRunner, promptRunner?: TaskPromptRunner): DispatcherInternals {
    const instance = {
        decisionRunner: runner,
        promptRunner,
        contextUser: new UserInfo(),
        conditionEvaluator: new DispatcherConditionEvaluator(),
        reportedUnevaluableConditions: new Set<string>(),
        inFlight: new Set<string>(),
        runStepLogs: new Map<string, Promise<void>>(),
    };
    Object.setPrototypeOf(instance, TaskGraphDispatcher.prototype);
    if (!drivesDispatcher(instance)) throw new Error('TaskGraphDispatcher no longer has the methods these tests drive.');
    return instance;
}

/** The origin a condition is evaluated against — the Decision step itself, with its status and output. */
function origin(status: MJTaskEntity['Status'], output: unknown): OriginFields {
    return {
        ID: 'task-triage', Name: 'Triage the ticket', Status: status, ErrorMessage: null,
        OutputPayload: output === undefined ? null : JSON.stringify(output),
    };
}

/** An edge out of `task-triage`. */
function edge(id: string, condition: string, exclusiveGroup: string | null = null): EdgeFields {
    return {
        ID: id, TaskID: `target-${id}`, DependsOnTaskID: 'task-triage', Condition: condition,
        ExclusiveGroup: exclusiveGroup, Priority: 0, Sequence: 0,
    };
}

const INTENT_FORK = [
    edge('e-billing', "decisions.triage.intent.value === 'billing'", 'route'),
    edge('e-refund', "decisions.triage.intent.value === 'refund'", 'route'),
    edge('e-other', "decisions.triage.intent.value === 'other'", 'route'),
];

/** Resolves the intent fork the way `loadGraphState` does, through the dispatcher's own evaluation. */
function resolveIntentFork(originStatus: 'Complete' | 'Failed', decisions: GraphDecisions, failureSemantics: 'block' | 'edges' = 'block') {
    const dispatcher = dispatcherWith(decisionRunner({ Success: true }));
    const entityById = new Map([['task-triage', origin(originStatus, {})]]);
    const evaluated: EvaluatedEdge[] = INTENT_FORK.map((d) => ({
        id: d.ID, taskId: d.TaskID, dependsOnTaskId: d.DependsOnTaskID, exclusiveGroup: 'route',
        originStatus, priority: 0, sequence: 0,
        conditionOutcome: dispatcher.evaluateExclusiveCondition(d, entityById, {}, decisions),
    }));
    return ResolveExclusiveGroups(evaluated, failureSemantics === 'edges' ? new Set(['Complete', 'Failed']) : new Set(['Complete']));
}

// ── the node ────────────────────────────────────────────────────────────────────────────────────

describe('a Decision node on the dispatcher', () => {
    const input = { ticket: { subject: 'I was charged twice', body: 'Two charges on my card this month.' } };

    it('makes ONE call for all of its questions, about the state its path names', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT, PromptRunID: PROMPT_RUN_ID });
        const { Provider } = fakeProvider(null);

        await dispatcherWith(runner).runTaskBody(decisionTask(), Provider, input, new Map());

        expect(runner.Calls).toHaveLength(1);
        expect(Object.keys(runner.Calls[0].Questions)).toEqual(['intent', 'urgent']);
        expect(runner.Calls[0].State).toEqual(input.ticket);
        expect(runner.Calls[0].PromptID).toBe(DECISION_PROMPT_ID);
    });

    it('writes the answers into its output under decisions.<step>, keeping the payload and earlier decisions', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT, PromptRunID: PROMPT_RUN_ID });
        const upstream = new Map<string, unknown>([['task-0', { decisions: { earlier: { ok: { probability: 0.9 } } } }]]);

        const outcome = await dispatcherWith(runner).runTaskBody(decisionTask(), fakeProvider(null).Provider, input, upstream);

        expect(outcome.Success).toBe(true);
        expect(outcome.PromptRunID).toBe(PROMPT_RUN_ID);
        expect(outcome.Output).toEqual({
            ticket: input.ticket,
            decisions: { earlier: { ok: { probability: 0.9 } }, triage: BILLING_CONFIDENT },
        });
    });

    it('puts the same answers in the condition context, where an edge reads them without a model call', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT });
        const outcome = await dispatcherWith(runner).runTaskBody(decisionTask(), fakeProvider(null).Provider, input, new Map());

        const decisions = ResolveGraphDecisions([decisionRow('Complete', outcome.Output)]);
        const context = BuildConditionContext(origin('Complete', outcome.Output), outcome.Output, {}, decisions.Answers);
        const verdict = new DispatcherConditionEvaluator().Evaluate("decisions.triage.intent.value === 'billing'", context);

        expect(context.decisions).toEqual({ triage: BILLING_CONFIDENT });
        expect(verdict).toEqual({ Success: true, Value: true });
        expect(runner.Calls).toHaveLength(1);
    });

    it('logs the call on the submitting run as a Decision step', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT, PromptRunID: PROMPT_RUN_ID });
        const { Provider, Saved, RunViews } = fakeProvider(SUBMITTING_RUN_ID, 7);

        await dispatcherWith(runner).runTaskBody(decisionTask(), Provider, input, new Map());

        expect(Saved).toHaveLength(1);
        const step = Saved[0];
        expect(step).toMatchObject({
            AgentRunID: SUBMITTING_RUN_ID,
            StepNumber: 8,
            StepType: 'Decision',
            StepName: 'Decision: Triage the ticket',
            TargetID: DECISION_PROMPT_ID,
            TargetLogID: PROMPT_RUN_ID,
            Status: 'Completed',
            Success: true,
        });
        expect(JSON.parse(step.InputData ?? '{}')).toMatchObject({ decision: 'triage', state: input.ticket });
        expect(JSON.parse(step.OutputData ?? '{}').answers).toEqual(BILLING_CONFIDENT);
        expect(RunViews[0]).toMatchObject({ EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${SUBMITTING_RUN_ID}'` });
    });

    it('logs no step for a graph no run submitted, and still decides', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT });
        const { Provider, Saved } = fakeProvider(null);

        const outcome = await dispatcherWith(runner).runTaskBody(decisionTask(), Provider, input, new Map());

        expect(Saved).toHaveLength(0);
        expect(outcome.Success).toBe(true);
    });

    it('fails on a failed call, writes NO answers, and logs the step as failed', async () => {
        const runner = decisionRunner({ Success: false, ErrorMessage: 'the model timed out', PromptRunID: PROMPT_RUN_ID });
        const { Provider, Saved } = fakeProvider(SUBMITTING_RUN_ID);

        const outcome = await dispatcherWith(runner).runTaskBody(decisionTask(), Provider, input, new Map());

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toBe('the model timed out');
        expect(outcome.Output).toEqual(input);
        // Still carried: a failed call can have cost tokens, and the rollup reaches it through this.
        expect(outcome.PromptRunID).toBe(PROMPT_RUN_ID);
        expect(Saved[0]).toMatchObject({ StepType: 'Decision', Status: 'Failed', Success: false, ErrorMessage: 'the model timed out' });
    });

    it('does not call the model when its state is not in the payload, and says which path was missing', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT });

        const outcome = await dispatcherWith(runner).runTaskBody(decisionTask(), fakeProvider(null).Provider, { other: 1 }, new Map());

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toMatch(/"payload.ticket" is not in the payload/);
        expect(runner.Calls).toHaveLength(0);
    });

    it('is routed by StepType, so the prompt runner never sees it despite its PromptID', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT });
        const promptRunner = { RunPromptForTask: vi.fn() };

        await dispatcherWith(runner, promptRunner).runTaskBody(decisionTask(), fakeProvider(null).Provider, input, new Map());

        expect(promptRunner.RunPromptForTask).not.toHaveBeenCalled();
        expect(runner.Calls).toHaveLength(1);
    });

    it('is claimable on a host with no prompt runner', () => {
        expect(dispatcherWith(decisionRunner({ Success: true })).canActOn(decisionTask())).toBe(true);
    });

    it('leaves an answer below its minConfidence out of its output, and says why in its place', async () => {
        const runner = decisionRunner({ Success: true, Answers: { ...BILLING_CONFIDENT, intent: { value: 'billing', confidence: 0.55 } } });

        const outcome = await dispatcherWith(runner).runTaskBody(decisionTask(), fakeProvider(null).Provider, input, new Map());

        expect(outcome.Success).toBe(true);
        expect(outcome.Output).toEqual({
            ticket: input.ticket,
            decisions: {
                triage: {
                    intent: { held: 'the decision "Triage the ticket" answered "intent" with confidence 0.55, below its minConfidence of 0.7' },
                    urgent: BILLING_CONFIDENT.urgent,
                },
            },
        });
        // The answer itself is nowhere in what later steps, or a condition, can read.
        expect(JSON.stringify(outcome.Output)).not.toContain('billing');
    });

    it('gives a condition reading its output nothing to route on below minConfidence, while the root holds', async () => {
        const runner = decisionRunner({ Success: true, Answers: { ...BILLING_CONFIDENT, intent: { value: 'billing', confidence: 0.55 } } });
        const outcome = await dispatcherWith(runner).runTaskBody(decisionTask(), fakeProvider(null).Provider, input, new Map());
        const decisions = ResolveGraphDecisions([decisionRow('Complete', outcome.Output)]);
        const context = BuildConditionContext(origin('Complete', outcome.Output), outcome.Output, {}, decisions.Answers);
        const evaluator = new DispatcherConditionEvaluator();

        // The door refuses `payload.decisions…`; this is what one that slipped past would see: no answer.
        expect(evaluator.Evaluate("payload.decisions.triage.intent.value === 'billing'", context)).toEqual({ Success: true, Value: false });
        const verdict = EvaluateCondition(
            "decisions.triage.intent.value === 'billing'", context, decisions, (c, ctx) => evaluator.Evaluate(c, ctx),
        );
        expect(verdict.Unevaluable).toBe(true);
        expect(verdict.ErrorMessage).toMatch(/confidence 0.55, below its minConfidence of 0.7/);
    });

    it('fails before its call rather than overwrite a payload "decisions" field that is not an object', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT });

        const outcome = await dispatcherWith(runner).runTaskBody(
            decisionTask(), fakeProvider(null).Provider, { ...input, decisions: ['approved by finance'] }, new Map(),
        );

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toMatch(/already has a "decisions" field holding a list/);
        expect(runner.Calls).toHaveLength(0);
    });

    it('numbers two Decision steps logging on one run at once in turn, never the same', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT, PromptRunID: PROMPT_RUN_ID });
        const { Provider, Saved } = fakeProvider(SUBMITTING_RUN_ID, 7);
        const dispatcher = dispatcherWith(runner);

        await Promise.all([
            dispatcher.runTaskBody(decisionTask(), Provider, input, new Map()),
            dispatcher.runTaskBody(decisionTask({ ID: 'task-triage-2', Name: 'Triage again' }), Provider, input, new Map()),
        ]);

        expect(Saved.map((step) => step.StepNumber).sort()).toEqual([8, 9]);
    });
});

describe('DecisionsPayloadConflict', () => {
    it.each([{}, { decisions: null }, { decisions: { earlier: {} } }])('lets the answers merge into %j', (payload) => {
        expect(DecisionsPayloadConflict(payload)).toBeNull();
    });

    it.each([
        [{ decisions: ['a'] }, 'a list'],
        [{ decisions: 'none yet' }, 'a string'],
        [{ decisions: 3 }, 'a number'],
    ])('refuses to replace %j', (payload, kind) => {
        expect(DecisionsPayloadConflict(payload)).toContain(`holding ${kind}`);
    });
});

// ── the root ────────────────────────────────────────────────────────────────────────────────────

describe('the decisions root in the condition envelope', () => {
    it('is provided at run time and declared for the door — the pinned pair covers it', () => {
        expect(Object.keys(BuildConditionContext(origin('Complete', null), null))).toContain('decisions');
        expect(CONDITION_ROOTS.has('decisions')).toBe(true);
    });

    it('is empty, not missing, in a graph with no decisions', () => {
        expect(BuildConditionContext(origin('Complete', null), null).decisions).toEqual({});
    });

    it('evaluates a condition that reads no decision exactly as before', () => {
        const evaluate = vi.fn((): ConditionVerdict => ({ Success: true, Value: true }));
        expect(EvaluateCondition('payload.ok === true', {}, NO_DECISIONS, evaluate)).toEqual({ Success: true, Value: true });
        expect(evaluate).toHaveBeenCalledTimes(1);
    });
});

// ── the hold ────────────────────────────────────────────────────────────────────────────────────

describe('ResolveGraphDecisions — which answers a condition may act on', () => {
    it('uses an answer at or above its minConfidence', () => {
        const decisions = decided({ intent: { value: 'refund', confidence: 0.7 }, urgent: { probability: 0.95 } });
        expect(decisions.Answers.triage).toEqual({ intent: { value: 'refund', confidence: 0.7 }, urgent: { probability: 0.95 } });
        expect(decisions.Unresolved).toEqual({});
    });

    it('does not use a Choice below its minConfidence, and says why', () => {
        const decisions = decided({ intent: { value: 'billing', confidence: 0.55 }, urgent: { probability: 0.05 } });
        expect(decisions.Answers.triage).toEqual({ urgent: { probability: 0.05 } });
        expect(decisions.Unresolved.triage.intent).toMatch(/confidence 0.55, below its minConfidence of 0.7/);
    });

    it('measures a Likelihood by its distance from an even call — a confident no is usable', () => {
        expect(DecisionAnswerConfidence({ probability: 0.05 })).toBeCloseTo(0.95);
        expect(decided({ ...BILLING_CONFIDENT, urgent: { probability: 0.05 } }).Answers.triage.urgent).toEqual({ probability: 0.05 });
        expect(decided({ ...BILLING_CONFIDENT, urgent: { probability: 0.6 } }).Unresolved.triage.urgent).toMatch(/below its minConfidence of 0.8/);
    });

    it('uses nothing from a failed decision, and carries the failure as the reason', () => {
        const decisions = ResolveGraphDecisions([decisionRow('Failed', {}, 'the model timed out')]);
        expect(decisions.Answers).toEqual({});
        expect(decisions.Unresolved.triage).toEqual({
            intent: 'the decision "Triage the ticket" failed: the model timed out',
            urgent: 'the decision "Triage the ticket" failed: the model timed out',
        });
    });

    it.each(['Pending', 'In Progress', 'Skipped', 'Blocked'])('uses nothing from a %s decision', (status) => {
        expect(ResolveGraphDecisions([decisionRow(status, undefined)]).Unresolved.triage.intent).toMatch(/has not answered/);
    });

    it('does not trust a completed step that wrote no answer', () => {
        expect(ResolveGraphDecisions([decisionRow('Complete', { unrelated: true })]).Unresolved.triage.intent)
            .toMatch(/completed without an answer/);
    });
});

describe('a condition reading an unsettled decision holds', () => {
    const BELOW = decided({ intent: { value: 'billing', confidence: 0.55 }, urgent: { probability: 0.6 } });
    const ABOVE = decided(BILLING_CONFIDENT);

    it('is refused evaluation — the evaluator is never asked, so absence cannot read as false', () => {
        const evaluate = vi.fn((): ConditionVerdict => ({ Success: true, Value: false }));
        const verdict = EvaluateCondition("decisions.triage.intent.value === 'billing'", {}, BELOW, evaluate);
        expect(verdict.Unevaluable).toBe(true);
        expect(verdict.ErrorMessage).toMatch(/below its minConfidence/);
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('turns into a hold at the gate, not a drop', () => {
        expect(DecideGate('Complete', 'block', () => ({ Success: false, Unevaluable: true, ErrorMessage: 'held' }))).toBe('hold');
    });

    it('holds a malformed or unknown reference too — the backstop for a condition that bypassed the door', () => {
        expect(DecisionHoldReason('decisions.triage', ABOVE)).toMatch(/without naming a step and a question/);
        expect(DecisionHoldReason('decisions.nobody.intent.value === "x"', ABOVE)).toMatch(/no Decision step "nobody"/);
    });

    it('holds an ordinary edge below minConfidence and routes it above', () => {
        const dispatcher = dispatcherWith(decisionRunner({ Success: true }));
        const entityById = new Map([['task-triage', origin('Complete', {})]]);
        const urgentEdge = edge('e-urgent', 'decisions.triage.urgent.probability >= 0.5');

        expect(dispatcher.evaluateEdgeCondition(urgentEdge, entityById, 'block', {}, BELOW)).toMatchObject({
            outcome: 'hold', reason: expect.stringMatching(/below its minConfidence of 0.8/),
        });
        expect(dispatcher.evaluateEdgeCondition(urgentEdge, entityById, 'block', {}, ABOVE).outcome).toBe('drop');
        expect(dispatcher.evaluateEdgeCondition(edge('e-calm', 'decisions.triage.urgent.probability < 0.5'), entityById, 'block', {}, ABOVE).outcome)
            .toBe('keep');
    });

    it('HOLDS the whole fork below minConfidence — no branch is guessed and none is skipped', () => {
        const resolution = resolveIntentFork('Complete', BELOW);
        expect(resolution.holdTaskIDs.sort()).toEqual(['target-e-billing', 'target-e-other', 'target-e-refund']);
        expect(resolution.keptEdgeIDs).toEqual([]);
        expect(resolution.loserEdgeIDs).toEqual([]);
    });

    it('ROUTES the fork above minConfidence — the chosen branch runs and the others are skipped', () => {
        const resolution = resolveIntentFork('Complete', ABOVE);
        expect(resolution.holdTaskIDs).toEqual([]);
        expect(resolution.keptEdgeIDs).toEqual(['e-billing']);
        expect(resolution.loserEdgeIDs.sort()).toEqual(['e-other', 'e-refund']);
    });
});

describe('a failed decision holds; it never reads as false', () => {
    const FAILED = ResolveGraphDecisions([decisionRow('Failed', {}, 'the model timed out')]);

    it('holds an edge that reads it where failures decide (edges semantics)', () => {
        const dispatcher = dispatcherWith(decisionRunner({ Success: true }));
        const entityById = new Map([['task-triage', origin('Failed', {})]]);
        const decision = dispatcher.evaluateEdgeCondition(
            edge('e-not-billing', "decisions.triage.intent.value !== 'billing'"), entityById, 'edges', {}, FAILED,
        );
        // A NEGATED test is the dangerous one: with no answer, `undefined !== 'billing'` is TRUE, so a
        // read-through would open this edge on a decision that never happened.
        expect(decision.outcome).toBe('hold');
        expect(decision.reason).toMatch(/failed: the model timed out/);
    });

    it('leaves it to the block cascade under block semantics — kept, never dropped', () => {
        const dispatcher = dispatcherWith(decisionRunner({ Success: true }));
        const entityById = new Map([['task-triage', origin('Failed', {})]]);
        const decision = dispatcher.evaluateEdgeCondition(
            edge('e-billing', "decisions.triage.intent.value === 'billing'"), entityById, 'block', {}, FAILED,
        );
        expect(decision.outcome).toBe('keep');
    });

    it('holds the whole fork on it where failures decide', () => {
        const resolution = resolveIntentFork('Failed', FAILED, 'edges');
        expect(resolution.holdTaskIDs).toHaveLength(3);
        expect(resolution.loserEdgeIDs).toEqual([]);
    });

    it('holds an edge from ANOTHER step that reads it, whatever that step\'s status', () => {
        const evaluate = vi.fn((): ConditionVerdict => ({ Success: true, Value: true }));
        expect(EvaluateCondition("decisions.triage.intent.value === 'other'", {}, FAILED, evaluate).Unevaluable).toBe(true);
        expect(evaluate).not.toHaveBeenCalled();
    });
});

// ── releasing a hold ────────────────────────────────────────────────────────────────────────────

describe('retrying a Decision step that is holding an answer', () => {
    const LOW_INTENT = { ...BILLING_CONFIDENT, intent: { value: 'billing', confidence: 0.55 } };
    const held = decisionRow('Complete', triageOutput(LOW_INTENT));
    const usable = decisionRow('Complete', triageOutput(BILLING_CONFIDENT));

    /** A step the graph holds on, with the columns a retry resets. */
    const heldStep = (): RetryableTask & DecisionTaskRow => ({
        ...held,
        Status: 'Complete',
        StepType: 'Decision',
        StartedAt: new Date('2026-09-30T10:00:00Z'),
        CompletedAt: new Date('2026-09-30T10:00:02Z'),
        PercentComplete: 100,
        ClaimedBy: null,
        ClaimExpiresAt: null,
    });

    it('knows which answers it is holding, and why', () => {
        expect(HeldDecisionAnswers(held)).toEqual({
            intent: 'the decision "Triage the ticket" answered "intent" with confidence 0.55, below its minConfidence of 0.7',
        });
        expect(HeldDecisionAnswers(usable)).toEqual({});
        expect(HeldDecisionAnswers(decisionRow('Failed', {}, 'timed out'))).toEqual({});
    });

    it('may be retried from Complete, as a failed step may', () => {
        expect(RetryRefusal(held)).toBeNull();
        expect(RetryRefusal(decisionRow('Failed', {}, 'timed out'))).toBeNull();
    });

    it('refuses an edited input a held step could not read, since failing would lose the answers it keeps', () => {
        expect(RetryRefusal(held, JSON.stringify({ ticket: { subject: 'Charged twice, and I need it today' } }))).toBeNull();
        expect(RetryRefusal(held, '')).toBeNull();
        expect(RetryRefusal(held, '["not", "named"]')).toMatch(/not a JSON object of named values/);
        expect(RetryRefusal(held, '{ not json')).toMatch(/not a JSON object of named values/);
        // A failed step keeps no answers, so its edited input fails, if at all, the ordinary way.
        expect(RetryRefusal(decisionRow('Failed', {}, 'timed out'), '[]')).toBeNull();
    });

    it('is refused when every answer is usable, and for anything else that has not failed', () => {
        expect(RetryRefusal(usable)).toMatch(/answers are all usable/);
        expect(RetryRefusal({ ...held, StepType: 'Agent' })).toMatch(/status is Complete, expected Failed/);
        expect(RetryRefusal(decisionRow('In Progress', undefined))).toMatch(/status is In Progress/);
    });

    it('goes back to Pending keeping its output; edges reading it hold until it answers again, then route', () => {
        const step = heldStep();
        const output = step.OutputPayload;
        PrepareTaskForRetry(step);
        expect(step).toMatchObject({
            Status: 'Pending', OutputPayload: output, ErrorMessage: null, StartedAt: null, CompletedAt: null, PercentComplete: 0,
        });
        // The output is kept for the answers the retry keeps, and nothing reads it as current meanwhile.
        expect(KeptDecisionAnswers(step)).toEqual({ urgent: BILLING_CONFIDENT.urgent });

        // An edge from a later step that reads the decision holds while it is asked again...
        const dispatcher = dispatcherWith(decisionRunner({ Success: true }));
        const gather: OriginFields = { ...origin('Complete', {}), ID: 'task-gather', Name: 'Gather' };
        const reading = { ...edge('e-later', "decisions.triage.intent.value === 'billing'"), DependsOnTaskID: 'task-gather' };
        const waiting = ResolveGraphDecisions([step]);
        expect(dispatcher.evaluateEdgeCondition(reading, new Map([['task-gather', gather]]), 'block', {}, waiting)).toMatchObject({
            outcome: 'hold', reason: expect.stringMatching(/has not answered \(it is Pending\)/),
        });

        // ...and routes once it answers confidently.
        const answered = ResolveGraphDecisions([{ ...step, Status: 'Complete', OutputPayload: JSON.stringify(triageOutput(BILLING_CONFIDENT)) }]);
        expect(dispatcher.evaluateEdgeCondition(reading, new Map([['task-gather', gather]]), 'block', {}, answered).outcome).toBe('keep');
        expect(resolveIntentFork('Complete', answered).keptEdgeIDs).toEqual(['e-billing']);
    });

    it('clears a failed Decision\'s output: it has no answers of its own to keep', () => {
        const step: RetryableTask & DecisionTaskRow = {
            ...heldStep(),
            Status: 'Failed',
            ErrorMessage: 'the model timed out',
            // A failed step passes its input through, and that input can carry a stale entry under its own name.
            OutputPayload: JSON.stringify({ decisions: { triage: BILLING_CONFIDENT } }),
        };
        PrepareTaskForRetry(step);
        expect(step.OutputPayload).toBeNull();
        expect(KeptDecisionAnswers(step)).toEqual({});
    });

    it('keeps a failed step\'s output when it is not a Decision', () => {
        const step: RetryableTask = {
            Status: 'Failed', StepType: 'Agent', ErrorMessage: 'boom', StartedAt: null, CompletedAt: null,
            PercentComplete: 40, ClaimedBy: null, ClaimExpiresAt: null, OutputPayload: '{"partial":true}',
        };
        PrepareTaskForRetry(step);
        expect(step).toMatchObject({ Status: 'Pending', ErrorMessage: null, OutputPayload: '{"partial":true}' });
    });
});

describe('a retried Decision asks only what it is holding', () => {
    const input = { ticket: { subject: 'I was charged twice', body: 'Two charges on my card this month.' } };
    const URGENT_HELD = { ...BILLING_CONFIDENT, urgent: { probability: 0.6 } };
    /** The step as a retry from Complete leaves it: Pending again, with the output it held on. */
    const retried = () => decisionTask({ OutputPayload: JSON.stringify(triageOutput(URGENT_HELD, input)) });
    const triageOf = (output: unknown) => ResolveGraphDecisions([decisionRow('Complete', output)]);

    it('reads the kept answers from an entity, whose fields are getters', () => {
        const output = JSON.stringify(triageOutput(URGENT_HELD, input));
        // Shaped like a BaseEntity: every field an accessor on the prototype, none an own property.
        class TaskEntityLike {
            get Name(): string { return 'Triage the ticket'; }
            get StepType(): string { return 'Decision'; }
            get Configuration(): string { return TRIAGE_CONFIGURATION; }
            get OutputPayload(): string { return output; }
        }
        expect(KeptDecisionAnswers(new TaskEntityLike())).toEqual({ intent: BILLING_CONFIDENT.intent });
    });

    it('asks every question on a first run, which has no output yet', () => {
        expect(Object.keys(QuestionsToAsk(TRIAGE.questions, KeptDecisionAnswers(decisionTask())))).toEqual(['intent', 'urgent']);
    });

    it('asks only the held questions, in one call, and merges the answers into the ones it kept', async () => {
        const runner = decisionRunner({ Success: true, Answers: { urgent: { probability: 0.05 } }, PromptRunID: PROMPT_RUN_ID });

        const outcome = await dispatcherWith(runner).runTaskBody(retried(), fakeProvider(null).Provider, input, new Map());

        expect(runner.Calls).toHaveLength(1);
        expect(Object.keys(runner.Calls[0].Questions)).toEqual(['urgent']);
        expect(outcome.Success).toBe(true);
        expect(triageOf(outcome.Output).Answers.triage).toEqual({ intent: BILLING_CONFIDENT.intent, urgent: { probability: 0.05 } });
    });

    it('never replaces a kept answer, whatever the call returns for its question', async () => {
        // A flipped answer to a question it was not asked: the fork already went to billing.
        const runner = decisionRunner({
            Success: true,
            Answers: { intent: { value: 'refund', confidence: 0.9, probabilities: { billing: 0.05, refund: 0.9, other: 0.05 } }, urgent: { probability: 0.05 } },
        });

        const outcome = await dispatcherWith(runner).runTaskBody(retried(), fakeProvider(null).Provider, input, new Map());

        expect(triageOf(outcome.Output).Answers.triage.intent).toEqual(BILLING_CONFIDENT.intent);
    });

    it('stays Complete with its usable answers when asking again fails, holding the rest with the reason', async () => {
        const runner = decisionRunner({ Success: false, ErrorMessage: 'the model timed out', PromptRunID: PROMPT_RUN_ID });

        const outcome = await dispatcherWith(runner).runTaskBody(retried(), fakeProvider(null).Provider, input, new Map());

        expect(outcome.Success).toBe(true);
        expect(outcome.PromptRunID).toBe(PROMPT_RUN_ID);
        const row = decisionRow('Complete', outcome.Output);
        expect(ResolveGraphDecisions([row]).Answers.triage).toEqual({ intent: BILLING_CONFIDENT.intent });
        expect(HeldDecisionAnswers(row)).toEqual({
            urgent: 'the decision "Triage the ticket" was asked "urgent" again and could not answer: the model timed out',
        });
        // Still holding, so it can be retried again.
        expect(RetryRefusal(row)).toBeNull();
    });

    it('stays Complete holding when it cannot be asked again, and calls no model', async () => {
        const runner = decisionRunner({ Success: true, Answers: BILLING_CONFIDENT });

        // An edited input that lost the state the questions are about.
        const outcome = await dispatcherWith(runner).runTaskBody(retried(), fakeProvider(null).Provider, { other: 1 }, new Map());

        expect(runner.Calls).toHaveLength(0);
        expect(outcome.Success).toBe(true);
        const row = decisionRow('Complete', outcome.Output);
        expect(ResolveGraphDecisions([row]).Answers.triage).toEqual({ intent: BILLING_CONFIDENT.intent });
        expect(HeldDecisionAnswers(row).urgent).toMatch(/asked "urgent" again and could not answer: its state "payload.ticket" is not in the payload/);
    });

    it('keeps the earlier output around the answers when it could not answer again', () => {
        const previous = JSON.stringify(triageOutput(URGENT_HELD, input));
        const output = StillHoldingDecisionOutput(previous, 'Triage the ticket', 'triage', TRIAGE.questions, { intent: BILLING_CONFIDENT.intent }, 'boom');
        expect(output.ticket).toEqual(input.ticket);
        expect(output.decisions).toEqual({
            triage: {
                intent: BILLING_CONFIDENT.intent,
                urgent: { held: 'the decision "Triage the ticket" was asked "urgent" again and could not answer: boom' },
            },
        });
    });
});

// ── a retry in a running graph ──────────────────────────────────────────────────────────────────

/** A graph step that is not a Decision: it completes when it runs. */
function workRow(id: string, name: string): GraphRow {
    return {
        ID: id, Name: name, StepType: 'Agent', PromptID: null, ActionID: null, AgentID: `agent-${id}`, ParentID: 'graph-1',
        Configuration: null, ConfigurationObject: null, OutputPayload: null, Status: 'Pending', ErrorMessage: null,
        StartedAt: null, CompletedAt: null, PercentComplete: 0, ClaimedBy: null, ClaimExpiresAt: null,
    };
}

/** An edge in the in-memory graph. */
function graphEdge(id: string, taskID: string, dependsOn: string, condition: string | null, exclusiveGroup: string | null = null): GraphEdgeRow {
    return {
        ID: id, TaskID: taskID, DependsOnTaskID: dependsOn, Condition: condition, ExclusiveGroup: exclusiveGroup,
        Priority: 0, Sequence: 0, DependencyType: 'Prerequisite',
    };
}

/**
 * The graph from the review of this retry: `triage` forks on `intent` to A (billing) or B (refund),
 * `urgent` gates C, and A also waits on C. The fork is drawn either as an exclusive group or as two
 * ordinary conditional edges.
 */
function supportGraph(fork: 'exclusive' | 'conditional') {
    const group = fork === 'exclusive' ? 'route' : null;
    const rows = new Map<string, GraphRow>([
        ['task-triage', { ...decisionTask(), Status: 'Pending', ErrorMessage: null, StartedAt: null, CompletedAt: null, PercentComplete: 0, ClaimedBy: null, ClaimExpiresAt: null }],
        ['task-a', workRow('task-a', 'Handle billing')],
        ['task-b', workRow('task-b', 'Handle refund')],
        ['task-c', workRow('task-c', 'Escalate')],
    ]);
    const edges = [
        graphEdge('e-a', 'task-a', 'task-triage', "decisions.triage.intent.value === 'billing'", group),
        graphEdge('e-b', 'task-b', 'task-triage', "decisions.triage.intent.value === 'refund'", group),
        graphEdge('e-c', 'task-c', 'task-triage', 'decisions.triage.urgent.probability >= 0.5'),
        graphEdge('e-ca', 'task-a', 'task-c', null),
    ];
    const provider: GraphProvider = {
        GetEntityObject: async () => ({ InputPayload: null, AgentRunID: null, Load: async () => true }),
        RunView: async (params: RunViewParams) => ({
            Success: true,
            Results: params.EntityName === 'MJ: Task Dependencies' ? edges : [...rows.values()],
        }),
    };
    const statusOf = (id: string) => rows.get(id)?.Status;
    return { rows, provider, statusOf, triage: () => rows.get('task-triage')! };
}

type SupportGraph = ReturnType<typeof supportGraph>;

/** A decision runner that answers, on each call, only the questions it was asked, from the next set. */
function answeringRunner(answerSets: Array<Record<string, TaskGraphDecisionAnswer>>): TaskDecisionRunner & { Calls: TaskDecisionRunParams[] } {
    const calls: TaskDecisionRunParams[] = [];
    return {
        Calls: calls,
        RunDecisionForTask: async (params: TaskDecisionRunParams) => {
            const set = answerSets[calls.length];
            calls.push(params);
            const answers: Record<string, TaskGraphDecisionAnswer> = {};
            for (const key of Object.keys(params.Questions)) answers[key] = set[key];
            return { Success: true, Answers: answers };
        },
    };
}

/**
 * Runs the graph the way the dispatcher's passes do — skips, then blocks, then claims whatever is
 * eligible — until nothing is left to claim. Every edge decision is the real `loadGraphState`'s, and
 * the Decision step runs through the real `runTaskBody`; only the row writes are in memory.
 */
async function runUntilSettled(dispatcher: DispatcherInternals, graph: SupportGraph, input: Record<string, unknown>): Promise<void> {
    for (let pass = 0; pass < 20; pass++) {
        const propagation = await dispatcher.loadGraphState(graph.provider, 'graph-1');
        for (const id of propagation.cascadeSkipTaskIDs) {
            const row = graph.rows.get(id);
            if (row?.Status === 'Pending') row.Status = 'Skipped';
        }
        const afterSkips = await dispatcher.loadGraphState(graph.provider, 'graph-1');
        for (const id of ComputeTasksToBlock(afterSkips.nodes, afterSkips.edges, afterSkips.handledFailureIDs)) {
            const row = graph.rows.get(id);
            if (row && !afterSkips.cascadeSkipTaskIDs.has(id)) row.Status = 'Blocked';
        }

        const claim = await dispatcher.loadGraphState(graph.provider, 'graph-1');
        const eligible = ComputeEligibleTasks(claim.nodes, claim.edges, claim.handledFailureIDs).filter((n) =>
            !claim.holdTaskIDs.has(n.id) && !claim.skipSeedTaskIDs.has(n.id)
            && !claim.unreachableTaskIDs.has(n.id) && !claim.cascadeSkipTaskIDs.has(n.id));
        if (eligible.length === 0) return;
        for (const node of eligible) {
            const row = graph.rows.get(node.id)!;
            if (row.StepType !== 'Decision') { row.Status = 'Complete'; continue; }
            const outcome = await dispatcher.runTaskBody(row, graph.provider, input, new Map());
            row.Status = outcome.Success ? 'Complete' : 'Failed';
            row.OutputPayload = outcome.Output == null ? null : JSON.stringify(outcome.Output);
            row.ErrorMessage = outcome.ErrorMessage ?? null;
        }
    }
    throw new Error('The graph did not settle in 20 passes.');
}

describe('retrying a held Decision in a running graph re-decides nothing', () => {
    const input = { ticket: { subject: 'I was charged twice', body: 'Two charges on my card this month.' } };

    it.each(['exclusive', 'conditional'] as const)('keeps the fork on its first answer when the retry would flip it (%s fork)', async (fork) => {
        const graph = supportGraph(fork);
        const runner = answeringRunner([
            // Billing, confidently; urgent at 0.6, below its 0.8.
            { intent: BILLING_CONFIDENT.intent, urgent: { probability: 0.6 } },
            // Asked again, the model would now say refund, and a confident no on urgent.
            { intent: { value: 'refund', confidence: 0.9, probabilities: { billing: 0.05, refund: 0.9, other: 0.05 } }, urgent: { probability: 0.05 } },
        ]);
        const dispatcher = dispatcherWith(runner);

        await runUntilSettled(dispatcher, graph, input);
        // The fork went to billing: refund is skipped, billing waits on C, and C holds on urgent.
        expect([graph.statusOf('task-a'), graph.statusOf('task-b'), graph.statusOf('task-c')]).toEqual(['Pending', 'Skipped', 'Pending']);

        expect(RetryRefusal(graph.triage())).toBeNull();
        PrepareTaskForRetry(graph.triage());
        await runUntilSettled(dispatcher, graph, input);

        // Billing stands, so the billing branch runs; C is not needed. Re-asking intent would flip the
        // fork to refund, whose branch is already Skipped, and skip A with C: nothing would run.
        expect([graph.statusOf('task-a'), graph.statusOf('task-b'), graph.statusOf('task-c')]).toEqual(['Complete', 'Skipped', 'Skipped']);
        expect(Object.keys(runner.Calls[1].Questions)).toEqual(['urgent']);
        expect(ResolveGraphDecisions([graph.triage()]).Answers.triage).toEqual({
            intent: BILLING_CONFIDENT.intent, urgent: { probability: 0.05 },
        });
    });
});

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────

describe('SummarizeDecisionAnswers', () => {
    const typed: AIDecisionRunResult['Answers'] = {
        urgent: { Kind: 'Likelihood', Probability: 0.81 },
        intent: { Kind: 'Choice', Value: 'refund', Confidence: 0.77, Probabilities: { billing: 0.2, refund: 0.77, other: 0.03 } },
        severity: { Kind: 'Score', Value: 1.4, Confidence: 0.6, Probabilities: { minor: 0.1, major: 0.4, critical: 0.5 } },
    };

    it('keeps the full distribution in the shape conditions read', () => {
        expect(SummarizeDecisionAnswers(typed)).toEqual({
            urgent: { probability: 0.81 },
            intent: { value: 'refund', confidence: 0.77, probabilities: { billing: 0.2, refund: 0.77, other: 0.03 } },
            severity: { value: 1.4, confidence: 0.6, probabilities: { minor: 0.1, major: 0.4, critical: 0.5 } },
        });
    });

    it('produces exactly the fields the validator lets a condition read, for every kind', () => {
        const summary = SummarizeDecisionAnswers(typed);
        expect(Object.keys(summary.urgent).sort()).toEqual([...DECISION_ANSWER_FIELDS.Likelihood].sort());
        expect(Object.keys(summary.intent).sort()).toEqual([...DECISION_ANSWER_FIELDS.Choice].sort());
        expect(Object.keys(summary.severity).sort()).toEqual([...DECISION_ANSWER_FIELDS.Score].sort());
    });
});

describe('ResolveDecisionState', () => {
    it('defaults to the whole payload', () => {
        expect(ResolveDecisionState(undefined, { a: 1 })).toEqual({ State: { a: 1 } });
    });

    it('passes text through and sends a list as JSON', () => {
        expect(ResolveDecisionState('payload.text', { text: 'hello' })).toEqual({ State: 'hello' });
        expect(ResolveDecisionState('payload.items', { items: [1, 2] })).toEqual({ State: '[1,2]' });
    });

    it('refuses an empty state rather than ask about nothing', () => {
        expect(ResolveDecisionState(undefined, {})).toEqual({ ErrorMessage: 'its state "payload" is empty' });
        expect(ResolveDecisionState('payload.text', { text: ' ' })).toEqual({ ErrorMessage: 'its state "payload.text" is empty' });
    });
});

describe('persisting a Decision step', () => {
    const node = TaskNode.Decision({ tempId: 'triage', name: 'Triage the ticket', description: '', dependsOn: [] }, TRIAGE);

    it('is a kind the dispatcher can run', () => {
        const graph: TaskGraphSpec = { workflowName: 'Support triage', tasks: [node] };
        expect(FindUnrunnableKinds(graph)).toBeNull();
    });

    it('stores its questions and state with the tempId conditions name it by', () => {
        const config = BuildStepConfiguration(node);
        expect(config?.decision).toEqual({ ...TRIAGE, nodeId: 'triage' });
        expect(ReadDecisionStepConfiguration(JSON.stringify(config))).toEqual({ ...TRIAGE, nodeId: 'triage' });
    });

    it('runs on Default Decision unless it names a prompt', () => {
        expect(DecisionPromptNameOf(node)).toBe('Default Decision');
        expect(DecisionPromptNameOf({ ...node, configuration: { ...TRIAGE, promptName: 'Triage Decision' } })).toBe('Triage Decision');
        expect(DecisionPromptNameOf(TaskNode.Agent({ tempId: 'a', name: 'A', description: '', dependsOn: [] }, { agentName: 'X' }))).toBeNull();
    });
});
