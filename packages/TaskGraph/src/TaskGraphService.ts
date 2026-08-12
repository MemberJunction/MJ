/**
 * @fileoverview Producer-agnostic submission of task graphs.
 *
 * Per D2, submission (validate + persist) is split from execution (the durable dispatcher). This
 * class does the first half only: it validates a spec, resolves agent names, writes the parent +
 * children + dependency edges, and returns immediately. Nothing here executes anything.
 *
 * That split is what makes the engine invocation-agnostic (D1): an agent emitting a graph, a
 * scheduled job, a Slack message, and a future manual workflow UI all call the same `Submit`, and
 * whichever dispatcher instance is running picks the work up. Callers never wait for execution, so
 * no channel needs to hold a long-lived request open the way the old `ExecuteTaskGraph` mutation did.
 *
 * Per D11 the API is deliberately not AI-flavored — an LLM, deterministic code, or a human UI can
 * all construct and submit a DAG.
 *
 * @module @memberjunction/task-graph
 */
import {
    IMetadataProvider,
    LogError,
    LogStatus,
    RunInEntityTransaction,
    RunView,
    UserInfo,
    type EntityTransactionScope,
} from '@memberjunction/core';
import {
    MJTaskEntity,
    MJTaskDependencyEntity,
    MJTaskTypeEntity,
    MJAIAgentRequestEntity,
    type MJTaskEntity_ITaskStepConfiguration,
} from '@memberjunction/core-entities';
import {
    FormatValidationErrors,
    NormalizeDependency,
    RankGraphNodes,
    ValidateTaskGraphSpec,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type ForEachOperation,
    type WhileOperation,
    ConfigOf,
} from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';
import { TaskClaimStore, type TaskGraphDebugFieldWrite } from './TaskClaimStore';
import { ParseTaskGraphDebugState, type EdgeOverrideVerdict, type StepTarget, type TaskGraphDebugState } from './debug-state';

/** Context a submission carries beyond the graph itself. */
export type TaskGraphSubmitContext = {
    /** Environment the tasks belong to. */
    EnvironmentID: string;
    /** Conversation this graph answers, when submitted from a conversational channel. */
    ConversationDetailID?: string | null;
    /** User the work runs as and is attributed to. */
    ContextUser: UserInfo;
    /** Provider to persist through. */
    Provider: IMetadataProvider;
    /** The agent run that emitted this graph, for provenance and `reinvoke` routing. */
    AgentRunID?: string | null;
    /**
     * How many continuation hops produced this graph. A graph submitted by an agent that was itself
     * re-invoked by a finished graph carries its parent's depth + 1.
     */
    ReinvokeDepth?: number;
};

/**
 * What the parent Task row remembers about the graph beyond its tasks.
 *
 * Persisted rather than held in memory because the dispatcher instance that *finishes* a graph is
 * routinely not the one that accepted it — a restart, a peer instance, or simply a graph that
 * outlives a deploy all break that assumption.
 */
export type TaskGraphParentMetadata = {
    continuation: 'message' | 'reinvoke' | 'none';
    reinvokeDepth: number;
    /**
     * How a failure propagates in this graph — persisted because the dispatcher that settles a graph
     * is routinely not the process that accepted it, and the spec is gone by then.
     *
     * `'block'` (the default) makes a failed step terminal for its dependents. `'edges'` releases
     * them along their drawn paths, which is what lets a workflow author a RECOVERY route. Compiled
     * flows are `'edges'`; without persisting it, every recovery path a flow author draws is dead
     * machinery — the edges exist and nothing ever follows them.
     */
    failureSemantics?: 'block' | 'edges';
    submittedByAgentRunID: string | null;
    /**
     * Who the graph belongs to.
     *
     * Stored here rather than on a Task column because `Task.UserID` already means something else —
     * it designates a *human* task, the assignee the graph waits on — so setting it on a parent
     * would make every graph look like work waiting on a person. It is durable for the same reason
     * everything else in this bag is: the instance that needs it is routinely not the one that wrote
     * it. Consumed by the live-frame layer, which cannot authorize a viewer without knowing whose
     * run they are watching.
     */
    submittedByUserID?: string | null;
    /**
     * Set once the completion handler has delivered. Written with a compare-and-swap guard, which is
     * what turns at-least-once delivery into effectively-once: a crash between "graph complete" and
     * "continuation delivered" leaves this unset, so the next sweep retries, and two instances
     * racing the same completion produce one winner rather than two notifications.
     */
    continuationDeliveredAt?: string;
    /**
     * HOW it was delivered — written by the same compare-and-swap that sets the timestamp.
     *
     * `'expired'` means the settlement was found after its delivery window, so the run and its cost
     * were corrected but nothing was announced: posting a week-old "your workflow finished" into a
     * live conversation, or starting a fresh billed turn for it, is worse than staying quiet. The
     * distinction has to survive in the row, or an expired settlement is indistinguishable from a
     * delivered one the moment anybody looks afterwards.
     */
    continuationDeliveredAs?: 'delivered' | 'expired' | 'cancelled';
};

/**
 * Continuation chains are bounded separately from graph nesting.
 *
 * The spawn-depth cap governs graphs nested *by tasks*; this one governs graphs chained *by
 * continuations* — an agent re-invoked with a finished graph's results can emit another graph, which
 * re-invokes it again. Both loops exist and neither cap constrains the other, so both are needed. At
 * the cap the dispatcher forces `continuation: 'message'`, which ends the chain without losing the
 * results.
 */
export const MAX_REINVOKE_DEPTH = 5;

/** What a parent row means when it carries no metadata, or metadata we cannot read. */
const DEFAULT_PARENT_METADATA: TaskGraphParentMetadata = {
    continuation: 'message',
    reinvokeDepth: 0,
    failureSemantics: 'block',
    submittedByAgentRunID: null,
    submittedByUserID: null,
};

/**
 * Parses a parent Task's continuation metadata.
 *
 * Shared by the writer (`TaskGraphService`) and the reader (`TaskGraphDispatcher`) so the two cannot
 * drift — the failure that shape invites is a graph that completes and then does nothing, because
 * one side wrote a field the other never looked for.
 *
 * Unparseable input defaults to `message` rather than throwing. A row predating this metadata, or
 * one a user hand-edited, is a legitimate state, and the right response to "I don't know what this
 * graph wanted" is still to tell the user their work finished.
 */
export function ParseTaskGraphParentMetadata(raw: string | null | undefined): TaskGraphParentMetadata {
    if (!raw) return { ...DEFAULT_PARENT_METADATA };
    try {
        const parsed = JSON.parse(raw) as Partial<TaskGraphParentMetadata>;
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PARENT_METADATA };
        return {
            ...DEFAULT_PARENT_METADATA,
            ...parsed,
            // Guard the two fields the dispatcher branches on. A JSON round-trip, a hand edit, or a
            // future producer can all supply the wrong type here, and a bad `reinvokeDepth` would
            // either disable the cap (NaN comparisons are always false) or trip it immediately.
            continuation: parsed.continuation === 'reinvoke' || parsed.continuation === 'none'
                ? parsed.continuation
                : 'message',
            failureSemantics: parsed.failureSemantics === 'edges' ? 'edges' : 'block',
            reinvokeDepth: Number.isFinite(parsed.reinvokeDepth) ? Number(parsed.reinvokeDepth) : 0,
            // Guarded like the others: this is read to explain a settlement after the fact, and an
            // arbitrary string arriving from a hand edit should read as "unknown", not be echoed.
            continuationDeliveredAs: DELIVERY_OUTCOMES.has(parsed.continuationDeliveredAs as string)
                ? parsed.continuationDeliveredAs
                : undefined,
        };
    } catch {
        return { ...DEFAULT_PARENT_METADATA };
    }
}

/**
 * How a settlement's announcement ended — the values `TryClaimContinuation` may record.
 *
 * `expired` means found too late to announce; `cancelled` means there was deliberately nobody left
 * to announce to, because the run that submitted the graph was cancelled. Both are settlements that
 * completed WITHOUT an announcement, and keeping them distinct is the difference between "we missed
 * it" and "we chose not to".
 */
const DELIVERY_OUTCOMES: ReadonlySet<string> = new Set(['delivered', 'expired', 'cancelled']);

/** What a cancellation actually managed to do. */
export type TaskGraphCancelResult = {
    /** False when anything the caller asked to stop is still running. */
    Success: boolean;
    /** True only when every non-terminal task in the graph — and its descendants — is Cancelled. */
    Cancelled: boolean;
    /** Named so the caller can say which parts of the workflow are still going. */
    UncancelledTaskNames: string[];
    ErrorMessage?: string;
};

/** True when a continuation chain has gone as far as it may. */
export function IsReinvokeCapReached(meta: TaskGraphParentMetadata): boolean {
    return meta.reinvokeDepth >= MAX_REINVOKE_DEPTH;
}

export type TaskGraphSubmitResult = {
    Success: boolean;
    /** The parent task representing the whole graph — the handle for status, cancel and retry. */
    ParentTaskID?: string;
    /** tempId -> persisted Task.ID, for callers that need to correlate back to their spec. */
    TaskIDMap?: Map<string, string>;
    ErrorMessage?: string;
};

/** Name of the task type used for agent-orchestrated graphs. */
export const TASK_TYPE_NAME = 'AI Workflow';

/**
 * The node kinds a `Task` row can actually represent, and therefore the ones the dispatcher can run.
 *
 * `Agent` and `Action` have their own foreign keys; `Human` is a task with an assignee; `ForEach`
 * and `While` carry their loop definition in `Task.Configuration` and their repeated body in the
 * same `AgentID` / `ActionID` keys.
 *
 * `Prompt` joins them now that `TaskPromptRunner` exists — it carries `Task.PromptID`. `External`
 * remains absent: it is completed by a system that has no way to report back, so persisting one
 * would produce a task that waits forever.
 */
const DISPATCHABLE_KINDS: ReadonlyArray<TaskGraphSpecNode['kind']> = [
    'Agent', 'Action', 'Human', 'ForEach', 'While', 'Prompt',
];

/**
 * Reports the node kinds this dispatcher cannot execute, or `null` when the graph is fully runnable.
 *
 * **Why this is a submit-time check and not a validation rule.** `ValidateTaskGraphSpec` is a pure
 * function over the spec: it answers "is this a well-formed graph?", and its answer has to be the
 * same in a browser, a CLI and a server. "Can it run *here*?" is a different question whose answer
 * changes as runners are added, so it belongs to the runtime that owns the runners.
 *
 * **Why refuse rather than persist-and-stall.** Before this existed, `persistTasks` keyed off which
 * configuration field happened to be populated and fell through to "Human task assigned to the
 * submitter" for everything else — so a loop step silently became an approval request nobody asked
 * for and nothing would ever complete. A graph that hangs forever while *looking* like it is waiting
 * on a person is the most expensive failure available here. Refusing at the door instead names the
 * offending step while the workflow is still the author's to edit.
 */
/**
 * Projects a spec node onto the `Task.Configuration` bag.
 *
 * Everything the row cannot hold in a column of its own: the kind-specific settings, the payload
 * mappings, and the execution policy. Returning `null` for an empty result keeps `Configuration`
 * NULL rather than `"{}"`, so "this step has no settings" reads the same in the database as it does
 * in the spec.
 *
 * **The mappings are the point.** They are how a step's result reaches the payload, and every
 * branch condition downstream reads the payload — so a step persisted without them produces a
 * workflow whose conditions all evaluate against nothing. Undefined is falsy, so that failure looks
 * exactly like a branch legitimately not being taken.
 */
export function BuildStepConfiguration(node: TaskGraphSpecNode): MJTaskEntity_ITaskStepConfiguration | null {
    const config: MJTaskEntity_ITaskStepConfiguration = {};

    const agent = ConfigOf(node, 'Agent');
    if (agent?.message || agent?.templateParameters) {
        config.agent = { message: agent.message, templateParameters: agent.templateParameters };
    }

    const prompt = ConfigOf(node, 'Prompt');
    if (prompt?.templateParameters) config.prompt = { templateParameters: prompt.templateParameters };

    const forEach = ConfigOf(node, 'ForEach');
    if (forEach) config.forEach = forEach;

    const whileOp = ConfigOf(node, 'While');
    if (whileOp) config.while = whileOp;

    // `expiresInHours` as well as instructions: dropping it here is what would leave the deadline in
    // the spec and out of the row the dispatcher actually reads, so the request would be raised with
    // no ExpiresAt and the author's timeout would silently not exist.
    const human = ConfigOf(node, 'Human');
    if (human?.instructions || human?.expiresInHours) {
        config.human = { instructions: human.instructions, expiresInHours: human.expiresInHours };
    }

    const external = ConfigOf(node, 'External');
    if (external) config.external = external;

    // Mappings live on the Action arm of the spec, but they are not action-specific: a loop step
    // carries them too, which is how its per-iteration inputs and results are wired.
    const action = ConfigOf(node, 'Action');
    const inputMapping = action?.inputMapping;
    const outputMapping = action?.outputMapping;
    if (inputMapping) config.inputMapping = inputMapping;
    if (outputMapping) config.outputMapping = outputMapping;

    if (node.policy) {
        config.policy = {
            timeoutSeconds: node.policy.timeoutSeconds,
            retryCount: node.policy.retryCount,
            onError: node.policy.onError,
        };
    }

    // The author's own arrangement, carried through so a hand-drawn workflow runs — and appears in
    // run history — in the shape they drew. Dropping it (as this did) meant a workflow someone had
    // laid out carefully came back as a machine-arranged graph the first time they watched it run.
    // Only authored geometry is stored: a graph with none has its layout derived at render time, and
    // persisting a derived layout would freeze one rendering of a graph that can still change.
    if (node.layout && Object.keys(node.layout).length > 0) {
        config.layout = {
            x: node.layout.x,
            y: node.layout.y,
            width: node.layout.width,
            height: node.layout.height,
        };
    }

    return Object.keys(config).length > 0 ? config : null;
}

/** Internal alias so the persistence path reads as a step, not as a projection. */
const buildStepConfiguration = BuildStepConfiguration;

/**
 * The loop definition on a node, whichever loop kind it is.
 *
 * ForEach and While differ in how they decide to iterate, not in what they repeat, so everything
 * downstream of that decision — body resolution, name collection, persistence — treats them alike.
 */
export function LoopOperationOf(node: TaskGraphSpecNode): ForEachOperation | WhileOperation | null {
    return ConfigOf(node, 'ForEach') ?? ConfigOf(node, 'While') ?? null;
}

/** Every agent name a node references, including the sub-agent a loop repeats. */
function agentNamesIn(node: TaskGraphSpecNode): string[] {
    const names = [ConfigOf(node, 'Agent')?.agentName, LoopOperationOf(node)?.subAgent?.name];
    return names.filter((n): n is string => !!n);
}

/** Every prompt name a node references, including the prompt a loop repeats. */
function promptNamesIn(node: TaskGraphSpecNode): string[] {
    const names = [ConfigOf(node, 'Prompt')?.promptName, LoopOperationOf(node)?.prompt?.name];
    return names.filter((n): n is string => !!n);
}

/** Every action name a node references, including the action a loop repeats. */
function actionNamesIn(node: TaskGraphSpecNode): string[] {
    const names = [ConfigOf(node, 'Action')?.actionName, LoopOperationOf(node)?.action?.name];
    return names.filter((n): n is string => !!n);
}

/**
 * The transaction capability of a provider, when it has one.
 *
 * `IMetadataProvider` does not declare transaction support — a browser provider genuinely has none —
 * so this narrows by CAPABILITY rather than asserting a type the interface does not promise. A
 * provider without it returns undefined and `RunInEntityTransaction` runs the work directly, which
 * is the honest degradation: server submissions get atomicity, and a client submission behaves
 * exactly as it did before rather than failing at a call site that claimed something untrue.
 */
function asTransactionCapable(provider: IMetadataProvider): TransactionCapableProvider | undefined {
    const candidate = provider as unknown as TransactionCapableProvider;
    return candidate.SupportsEntityTransactions === true && typeof candidate.BeginEntityTransaction === 'function'
        ? candidate
        : undefined;
}

/** The slice of a provider `RunInEntityTransaction` needs. */
type TransactionCapableProvider = {
    SupportsEntityTransactions?: boolean;
    BeginEntityTransaction?(): Promise<EntityTransactionScope>;
};

export function FindUnrunnableKinds(spec: TaskGraphSpec): string | null {
    const offenders = spec.tasks.filter((t) => !DISPATCHABLE_KINDS.includes(t.kind));
    if (offenders.length === 0) return null;

    const detail = offenders.map((t) => `"${t.name}" (${t.kind})`).join(', ');
    return (
        `"${spec.workflowName}" cannot be run yet: ${detail}. ` +
        `The dispatcher runs agent, action, person and loop steps. Prompt steps and steps completed ` +
        `by an outside system are not supported yet — replace them, or split them out of this workflow.`
    );
}

/**
 * Reports human steps assigned to someone other than the submitter, or `null` when there are none.
 *
 * Cross-user assignment needs an authorization model (#3524) — deciding that A may put work in B's
 * inbox is a permissions question, not a graph question. Until it lands, a workflow can only ask the
 * person who started it.
 *
 * **Why refuse rather than reassign.** Persist wrote `task.UserID = submitter` unconditionally, so
 * an authored `assignToUserID` was overwritten in silence. Every layer above accepts the field —
 * the flow compiler reads it into the spec, the validator passes it, the spec type declares it — so
 * silence here is indistinguishable from support: the graph submits, a step appears in the WRONG
 * person's inbox, the named person is never told, and the author has no reason to suspect any of it.
 * Refusing while the graph is still the author's to edit is the only point at which saying so costs
 * nothing.
 */
export function FindCrossUserAssignments(spec: TaskGraphSpec, submitterUserID: string): string | null {
    const offenders = spec.tasks.filter((t) => {
        const assignTo = ConfigOf(t, 'Human')?.assignToUserID;
        return !!assignTo && !UUIDsEqual(assignTo, submitterUserID);
    });
    if (offenders.length === 0) return null;

    const detail = offenders.map((t) => `"${t.name}"`).join(', ');
    return (
        `"${spec.workflowName}" was not started: ${detail} asks a person other than whoever runs the ` +
        `workflow. Assigning a step to someone else is not available yet (#3524) — a workflow can ` +
        `only ask the person who started it. Remove assignToUserID from those steps.`
    );
}

export class TaskGraphService {
    /**
     * Validates and persists a task graph, returning as soon as it is durable.
     *
     * Deliberately does NOT start execution: the dispatcher discovers `Pending` work by polling
     * claimable tasks, so submission and execution are decoupled even within a single process.
     * A submitted graph therefore survives the submitting request, the submitting agent run, and
     * the submitting server — which is the entire point of Task rows over in-run state (D8).
     */
    public async Submit(spec: TaskGraphSpec, context: TaskGraphSubmitContext): Promise<TaskGraphSubmitResult> {
        // 1. Structural validation. Server-side is the source of truth even when a producer already
        //    validated client-side — the same function runs in both places, so they cannot disagree.
        const validation = ValidateTaskGraphSpec(spec);
        if (!validation.Valid) {
            const message = `Task graph "${spec.workflowName}" is invalid:\n${FormatValidationErrors(validation.Errors)}`;
            LogError(`[TaskGraphService] ${message}`);
            return { Success: false, ErrorMessage: message };
        }

        // 1b. Representability. Validation asks "is this a well-formed graph?"; this asks "can THIS
        //     dispatcher run it?" — a different question, and one the pure validator has no business
        //     answering, since capability is a property of the runtime, not of the spec.
        const unrunnable = this.findUnrunnableKinds(spec);
        if (unrunnable) {
            LogError(`[TaskGraphService] ${unrunnable}`);
            return { Success: false, ErrorMessage: unrunnable };
        }

        // 1b-ii. Assignability. Same question, narrower: this dispatcher can only ask the person who
        //        submitted the graph. Persist used to overwrite an authored `assignToUserID` with
        //        the submitter and say nothing, so a step meant for someone else landed in the
        //        wrong inbox and the named person was never told. The compiler accepts the field and
        //        the validator passes it, which makes silence here indistinguishable from support.
        const misassigned = FindCrossUserAssignments(spec, context.ContextUser.ID);
        if (misassigned) {
            LogError(`[TaskGraphService] ${misassigned}`);
            return { Success: false, ErrorMessage: misassigned };
        }

        // 1c. Chain depth. A flow that dispatches a graph containing itself recurses without bound,
        //     and each hop costs real money and real rows before anyone notices. The cap is checked
        //     HERE rather than at execution because refusing to write the graph is the only point at
        //     which nothing has happened yet.
        const depth = context.ReinvokeDepth ?? 0;
        if (depth >= MAX_REINVOKE_DEPTH) {
            const message =
                `"${spec.workflowName}" was not started: it is ${depth} levels deep in a chain of ` +
                `workflows starting workflows, which is the limit. A workflow that reaches this is ` +
                `almost always calling itself, directly or through another one.`;
            LogError(`[TaskGraphService] ${message}`);
            return { Success: false, ErrorMessage: message };
        }

        try {
            // 2. Resolve every agent and action BEFORE writing anything. An unresolvable name is a
            //    hard error, not a skipped node: silently dropping a task executes the graph with
            //    holes where the caller's work should have been.
            const agentIDsByName = await this.resolveAgents(spec, context);
            if (!agentIDsByName.Success) {
                return { Success: false, ErrorMessage: agentIDsByName.ErrorMessage };
            }
            const actionIDsByName = await this.resolveActions(spec, context);
            if (!actionIDsByName.Success) {
                return { Success: false, ErrorMessage: actionIDsByName.ErrorMessage };
            }
            const promptIDsByName = await this.resolvePrompts(spec, context);
            if (!promptIDsByName.Success) {
                return { Success: false, ErrorMessage: promptIDsByName.ErrorMessage };
            }

            const taskTypeID = await this.ensureTaskType(context);

            // 3. Persist — ALL of it, or none of it.
            //
            // ── The whole graph becomes visible together, or not at all ─────────────────────────
            // The dispatcher discovers work by polling for child tasks in 'Pending'. Writing the
            // children first and their dependencies afterwards leaves a window — milliseconds, but
            // real — in which every task exists with NO prerequisites recorded yet. A poll landing
            // there sees a graph of independent tasks and claims all of them at once.
            //
            // Observed, not theorised: in graph C08B36E3 the dependency gating `Research: focused`
            // was written at 00:00:59.653 and that task STARTED at 00:00:59.647 — six milliseconds
            // before the edge that was supposed to hold it back existed. `Close out: approved` ran
            // in the same wave as the research steps, before the draft it was meant to judge had
            // been written. The graph then reported Complete, having executed in an order its author
            // never drew.
            //
            // A transaction is the whole fix: the dispatcher cannot observe a half-built graph
            // because a half-built graph is never visible. `RunInEntityTransaction` degrades to
            // running the work as-is on a provider that cannot transact, which is the correct
            // fallback rather than a silent failure.
            //
            // The PARENT is inside it too. Written outside, a failure while persisting children or
            // edges would roll those back and leave a childless parent durably in 'Pending' — which
            // never settles (the rollup deliberately skips a graph with no nodes) and never dies, so
            // the active-graph scan picks it up on every poll forever: permanent debris plus a
            // permanent tick of wasted work for each failed submit. Ordering inside the transaction
            // is unchanged, because edges only ever reference child IDs.
            const { parentTaskID, taskIDMap } = await RunInEntityTransaction(
                asTransactionCapable(context.Provider),
                async () => {
                    // Parent first so children have a ParentID, then children, then edges — edges
                    // last because they reference two child IDs that must both exist.
                    const parentID = await this.persistParent(spec, taskTypeID, context);
                    const map = await this.persistChildren(
                        spec, parentID, taskTypeID, agentIDsByName.Map!, actionIDsByName.Map!, promptIDsByName.Map!, context,
                    );
                    await this.persistDependencies(spec, map, context);
                    return { parentTaskID: parentID, taskIDMap: map };
                },
            );

            LogStatus(
                `[TaskGraphService] Submitted "${spec.workflowName}": parent ${parentTaskID}, ${taskIDMap.size} task(s). ` +
                `Awaiting dispatcher pickup.`,
            );
            return { Success: true, ParentTaskID: parentTaskID, TaskIDMap: taskIDMap };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[TaskGraphService] Submit failed for "${spec.workflowName}": ${message}`);
            return { Success: false, ErrorMessage: message };
        }
    }

    /**
     * Cancels a graph, everything in it that has not already settled, and everything it started.
     *
     * Cancels children first: a parent marked `Cancelled` while children are still `Pending` would
     * leave the dispatcher free to pick those children up, which is the opposite of what the caller
     * asked for.
     *
     * **The verdict is the outcome, not the attempt** (R2-9). This returned `true` unconditionally
     * while logging each child that failed to cancel — so one failed save left that child `Pending`,
     * told the caller cancellation had succeeded, and let the dispatcher run the child afterwards.
     * The graph could then settle `Complete` and ANNOUNCE ITS COMPLETION into the conversation of a
     * workflow the user had cancelled. A partial cancel now says so and names what survived; the
     * graph stays active, so retrying is meaningful rather than cosmetic.
     */
    public async Cancel(parentTaskID: string, context: TaskGraphSubmitContext): Promise<TaskGraphCancelResult> {
        try {
            const children = await this.loadChildren(parentTaskID, context);
            const uncancelled: string[] = [];
            for (const child of children) {
                // Terminal work is left alone — cancelling a completed task would rewrite history.
                if (['Complete', 'Failed', 'Cancelled'].includes(child.Status)) continue;
                child.Status = 'Cancelled';
                if (!(await child.Save())) {
                    LogError(`[TaskGraphService] Failed to cancel task ${child.ID}: ${child.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    uncancelled.push(child.Name);
                }
            }

            // Withdraw the questions too. A human step that was waiting has an open
            // `MJ: AI Agent Requests` row, and cancelling only the Task left that row `Requested`
            // FOREVER: the person keeps seeing "a workflow is waiting on you" in their inbox for a
            // workflow that no longer exists, and answering it settles nothing because the task is
            // already Cancelled. Nothing else ever closes these — the dispatcher only expires rows
            // that carry a deadline, and most do not.
            await this.cancelOpenRequests(children.map((c) => c.ID), context);

            // THE PARENT IS LEFT TO THE DISPATCHER, DELIBERATELY.
            //
            // Writing it terminal here skipped the settle path entirely — no cost rollup, no run
            // settlement, no notification — so the submitting agent run stayed `Paused` forever.
            // Worse, it was NONDETERMINISTIC: if a dispatcher poll happened to land between the
            // child cancels above and the parent write, the graph settled through the normal path
            // and the run WAS failed and messaged. Cancel behaved differently run to run depending
            // on timing.
            //
            // With the children cancelled, `ComputeParentRollup` reaches `Cancelled` on its own and
            // the ordinary settle sequence runs — rollup, run settlement, continuation — exactly as
            // it does for a graph that finished by itself. Less code, one path, and a deterministic
            // outcome.
            //
            // The parent stays non-terminal until then, so the sweep still sees it as active work.

            // WHAT THIS WORKFLOW STARTED IS ALSO CANCELLED (R2-9).
            //
            // A graph's step can be an agent that submits a graph of its own, and those sub-graphs
            // persist as ROOTS — linked back only through the child task's `AgentRunID`. So
            // cancelling a workflow left its descendants running, and on settlement one of them can
            // REINVOKE the cancelled workflow's own agent for a fresh billed turn: the user stopped
            // a workflow and it started itself again.
            //
            // Bounded by the reinvoke depth cap, which is what bounds the chain in the first place.
            const nested = await this.cancelNestedGraphs(children, context, 0);
            uncancelled.push(...nested);

            if (uncancelled.length > 0) {
                return {
                    Success: false,
                    Cancelled: false,
                    UncancelledTaskNames: uncancelled,
                    ErrorMessage:
                        `Cancelled what it could, but ${uncancelled.length} task(s) could not be cancelled ` +
                        `(${uncancelled.join(', ')}). The workflow is still active — retry the cancel.`,
                };
            }
            return { Success: true, Cancelled: true, UncancelledTaskNames: [] };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`[TaskGraphService] Cancel failed for ${parentTaskID}: ${message}`);
            return { Success: false, Cancelled: false, UncancelledTaskNames: [], ErrorMessage: message };
        }
    }

    /**
     * Cancels the graphs that this graph's own steps submitted, one level at a time.
     *
     * The linkage is `child task → AgentRunID → the graphs that run submitted`, which is exactly how
     * the continuation chain finds its way back up; walking it downward is the same relation read the
     * other way. Depth-capped by the same constant that caps reinvocation, so a self-referencing
     * workflow cannot make cancellation recurse further than it could have spawned.
     *
     * @returns names of tasks in descendant graphs that could not be cancelled
     */
    private async cancelNestedGraphs(
        children: readonly MJTaskEntity[],
        context: TaskGraphSubmitContext,
        depth: number,
    ): Promise<string[]> {
        if (depth >= MAX_REINVOKE_DEPTH) return [];
        const runIDs = [...new Set(children.map((c) => c.AgentRunID).filter((id): id is string => !!id))];
        if (runIDs.length === 0) return [];

        const rv = RunView.FromMetadataProvider(context.Provider);
        const inList = runIDs.map((id) => `'${id}'`).join(',');
        // Graphs those runs submitted: root tasks of the workflow type carrying the run's ID.
        const subGraphs = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID IS NULL AND AgentRunID IN (${inList})`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            context.ContextUser,
        );
        if (!subGraphs.Success) {
            LogError(`[TaskGraphService] Could not look for sub-graphs while cancelling: ${subGraphs.ErrorMessage}`);
            return [];
        }

        const failures: string[] = [];
        for (const row of subGraphs.Results ?? []) {
            const result = await this.Cancel(row.ID, context);
            if (!result.Success) failures.push(...result.UncancelledTaskNames);
        }
        return failures;
    }

    /**
     * Closes the still-open requests raised for a set of tasks.
     *
     * `Canceled` rather than `Expired`: nobody ran out of time, the ask was withdrawn — and the two
     * mean different things downstream, since the dispatcher treats an expired human step as a
     * FAILURE a give-up edge can route around, which would be a lie about a graph somebody stopped
     * on purpose.
     *
     * Failures here are logged and never propagated: the graph is already cancelled, and refusing to
     * finish that because an inbox row would not close would leave the graph in a worse state than
     * the debris it is trying to avoid.
     */
    private async cancelOpenRequests(taskIDs: string[], context: TaskGraphSubmitContext): Promise<void> {
        if (taskIDs.length === 0) return;
        try {
            const idList = taskIDs.map((id) => `'${id}'`).join(',');
            const open = await RunView.FromMetadataProvider(context.Provider).RunView<MJAIAgentRequestEntity>(
                {
                    EntityName: 'MJ: AI Agent Requests',
                    ExtraFilter: `Status='Requested' AND OriginatingTaskID IN (${idList})`,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                context.ContextUser,
            );
            if (!open.Success) {
                LogError(`[TaskGraphService] Could not read open requests to cancel: ${open.ErrorMessage}`);
                return;
            }

            for (const request of open.Results ?? []) {
                request.Status = 'Canceled';
                request.Comments = 'The workflow that asked this was cancelled.';
                if (!(await request.Save())) {
                    LogError(
                        `[TaskGraphService] Could not withdraw request ${request.ID}: ` +
                        `${request.LatestResult?.CompleteMessage ?? 'unknown error'}. It will keep showing ` +
                        `in someone's inbox for a workflow that no longer exists.`,
                    );
                }
            }
            if ((open.Results ?? []).length > 0) {
                LogStatus(`[TaskGraphService] Withdrew ${open.Results!.length} open request(s) for the cancelled graph.`);
            }
        } catch (e) {
            LogError(`[TaskGraphService] Could not withdraw open requests: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Returns a failed task to `Pending` so the dispatcher can run it again.
     *
     * Also clears any `Blocked` dependents, since they were only blocked because this task failed —
     * leaving them blocked would make the retry pointless, as the graph still could not progress
     * past this node.
     */
    public async Retry(taskID: string, context: TaskGraphSubmitContext, inputPayload?: unknown): Promise<boolean> {
        try {
            const task = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
            if (!(await task.Load(taskID))) return false;
            if (task.Status !== 'Failed') {
                LogError(`[TaskGraphService] Cannot retry task ${taskID}: status is ${task.Status}, expected Failed.`);
                return false;
            }

            // An edited input rides the retry: the operator saw WHY it failed and is re-running the
            // step with a corrected brief. Applies to this run only — the graph's spec is long gone.
            //
            // Written through the GUARDED statement rather than onto the in-memory row, so the edit
            // cannot ride along on the full-row save below. The window here is narrower than
            // `UpdateTaskInput`'s (the pre-state is `Failed`, so a concurrent claim is not the
            // hazard — a concurrent human retry is), but the shape is the same and it costs one
            // statement to not have it. The rest of this method's full-row save predates this PR
            // and is Round 3's to purge; the new write does not add to it.
            if (inputPayload !== undefined) {
                const typeID = await this.ensureTaskType(context);
                const json = typeof inputPayload === 'string' ? inputPayload : JSON.stringify(inputPayload);
                const wrote = await this.debugWrites.TryUpdateInputPayload(
                    context.Provider, taskID, json, 'Failed', typeID, context.ContextUser,
                );
                if (!wrote) {
                    LogError(`[TaskGraphService] Could not apply the edited input to task ${taskID}; retry refused rather than re-running the old brief.`);
                    return false;
                }
                // Keep the in-memory row in step with what was just written, so the save below does
                // not put the old input back.
                task.InputPayload = json;
            }
            task.Status = 'Pending';
            task.ErrorMessage = null;
            task.StartedAt = null;
            task.CompletedAt = null;
            task.PercentComplete = 0;
            // Clear any stale claim so the task is immediately claimable.
            task.ClaimedBy = null;
            task.ClaimExpiresAt = null;
            if (!(await task.Save())) return false;

            if (task.ParentID) {
                for (const sibling of await this.loadChildren(task.ParentID, context)) {
                    if (sibling.Status === 'Blocked') {
                        sibling.Status = 'Pending';
                        await sibling.Save();
                    }
                }
            }
            return true;
        } catch (e) {
            LogError(`[TaskGraphService] Retry failed for ${taskID}: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // debug / runner control plane
    //
    // Every verb here is durable, declarative state the dispatcher's claim filter consults on its
    // next pass — never a call into a running dispatcher. That is what makes the controls work
    // across instances and restarts, and what bounds their latency to one poll interval. See
    // `debug-state.ts` for the model.
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Store for the guarded JSON_MODIFY writes. The instance identity and TTL are claim-protocol
     * concerns this class never exercises — the debug writes are instance-free.
     */
    private readonly debugWrites = new TaskClaimStore('task-graph-service', 0);

    /** Result shape shared by the control verbs: what happened, and the state that now holds. */
    private controlResult(success: boolean, debug?: TaskGraphDebugState, errorMessage?: string) {
        return { Success: success, Debug: debug, ErrorMessage: errorMessage };
    }

    /**
     * Loads a graph parent and proves it IS a workflow graph before any debug write.
     *
     * Read with `BypassCache` for the same reason the dispatcher reads rows that way: the debug bag
     * is written by direct `JSON_MODIFY` statements that fire no cache invalidation, so a cached
     * read here could merge new state over a stale copy and silently resurrect a cleared flag.
     */
    private async loadWorkflowParent(
        parentTaskID: string,
        context: TaskGraphSubmitContext,
    ): Promise<{ typeID: string; inputPayload: string | null; status: string } | null> {
        const typeID = await this.ensureTaskType(context);
        const rows = await RunView.FromMetadataProvider(context.Provider).RunView<{
            ID: string; TypeID: string; InputPayload: string | null; Status: string;
        }>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ID='${parentTaskID.replace(/'/g, "''")}'`,
                Fields: ['ID', 'TypeID', 'InputPayload', 'Status'],
                ResultType: 'simple',
                BypassCache: true,
            },
            context.ContextUser,
        );
        const row = rows.Success ? rows.Results?.[0] : undefined;
        if (!row) return null;
        if (!UUIDsEqual(row.TypeID, typeID)) return null;
        return { typeID, inputPayload: row.InputPayload, status: row.Status };
    }

    /**
     * Writes the debug-bag fields a verb OWNS, and reports the state that results.
     *
     * Field-scoped on purpose — see {@link TaskClaimStore.TryWriteDebugFields}. A verb declares the
     * paths it is responsible for; everything else in the bag is left exactly as the database has
     * it, so a concurrent step-consume, breakpoint edit, or override cannot be undone by a verb that
     * was not talking about them.
     *
     * The returned state is this instance's best view (read + the fields just written) and is
     * advisory — the same posture the console takes toward frames.
     */
    private async writeDebugFields(
        parentTaskID: string,
        context: TaskGraphSubmitContext,
        build: (current: TaskGraphDebugState) => {
            Fields: readonly TaskGraphDebugFieldWrite[];
            Next: TaskGraphDebugState;
        },
    ): Promise<{ Success: boolean; Debug?: TaskGraphDebugState; ErrorMessage?: string }> {
        const parent = await this.loadWorkflowParent(parentTaskID, context);
        if (!parent) return this.controlResult(false, undefined, 'Not a workflow graph this control plane can act on.');

        const { Fields, Next } = build(ParseTaskGraphDebugState(parent.inputPayload));
        const ok = await this.debugWrites.TryWriteDebugFields(
            context.Provider, parentTaskID, Fields, parent.typeID, context.ContextUser,
        );
        if (!ok) return this.controlResult(false, undefined, 'The debug state could not be written; see the server log.');
        return this.controlResult(true, Next);
    }

    /**
     * Pauses a graph: nothing new is claimed until it is resumed. In-flight steps finish naturally
     * and their completions land — a pause gates claiming and never touches a live claim, which is
     * why there is no "what happens to the claim" question to answer.
     */
    public async PauseGraph(parentTaskID: string, context: TaskGraphSubmitContext, pausedByUserID?: string | null) {
        const pausedBy = pausedByUserID ?? context.ContextUser?.ID ?? null;
        return this.writeDebugFields(parentTaskID, context, (current) => ({
            // Pause owns the pause fields AND the step allowance: an allowance armed a moment ago is
            // for a run the operator has now stopped, so clearing it is the verb's meaning rather
            // than a side effect. Breakpoints and overrides are untouched — they outlive a pause.
            Fields: [
                TaskClaimStore.DebugField('$.debug.paused', { Kind: 'bool', Value: true }),
                TaskClaimStore.DebugField('$.debug.pausedReason', { Kind: 'string', Value: 'user' }),
                TaskClaimStore.DebugField('$.debug.pausedBy', pausedBy ? { Kind: 'string', Value: pausedBy } : { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pausedAtTaskID', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.step', { Kind: 'null' }),
            ],
            Next: { ...current, paused: true, pausedBy, pausedReason: 'user', pausedAtTaskID: null, step: undefined },
        }));
    }

    /** Resumes a paused graph. Breakpoints and edge overrides survive — only the pause clears. */
    public async ResumeGraph(parentTaskID: string, context: TaskGraphSubmitContext) {
        return this.writeDebugFields(parentTaskID, context, (current) => {
            const next: TaskGraphDebugState = { ...current };
            delete next.paused;
            delete next.pausedBy;
            delete next.pausedReason;
            delete next.pausedAtTaskID;
            delete next.step;
            return {
                Fields: [
                    TaskClaimStore.DebugField('$.debug.paused', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.pausedReason', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.pausedBy', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.pausedAtTaskID', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.step', { Kind: 'null' }),
                ],
                Next: next,
            };
        });
    }

    /**
     * Arms a one-shot step allowance on a paused graph: `'one'` releases the next eligible task,
     * `'wave'` releases the current frontier, a task ID releases exactly that task. The dispatcher
     * consumes the allowance CAS-style, so two instances stepping the same graph release work once.
     */
    public async StepGraph(parentTaskID: string, target: StepTarget, context: TaskGraphSubmitContext) {
        const parent = await this.loadWorkflowParent(parentTaskID, context);
        if (!parent) return this.controlResult(false, undefined, 'Not a workflow graph this control plane can act on.');
        const current = ParseTaskGraphDebugState(parent.inputPayload);
        if (!current.paused) {
            return this.controlResult(false, current, 'Step only applies to a paused workflow — pause it first.');
        }
        return this.writeDebugFields(parentTaskID, context, (state) => ({
            Fields: [TaskClaimStore.DebugField('$.debug.step', { Kind: 'string', Value: target })],
            Next: { ...state, step: target },
        }));
    }

    /**
     * Replaces the graph's breakpoint set. Every ID must name a child of this graph — a breakpoint
     * on a task in some other graph would gate nothing and silently lie to the person who set it.
     */
    public async SetBreakpoints(parentTaskID: string, taskIDs: string[], context: TaskGraphSubmitContext) {
        const children = await this.loadChildren(parentTaskID, context);
        const childIDs = new Set(children.map((c) => c.ID.toLowerCase()));
        const foreign = taskIDs.filter((id) => !childIDs.has(id.toLowerCase()));
        if (foreign.length > 0) {
            return this.controlResult(false, undefined, `Not steps of this workflow: ${foreign.join(', ')}`);
        }
        return this.writeDebugFields(parentTaskID, context, (current) => {
            const next: TaskGraphDebugState = { ...current };
            if (taskIDs.length > 0) next.breakpoints = [...taskIDs];
            else delete next.breakpoints;
            return {
                Fields: [
                    TaskClaimStore.DebugField(
                        '$.debug.breakpoints',
                        taskIDs.length > 0 ? { Kind: 'json', Value: JSON.stringify(taskIDs) } : { Kind: 'null' },
                    ),
                ],
                Next: next,
            };
        });
    }

    /**
     * Overrides one edge's condition verdict — the operator's answer for a path the engine cannot
     * decide (a held graph) or decided wrongly (a broken guard). `'false'` reads as "branch not
     * taken" and cascades skips; `'true'` opens the gate; `null` removes the override.
     */
    public async SetEdgeOverride(
        parentTaskID: string,
        edgeID: string,
        verdict: EdgeOverrideVerdict | null,
        context: TaskGraphSubmitContext,
    ) {
        // Prove the edge belongs to this graph before writing anything about it.
        const edge = await context.Provider.GetEntityObject<MJTaskDependencyEntity>('MJ: Task Dependencies', context.ContextUser);
        if (!(await edge.Load(edgeID))) return this.controlResult(false, undefined, 'No such path.');
        const target = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
        if (!(await target.Load(edge.TaskID)) || !UUIDsEqual(target.ParentID ?? '', parentTaskID)) {
            return this.controlResult(false, undefined, 'That path does not belong to this workflow.');
        }

        // AN UNCONDITIONAL PATH CANNOT BE OVERRIDDEN — refused here so the two dialects agree.
        //
        // The engine reads overrides at different depths: an ordinary edge only consults one when
        // it HAS a condition, while the exclusive evaluator consults it before its no-condition
        // early return. Left open, the same override would force an unconditional exclusive edge to
        // lose while doing nothing at all to an unconditional ordinary one — the operator's answer
        // meaning two different things depending on a property of the graph they cannot see.
        // Refusing is the conservative reading, and it costs nothing: "don't take this branch" is
        // already expressible, precisely, as SkipTask on the step itself.
        if (verdict !== null && !edge.Condition?.trim()) {
            return this.controlResult(
                false,
                undefined,
                'That path has no condition to answer — it is always taken. To stop the branch, skip its step instead.',
            );
        }

        return this.writeDebugFields(parentTaskID, context, (current) => {
            const overrides = { ...(current.edgeOverrides ?? {}) };
            if (verdict === null) delete overrides[edgeID];
            else overrides[edgeID] = verdict;
            const next: TaskGraphDebugState = { ...current };
            if (Object.keys(overrides).length > 0) next.edgeOverrides = overrides;
            else delete next.edgeOverrides;
            return {
                // Scoped to THIS edge's key, not the whole map: two operators answering two
                // different held paths at once must not overwrite each other's answer.
                Fields: [
                    TaskClaimStore.DebugField(
                        `$.debug.edgeOverrides."${edgeID}"`,
                        verdict === null ? { Kind: 'null' } : { Kind: 'string', Value: verdict },
                    ),
                ],
                Next: next,
            };
        });
    }

    /**
     * Declares a Pending step not-taken. Downstream dependents proceed — `Skipped` satisfies a
     * prerequisite — and any open human request for the step is withdrawn so nobody keeps seeing an
     * ask for work the operator decided against.
     */
    public async SkipTask(taskID: string, context: TaskGraphSubmitContext): Promise<{ Success: boolean; ErrorMessage?: string }> {
        const typeID = await this.ensureTaskType(context);
        const ok = await this.debugWrites.TrySkipPending(context.Provider, taskID, typeID, context.ContextUser);
        if (!ok) {
            return { Success: false, ErrorMessage: 'Only a step that has not started can be skipped.' };
        }
        await this.cancelOpenRequests([taskID], context);
        return { Success: true };
    }

    /**
     * Marks a step Complete with an operator-supplied output.
     *
     * Human steps are refused here on purpose: they already have a first-class completion path
     * (`TaskGraph.CompleteTask`) with the assignee/elevation check, and this verb must not become
     * the door that bypasses it.
     */
    public async ForceCompleteTask(
        taskID: string,
        outputPayload: unknown,
        context: TaskGraphSubmitContext,
    ): Promise<{ Success: boolean; ErrorMessage?: string }> {
        const task = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
        if (!(await task.Load(taskID))) return { Success: false, ErrorMessage: 'No such step.' };
        if (task.UserID) {
            return { Success: false, ErrorMessage: 'A human step completes through its assignee — use CompleteTask.' };
        }
        const json = outputPayload == null
            ? null
            : typeof outputPayload === 'string' ? outputPayload : JSON.stringify(outputPayload);
        const typeID = await this.ensureTaskType(context);
        const ok = await this.debugWrites.TryForceComplete(context.Provider, taskID, json, typeID, context.ContextUser);
        if (!ok) {
            return {
                Success: false,
                ErrorMessage: 'The step is running with a live claim, or already finished. Cancel it or wait for the claim to lapse.',
            };
        }
        return { Success: true };
    }

    /**
     * Replaces a Pending step's input — the "edit the brief before stepping" move at a breakpoint.
     * Applies to this run only; the step must not have started.
     *
     * **A guarded statement, not load-check-save.** The in-memory `Status === 'Pending'` check plus
     * `task.Save()` is an unconditional full-row UPDATE: a task claimed in the window between the
     * load and the save has its claim columns reverted to the pre-claim snapshot *while its body
     * runs*, and a second instance then claims it again — the step executes twice. See
     * {@link TaskClaimStore.TryUpdateInputPayload}, which makes the check and the write one atomic
     * operation whose rowcount is the answer.
     */
    public async UpdateTaskInput(
        taskID: string,
        inputPayload: unknown,
        context: TaskGraphSubmitContext,
    ): Promise<{ Success: boolean; ErrorMessage?: string }> {
        try {
            const typeID = await this.ensureTaskType(context);
            const json = typeof inputPayload === 'string' ? inputPayload : JSON.stringify(inputPayload);
            const ok = await this.debugWrites.TryUpdateInputPayload(
                context.Provider, taskID, json, 'Pending', typeID, context.ContextUser,
            );
            if (!ok) {
                return {
                    Success: false,
                    ErrorMessage: 'Only a workflow step that has not started can have its input edited.',
                };
            }
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : String(e) };
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // internals
    // ────────────────────────────────────────────────────────────────────────

    /** Maps every referenced agent name to its ID, or reports all unresolvable names at once. */
    private async resolveAgents(
        spec: TaskGraphSpec,
        context: TaskGraphSubmitContext,
    ): Promise<{ Success: boolean; Map?: Map<string, string>; ErrorMessage?: string }> {
        // A loop's repeated sub-agent counts as a referenced agent. Collecting only the Agent nodes
        // left a loop body pointing at a name nothing had resolved, so the row got no AgentID and
        // the loop had nothing to run.
        const names = [...new Set(spec.tasks.flatMap(agentNamesIn))];
        if (names.length === 0) return { Success: true, Map: new Map() };

        const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string; Name: string }>(
            { EntityName: 'MJ: AI Agents', ExtraFilter: `Name IN (${quoted})`, Fields: ['ID', 'Name'], ResultType: 'simple' },
            context.ContextUser,
        );

        const found = new Map((result.Results ?? []).map((r) => [r.Name, r.ID]));
        const missing = names.filter((n) => !found.has(n));
        if (missing.length > 0) {
            return {
                Success: false,
                ErrorMessage:
                    `Task graph "${spec.workflowName}" references ${missing.length} unknown agent(s): ${missing.join(', ')}. ` +
                    `Submitting would execute the graph with holes where those tasks should be.`,
            };
        }
        return { Success: true, Map: found };
    }

    /**
     * Maps every referenced action name to its ID, or reports all unresolvable names at once.
     *
     * Deliberately a mirror of {@link resolveAgents} rather than a generalization of it: the two
     * read different entities and produce different error prose, and the shared shape is three
     * lines. Collapsing them would trade a readable failure message for a parameterized lookup.
     */
    /**
     * Maps every referenced prompt name to its ID.
     *
     * A prompt is addressed by name in the spec and stored as a foreign key on the row, exactly like
     * agents and actions — a name in JSON cannot be joined, checked, or survive a rename.
     */
    private async resolvePrompts(
        spec: TaskGraphSpec,
        context: TaskGraphSubmitContext,
    ): Promise<{ Success: boolean; Map?: Map<string, string>; ErrorMessage?: string }> {
        const names = [...new Set(spec.tasks.flatMap(promptNamesIn))];
        if (names.length === 0) return { Success: true, Map: new Map() };

        const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string; Name: string }>(
            { EntityName: 'MJ: AI Prompts', ExtraFilter: `Name IN (${quoted})`, Fields: ['ID', 'Name'], ResultType: 'simple' },
            context.ContextUser,
        );

        const found = new Map((result.Results ?? []).map((r) => [r.Name, r.ID]));
        const missing = names.filter((n) => !found.has(n));
        if (missing.length > 0) {
            return {
                Success: false,
                ErrorMessage:
                    `Task graph "${spec.workflowName}" references ${missing.length} unknown prompt(s): ${missing.join(', ')}. ` +
                    `Submitting would execute the graph with holes where those steps should be.`,
            };
        }
        return { Success: true, Map: found };
    }

    private async resolveActions(
        spec: TaskGraphSpec,
        context: TaskGraphSubmitContext,
    ): Promise<{ Success: boolean; Map?: Map<string, string>; ErrorMessage?: string }> {
        // Includes a loop's repeated action — see the note in resolveAgents.
        const names = [...new Set(spec.tasks.flatMap(actionNamesIn))];
        if (names.length === 0) return { Success: true, Map: new Map() };

        const quoted = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string; Name: string }>(
            { EntityName: 'MJ: Actions', ExtraFilter: `Name IN (${quoted})`, Fields: ['ID', 'Name'], ResultType: 'simple' },
            context.ContextUser,
        );

        const found = new Map((result.Results ?? []).map((r) => [r.Name, r.ID]));
        const missing = names.filter((n) => !found.has(n));
        if (missing.length > 0) {
            return {
                Success: false,
                ErrorMessage:
                    `Task graph "${spec.workflowName}" references ${missing.length} unknown action(s): ${missing.join(', ')}. ` +
                    `Submitting would execute the graph with holes where those tasks should be.`,
            };
        }
        return { Success: true, Map: found };
    }

    /**
     * Finds or creates the task type used for orchestrated graphs — exactly one of it, ever.
     *
     * **This resolves the engine's discriminator, not a label** (R2-7). Round 1 scoped every sweep
     * arm and both payload-writing guards to this type, so a second row sharing the name lets
     * different processes bind different IDs — and a graph stamped with the other one is invisible
     * to the sweep, never claimed, never settled, its submitting run `Paused` forever, with no
     * error anywhere.
     *
     * Race-safe by INSERT-then-reselect rather than by checking harder. Two concurrent first-ever
     * submissions both read "not there" and both insert; the unique index added in this round makes
     * the loser's insert fail, and the loser then re-reads and finds the winner's row. Checking
     * first is what created the window, so the fix cannot be a better check.
     */
    private async ensureTaskType(context: TaskGraphSubmitContext): Promise<string> {
        const found = await this.findTaskTypeID(context);
        if (found) return found;

        const tt = await context.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', context.ContextUser);
        tt.NewRecord();
        tt.Name = TASK_TYPE_NAME;
        tt.Description = 'Tasks created by agent-orchestrated workflows.';
        if (await tt.Save()) return tt.ID;

        // The insert lost. Almost certainly to the unique index and another process that got there
        // first — so re-read before treating it as a failure. Any other cause falls through to the
        // throw below with its own message intact.
        const winner = await this.findTaskTypeID(context);
        if (winner) return winner;

        throw new Error(`Could not create task type: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }

    /**
     * The `AI Workflow` task type's ID, resolved deterministically.
     *
     * `ORDER BY` is not decoration: two rows sharing the name come back in whatever order the engine
     * chooses, so an unordered `MaxRows: 1` lets two processes bind different IDs from the same
     * data. The index this round adds makes duplicates impossible going forward; the ordering makes
     * the resolution deterministic on a database that still has some, and the warning makes the
     * situation visible rather than merely survivable.
     */
    private async findTaskTypeID(context: TaskGraphSubmitContext): Promise<string | null> {
        const existing = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Task Types',
                ExtraFilter: `Name='${TASK_TYPE_NAME}'`,
                Fields: ['ID'],
                OrderBy: '__mj_CreatedAt ASC, ID ASC',
                ResultType: 'simple',
                MaxRows: 2,
            },
            context.ContextUser,
        );
        const rows = existing.Results ?? [];
        if (rows.length > 1) {
            LogError(
                `[TaskGraphService] More than one '${TASK_TYPE_NAME}' task type exists. Binding the oldest ` +
                `(${rows[0].ID}), but graphs stamped with the other are invisible to the dispatcher's ` +
                `sweep and will never settle. Merge them.`,
            );
        }
        return rows[0]?.ID ?? null;
    }

    /** Writes the parent task that represents the graph as a whole. */
    private async persistParent(spec: TaskGraphSpec, taskTypeID: string, context: TaskGraphSubmitContext): Promise<string> {
        const parent = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
        parent.NewRecord();
        parent.Name = spec.workflowName;
        parent.Description = spec.reasoning || 'Orchestrated workflow';
        parent.TypeID = taskTypeID;
        parent.EnvironmentID = context.EnvironmentID;
        parent.ConversationDetailID = context.ConversationDetailID ?? null;
        parent.Status = 'In Progress';
        parent.PercentComplete = 0;
        // The run that submitted this graph, in the COLUMN and not only in the metadata JSON below.
        // A json field cannot be joined, so provenance that lives only there is unavailable to any
        // query — which is how a human step ended up with no agent to ask on behalf of, and how a
        // dispatched run had no parent to roll its cost up to.
        parent.AgentRunID = context.AgentRunID ?? null;
        // The parent row carries what happens AFTER the graph settles. It lives here rather than in
        // dispatcher memory because the dispatcher that finishes a graph is frequently not the
        // process that accepted it — a restart, a second instance, or simply a long-running graph
        // all break that assumption. Anything the completion path needs has to be durable too.
        parent.InputPayload = JSON.stringify({
            continuation: spec.continuation ?? 'message',
            reinvokeDepth: context.ReinvokeDepth ?? 0,
            failureSemantics: spec.failureSemantics ?? 'block',
            submittedByAgentRunID: context.AgentRunID ?? null,
            submittedByUserID: context.ContextUser?.ID ?? null,
        } satisfies TaskGraphParentMetadata);
        if (!(await parent.Save())) {
            throw new Error(`Could not create parent task: ${parent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return parent.ID;
    }

    /** Writes each child task, returning the tempId -> real ID mapping edges will need. */
    private async persistChildren(
        spec: TaskGraphSpec,
        parentTaskID: string,
        taskTypeID: string,
        agentIDsByName: Map<string, string>,
        actionIDsByName: Map<string, string>,
        promptIDsByName: Map<string, string>,
        context: TaskGraphSubmitContext,
    ): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        // Resolved ONCE over the whole graph: a rank is a node's position in the topology, so it
        // cannot be computed per node without seeing all of them.
        const ranks = RankGraphNodes(
            spec.tasks.map((t) => t.tempId),
            spec.tasks.flatMap((t) =>
                (t.dependsOn ?? []).map((d) => ({ From: NormalizeDependency(d).tempId, To: t.tempId })),
            ),
        );
        for (const node of spec.tasks) {
            const task = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
            task.NewRecord();
            task.Name = node.name;
            task.Description = node.description;
            task.TypeID = taskTypeID;
            task.EnvironmentID = context.EnvironmentID;
            task.ParentID = parentTaskID;
            task.ConversationDetailID = context.ConversationDetailID ?? null;
            task.Status = 'Pending';
            task.PercentComplete = 0;

            // The discriminator the dispatcher routes on. Written first because everything below —
            // and everything the dispatcher later does with this row — reads it.
            task.StepType = node.kind;

            // Switching on `kind` rather than on which config field happens to be populated. The
            // old shape — "agentName? then agent; actionName? then action; ELSE human" — turned
            // every kind it did not know about into a Human task assigned to the submitter, so a
            // ForEach step became an approval request that nobody had asked for and nothing would
            // ever complete. A graph that stalls forever while LOOKING like it is waiting on a
            // person is the worst available failure. `findUnrunnableKinds` refuses unsupported
            // kinds before anything is written; this switch is what keeps the two in step.
            switch (node.kind) {
                case 'Agent':
                    task.AgentID = agentIDsByName.get(ConfigOf(node, 'Agent')!.agentName)!;
                    break;
                case 'Action':
                    task.ActionID = actionIDsByName.get(ConfigOf(node, 'Action')!.actionName)!;
                    break;
                case 'Human':
                    // Assigned to the submitting user only — cross-user assignment stays rejected
                    // until the authorization model in #3524 lands, and `findCrossUserAssignments`
                    // has already refused any graph that asked for someone else.
                    task.UserID = context.ContextUser.ID;
                    break;
                case 'Prompt':
                    task.PromptID = promptIDsByName.get(ConfigOf(node, 'Prompt')!.promptName)!;
                    break;
                case 'ForEach':
                case 'While': {
                    // A loop's key points at what it REPEATS, not at the loop itself. That keeps the
                    // reference a real foreign key — joinable, constrained, rename-proof — instead
                    // of a name buried in JSON, and CK_Task_Assignment still holds because a loop
                    // body is exactly one thing.
                    const op = LoopOperationOf(node);
                    if (op?.action) task.ActionID = actionIDsByName.get(op.action.name)!;
                    else if (op?.subAgent) task.AgentID = agentIDsByName.get(op.subAgent.name)!;
                    else if (op?.prompt) task.PromptID = promptIDsByName.get(op.prompt.name)!;
                    else {
                        throw new Error(
                            `Task "${node.name}" is a loop with nothing to repeat. Choose an action, ` +
                            `a prompt, or a sub-agent for it to run on each pass.`,
                        );
                    }
                    break;
                }
                default:
                    // Unreachable: findUnrunnableKinds rejected these before any write. Throwing
                    // rather than falling through means a kind added later fails loudly here
                    // instead of quietly becoming somebody's to-do item.
                    throw new Error(
                        `Task "${node.name}" has kind "${node.kind}", which cannot be persisted for dispatch.`,
                    );
            }

            // Everything about the step that has no column of its own. Dropping this is what used
            // to lose the input/output mappings — and with them the payload values every branch
            // condition downstream reads.
            //
            // The step's rank in the graph's own order rides along. `Task` has no sequence column,
            // so without it every consumer listing a graph's steps falls back to creation order —
            // the compiler's walk, which is neither the order they were drawn in nor the order they
            // run in. A graph that has not started yet has no timestamps to sort by, so its
            // structure is the only order available, and it is available from the moment it is
            // compiled.
            const configuration = { ...buildStepConfiguration(node), sequence: ranks.get(node.tempId) };
            task.Configuration = JSON.stringify(configuration);

            // Input rides in its own column; Description stays human-readable.
            task.InputPayload = node.inputPayload ? JSON.stringify(node.inputPayload) : null;

            if (!(await task.Save())) {
                throw new Error(`Could not create task "${node.name}": ${task.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            map.set(node.tempId, task.ID);
        }
        return map;
    }

    /**
     * Reports the node kinds this dispatcher cannot yet execute, or `null` when the graph is
     * entirely runnable.
     *
     * **Why this is a submit-time check and not a validation rule.** `ValidateTaskGraphSpec` is a
     * pure function over the spec: it answers "is this a well-formed graph?", and its answer must be
     * the same in a browser, a CLI and a server. "Can it run *here*?" is a different question whose
     * answer changes as runners are added, so it belongs to the runtime that owns the runners.
     *
     * **Why refuse rather than persist-and-stall.** `Prompt`, `ForEach`, `While` and `External`
     * are legitimate parts of the spec, but the `Task` row has nowhere to carry a node's `kind` or
     * its typed `configuration` — so a persisted one could not be dispatched even if a runner
     * existed. Refusing at the door tells the author which step is the problem while the graph is
     * still theirs to edit. The alternative is a graph that submits successfully and then never
     * finishes, which costs an operator an afternoon to diagnose.
     */
    private findUnrunnableKinds(spec: TaskGraphSpec): string | null {
        return FindUnrunnableKinds(spec);
    }

    /** Writes the dependency edges, translating tempIds to persisted IDs. */
    private async persistDependencies(
        spec: TaskGraphSpec,
        taskIDMap: Map<string, string>,
        context: TaskGraphSubmitContext,
    ): Promise<void> {
        for (const node of spec.tasks) {
            const taskID = taskIDMap.get(node.tempId);
            if (!taskID) continue;
            for (const raw of node.dependsOn ?? []) {
                const edge = NormalizeDependency(raw);
                const dependsOnTaskID = taskIDMap.get(edge.tempId);
                if (!dependsOnTaskID) continue; // validation already rejected unknown refs

                const dep = await context.Provider.GetEntityObject<MJTaskDependencyEntity>('MJ: Task Dependencies', context.ContextUser);
                dep.NewRecord();
                dep.TaskID = taskID;
                dep.DependsOnTaskID = dependsOnTaskID;
                dep.DependencyType = edge.dependencyType ?? 'Prerequisite';
                // NULL for an unconditional edge, matching AIAgentStepPath — so a graph authored in
                // the flow editor and one emitted by an agent store the same thing.
                dep.Condition = edge.condition ?? null;

                // The exclusive-choice fields. Dropping these was silent and severe: without an
                // ExclusiveGroup the dispatcher sees a plain fan-out and runs EVERY branch, so a
                // workflow that should pick one route would take all of them — doing work its author
                // never intended and, in the Demo workflow's case, calling two different APIs where
                // the flow calls one. Priority and Sequence are what decide which branch wins, so a
                // group without them resolves arbitrarily.
                dep.ExclusiveGroup = edge.exclusiveGroup ?? null;
                dep.Priority = edge.priority ?? 0;
                dep.Sequence = edge.sequence ?? 0;
                if (!(await dep.Save())) {
                    throw new Error(
                        `Could not create dependency ${node.tempId} -> ${edge.tempId}: ${dep.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }
        }
    }

    private async loadChildren(parentTaskID: string, context: TaskGraphSubmitContext): Promise<MJTaskEntity[]> {
        // `BypassCache` for the reason the dispatcher documents at every one of its reads (C4): task
        // status is written by the claim protocol's direct SQL, which fires no cache invalidation.
        // A cached read here returns PRE-EXECUTION state, and both callers act on status — Cancel's
        // "leave terminal work alone" guard would pass for a task that has since completed, and
        // write `Cancelled` over a `Complete` row. That is precisely the history-rewriting the guard
        // exists to prevent, performed by the guard itself.
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskID}'`, ResultType: 'entity_object', BypassCache: true },
            context.ContextUser,
        );
        return (result.Success ? result.Results : []) ?? [];
    }
}
