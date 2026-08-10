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
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    MJTaskEntity,
    MJTaskDependencyEntity,
    MJTaskTypeEntity,
    type MJTaskEntity_ITaskStepConfiguration,
} from '@memberjunction/core-entities';
import {
    FormatValidationErrors,
    NormalizeDependency,
    ValidateTaskGraphSpec,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type ForEachOperation,
    type WhileOperation,
    ConfigOf,
} from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';

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
        };
    } catch {
        return { ...DEFAULT_PARENT_METADATA };
    }
}

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
const TASK_TYPE_NAME = 'AI Workflow';

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

    const human = ConfigOf(node, 'Human');
    if (human?.instructions) config.human = { instructions: human.instructions };

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

            // 3. Persist. Parent first so children have a ParentID, then children, then edges —
            //    edges last because they reference two child IDs that must both exist.
            const parentTaskID = await this.persistParent(spec, taskTypeID, context);
            const taskIDMap = await this.persistChildren(
                spec, parentTaskID, taskTypeID, agentIDsByName.Map!, actionIDsByName.Map!, promptIDsByName.Map!, context,
            );
            await this.persistDependencies(spec, taskIDMap, context);

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
     * Cancels a graph and everything in it that has not already settled.
     *
     * Cancels children first: a parent marked `Cancelled` while children are still `Pending` would
     * leave the dispatcher free to pick those children up, which is the opposite of what the caller
     * asked for.
     */
    public async Cancel(parentTaskID: string, context: TaskGraphSubmitContext): Promise<boolean> {
        try {
            const children = await this.loadChildren(parentTaskID, context);
            for (const child of children) {
                // Terminal work is left alone — cancelling a completed task would rewrite history.
                if (['Complete', 'Failed', 'Cancelled'].includes(child.Status)) continue;
                child.Status = 'Cancelled';
                if (!(await child.Save())) {
                    LogError(`[TaskGraphService] Failed to cancel task ${child.ID}: ${child.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }

            const parent = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
            if (!(await parent.Load(parentTaskID))) return false;
            parent.Status = 'Cancelled';
            parent.CompletedAt = new Date();
            return await parent.Save();
        } catch (e) {
            LogError(`[TaskGraphService] Cancel failed for ${parentTaskID}: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /**
     * Returns a failed task to `Pending` so the dispatcher can run it again.
     *
     * Also clears any `Blocked` dependents, since they were only blocked because this task failed —
     * leaving them blocked would make the retry pointless, as the graph still could not progress
     * past this node.
     */
    public async Retry(taskID: string, context: TaskGraphSubmitContext): Promise<boolean> {
        try {
            const task = await context.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', context.ContextUser);
            if (!(await task.Load(taskID))) return false;
            if (task.Status !== 'Failed') {
                LogError(`[TaskGraphService] Cannot retry task ${taskID}: status is ${task.Status}, expected Failed.`);
                return false;
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

    /** Finds or creates the task type used for orchestrated graphs. */
    private async ensureTaskType(context: TaskGraphSubmitContext): Promise<string> {
        const existing = await RunView.FromMetadataProvider(context.Provider).RunView<{ ID: string }>(
            { EntityName: 'MJ: Task Types', ExtraFilter: `Name='${TASK_TYPE_NAME}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
            context.ContextUser,
        );
        const found = existing.Results?.[0]?.ID;
        if (found) return found;

        const tt = await context.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', context.ContextUser);
        tt.NewRecord();
        tt.Name = TASK_TYPE_NAME;
        tt.Description = 'Tasks created by agent-orchestrated workflows.';
        if (!(await tt.Save())) {
            throw new Error(`Could not create task type: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return tt.ID;
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
            const configuration = buildStepConfiguration(node);
            task.Configuration = configuration ? JSON.stringify(configuration) : null;

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
        const result = await RunView.FromMetadataProvider(context.Provider).RunView<MJTaskEntity>(
            { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentTaskID}'`, ResultType: 'entity_object' },
            context.ContextUser,
        );
        return (result.Success ? result.Results : []) ?? [];
    }
}
