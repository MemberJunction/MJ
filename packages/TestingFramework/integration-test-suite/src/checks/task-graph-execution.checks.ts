/**
 * @fileoverview IT74 — the durable dispatcher actually executing graphs against a live database.
 *
 * **Why this bundle exists.** IT71 covers eighteen checks and not one of them runs a graph. Nine
 * assert that metadata exists; nine drive `Submit`/`Persist` and verify the rows that come back. So
 * everything from "the rows are correct" onward — claim, execute, propagate, roll up, settle — was
 * unit-tested against fixtures and never against SQL Server. That gap is the same species as the one
 * Phase 6 shipped and Phase 7 caught: a binding that *looked* right until something drove it.
 *
 * **A stub agent runner, not a real one.** The dispatcher takes `TaskAgentRunner` as an injected
 * seam precisely so it can execute without the agent framework. Using a stub keeps this bundle in
 * the deterministic tier — no model calls, no tokens, no network — while still exercising the real
 * claim protocol, the real condition evaluator, the real rollup, and real rows. What is under test
 * is the dispatcher, not the agent.
 *
 * **Mutation-class throughout.** Every check writes Tasks and Task Dependencies, so the whole bundle
 * is gated behind `RUN_MUTATION_TESTS=1` and tears down what it created, FK-ordered.
 *
 * @module @memberjunction/integration-test-suite
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    MJTaskEntity,
    MJTaskTypeEntity,
    MJAIAgentRunEntity,
    MJAIAgentRequestEntity,
} from '@memberjunction/core-entities';
import type { TaskGraphSpec, TaskGraphSpecNode } from '@memberjunction/ai-core-plus';
import {
    ParseTaskGraphDebugState,
    ParseTaskGraphParentMetadata,
    TASK_TYPE_NAME,
    TaskClaimStore,
    TaskGraphDispatcher,
    TaskGraphService,
    type TaskPromptRunner,
    type TaskPromptRunParams,
    type TaskPromptRunResult,
    type ProviderFactory,
    type TaskAgentRunner,
    type TaskAgentRunParams,
    type TaskAgentRunResult,
    type TaskContinuationDeliverer,
    type TaskContinuationParams,
    type TaskGraphFrame,
    type TaskGraphObserver,
} from '@memberjunction/task-graph';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import {
    GetTaskGraphSubmitter,
    SuppressTaskGraphSubmission,
    TaskGraphSubmissionSuppressedBecause,
} from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Parent tasks this bundle submitted, unwound children-first in teardown. */
const CREATED_PARENT_IDS: string[] = [];
/** TaskTypes created only when the install had none. */
const CREATED_TASK_TYPE_IDS: string[] = [];
/** Agent runs minted by the settle-path checks, removed in teardown. */
const CREATED_RUN_IDS: string[] = [];

/** Poll fast enough that a four-node graph settles inside a test rather than in twenty seconds. */
const TEST_POLL_SECONDS = 0.25;
/** Ceiling on how long any single graph may take to settle before the check gives up. */
const SETTLE_TIMEOUT_MS = 30_000;

/**
 * Failure policy for the bundle, keyed by task NAME.
 *
 * Names rather than IDs, and resolved from the database at execution time, because there is a real
 * window between `Submit` (which creates claimable rows) and any bookkeeping a check does
 * afterwards. A dispatcher still draining from an earlier check can claim a task inside that window,
 * and a policy keyed on a map the check had not finished populating would silently apply the wrong
 * behaviour — which is exactly how the failure-propagation check spent several runs passing a
 * *successful* graph. Resolving the name where the work happens removes the window rather than
 * narrowing it.
 */
const SHARED_FAILURES = new Set<string>();

/**
 * Task names whose run produces NO output at all, keyed the same way as the failure policy.
 *
 * The shape R2-3 is about: an action that returns nothing, a human approval with no response data,
 * a prompt that answered with silence. A condition on an edge out of one of these used to throw and
 * hold the branch forever.
 */
const SILENT_TASKS = new Set<string>();

/**
 * Stands in for the agent framework.
 *
 * Records the order tasks were started in — the only way to prove a join actually waited, as
 * opposed to every node merely reaching `Complete` eventually.
 *
 * One instance serves the whole bundle, matching production: a process runs one dispatcher and one
 * runner, and a dispatcher claims from the whole table rather than from "its own" graph.
 */
class StubAgentRunner implements TaskAgentRunner {
    public readonly Started: string[] = [];
    public readonly Finished: string[] = [];
    /** Artificial work, so concurrent claims genuinely overlap. */
    public DelayMs = 0;

    public async RunAgentForTask(params: TaskAgentRunParams): Promise<TaskAgentRunResult> {
        const name = await this.resolveName(params);
        this.Started.push(name);
        if (this.DelayMs > 0) {
            await settle(this.DelayMs);
        }
        this.Finished.push(name);

        if (SHARED_FAILURES.has(name)) {
            return { Success: false, ErrorMessage: `stub failure for ${name}` };
        }
        // A step that genuinely produced nothing — not an empty object, no output at all. The
        // distinction is the whole of R2-3: `OutputPayload` ends up null, and a condition reaching
        // through it has nothing to read.
        if (SILENT_TASKS.has(name)) return { Success: true };

        return {
            Success: true,
            // Echoed back so a dependent task's DependencyOutputs can be asserted downstream.
            Output: { ranBy: 'stub', task: name, dependencyCount: params.DependencyOutputs.size },
        };
    }

    /**
     * Names registered at submission time, so the hot path needs no query.
     *
     * Reading the name from the database at execution time made every recorded start depend on a
     * concurrent read succeeding. When one transiently failed — the shared connection reports
     * `Requests can only be made in the LoggedIn state` under a fanned-out wave — the catch below
     * fell through to the task ID, and every assertion that filters by NAME silently dropped that
     * execution. The task had run; the check reported it had not, so a healthy engine failed as
     * "the gate task must still run" or "expected 4, got 3".
     */
    public readonly NamesByID = new Map<string, string>();

    /** The task's own name, read where the work happens — see SHARED_FAILURES. */
    private async resolveName(params: TaskAgentRunParams): Promise<string> {
        const known = this.NamesByID.get(params.TaskID);
        if (known) return known;
        try {
            const t = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', params.ContextUser);
            if (await t.Load(params.TaskID)) {
                this.NamesByID.set(params.TaskID, t.Name);
                return t.Name;
            }
        } catch { /* fall through to the ID */ }
        return params.TaskID;
    }

    /** Names this check cares about, in the order they started. */
    public StartedAmong(names: string[]): string[] {
        const wanted = new Set(names);
        return this.Started.filter((n) => wanted.has(n));
    }
}

/** One runner for the bundle. */
const RUNNER = new StubAgentRunner();

/** Collects frames so the live signal can be asserted rather than assumed. */
class RecordingObserver implements TaskGraphObserver {
    public readonly Frames: TaskGraphFrame[] = [];
    public OnFrame(frame: TaskGraphFrame): void {
        this.Frames.push(frame);
    }
}

/**
 * Mints one provider per task, over the check's pool — what production does.
 *
 * This used to hand every task the check's single provider, on the reasoning that a check has no
 * real contention. That reasoning was wrong, and it is the root cause of this bundle's long-running
 * intermittency. A `SQLServerDataProvider` wraps one request context: issue two queries on it
 * concurrently and `mssql` rejects the second with `Requests can only be made in the LoggedIn state,
 * not the SentClientRequest state`. Any check that runs work in parallel — TX2's diamond branches,
 * TX6's two dispatchers — does exactly that, so a claim query or a rollup read would fail at random.
 * `pollOnce` catches and logs the failure, so the visible symptom was never the driver error but
 * whatever the lost query would have done: a task that never got claimed, a graph that never
 * settled, an execution that never showed up.
 *
 * The pool is the concurrency governor, exactly as `TaskGraphProviderFactory` documents. Client
 * bundles have no pool and no parallel dispatcher, so they keep the shared provider.
 */
function providerFactory(ctx: IntegrationCheckContext): ProviderFactory {
    const pool = ctx.Pool;
    if (!pool) return { CreateProvider: async () => ctx.Provider };
    return {
        CreateProvider: async () => {
            // `loadIfNeeded = false` reuses already-loaded metadata rather than re-reading it per
            // provider — the difference between cheap-per-task and prohibitive.
            const config = new SQLServerProviderConfigData(pool, ctx.Schema ?? '__mj', 0, undefined, undefined, false);
            const provider = new SQLServerDataProvider();
            await provider.Config(config);
            return provider as unknown as IMetadataProvider;
        },
    };
}

/** Resolves a TaskType, creating a disposable one if the install has none. */
async function resolveTaskTypeID(ctx: IntegrationCheckContext): Promise<string> {
    const existing = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Task Types', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const found = existing.Results?.[0]?.ID;
    if (found) return found;

    const tt = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
    tt.NewRecord();
    tt.Name = 'mj-integration-test-exec-task-type (safe to delete)';
    tt.Description = 'Created by the task-graph-execution integration bundle.';
    Assert(await tt.Save(), `could not create a TaskType fixture: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED_TASK_TYPE_IDS.push(tt.ID);
    return tt.ID;
}

/**
 * The `AI Workflow` task type specifically — NOT interchangeable with `resolveTaskTypeID`.
 *
 * The type-scoped claim-store verbs (`TrySkipPending` and friends) carry `TypeID` in their WHERE
 * clause so a graph verb can never touch a row outside the workflow substrate. A check that passes
 * the wrong type ID to one of them still sees the refusal it asserts — but earned by the type
 * predicate rather than by the guard actually under test, which is a green test proving nothing.
 * Resolved by reading, never creating: `TaskGraphService.Submit` has already minted the row by the
 * time any check calls this, so an absent one means the graph under test was typed as something
 * else and the check should fail rather than mint a type that makes it vacuous.
 */
async function resolveWorkflowTaskTypeID(ctx: IntegrationCheckContext): Promise<string> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Task Types',
            ExtraFilter: `Name='${TASK_TYPE_NAME}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            MaxRows: 1,
        },
        ctx.User,
    );
    const id = res.Results?.[0]?.ID;
    Assert(!!id, `could not resolve the '${TASK_TYPE_NAME}' task type`);
    return id!;
}

/** Any real agent name — the graph must resolve one, but the stub is what actually runs. */
async function resolveAgentName(ctx: IntegrationCheckContext): Promise<string> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['Name'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const name = res.Results?.[0]?.Name;
    Assert(!!name, 'could not resolve an AI Agent');
    return name!;
}

async function resolveEnvironmentID(ctx: IntegrationCheckContext): Promise<string> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Environments', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const id = res.Results?.[0]?.ID;
    Assert(!!id, 'could not resolve an Environment');
    return id!;
}

/** Submits a graph and registers it for teardown. */
async function submitGraph(
    ctx: IntegrationCheckContext,
    spec: TaskGraphSpec,
    agentRunID?: string,
    invocation?: { Data?: unknown; Context?: unknown },
): Promise<string> {
    await resolveTaskTypeID(ctx);
    const result = await new TaskGraphService().Submit(spec, {
        EnvironmentID: await resolveEnvironmentID(ctx),
        ConversationDetailID: null,
        ContextUser: ctx.User,
        Provider: ctx.Provider,
        // Stamped at PERSIST time, never afterwards. A graph is claimable the instant `Submit`
        // returns, so attaching the submitting run in a later write leaves a window in which the
        // graph legitimately has nobody waiting — and a dispatcher polling inside it settles and
        // claims delivery correctly, which would make a check about deferral fail for a reason that
        // is not the behaviour under test.
        AgentRunID: agentRunID ?? null,
        // The flow dialect's `data`/`context` roots (R3-3). Supplied at persist time, like the run,
        // because a graph is claimable the instant `Submit` returns.
        Invocation: invocation,
    });
    Assert(result.Success, `submission failed: ${result.ErrorMessage}`);
    Assert(!!result.ParentTaskID, 'submission returned no parent task');
    CREATED_PARENT_IDS.push(result.ParentTaskID!);

    // Register the names now, while nothing is executing and the read is uncontended. This is the
    // only moment that is true: once the dispatcher starts, a name lookup competes with the wave it
    // is describing. See StubAgentRunner.NamesByID.
    for (const child of (await loadChildren(ctx, result.ParentTaskID!)).values()) {
        RUNNER.NamesByID.set(child.ID, child.Name);
    }
    return result.ParentTaskID!;
}

/**
 * The graph's child tasks, by name.
 *
 * `BypassCache` for the same reason the dispatcher needs it: the claim protocol writes task rows
 * through direct SQL, which fires no invalidation, so a cached read here returns pre-execution
 * state. That is not a cosmetic problem for a test — the name map built from this feeds the stub
 * runner, and a stale read left it empty, so the stub could not recognise which task was supposed
 * to fail and the "failure" check passed a successful graph. Intermittently.
 */
async function loadChildren(ctx: IntegrationCheckContext, parentID: string): Promise<Map<string, MJTaskEntity>> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true },
        ctx.User,
    );
    return new Map((res.Results ?? []).map((t) => [t.Name, t]));
}

/**
 * A single task, read fresh.
 *
 * `Load()` is a point read rather than a cached view, so it sees the dispatcher's direct-SQL writes
 * — which is exactly what the settle loop depends on.
 */
async function loadTask(ctx: IntegrationCheckContext, id: string): Promise<MJTaskEntity> {
    const t = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
    Assert(await t.Load(id), `task ${id} could not be loaded`);
    return t;
}

/** This graph's task names, for filtering the shared runner's records down to one check. */
async function taskNames(ctx: IntegrationCheckContext, parentID: string): Promise<string[]> {
    return [...(await loadChildren(ctx, parentID)).values()].map((t) => t.Name);
}

/** Builds a dispatcher wired to the stub, polling fast. */
function buildDispatcher(
    ctx: IntegrationCheckContext,
    runner: TaskAgentRunner,
    instanceID: string,
    observer?: TaskGraphObserver,
    deliverer?: TaskContinuationDeliverer,
    pollIntervalSeconds: number = TEST_POLL_SECONDS,
    promptRunner?: TaskPromptRunner,
    reconciliationIntervalSeconds: number = 3600,
): TaskGraphDispatcher {
    return new TaskGraphDispatcher(
        providerFactory(ctx),
        runner,
        ctx.User as UserInfo,
        {
            InstanceID: instanceID,
            PollIntervalSeconds: pollIntervalSeconds,
            // Long enough that nothing self-reclaims mid-check; TX7 drives reconciliation explicitly.
            ClaimTTLSeconds: 300,
            // Default long, for the same reason — TX26 is the one check that wants it short, because
            // an interval it can outwait is how a timer that should not exist becomes observable.
            ReconciliationIntervalSeconds: reconciliationIntervalSeconds,
            MaxConcurrentTasks: 5,
        },
        deliverer,  // usually absent: a test has no conversation to post into
        observer,
        undefined,  // no action runner
        promptRunner,
    );
}


/**
 * Counts continuation deliveries, per graph.
 *
 * The end-to-end half of P4. `TaskClaimStore.settlement.test.ts` proves the CAS statement says what
 * we think it says and `verify-settlement-races.ts` proves the database honours it; this proves the
 * dispatcher actually gates the *delivery* on it. For `continuation: 'reinvoke'` a second delivery
 * is a second billed agent turn, so "exactly once" is the property, not "at least once".
 */
class CountingDeliverer implements TaskContinuationDeliverer {
    private readonly counts = new Map<string, number>();

    public async PostMessage(params: TaskContinuationParams): Promise<void> {
        this.counts.set(params.ParentTaskID, (this.counts.get(params.ParentTaskID) ?? 0) + 1);
    }

    public CountFor(parentTaskID: string): number {
        return this.counts.get(parentTaskID) ?? 0;
    }
}

/**
 * Puts a genuinely-settled graph back into the state a crash mid-settlement leaves: delivered
 * nothing, and no record that it ever tried.
 *
 * Removing the marker from a REAL settlement rather than hand-writing a terminal parent is the
 * difference between testing the rescue and testing a fixture. Everything else about the row — the
 * status the rollup computed, the `CompletedAt` the guarded write stamped, the metadata bag `Submit`
 * wrote — stays exactly as the dispatcher left it, so what the sweep sees is the real shape a crash
 * between the terminal write and the delivery produces.
 */
async function stripDeliveryMarker(ctx: IntegrationCheckContext, parentID: string): Promise<void> {
    const parent = await loadTask(ctx, parentID);
    const meta = ParseTaskGraphParentMetadata(parent.InputPayload) as Record<string, unknown>;
    delete meta.continuationDeliveredAt;
    delete meta.continuationDeliveredAs;
    parent.InputPayload = JSON.stringify(meta);
    Assert(await parent.Save(), `could not strip the delivery marker: ${parent.LatestResult?.CompleteMessage ?? 'unknown'}`);
}

/** The delivery marker on a graph's parent, or null while it has not been claimed. */
async function deliveryMarker(
    ctx: IntegrationCheckContext,
    parentID: string,
): Promise<{ At: string | undefined; As: string | undefined; SubmittedByAgentRunID: string | null }> {
    const parent = await loadTask(ctx, parentID);
    const meta = ParseTaskGraphParentMetadata(parent.InputPayload);
    return {
        At: meta.continuationDeliveredAt,
        As: meta.continuationDeliveredAs,
        SubmittedByAgentRunID: meta.submittedByAgentRunID,
    };
}

/**
 * Creates a root task hierarchy that is NOT a workflow — a stand-in for a conversation task or a
 * user's own to-do list, which share `MJ: Tasks` with graphs.
 *
 * Deliberately shaped like the thing an unscoped sweep would have mistaken for a graph: a root task
 * with a child, both non-terminal, with valid JSON in `InputPayload` so a claim statement would have
 * succeeded in editing it rather than being turned away by the `ISJSON` guard.
 */
async function createForeignTaskHierarchy(ctx: IntegrationCheckContext): Promise<string> {
    const typeID = await resolveForeignTaskTypeID(ctx);
    const environmentID = await resolveEnvironmentID(ctx);

    const parent = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
    parent.NewRecord();
    parent.Name = 'mj-it-foreign-parent (safe to delete)';
    parent.Description = 'Not a workflow. The dispatcher must never touch this.';
    parent.TypeID = typeID;
    parent.EnvironmentID = environmentID;
    parent.Status = 'In Progress';
    parent.PercentComplete = 25;
    parent.InputPayload = JSON.stringify({ personal: 'buy milk', notes: ['and eggs'] });
    Assert(await parent.Save(), `could not create the foreign parent: ${parent.LatestResult?.CompleteMessage ?? 'unknown'}`);
    CREATED_PARENT_IDS.push(parent.ID);

    const child = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
    child.NewRecord();
    child.Name = 'mj-it-foreign-child (safe to delete)';
    child.Description = 'A plain sub-task.';
    child.TypeID = typeID;
    child.EnvironmentID = environmentID;
    child.ParentID = parent.ID;
    child.Status = 'Pending';
    Assert(await child.Save(), `could not create the foreign child: ${child.LatestResult?.CompleteMessage ?? 'unknown'}`);

    return parent.ID;
}

/** A task type that is deliberately NOT the workflow one. Created once, torn down with the rest. */
async function resolveForeignTaskTypeID(ctx: IntegrationCheckContext): Promise<string> {
    const name = 'mj-integration-test-foreign-task-type (safe to delete)';
    const existing = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: Task Types', ExtraFilter: `Name='${name}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const found = existing.Results?.[0]?.ID;
    if (found) return found;

    const tt = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
    tt.NewRecord();
    tt.Name = name;
    tt.Description = 'Stands in for a conversation task or a personal to-do, which are not workflows.';
    Assert(await tt.Save(), `could not create the foreign TaskType: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED_TASK_TYPE_IDS.push(tt.ID);
    return tt.ID;
}

/**
 * Asserts how many of a graph's tasks THIS BUNDLE'S stub ran, and explains a shortfall.
 *
 * The bundle assumes it is the only dispatcher on the database — every "ran exactly once" assertion
 * depends on it. That assumption is invisible until it breaks, and when it breaks it produces the
 * least informative failure available: `expected 1, got 0` on a task that plainly reached `Complete`.
 * The cause is always the same and is never in this repository's code — another process (an MJAPI
 * left running against the same dev database, a second agent's session) claimed the task and ran it
 * with its own runner, so this stub never saw it.
 *
 * So when the count is short, the claim column is read and the foreign instance NAMED. The check
 * still fails — the run genuinely proved nothing — but it fails with the sentence that identifies
 * the environment problem instead of implicating the dispatcher.
 */
async function assertStubRan(
    ctx: IntegrationCheckContext,
    parentID: string,
    names: string[],
    expected: number,
    what: string,
): Promise<string[]> {
    const started = RUNNER.StartedAmong(names);
    if (started.length < expected) {
        // The inference is on the RUNNER's record, not on the claim column: a completing task clears
        // `ClaimedBy` (TaskClaimStore sets it NULL on the terminal write), so by the time an
        // assertion fails the evidence of who held it is already gone. What cannot be erased is the
        // combination "this task reached a terminal status" AND "our stub never started it" — which
        // only a runner outside this bundle can produce.
        const ranByOthers = [...(await loadChildren(ctx, parentID)).values()]
            .filter((t) => TERMINAL_FOR_FOREIGN_CHECK.has(t.Status) && !RUNNER.Started.includes(t.Name))
            .map((t) => `${t.Name} (${t.Status})`);
        Assert(
            ranByOthers.length === 0,
            `${what} — but ${ranByOthers.length} task(s) reached a terminal status without this `
            + `bundle's stub ever running them: ${ranByOthers.join(', ')}. Another dispatcher on this `
            + `database executed them with its own runner, so this check exercised nothing. IT74 `
            + `requires exclusive use of the database (an MJAPI pointed at it, or another agent's `
            + `session, will race every check here). ${CONTAMINATION_REMEDY}`,
        );
    }
    AssertEqual(started.length, expected, what);
    return started;
}

/**
 * What to DO about a contaminated run — stated once, so both inferences give the same instruction.
 *
 * Naming the flag matters: without it the only apparent remedy is "stop your server", which nobody
 * wants to do on a machine they are also developing on, so the bundle gets re-run and blamed
 * instead. The flag is also what R3-11 made honest — a host carrying it now refuses graph
 * submissions rather than silently accepting work it will never run.
 */
const CONTAMINATION_REMEDY =
    'Stop the other dispatcher — or, if it is an MJAPI you need running, restart it with ' +
    'MJ_DISABLE_TASK_GRAPH_DISPATCHER=1, which keeps the server serving while it declines both to ' +
    'run graphs and (since R3-11) to accept them — then re-run.';

/** Statuses that mean a task was RUN by somebody, for the foreign-runner inference above. */
const TERMINAL_FOR_FOREIGN_CHECK: ReadonlySet<string> = new Set(['Complete', 'Failed']);

/**
 * Asserts the delivery marker is still unclaimed, and blames the right party when it is not.
 *
 * The claim is a single row-level fact that ANY dispatcher on the database can set, so a check that
 * merely reports "expected undefined, got a timestamp" cannot distinguish the behaviour under test
 * from a competitor winning the row. The caller passes what it has already PROVEN about its own
 * instances — normally "my deliverer was never called" — so the failure can say which of the two it
 * is instead of leaving the reader to guess.
 */
function assertMarkerUnclaimed(marker: { At: string | undefined }, provenLocallyUndelivered: boolean, what: string): void {
    if (!marker.At) return;
    Assert(
        !provenLocallyUndelivered,
        `${what} — but this bundle's own instances provably delivered nothing, so the marker at ` +
        `${marker.At} was claimed by a dispatcher outside this bundle. IT74 requires exclusive use of ` +
        `the database (an MJAPI pointed at it, or another agent's session, will race every check ` +
        `here). ${CONTAMINATION_REMEDY}`,
    );
    AssertEqual(marker.At, undefined, what);
}

/** How many requests are still awaiting an answer for a task. */
async function openRequestCount(ctx: IntegrationCheckContext, taskID: string): Promise<number> {
    const open = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        {
            EntityName: 'MJ: AI Agent Requests',
            ExtraFilter: `Status='Requested' AND OriginatingTaskID='${taskID}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User,
    );
    return (open.Results ?? []).length;
}


/** The still-open requests for a task, oldest first — the order the dispatcher itself resolves. */
async function openRequests(ctx: IntegrationCheckContext, taskID: string): Promise<MJAIAgentRequestEntity[]> {
    const open = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentRequestEntity>(
        {
            EntityName: 'MJ: AI Agent Requests',
            ExtraFilter: `Status='Requested' AND OriginatingTaskID='${taskID}'`,
            OrderBy: '__mj_CreatedAt ASC, ID ASC',
            ResultType: 'entity_object',
            BypassCache: true,
        },
        ctx.User,
    );
    return open.Results ?? [];
}

/** Polls until a value satisfies a predicate, or fails the check with `what` at the deadline. */
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string): Promise<T> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    let latest = await read();
    while (Date.now() < deadline && !done(latest)) {
        await settle(250);
        latest = await read();
    }
    Assert(done(latest), `${what} (last saw ${JSON.stringify(latest)})`);
    return latest;
}


/** How long to wait for a SECOND task to wrongly slip through after a one-shot allowance. */
const TWO_INSTANCE_DRAIN_MS = 8_000;

/** Parent statuses that mean the graph is over. */
const TERMINAL_PARENT_STATUSES: ReadonlySet<string> = new Set(['Complete', 'Failed', 'Cancelled', 'Skipped']);

/** How many of a graph's steps have started (or finished) — the count a step allowance must bound. */
async function countStarted(ctx: IntegrationCheckContext, parentID: string): Promise<number> {
    return [...(await loadChildren(ctx, parentID)).values()]
        .filter((t) => t.Status !== 'Pending').length;
}

/** Lets the dispatchers poll, then reports how many steps have started. */
async function settleAndCount(ctx: IntegrationCheckContext, parentID: string): Promise<number> {
    await settle(TWO_INSTANCE_DRAIN_MS);
    return countStarted(ctx, parentID);
}

/** One task's current status. */
async function statusOf(ctx: IntegrationCheckContext, taskID: string): Promise<string> {
    return (await loadTask(ctx, taskID)).Status;
}

/** True once the graph records that a BREAKPOINT paused it, rather than a person. */
async function pausedByBreakpoint(ctx: IntegrationCheckContext, parentID: string): Promise<boolean> {
    // Read through the engine's own parser rather than JSON-walking the bag: `$.debug` is written by
    // guarded JSON_MODIFY statements, and a check that re-implements the read is a second opinion
    // about a shape only one of them owns.
    const debug = ParseTaskGraphDebugState((await loadTask(ctx, parentID)).InputPayload);
    return debug.paused === true && debug.pausedReason === 'breakpoint';
}

/** A well-formed run ID that will never exist, for TX14's read-failure trigger. */
const NONEXISTENT_RUN_ID = 'DEAD0000-0000-4000-8000-000000000BAD';

/** Instance name for TX11, shared between the dispatcher and the claims assertion. */
const INSTANCE_TX11 = 'it-tx11';

/** Which of a graph's tasks one named instance currently holds a claim on. */
async function claimsHeldBy(ctx: IntegrationCheckContext, parentID: string, instanceID: string): Promise<string> {
    return [...(await loadChildren(ctx, parentID)).values()]
        .filter((t) => t.ClaimedBy === instanceID)
        .map((t) => `${t.Name}:${t.Status}`)
        .sort()
        .join('|');
}

/** Runs dispatchers until the graph's continuation has been claimed, then stops them. */
async function runUntilDelivered(
    ctx: IntegrationCheckContext,
    dispatchers: TaskGraphDispatcher[],
    parentID: string,
): Promise<void> {
    await Promise.all(dispatchers.map((d) => d.Start()));
    try {
        const deadline = Date.now() + SETTLE_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await settle(200);
            if ((await deliveryMarker(ctx, parentID)).At) return;
        }
        Assert(false, `graph ${parentID} was never delivered within ${SETTLE_TIMEOUT_MS}ms`);
    } finally {
        await Promise.all(dispatchers.map((d) => d.Stop()));
    }
}

/** Runs the dispatcher until the parent reaches a terminal status, then stops it. */
async function runUntilSettled(
    ctx: IntegrationCheckContext,
    dispatcher: TaskGraphDispatcher,
    parentID: string,
): Promise<MJTaskEntity> {
    await dispatcher.Start();
    try {
        const deadline = Date.now() + SETTLE_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await settle(200);
            const parent = await loadTask(ctx, parentID);
            // 'Blocked' belongs here: ComputeParentRollup reports it as terminal, because a graph
            // holding an unreachable prerequisite has nothing left it can do.
            if (parent.Status === 'Complete' || parent.Status === 'Failed'
                || parent.Status === 'Cancelled' || parent.Status === 'Blocked') {
                return parent;
            }
        }
        // Reported as a failure rather than silently returning a Pending parent: a graph that never
        // settles is precisely the deadlock this engine exists to make impossible.
        const stuck = await loadTask(ctx, parentID);
        Assert(false, `graph ${parentID} did not settle within ${SETTLE_TIMEOUT_MS}ms (parent status: ${stuck.Status})`);
        return stuck;
    } finally {
        await dispatcher.Stop();
    }
}

/**
 * Stands in for the prompt runner, recording which prompt tasks it was asked to run.
 *
 * The dispatcher routes on `PromptID` before it looks at `AgentID`, so a Prompt node never reaches
 * the agent stub — without this seam the node is simply never claimable and TX12 would pass
 * vacuously by testing nothing.
 */
class StubPromptRunner implements TaskPromptRunner {
    public readonly Ran: string[] = [];
    public async RunPromptForTask(params: TaskPromptRunParams): Promise<TaskPromptRunResult> {
        this.Ran.push(params.TaskID);
        return { Success: true, Output: { ranBy: 'prompt-stub' } };
    }
}

/** Any real prompt — the graph must resolve one; the stub is what actually runs. */
async function resolvePromptName(ctx: IntegrationCheckContext): Promise<string> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
        { EntityName: 'MJ: AI Prompts', Fields: ['Name'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const name = res.Results?.[0]?.Name;
    Assert(!!name, 'could not resolve an AI Prompt');
    return name!;
}

/** One prompt-assigned node — carries `PromptID` with neither AgentID nor ActionID. */
const promptTask = (tempId: string, name: string, promptName: string, dependsOn: string[] = []): TaskGraphSpecNode =>
    ({ tempId, name, description: name, kind: 'Prompt', configuration: { promptName }, dependsOn });

/** The submitting agent run recorded in a graph's durable metadata, if any. */
async function submittingRunID(ctx: IntegrationCheckContext, parentID: string): Promise<string | null> {
    return ParseTaskGraphParentMetadata((await loadTask(ctx, parentID)).InputPayload).submittedByAgentRunID;
}

/**
 * Rewrites which run a graph records as its submitter, leaving everything else alone.
 *
 * Used to make the run half fail and then recover, without touching the graph's own state. The
 * `AgentRunID` COLUMN is deliberately not changed — the dispatcher reads the metadata bag, so this
 * isolates the read failure to exactly the path under test.
 */
async function repointSubmittingRun(
    ctx: IntegrationCheckContext,
    parentID: string,
    runID: string,
): Promise<void> {
    const parent = await loadTask(ctx, parentID);
    const meta = ParseTaskGraphParentMetadata(parent.InputPayload) as Record<string, unknown>;
    meta.submittedByAgentRunID = runID;
    parent.InputPayload = JSON.stringify(meta);
    Assert(await parent.Save(), `could not repoint the submitting run: ${parent.LatestResult?.CompleteMessage ?? 'unknown'}`);
}

/** Creates an agent run in a chosen state, for the settle-path checks. */
async function createRun(ctx: IntegrationCheckContext, status: 'Running' | 'Paused'): Promise<MJAIAgentRunEntity> {
    const agents = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const agentID = agents.Results?.[0]?.ID;
    Assert(!!agentID, 'could not resolve an AI Agent to own the run');

    const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
    run.NewRecord();
    run.AgentID = agentID!;
    run.Status = status;
    run.StartedAt = new Date();
    Assert(await run.Save(), `could not create the ${status} run: ${run.LatestResult?.CompleteMessage ?? 'unknown'}`);
    CREATED_RUN_IDS.push(run.ID);
    return run;
}

/** One agent-assigned node. Spec v2: `kind` selects the configuration shape. */
const agentTask = (tempId: string, name: string, agentName: string, dependsOn: string[] = []): TaskGraphSpecNode =>
    ({ tempId, name, description: name, kind: 'Agent', configuration: { agentName }, dependsOn });

/** A step a person completes: never claimed, never run, released by answering its request. */
const humanTask = (tempId: string, name: string, dependsOn: string[] = []): TaskGraphSpecNode =>
    ({ tempId, name, description: name, kind: 'Human', configuration: {}, dependsOn });

export const TaskGraphExecutionChecks: NamedCheck[] = [
    {
        Id: 'task-graph-execution.TX1',
        Name: 'TX1: a submitted graph is claimed, executed and rolled up to Complete',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The baseline nothing previously proved: submission is durable AND something picks it up.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-single (safe to delete)',
                tasks: [agentTask('a', 'Only Step', agentName)],
            });

            const mine = await taskNames(ctx, parentID);
            const parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx1'), parentID);

            AssertEqual(parent.Status, 'Complete', 'the parent must roll up to Complete');
            AssertEqual(parent.PercentComplete, 100, 'a fully complete graph is 100%');
            Assert(!!parent.CompletedAt, 'a settled graph records CompletedAt');
            await assertStubRan(ctx, parentID, mine, 1, 'the single task ran exactly once');

            const child = (await loadChildren(ctx, parentID)).get('Only Step');
            Assert(!!child, 'the child task disappeared');
            AssertEqual(child!.Status, 'Complete', 'the child must be Complete');
            Assert(!!child!.OutputPayload, 'the stub output must be persisted to OutputPayload');
            Assert(child!.OutputPayload!.includes('"ranBy":"stub"'), 'OutputPayload must carry what the runner returned');

            console.log('      → submit → claim → execute → rollup, end to end against SQL Server');
        }
    },

    {
        Id: 'task-graph-execution.TX2',
        Name: 'TX2: a diamond graph runs its join AFTER both branches, not merely eventually',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // "Everything reached Complete" is a much weaker claim than "D waited for B and C".
            // Recording start order is what separates the two, and only a live run can show it.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-diamond (safe to delete)',
                tasks: [
                    agentTask('a', 'A Root', agentName),
                    agentTask('b', 'B Left', agentName, ['a']),
                    agentTask('c', 'C Right', agentName, ['a']),
                    agentTask('d', 'D Join', agentName, ['b', 'c']),
                ],
            });

            // A delay makes the branches genuinely overlap, so a join that did not wait would be
            // caught rather than hidden by tasks completing instantly in submission order.
            const mine = await taskNames(ctx, parentID);
            RUNNER.DelayMs = 60;
            let parent: MJTaskEntity;
            try {
                parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx2'), parentID);
            } finally {
                RUNNER.DelayMs = 0;
            }

            AssertEqual(parent.Status, 'Complete', 'the whole diamond must complete');
            const started = await assertStubRan(ctx, parentID, mine, mine.length, 'every task ran exactly once');
            AssertEqual(started.length, 4, 'every node ran exactly once');
            AssertEqual(started[0], 'A Root', 'the root must run first');
            AssertEqual(started[3], 'D Join', 'the join must run last');
            Assert(
                RUNNER.Finished.indexOf('B Left') < RUNNER.Started.indexOf('D Join') &&
                RUNNER.Finished.indexOf('C Right') < RUNNER.Started.indexOf('D Join'),
                'the join started before both prerequisites finished — the AND-join did not hold',
            );

            const d = (await loadChildren(ctx, parentID)).get('D Join');
            Assert(
                d!.OutputPayload!.includes('"dependencyCount":2'),
                'the join must receive BOTH dependency outputs — a task depends on another precisely to consume what it produced',
            );

            console.log('      → AND-join waited for both branches, and received both outputs');
        }
    },

    {
        Id: 'task-graph-execution.TX3',
        Name: 'TX3: a failed step blocks its dependents and the graph still settles',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The failure that matters is not the failed task — it is a graph that hangs forever
            // waiting on a prerequisite that can never arrive.
            const agentName = await resolveAgentName(ctx);
            // Declared BEFORE the graph exists. Submit creates claimable rows, so any policy set
            // afterwards has a window in which a draining dispatcher can run the task under the
            // wrong one.
            SHARED_FAILURES.add('A Fails');
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-failure (safe to delete)',
                tasks: [
                    agentTask('a', 'A Fails', agentName),
                    agentTask('b', 'B Depends', agentName, ['a']),
                ],
            });

            // Registered BEFORE the failure policy so no dispatcher can claim the task in the
            // window between the two and run it under the wrong policy.
            const mine = await taskNames(ctx, parentID);
            const parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx3'), parentID);

            AssertEqual(parent.Status, 'Failed', 'a graph with an unrecoverable failure rolls up Failed');

            const children = await loadChildren(ctx, parentID);
            AssertEqual(children.get('A Fails')!.Status, 'Failed', 'the failing task records Failed');
            Assert(!!children.get('A Fails')!.ErrorMessage, 'the failure reason must be persisted');
            AssertEqual(
                children.get('B Depends')!.Status,
                'Blocked',
                'a dependent of a failed task must be Blocked, not left Pending forever',
            );
            Assert(
                !RUNNER.StartedAmong(mine).includes('B Depends'),
                'the blocked task must never have executed',
            );

            console.log('      → failure propagated to Blocked, and the graph settled rather than hanging');
        }
    },

    {
        Id: 'task-graph-execution.TX4',
        Name: 'TX4: a false edge condition Skips its branch and the graph settles Complete',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // TG9 proves TaskDependency.Condition round-trips as a column. This proves the dispatcher
            // reads it, evaluates it, and lets the graph finish — the Phase 4 feature end to end.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-condition (safe to delete)',
                tasks: [
                    agentTask('a', 'A Gate', agentName),
                    { ...agentTask('b', 'B Conditional', agentName, ['a']), dependsOn: [{ tempId: 'a', condition: 'false' }] },
                ],
            } as TaskGraphSpec);

            const mine = await taskNames(ctx, parentID);
            const parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx4'), parentID);

            // One of the two nodes is deliberately NOT run, so the count assertion that guards the
            // other checks would be wrong here — what is asserted is which one ran.
            const started = await assertStubRan(ctx, parentID, mine, 1, 'exactly one side of the gate ran');
            Assert(started.includes('A Gate'), 'the gate task must still run');
            Assert(
                !started.includes('B Conditional'),
                'a task behind a false condition must not execute — dropping its only prerequisite ' +
                'would make it eligible immediately, so "branch not taken" would run the branch',
            );

            const b = (await loadChildren(ctx, parentID)).get('B Conditional');

            // ── Skipped, not Blocked — this assertion was REWRITTEN, and the old one is why ──────
            // It used to demand `Blocked` for both the branch and the graph, on the reasoning that a
            // Prerequisite edge which can never be satisfied means the graph has genuinely not
            // finished its work. R6 overruled that: a condition that is definitely false is a
            // DECISION, not an obstruction. The branch was not taken, and a workflow that chose one
            // of two routes has finished — reporting it as Blocked told an operator to go
            // investigate a graph that had done exactly what its author drew.
            //
            // The dispatcher now routes definitely-false edges through the skip seeds, so the branch
            // settles `Skipped` and the graph `Complete`. Leaving this check on the old contract
            // meant it contradicted the live engine on every full run of the deterministic tier, and
            // — worse — the comment taught the overruled doctrine as design intent.
            AssertEqual(b!.Status, 'Skipped', 'the untaken branch must be Skipped: not taken is a decision, not an obstruction');
            AssertEqual(parent.Status, 'Complete', 'a graph that chose one of two routes has finished');

            console.log('      → false condition skipped its branch; graph settled Complete');
        }
    },

    {
        Id: 'task-graph-execution.TX5',
        Name: 'TX5: the dispatcher emits lifecycle frames, addressed and owned',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The live signal has only ever been unit-tested. This is the first proof that a real
            // run produces frames at all — and that each carries the owner the delivery filter
            // needs, without which every frame would be dropped as unauthorized.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-frames (safe to delete)',
                tasks: [
                    agentTask('a', 'F One', agentName),
                    agentTask('b', 'F Two', agentName, ['a']),
                ],
            });

            const observer = new RecordingObserver();
            await taskNames(ctx, parentID);
            await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx5', observer), parentID);

            // Only this graph's frames — a concurrent dispatcher may be emitting for others.
            const own = observer.Frames.filter((f) => f.ParentTaskID === parentID);
            const kinds = own.map((f) => f.Kind);
            Assert(kinds.includes('TaskStarted'), 'no TaskStarted frame was emitted');
            Assert(kinds.includes('TaskCompleted'), 'no TaskCompleted frame was emitted');
            Assert(kinds.includes('GraphSettled'), 'no GraphSettled frame was emitted');

            // Ordering is the property a viewer renders from: a completion before its own start
            // would show a step finishing before it began.
            const firstStart = kinds.indexOf('TaskStarted');
            const settled = kinds.lastIndexOf('GraphSettled');
            Assert(firstStart < settled, 'GraphSettled must come after the first TaskStarted');

            Assert(
                observer.Frames.every((f) => !!f.ParentTaskID),
                'every frame must be addressed to the graph it happened in — that is the subscription key',
            );
            Assert(
                own.every((f) => !!f.OwnerUserID),
                'every frame must carry an owner; the delivery filter fails closed without one, so ownerless frames reach nobody',
            );

            const settledFrame = own.find((f) => f.Kind === 'GraphSettled');
            AssertEqual(settledFrame!.TotalCount, 2, 'GraphSettled reports the node count');
            AssertEqual(settledFrame!.CompletedCount, 2, 'GraphSettled reports how many completed');

            console.log(`      → ${own.length} frames emitted for this graph, all addressed and owned`);
        }
    },

    {
        Id: 'task-graph-execution.TX6',
        Name: 'TX6: two dispatchers on one graph execute every task exactly once',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The CAS claim protocol is the whole reason durable execution is safe to run on more
            // than one server. It has never been tested against a real table — and an in-memory
            // mock cannot test it, because the guarantee IS the database's atomicity.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-concurrent (safe to delete)',
                tasks: [
                    agentTask('a', 'C One', agentName),
                    agentTask('b', 'C Two', agentName),
                    agentTask('c', 'C Three', agentName),
                    agentTask('d', 'C Four', agentName),
                ],
            });

            const mine = await taskNames(ctx, parentID);
            // One recorder for both instances, so a double execution shows up as a duplicate name.
            RUNNER.DelayMs = 40;
            const one = buildDispatcher(ctx, RUNNER, 'it-tx6-instance-one');
            const two = buildDispatcher(ctx, RUNNER, 'it-tx6-instance-two');

            await one.Start();
            await two.Start();
            try {
                const deadline = Date.now() + SETTLE_TIMEOUT_MS;
                while (Date.now() < deadline) {
                    await settle(200);
                    const p = await loadTask(ctx, parentID);
                    if (p.Status === 'Complete' || p.Status === 'Failed') break;
                }
            } finally {
                await one.Stop();
                await two.Stop();
                RUNNER.DelayMs = 0;
            }

            const parent = await loadTask(ctx, parentID);
            AssertEqual(parent.Status, 'Complete', 'the graph must complete under two dispatchers');

            const counts = new Map<string, number>();
            for (const n of RUNNER.StartedAmong(mine)) counts.set(n, (counts.get(n) ?? 0) + 1);
            const duplicated = [...counts.entries()].filter(([, c]) => c > 1);
            AssertEqual(
                duplicated.length,
                0,
                `these tasks executed more than once, so the claim was not atomic: ${duplicated.map(([n, c]) => `${n}×${c}`).join(', ')}`,
            );
            AssertEqual(counts.size, 4, 'all four tasks must have run');

            console.log('      → 2 dispatchers, 4 tasks, each executed exactly once');
        }
    },

    {
        Id: 'task-graph-execution.TX7',
        Name: 'TX7: a claim orphaned by a crash is reclaimed and the graph finishes',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // "Work resumes after a crash" is the promise durable execution is sold on, and it has
            // been a comment rather than a test. Simulated by writing the state a crash actually
            // leaves: a claim held by an instance that is gone, with an expired lease.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-recovery (safe to delete)',
                tasks: [agentTask('a', 'R One', agentName)],
            });

            const child = (await loadChildren(ctx, parentID)).get('R One')!;
            child.Status = 'In Progress';
            child.ClaimedBy = 'it-tx7-dead-instance';
            child.ClaimExpiresAt = new Date(Date.now() - 60_000); // lease already expired
            Assert(await child.Save(), `could not stage the orphaned claim: ${child.LatestResult?.CompleteMessage ?? 'unknown'}`);

            const mine = await taskNames(ctx, parentID);
            const survivor = buildDispatcher(ctx, RUNNER, 'it-tx7-survivor');

            // Reconcile explicitly rather than waiting on a timer — the behavior under test is the
            // reclaim itself, not the interval it happens to run on.
            await survivor.Reconcile();
            const parent = await runUntilSettled(ctx, survivor, parentID);

            AssertEqual(parent.Status, 'Complete', 'the recovered graph must finish');
            await assertStubRan(ctx, parentID, mine, 1, 'the reclaimed task ran exactly once');

            const recovered = (await loadChildren(ctx, parentID)).get('R One')!;
            AssertEqual(recovered.Status, 'Complete', 'the reclaimed task completed');
            Assert(
                recovered.ClaimedBy !== 'it-tx7-dead-instance',
                'the dead instance still owns the claim — reconciliation did not reclaim it',
            );

            console.log('      → orphaned claim reclaimed after a simulated crash; graph completed');
        }
    },

    {
        Id: 'task-graph-execution.TX8',
        Name: 'TX8: a settlement lost to a crash is rescued by a fresh process, delivered exactly once',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // P3's whole premise, end to end and ACROSS A PROCESS BOUNDARY. Settlement is two steps
            // that are not one transaction — the parent's terminal write, then cost rollup + run
            // settlement + continuation delivery — and a process that died between them left a graph
            // that read as FINISHED to every sweep while having delivered nothing. The submitting
            // agent run stayed `Paused` forever, with nothing that would ever look again. The
            // metadata's own doc comment promised "the next sweep retries"; that sweep did not exist.
            //
            // The graph is settled FOR REAL first and then has its marker removed, rather than being
            // hand-written into a terminal shape. Everything else — the status the rollup computed,
            // the CompletedAt the guarded write stamped, the metadata bag Submit wrote — is left
            // exactly as the dispatcher left it, so the rescue sees the real post-crash row and not
            // a fixture that happens to resemble one.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-crash-window (safe to delete)',
                tasks: [
                    agentTask('a', 'CW One', agentName),
                    agentTask('b', 'CW Two', agentName, ['a']),
                ],
            });

            // The settling instance needs a deliverer of its own. Since R2-6 an instance that cannot
            // deliver declines the CAS rather than winning and discarding the announcement — so
            // without one there would be no marker here to remove, and this check would be staging a
            // state that never occurs.
            const settled = await runUntilSettled(
                ctx, buildDispatcher(ctx, RUNNER, 'it-tx8-crashed', undefined, new CountingDeliverer()), parentID);
            AssertEqual(settled.Status, 'Complete', 'the graph must genuinely settle before its marker is removed');
            Assert(!!(await deliveryMarker(ctx, parentID)).At, 'settling should have claimed a marker to remove');

            await stripDeliveryMarker(ctx, parentID);
            AssertEqual((await deliveryMarker(ctx, parentID)).At, undefined, 'the crash state must start undelivered');

            // A FRESH dispatcher, and one that cannot poll: at an hour's interval the steady-state
            // pass provably has not run by the time `Start()` returns, so anything that happens is
            // the STARTUP sweep — the arm that exists for the case where the rescue is needed most,
            // a process that was down while the graph was stranded.
            const deliverer = new CountingDeliverer();
            const rescuer = buildDispatcher(ctx, RUNNER, 'it-tx8-rescuer', undefined, deliverer, 3600);
            await rescuer.Start();
            try {
                const after = await deliveryMarker(ctx, parentID);
                Assert(!!after.At, 'the startup sweep did not rescue a terminal-but-undelivered graph');
                AssertEqual(after.As, 'delivered', 'a fresh settlement is delivered, not expired');
                AssertEqual(deliverer.CountFor(parentID), 1, 'the rescued settlement delivered exactly once');
                AssertEqual(
                    after.SubmittedByAgentRunID,
                    ParseTaskGraphParentMetadata(settled.InputPayload).submittedByAgentRunID,
                    'the rescue overwrote the metadata bag it needed to read',
                );
                AssertEqual((await loadTask(ctx, parentID)).Status, 'Complete', 'the rescue must not disturb the settled status');

                // The second half, and the reason the marker exists at all: a rescue that
                // re-delivered on every subsequent sweep would be worse than the bug it fixes.
                const second = new CountingDeliverer();
                const again = buildDispatcher(ctx, RUNNER, 'it-tx8-second', undefined, second, 3600);
                await again.Start();
                await again.Stop();

                AssertEqual(second.CountFor(parentID), 0, 'a delivered graph is rescued again by the next process');
                AssertEqual((await deliveryMarker(ctx, parentID)).At, after.At, 'the marker was rewritten');

                console.log(`      → startup sweep rescued a crashed settlement; delivered once at ${after.At}`);
            } finally {
                await rescuer.Stop();
            }
        }
    },

    {
        Id: 'task-graph-execution.TX9',
        Name: 'TX9: two dispatchers reaching one settlement deliver it once between them',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // The claim was Load → check the marker → `Save()`: both instances read "no marker",
            // both wrote, both delivered. Nothing about that is exotic — two dispatchers polling the
            // same settled graph inside one interval is the NORMAL multi-instance case, and for
            // `continuation: 'reinvoke'` losing it means two fresh billed agent turns for one
            // settlement, each able to submit further graphs.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-delivery-race (safe to delete)',
                tasks: [agentTask('a', 'DR One', agentName)],
            });
            const settled = await runUntilSettled(
                ctx, buildDispatcher(ctx, RUNNER, 'it-tx9-settler', undefined, new CountingDeliverer()), parentID);
            AssertEqual(settled.Status, 'Complete', 'the graph must settle before its delivery is raced');
            await stripDeliveryMarker(ctx, parentID);
            const submitter = ParseTaskGraphParentMetadata(settled.InputPayload).submittedByAgentRunID;

            // One deliverer shared by both, so the count is across instances rather than per instance.
            const deliverer = new CountingDeliverer();
            await runUntilDelivered(ctx, [
                buildDispatcher(ctx, RUNNER, 'it-tx9-one', undefined, deliverer),
                buildDispatcher(ctx, RUNNER, 'it-tx9-two', undefined, deliverer),
            ], parentID);

            // Both instances keep polling for a moment after the winner claims, which is when a
            // loser would deliver a second time.
            await settle(1000);

            AssertEqual(deliverer.CountFor(parentID), 1, 'exactly one of the two instances delivered');

            const marker = await deliveryMarker(ctx, parentID);
            AssertEqual(marker.As, 'delivered', 'the winning claim recorded how it settled');
            AssertEqual(
                marker.SubmittedByAgentRunID, submitter,
                'the loser\'s full-row snapshot overwrote the payload — the rest of the metadata bag is gone',
            );
            AssertEqual((await loadTask(ctx, parentID)).Status, 'Complete', 'no instance reverted the settled status');

            console.log('      → 2 dispatchers, 1 settlement, 1 delivery; metadata bag intact');
        }
    },

    {
        Id: 'task-graph-execution.TX10',
        Name: 'TX10: a task hierarchy that is not a workflow is never touched',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // `MJ: Tasks` is general-purpose: conversation tasks and users' own to-do lists live in
            // the same table. An unscoped sweep treats every root hierarchy as a workflow — rolling
            // up and OVERWRITING somebody's status, raising agent requests against plain tasks, and
            // injecting continuation-marker keys into a payload that is not ours to edit.
            const foreignParentID = await createForeignTaskHierarchy(ctx);
            const beforeParent = await loadTask(ctx, foreignParentID);
            const beforePayload = beforeParent.InputPayload;
            const beforeStatus = beforeParent.Status;
            const beforePercent = beforeParent.PercentComplete;

            // Run a REAL graph alongside it, so the dispatcher is genuinely sweeping rather than
            // idling — an untouched row proves nothing if nothing ran.
            const agentName = await resolveAgentName(ctx);
            const workflowID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-scoping (safe to delete)',
                tasks: [agentTask('a', 'SC One', agentName)],
            });
            const parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx10'), workflowID);
            AssertEqual(parent.Status, 'Complete', 'the workflow graph must actually have run');

            // Any damage here is the exact shape an UNSCOPED sweep produces, so the message says so:
            // the most likely cause by far is a dispatcher built before the TypeID filter running
            // against this database (an MJAPI left up from an earlier build), not the code under
            // test — and the two are indistinguishable from the row alone.
            const blame = 'If this fails, a dispatcher WITHOUT the workflow-type filter is running '
                + 'against this database — that is precisely the damage the filter prevents, and it '
                + 'is being done by another process. Restart or stop it and re-run.';

            const afterParent = await loadTask(ctx, foreignParentID);
            AssertEqual(afterParent.Status, beforeStatus, `the foreign hierarchy's status was rewritten. ${blame}`);
            AssertEqual(afterParent.PercentComplete, beforePercent, `the foreign hierarchy's progress was rewritten. ${blame}`);
            AssertEqual(afterParent.InputPayload, beforePayload, `the foreign hierarchy's payload was edited. ${blame}`);
            AssertEqual(afterParent.CompletedAt, null, `the foreign hierarchy was settled by a dispatcher. ${blame}`);

            const foreignChildren = [...(await loadChildren(ctx, foreignParentID)).values()];
            AssertEqual(foreignChildren.length, 1, 'the foreign child should still be there');
            AssertEqual(foreignChildren[0].Status, 'Pending', `the foreign child was executed. ${blame}`);
            AssertEqual(foreignChildren[0].ClaimedBy, null, `the foreign child was CLAIMED by a dispatcher. ${blame}`);

            console.log('      → a non-workflow hierarchy survived a live sweep byte-identical');
        }
    },

    {
        Id: 'task-graph-execution.TX11',
        Name: 'TX11: a stopped dispatcher has stopped writing',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // `Stop()` waited on in-flight TASKS but not on the timer passes, which are `void`-ed
            // promises nothing held — so it returned mid-pass and that pass went on to settle
            // graphs, emit frames and claim new work afterwards. Quiet in three ways: a settlement
            // frame arriving after every subscriber had gone, a shutting-down process manufacturing
            // the orphaned claims reconciliation exists to clean up, and statements landing on a
            // connection the host had already taken back. TX5 is what caught it.
            //
            // ASSERTED PER INSTANCE, NOT PER GRAPH. "The rows stopped changing" is not this
            // dispatcher's property to have: any other dispatcher on the same database — an MJAPI
            // in a dev environment, another check's instance — legitimately keeps working on the
            // same graph, and a check that forbade that would be asserting exclusivity it does not
            // own. What this instance owes is that IT stops: no frames of its own, and no claims of
            // its own, after `Stop()` returns.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-drain (safe to delete)',
                tasks: [
                    agentTask('a', 'DN One', agentName),
                    agentTask('b', 'DN Two', agentName, ['a']),
                    agentTask('c', 'DN Three', agentName, ['b']),
                ],
            });

            const observer = new RecordingObserver();
            const dispatcher = buildDispatcher(ctx, RUNNER, INSTANCE_TX11, observer);
            await dispatcher.Start();
            // Stop mid-flight — the chain guarantees work is still outstanding.
            await settle(400);
            await dispatcher.Stop();

            const framesAtStop = observer.Frames.length;
            const claimedAtStop = await claimsHeldBy(ctx, parentID, INSTANCE_TX11);

            // Several poll intervals: an undrained pass would have emitted or claimed by now.
            await settle(2000);

            AssertEqual(
                observer.Frames.length, framesAtStop,
                'the dispatcher emitted a frame AFTER Stop() returned — a settlement nobody is subscribed to',
            );
            AssertEqual(
                await claimsHeldBy(ctx, parentID, INSTANCE_TX11), claimedAtStop,
                'the dispatcher claimed work AFTER Stop() returned — claims a shutting-down process will only abandon',
            );

            const unfinished = [...(await loadChildren(ctx, parentID)).values()]
                .filter((t) => t.ClaimedBy === INSTANCE_TX11 && t.Status === 'In Progress');
            AssertEqual(unfinished.length, 0, 'Stop() returned while still holding a claim on unfinished work');

            console.log(`      → stopped cleanly mid-flight: ${framesAtStop} frames, then silence`);
        }
    },

    {
        Id: 'task-graph-execution.TX12',
        Name: 'TX12: a crashed PROMPT task is reclaimed, not stranded forever',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R2-1. A Prompt step carries `PromptID` with neither `AgentID` nor `ActionID`, and
            // reclamation scoped to that pair — a predicate written before the column existed. So a
            // prompt task whose owner died was excluded from BOTH reclamation statements: never
            // returned to Pending, never retakeable, and not even reported by the orphan sweep. The
            // graph wedges In Progress forever with zero diagnostics, which is why this asserts on
            // recovery rather than waiting for an error that never comes.
            const promptRunner = new StubPromptRunner();
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-prompt-recovery (safe to delete)',
                tasks: [promptTask('p', 'PR One', await resolvePromptName(ctx))],
            });

            // The state a crash actually leaves: claimed by an instance that is gone, lease expired.
            const child = (await loadChildren(ctx, parentID)).get('PR One')!;
            child.Status = 'In Progress';
            child.ClaimedBy = 'it-tx12-dead-instance';
            child.ClaimExpiresAt = new Date(Date.now() - 60_000);
            Assert(await child.Save(), `could not stage the orphaned prompt claim: ${child.LatestResult?.CompleteMessage ?? 'unknown'}`);

            const survivor = buildDispatcher(ctx, RUNNER, 'it-tx12', undefined, undefined, TEST_POLL_SECONDS, promptRunner);
            await survivor.Reconcile();

            const reclaimed = (await loadChildren(ctx, parentID)).get('PR One')!;
            AssertEqual(reclaimed.Status, 'Pending', 'reclamation did not return the prompt task to Pending');
            AssertEqual(reclaimed.ClaimedBy, null, 'the dead instance still owns the prompt task');

            const parent = await runUntilSettled(ctx, survivor, parentID);
            AssertEqual(parent.Status, 'Complete', 'the recovered prompt graph must finish');
            AssertEqual(promptRunner.Ran.length, 1, 'the reclaimed prompt task ran exactly once');

            console.log('      → crashed prompt task reclaimed and completed');
        }
    },

    {
        Id: 'task-graph-execution.TX13',
        Name: 'TX13: a graph that finishes before its submitter parks does not claim delivery',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R2-2's sharpest case, and it needs no failure at all. `finalizeAgentRun` parks a run
            // AFTER the graph is durable and dispatchable, so a fast graph settles first — and then
            // both settle-path writes land wrong without saying so: the lifecycle write silently
            // returns on its `Paused` guard, and the cost write is overwritten by finalize's own
            // full-row save. Claiming the marker then makes that pass the LAST one ever to look at
            // the graph, and the run stays Paused forever.
            const agentName = await resolveAgentName(ctx);
            // The run exists BEFORE the graph, and the graph is stamped with it at persist time —
            // which is also how production orders these: `BaseAgent` has a run long before it
            // submits, and only parks it afterwards.
            const run = await createRun(ctx, 'Running');
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-early-settle (safe to delete)',
                tasks: [agentTask('a', 'ES One', agentName)],
            }, run.ID);
            AssertEqual(await submittingRunID(ctx, parentID), run.ID, 'the graph must record its submitting run from the start');

            const deliverer = new CountingDeliverer();
            const settled = await runUntilSettled(
                ctx, buildDispatcher(ctx, RUNNER, 'it-tx13', undefined, deliverer), parentID);
            AssertEqual(settled.Status, 'Complete', 'the graph itself must still settle');

            // THE INSTANCE-OWNED PROPERTY FIRST. Whether this dispatcher delivered is a fact about
            // this dispatcher; whether the marker row is set is a fact any dispatcher on the database
            // can change. Asserting the second as though it were the first is how a competitor's
            // write reads as a regression here.
            AssertEqual(deliverer.CountFor(parentID), 0,
                'this instance delivered while the submitting run was still Running — the run would stay Paused forever');
            assertMarkerUnclaimed(
                await deliveryMarker(ctx, parentID), true,
                'the marker was claimed while the submitting run was still Running',
            );

            // Now the submitter parks, exactly as finalize would have done moments later.
            run.Status = 'Paused';
            Assert(await run.Save(), `could not park the run: ${run.LatestResult?.CompleteMessage ?? 'unknown'}`);

            const second = buildDispatcher(ctx, RUNNER, 'it-tx13-second', undefined, deliverer);
            await runUntilDelivered(ctx, [second], parentID);

            AssertEqual(deliverer.CountFor(parentID), 1, 'the next pass delivered exactly once');
            AssertEqual((await deliveryMarker(ctx, parentID)).As, 'delivered', 'and recorded how');

            const finished = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            Assert(await finished.Load(run.ID), 'could not re-read the submitting run');
            AssertEqual(finished.Status, 'Completed', 'the run was never settled — the deferral did not resolve');

            console.log('      → settlement deferred until the submitter parked, then delivered once');
        }
    },


    {
        Id: 'task-graph-execution.TX14',
        Name: 'TX14: a run-half failure leaves the marker unclaimed, and the next pass finishes the job',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R2-2's other half. TX13 covers the graph finishing before its submitter parks; this
            // covers the submitting-run half FAILING, which must produce the same outcome: nothing
            // claims the marker, so the rescue sweep brings the graph back and a later pass completes
            // settlement and delivery exactly once.
            //
            // THE TRIGGER IS AN UNREADABLE RUN, NOT AN INJECTED `Save()` FAILURE. The plan names the
            // save, and a save cannot be made to fail from here — the dispatcher runs in this process
            // but the write goes through the entity layer against a real database, so there is no
            // seam to inject at without a mock, and a mock would be asserting that the mock agrees
            // with itself. Pointing the graph's metadata at a run ID that does not exist reaches the
            // SAME verdict through the same function (`submittingRunReadiness` and
            // `settleSubmittingRun` both return 'defer' when the run cannot be loaded), and the
            // consequence under test — marker unclaimed, graph retried, delivered once later — is
            // identical. What is not covered is the save statement itself; that path is unit-tested
            // in the settle-verdict tests.
            const agentName = await resolveAgentName(ctx);
            const run = await createRun(ctx, 'Paused');
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-run-half-failure (safe to delete)',
                tasks: [agentTask('a', 'RH One', agentName)],
            }, run.ID);

            // Point the metadata at a run that does not exist. The COLUMN keeps the real ID, so this
            // is precisely a run-half read failure and nothing else about the graph changes.
            await repointSubmittingRun(ctx, parentID, NONEXISTENT_RUN_ID);

            const deliverer = new CountingDeliverer();
            const settled = await runUntilSettled(
                ctx, buildDispatcher(ctx, RUNNER, 'it-tx14', undefined, deliverer), parentID);
            AssertEqual(settled.Status, 'Complete', 'the graph itself must still settle — only the run half failed');

            AssertEqual(deliverer.CountFor(parentID), 0,
                'this instance delivered despite being unable to settle the submitting run');
            assertMarkerUnclaimed(
                await deliveryMarker(ctx, parentID), true,
                'the marker was claimed by a pass that could not complete the run half',
            );

            // The condition clears — as a transient failure would.
            await repointSubmittingRun(ctx, parentID, run.ID);
            await runUntilDelivered(
                ctx, [buildDispatcher(ctx, RUNNER, 'it-tx14-second', undefined, deliverer)], parentID);

            AssertEqual(deliverer.CountFor(parentID), 1, 'the recovering pass delivered exactly once');
            AssertEqual((await deliveryMarker(ctx, parentID)).As, 'delivered', 'and recorded how');

            const finished = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', ctx.User);
            Assert(await finished.Load(run.ID), 'could not re-read the submitting run');
            AssertEqual(finished.Status, 'Completed', 'the run was never settled — the retry did not resolve');

            console.log('      → run-half failure deferred delivery; the next pass completed it once');
        }
    },


    {
        Id: 'task-graph-execution.TX18',
        Name: 'TX18: an early finish cannot overwrite a sibling that started',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-1. The early-finish skips were full-row saves against a one-shot snapshot, and the
            // decision lived only in the deciding instance's memory — so a sibling claimed between
            // the snapshot and its write had `In Progress` reverted to `Skipped` and `ClaimedBy`
            // cleared MID-EXECUTION. Its side effects had fired, its completion was refused, its
            // output discarded, and the graph settled `Complete` with nothing recording it ran.
            //
            // Staged by claiming the sibling FIRST, which is the state that race produces and the
            // one the guarded write must refuse.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-early-race (safe to delete)',
                tasks: [
                    agentTask('a', 'ER Finisher', agentName),
                    agentTask('b', 'ER Sibling', agentName),
                ],
            });

            const sibling = (await loadChildren(ctx, parentID)).get('ER Sibling')!;
            const claims = new TaskClaimStore('it-tx18-peer', 300);
            Assert(await claims.TryClaim(ctx.Provider, sibling.ID, ctx.User),
                'could not stage the sibling as claimed');

            // The guarded skip must refuse it — its predicate is `Status='Pending'`, and a claimed
            // task is `In Progress`. The REAL workflow type ID is passed deliberately: the verb is
            // type-scoped, so a wrong one would produce the same refusal for the wrong reason and
            // leave the Pending guard untested.
            const skipped = await claims.TrySkipPending(
                ctx.Provider, sibling.ID, await resolveWorkflowTaskTypeID(ctx), ctx.User,
            );
            AssertEqual(skipped, false, 'a claimed sibling was skipped — its running work would be discarded');

            const after = (await loadChildren(ctx, parentID)).get('ER Sibling')!;
            AssertEqual(after.Status, 'In Progress', 'the claimed sibling lost its status');
            AssertEqual(after.ClaimedBy, 'it-tx18-peer', 'the claimed sibling lost its owner');

            // And its owner can still record the outcome, which is the point: the work is not lost.
            const recorded = await claims.CompleteClaimed(
                ctx.Provider, sibling.ID,
                { Status: 'Complete', OutputPayload: JSON.stringify({ ranBy: 'peer' }) },
                ctx.User,
            );
            AssertEqual(recorded, true, 'the claimed sibling could not record its outcome');

            const final = (await loadChildren(ctx, parentID)).get('ER Sibling')!;
            AssertEqual(final.Status, 'Complete', 'the sibling\'s outcome did not survive');
            Assert(!!final.OutputPayload, 'the sibling\'s output was discarded');

            console.log('      → a claimed sibling refused the skip and kept its outcome');
        }
    },

    {
        Id: 'task-graph-execution.TX19',
        Name: 'TX19: under block semantics, a failed step blocks the join rather than releasing it',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-2. A Failed origin's false conditional edge was DROPPED, its target skipped, and
            // the dropped edge severed the block walk — so a join fed by an independent healthy
            // route executed downstream of an unhandled failure while the parent rolled up Failed.
            // `'block'` is the spec default, so this is every agent-emitted graph.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-block-join (safe to delete)',
                tasks: [
                    agentTask('a', 'BJ Fails', agentName),
                    agentTask('e', 'BJ Healthy', agentName),
                    {
                        tempId: 'b', name: 'BJ Guarded', description: 'guarded', kind: 'Agent',
                        configuration: { agentName },
                        dependsOn: [{ tempId: 'a', condition: 'payload.approved === true' }],
                    },
                    {
                        tempId: 'd', name: 'BJ Join', description: 'join', kind: 'Agent',
                        configuration: { agentName }, dependsOn: ['b', 'e'],
                    },
                ],
            });

            SHARED_FAILURES.add('BJ Fails');
            SILENT_TASKS.add('BJ Fails');   // a failed step almost never has output — that is the point
            try {
                const mine = await taskNames(ctx, parentID);
                const parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx19'), parentID);
                AssertEqual(parent.Status, 'Failed', 'the graph must roll up Failed');

                const started = RUNNER.StartedAmong(mine);
                Assert(!started.includes('BJ Join'),
                    'the join RAN downstream of an unhandled failure — the dropped edge released it');

                const children = await loadChildren(ctx, parentID);
                AssertEqual(children.get('BJ Join')!.Status, 'Blocked', 'the join should be Blocked, not skipped or run');
                AssertEqual(children.get('BJ Guarded')!.Status, 'Blocked',
                    'the guarded step should be Blocked — Skipped would satisfy its dependents');
            } finally {
                SHARED_FAILURES.delete('BJ Fails');
                SILENT_TASKS.delete('BJ Fails');
            }

            console.log('      → failed origin blocked the join instead of skip-releasing it');
        }
    },

    {
        Id: 'task-graph-execution.TX20',
        Name: 'TX20: a flow condition on data.* sees the invocation, not the origin\'s output',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-3 / D2. `data` and `context` resolved against the origin STEP's output, which never
            // carries those keys — so every documented `data.x` condition read undefined, came out
            // false, and silently took the branch the walker would not have. On every invocation,
            // with the validator blessing the condition at the door.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-invocation (safe to delete)',
                tasks: [
                    agentTask('a', 'IV Gate', agentName),
                    {
                        tempId: 'b', name: 'IV Approved', description: 'approved branch', kind: 'Agent',
                        configuration: { agentName },
                        dependsOn: [{ tempId: 'a', condition: 'data.userApproval === true' }],
                    },
                ],
            }, undefined, { Data: { userApproval: true } });

            const mine = await taskNames(ctx, parentID);
            const parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx20'), parentID);
            AssertEqual(parent.Status, 'Complete', 'the graph must settle');

            const started = RUNNER.StartedAmong(mine);
            Assert(started.includes('IV Approved'),
                'the approval branch did not run — data.userApproval resolved against the wrong thing');

            console.log('      → data.userApproval reached the dispatcher and took the approval branch');
        }
    },

    {
        Id: 'task-graph-execution.TX21',
        Name: 'TX21: duplicate asks for one human step collapse to one, and settle leaves none',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-5. The raise was SELECT-then-INSERT with no unique index behind it, so two
            // overlapping instances both read "none open", both inserted, and both pinged the
            // assignee. Answering one left the other un-answerable and IMMORTAL: the withdrawal
            // paths fire only on skips and cancels, and both human sweeps scope to `Pending` tasks,
            // which an answered task no longer is.
            //
            // The duplicate is staged rather than raced, because the interleaving that produces it
            // is a few milliseconds wide and unreachable from a check. What is asserted is the
            // property that makes the race survivable: a task with more than one open ask converges
            // to one on the next pass over it, whoever minted the extra and whenever.
            const run = await createRun(ctx, 'Paused');
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-human-race (safe to delete)',
                tasks: [humanTask('a', 'HR One')],
            }, run.ID);
            const task = (await loadChildren(ctx, parentID)).get('HR One')!;

            const dispatcher = buildDispatcher(ctx, RUNNER, 'it-tx21');
            await dispatcher.Start();
            try {
                await waitFor(() => openRequestCount(ctx, task.ID), n => n === 1,
                    'the dispatcher never raised the human step\'s request');

                // The losing instance's insert, exactly as the race leaves it.
                const original = (await openRequests(ctx, task.ID))[0];
                const duplicate = await ctx.Provider.GetEntityObject<MJAIAgentRequestEntity>(
                    'MJ: AI Agent Requests', ctx.User,
                );
                duplicate.NewRecord();
                duplicate.OriginatingTaskID = task.ID;
                duplicate.AgentID = original.AgentID;
                duplicate.RequestForUserID = original.RequestForUserID;
                duplicate.Status = 'Requested';
                duplicate.RequestedAt = new Date();
                duplicate.Request = 'a second ask for the same step';
                Assert(await duplicate.Save(), 'could not stage the duplicate request');
                AssertEqual(await openRequestCount(ctx, task.ID), 2, 'the fixture did not stage a duplicate');

                await waitFor(() => openRequestCount(ctx, task.ID), n => n === 1,
                    'more than one request is still open — the assignee sees a duplicate that nothing will ever close');

                const survivor = (await openRequests(ctx, task.ID))[0];
                Assert(UUIDsEqual(survivor.ID, original.ID),
                    'the wrong row survived — the assignee already saw the older ask, so it is the one that must stand');
            } finally {
                await dispatcher.Stop();
            }

            // The other half: nothing is left open behind a graph that is over.
            const cancelled = await new TaskGraphService().Cancel(parentID, {
                EnvironmentID: await resolveEnvironmentID(ctx),
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });
            Assert(cancelled.Success, `cancel reported failure: ${cancelled.ErrorMessage}`);
            AssertEqual(await openRequestCount(ctx, task.ID), 0,
                'a cancelled workflow left an ask standing in someone\'s inbox');

            console.log('      → duplicate asks collapsed to the older one, and cancelling closed it');
        }
    },

    {
        Id: 'task-graph-execution.TX22',
        Name: 'TX22: a transient rollup failure defers the marker, and the next pass completes it',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-8. Only the settlement half of R2-2's specification shipped: the rollup's transient
            // failures logged and returned while the pass went on to settle the run and claim the
            // marker — which permanently excludes the graph from the rescue sweep, making the
            // rollup's own "retrying on a later settlement" log a promise it could not keep.
            //
            // The transient trigger is a submitting run whose TREE cannot be loaded, staged by
            // pointing the graph at a run ID that does not exist. TX14 covers the run READ failure;
            // this covers the tree, which is the path R2-2 named and R2-2 did not close.
            const agentName = await resolveAgentName(ctx);
            const run = await createRun(ctx, 'Paused');
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-rollup-defer (safe to delete)',
                tasks: [agentTask('a', 'RD One', agentName)],
            }, run.ID);

            await repointSubmittingRun(ctx, parentID, NONEXISTENT_RUN_ID);

            const deliverer = new CountingDeliverer();
            const settled = await runUntilSettled(
                ctx, buildDispatcher(ctx, RUNNER, 'it-tx22', undefined, deliverer), parentID);
            AssertEqual(settled.Status, 'Complete', 'the graph itself must still settle');

            AssertEqual(deliverer.CountFor(parentID), 0,
                'this instance delivered despite being unable to roll up — the marker would lock the wrong total in');
            assertMarkerUnclaimed(
                await deliveryMarker(ctx, parentID), true,
                'the marker was claimed by a pass whose rollup failed transiently',
            );

            await repointSubmittingRun(ctx, parentID, run.ID);
            await runUntilDelivered(
                ctx, [buildDispatcher(ctx, RUNNER, 'it-tx22-second', undefined, deliverer)], parentID);
            AssertEqual(deliverer.CountFor(parentID), 1, 'the recovering pass delivered exactly once');

            console.log('      → transient rollup failure deferred the marker; the next pass finished it');
        }
    },

    {
        Id: 'task-graph-execution.TX23',
        Name: 'TX23: Cancel racing a completion keeps the completed outcome',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-9. `Cancel` tested the terminal set against an in-memory snapshot and wrote with a
            // full-row save, so a child whose guarded completion landed in between had its entire
            // outcome overwritten — Complete back to Cancelled, OutputPayload to NULL, provenance
            // reverted. The moment users cancel is exactly the moment tasks are running.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-cancel-race (safe to delete)',
                tasks: [
                    agentTask('a', 'CR Done', agentName),
                    agentTask('b', 'CR Pending', agentName),
                ],
            });

            // Stage the state the race produces: one child already settled with a real outcome.
            const claims = new TaskClaimStore('it-tx23-peer', 300);
            const done = (await loadChildren(ctx, parentID)).get('CR Done')!;
            Assert(await claims.TryClaim(ctx.Provider, done.ID, ctx.User), 'could not claim the child');
            Assert(
                await claims.CompleteClaimed(
                    ctx.Provider, done.ID,
                    { Status: 'Complete', OutputPayload: JSON.stringify({ kept: true }) },
                    ctx.User,
                ),
                'could not complete the child',
            );

            const result = await new TaskGraphService().Cancel(parentID, {
                EnvironmentID: await resolveEnvironmentID(ctx),
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });
            Assert(result.Success, `cancel reported failure: ${result.ErrorMessage}`);

            const after = await loadChildren(ctx, parentID);
            const kept = after.get('CR Done')!;
            AssertEqual(kept.Status, 'Complete', 'the completed child was overwritten to Cancelled');
            Assert(!!kept.OutputPayload, 'the completed child lost its OutputPayload');
            AssertEqual(after.get('CR Pending')!.Status, 'Cancelled', 'the pending child was not cancelled');

            console.log('      → cancel left the completed outcome and its output intact');
        }
    },

    {
        Id: 'task-graph-execution.TX24',
        Name: 'TX24: nested cancel stays inside workflow graphs and terminates on a cycle',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-10. The sub-graph walk filtered only on `AgentRunID`, with no TypeID predicate — so
            // any non-workflow root hierarchy carrying a cancelled run's ID got `Cancelled` written
            // over its children. And the depth cap was dead code: the sole caller passed a literal 0
            // and the recursion restarted at 0, so a cyclic `AgentRunID` linkage recursed to stack
            // overflow mid-cancel.
            const agentName = await resolveAgentName(ctx);
            const run = await createRun(ctx, 'Paused');
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-nested-scope (safe to delete)',
                tasks: [agentTask('a', 'NS One', agentName)],
            }, run.ID);

            // A NON-workflow root hierarchy carrying the same run id — the shape the unscoped walk
            // would have cancelled.
            const foreignParentID = await createForeignTaskHierarchy(ctx);
            const foreign = await loadTask(ctx, foreignParentID);
            foreign.AgentRunID = run.ID;
            Assert(await foreign.Save(), 'could not stage the foreign hierarchy');
            const foreignChildBefore = [...(await loadChildren(ctx, foreignParentID)).values()][0];

            // A cycle: the graph's own child points back at the run that owns the graph.
            const child = (await loadChildren(ctx, parentID)).get('NS One')!;
            child.AgentRunID = run.ID;
            Assert(await child.Save(), 'could not stage the cyclic linkage');

            const result = await new TaskGraphService().Cancel(parentID, {
                EnvironmentID: await resolveEnvironmentID(ctx),
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });
            // Terminating at all is half the assertion — the cycle used to recurse without bound.
            Assert(result.Success, `cancel reported failure: ${result.ErrorMessage}`);

            const foreignAfter = [...(await loadChildren(ctx, foreignParentID)).values()][0];
            AssertEqual(foreignAfter.Status, foreignChildBefore.Status,
                'the non-workflow hierarchy was cancelled — the walk is not type-scoped');

            console.log('      → nested cancel skipped the foreign hierarchy and terminated on the cycle');
        }
    },

    {
        Id: 'task-graph-execution.TX25',
        Name: 'TX25: a host that will not run graphs refuses to accept them',
        RequiresMutation: true,
        Fn: async () => {
            // R3-11. `MJ_DISABLE_TASK_GRAPH_DISPATCHER=1` suppressed execution while the durable
            // submitter kept registering, so the agent submitted, promised a follow-up, and parked
            // its run `Paused` — graph Pending, run parked, forever, with no per-submission
            // diagnostics. This asserts the seam the host uses, rather than booting a second server.
            const before = GetTaskGraphSubmitter();
            Assert(!!before, 'this host has no submitter registered, so the check would pass vacuously');

            SuppressTaskGraphSubmission('MJ_DISABLE_TASK_GRAPH_DISPATCHER=1 is set on this host');
            try {
                AssertEqual(GetTaskGraphSubmitter(), null,
                    'a disabled host still hands out a submitter — it would accept graphs nobody runs');
                Assert(
                    (TaskGraphSubmissionSuppressedBecause() ?? '').includes('MJ_DISABLE_TASK_GRAPH_DISPATCHER'),
                    'the refusal does not name the flag, so an operator cannot tell why it refused',
                );
            } finally {
                SuppressTaskGraphSubmission(null as unknown as string);
            }

            Assert(!!GetTaskGraphSubmitter(), 'suppression leaked past the check');
            console.log('      → a disabled host hands out no submitter, and says which flag did it');
        }
    },

    {
        Id: 'task-graph-execution.TX26',
        Name: 'TX26: a dispatcher stopped during boot installs no timers afterwards',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R3-4. Everything in `Start()` before the timer install is awaited — reconciliation and
            // the counted startup sweep, which R2-13 makes `Stop()` wait out. So a host shutting down
            // during boot drained correctly, logged "Stopped.", and returned with both timer fields
            // null — and then `Start()`'s own continuation resumed and installed both timers on the
            // stopped instance. `pollOnce` was inert (its own `running` guard), but `Reconcile` had
            // none: `ReleaseExpiredClaims` — a real UPDATE — ran every interval forever, against a
            // pool the host may have torn down, with nothing left to call `Stop()` again.
            //
            // Observed through that UPDATE, since the timers themselves are private: an expired claim
            // staged AFTER the race has no legitimate reason to be released by anybody. If it is, a
            // reconcile timer exists on an instance that reported itself stopped.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-boot-race (safe to delete)',
                tasks: [agentTask('a', 'BR One', agentName)],
            });

            const dispatcher = buildDispatcher(ctx, RUNNER, 'it-tx26', undefined, undefined,
                TEST_POLL_SECONDS, undefined, 1);
            const booting = dispatcher.Start();     // deliberately not awaited
            await dispatcher.Stop();                 // lands inside the boot awaits
            await booting;                           // let the continuation run

            // The state a crashed peer leaves, staged now so only a live timer could clear it.
            const child = (await loadChildren(ctx, parentID)).get('BR One')!;
            child.Status = 'In Progress';
            child.ClaimedBy = 'it-tx26-dead-peer';
            child.ClaimExpiresAt = new Date(Date.now() - 60_000);
            Assert(await child.Save(), `could not stage the orphaned claim: ${child.LatestResult?.CompleteMessage ?? 'unknown'}`);

            await settle(4_000);   // several reconcile intervals, had one been installed

            const after = (await loadChildren(ctx, parentID)).get('BR One')!;
            AssertEqual(after.ClaimedBy, 'it-tx26-dead-peer',
                'the claim was released by an instance that reported itself stopped — a reconcile timer is still running');
            AssertEqual(after.Status, 'In Progress', 'the stopped instance reconciled the task back to Pending');

            console.log('      → a stop during boot stayed stopped; no timer outlived it');
        }
    },


    {
        Id: 'task-graph-execution.TX27',
        Name: 'TX27: a step allowance armed on one instance releases exactly one task, whichever instance owns it',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // #3770's handover exercise (d)-(h), which nothing in CI could run: step allowances live
            // in the claim store precisely so a Run Console attached to instance A can single-step a
            // graph whose tasks are executed by a dispatcher on instance B. Two instances is the
            // whole point, and no test had two.
            //
            // The console is one CALLER of the debug verbs, so the verbs are driven directly here —
            // deterministic, no browser session, and it runs on every future change instead of once.
            //
            // THE FAILURE MODE, named in the handover: an allowance granted on A consumed as a
            // FREE-RUN signal on B, so more than one step executes per press.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-two-instance (safe to delete)',
                tasks: [
                    agentTask('a', 'TI One', agentName),
                    agentTask('b', 'TI Two', agentName, ['a']),
                    agentTask('c', 'TI Three', agentName, ['b']),
                    agentTask('d', 'TI Four', agentName, ['c']),
                ],
            });
            const service = new TaskGraphService();
            const context = {
                EnvironmentID: await resolveEnvironmentID(ctx),
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            };

            // (d) PAUSE on "instance A" — durable state, so BOTH instances must stop advancing it.
            Assert((await service.PauseGraph(parentID, context)).Success, 'pause was refused');

            const instanceA = buildDispatcher(ctx, RUNNER, 'it-tx27-instance-a');
            const instanceB = buildDispatcher(ctx, RUNNER, 'it-tx27-instance-b');
            await instanceA.Start();
            await instanceB.Start();
            try {
                const ranAfterPause = await settleAndCount(ctx, parentID);
                AssertEqual(ranAfterPause, 0,
                    'a paused graph advanced anyway — the pause is not gating both instances');

                // (e) STEP once. Exactly one task may start, whichever instance wins the claim.
                Assert((await service.StepGraph(parentID, 'one', context)).Success, 'step was refused');
                await waitFor(() => countStarted(ctx, parentID), (n) => n >= 1,
                    'the step allowance released nothing within the timeout');
                await settle(TWO_INSTANCE_DRAIN_MS);   // give a SECOND task time to slip through
                AssertEqual(await countStarted(ctx, parentID), 1,
                    'more than one task ran for a single step — the allowance was consumed as a free-run signal');

                // The allowance is spent: nothing further moves until told again.
                const afterConsume = await settleAndCount(ctx, parentID);
                AssertEqual(afterConsume, 1, 'the graph kept running after its one-shot allowance was consumed');

                // (f) BREAKPOINT on a downstream step, then resume. The graph must halt there even
                // though a different instance may be the executor.
                const children = await loadChildren(ctx, parentID);
                const breakOn = children.get('TI Three')!;
                Assert((await service.SetBreakpoints(parentID, [breakOn.ID], context)).Success, 'breakpoints refused');
                Assert((await service.ResumeGraph(parentID, context)).Success, 'resume was refused');

                await waitFor(() => statusOf(ctx, breakOn.ID), (st) => st === 'Pending',
                    'the breakpoint task should still be Pending when the graph halts on it');
                await waitFor(() => pausedByBreakpoint(ctx, parentID), (hit) => hit,
                    'the graph never paused on the breakpoint');
                AssertEqual(await statusOf(ctx, breakOn.ID), 'Pending',
                    'the breakpoint task RAN — the graph did not halt before claiming it');
                AssertEqual(await statusOf(ctx, children.get('TI Two')!.ID), 'Complete',
                    'the step before the breakpoint should have run');

                // (g) FORCE COMPLETE the step we are stopped on, and SKIP the one after it. Both are
                // verbs the console offers; what matters here is that the graph's own gating honours
                // the forced and skipped results rather than re-deciding them.
                Assert(
                    (await service.ForceCompleteTask(breakOn.ID, { forcedBy: 'TX27' }, context)).Success,
                    'force-complete was refused',
                );
                Assert((await service.SkipTask(children.get('TI Four')!.ID, context)).Success, 'skip was refused');
                Assert((await service.SetBreakpoints(parentID, [], context)).Success, 'clearing breakpoints refused');
                Assert((await service.ResumeGraph(parentID, context)).Success, 'final resume was refused');

                const settled = await waitFor(
                    async () => (await loadTask(ctx, parentID)).Status,
                    (st) => TERMINAL_PARENT_STATUSES.has(st),
                    'the graph never settled after the forced completion and skip',
                );
                AssertEqual(settled, 'Complete',
                    'a graph whose remaining work was forced and skipped should settle Complete');
                AssertEqual(await statusOf(ctx, breakOn.ID), 'Complete', 'the forced step did not stay Complete');
                AssertEqual(await statusOf(ctx, children.get('TI Four')!.ID), 'Skipped', 'the skipped step did not stay Skipped');
            } finally {
                await Promise.all([instanceA.Stop(), instanceB.Stop()]);
            }

            console.log('      → two instances honoured one pause, one step, one breakpoint, and two interventions');
        }
    },

    {
        Id: 'task-graph-execution.TX15',
        Name: 'TX15: a condition on a step that produced nothing completes the graph',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R2-3. `payload.approved === true` on a step whose output is null used to THROW, and
            // every throw became a hold — permanent, because the origin is terminal and its output
            // can never change. Both the legacy walker and the pre-P2 dispatcher ran this graph to
            // completion; after P2 it stalled forever with no error. The assertion is that the graph
            // SETTLES, because a stalled graph produces nothing to assert on at all.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-null-output (safe to delete)',
                tasks: [
                    agentTask('a', 'NO Silent', agentName),
                    {
                        tempId: 'b', name: 'NO Guarded', description: 'guarded', kind: 'Agent',
                        configuration: { agentName },
                        dependsOn: [{ tempId: 'a', condition: 'payload.approved === true' }],
                    },
                ],
            });

            // The origin produces NO output at all — an action that returns nothing, a human
            // approval with no response data, a prompt that answered with silence.
            SILENT_TASKS.add('NO Silent');
            try {
                const parent = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx15'), parentID);
                AssertEqual(parent.Status, 'Complete', 'the graph must settle rather than hold forever');
            } finally {
                SILENT_TASKS.delete('NO Silent');
            }

            const children = await loadChildren(ctx, parentID);
            AssertEqual(children.get('NO Silent')!.Status, 'Complete', 'the origin ran');
            // The condition asked about data that does not exist. That is the data answering NO —
            // so the branch is not taken, and "not taken" is Skipped, never Blocked.
            AssertEqual(children.get('NO Guarded')!.Status, 'Skipped', 'the guarded branch should be skipped, not held or blocked');

            console.log('      → null-output condition read as false; graph settled instead of stalling');
        }
    },

    {
        Id: 'task-graph-execution.TX16',
        Name: 'TX16: a dispatcher that cannot deliver does not win the right to',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R2-6. `claimContinuation` ran before the deliverer check, so an instance built without
            // one — a worker tier, this very bundle, a second dev session — could observe the
            // settlement first, win the CAS, mark it `delivered`, and discard the message a capable
            // peer would have posted moments later. Permanently, decided by poll timing.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-capability (safe to delete)',
                tasks: [agentTask('a', 'CP One', agentName)],
            });

            const deliverer = new CountingDeliverer();
            // The incapable instance is given a HEAD START, so if capability did not gate the claim
            // it would win — the check would be vacuous if both raced fairly.
            const blind = buildDispatcher(ctx, RUNNER, 'it-tx16-blind');
            await blind.Start();
            try {
                await settle(1500);
                // The blind instance has no deliverer at all, so nothing local can have delivered —
                // which is exactly the premise `assertMarkerUnclaimed` needs to assign blame.
                assertMarkerUnclaimed(
                    await deliveryMarker(ctx, parentID), true,
                    'the deliverer-less instance claimed delivery and discarded the announcement',
                );

                const capable = buildDispatcher(ctx, RUNNER, 'it-tx16-capable', undefined, deliverer);
                await runUntilDelivered(ctx, [capable], parentID);
            } finally {
                await blind.Stop();
            }

            AssertEqual(deliverer.CountFor(parentID), 1, 'the capable instance delivered exactly once');
            AssertEqual((await loadTask(ctx, parentID)).Status, 'Complete',
                'the graph still settled — only the ANNOUNCEMENT was left to a peer');

            console.log('      → incapable instance settled the graph and left the announcement to a peer');
        }
    },

    {
        Id: 'task-graph-execution.TX17',
        Name: 'TX17: cancelling a workflow cancels what it started, and reports the truth',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            // R2-9. A step can be an agent that submits a graph of its own, and those persist as
            // ROOTS — linked back only through the child task's `AgentRunID`. So cancelling a
            // workflow left its descendants running, and on settlement one of them could REINVOKE
            // the cancelled workflow's own agent for a fresh billed turn: the user stopped a
            // workflow and it started itself again.
            const agentName = await resolveAgentName(ctx);
            const parentID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-cancel-parent (safe to delete)',
                tasks: [agentTask('a', 'CN Outer', agentName)],
            });
            // Wire the nested graph to the outer graph's step exactly as a real sub-graph is: the
            // step records the run, and the sub-graph's root records the same run — stamped at
            // persist time, as `Submit` does it.
            const run = await createRun(ctx, 'Running');
            const nestedID = await submitGraph(ctx, {
                workflowName: 'mj-it-exec-cancel-nested (safe to delete)',
                tasks: [agentTask('a', 'CN Inner', agentName)],
            }, run.ID);

            const outerChild = (await loadChildren(ctx, parentID)).get('CN Outer')!;
            outerChild.AgentRunID = run.ID;
            Assert(await outerChild.Save(), `could not link the outer step to its run: ${outerChild.LatestResult?.CompleteMessage ?? 'unknown'}`);

            const result = await new TaskGraphService().Cancel(parentID, {
                EnvironmentID: await resolveEnvironmentID(ctx),
                ConversationDetailID: null,
                ContextUser: ctx.User,
                Provider: ctx.Provider,
            });

            Assert(result.Success, `cancel reported failure: ${result.ErrorMessage}`);
            AssertEqual(result.UncancelledTaskNames.join(', '), '', 'a clean cancel names nothing as surviving');

            AssertEqual((await loadChildren(ctx, parentID)).get('CN Outer')!.Status, 'Cancelled',
                'the outer step was not cancelled');
            AssertEqual((await loadChildren(ctx, nestedID)).get('CN Inner')!.Status, 'Cancelled',
                'the NESTED graph kept running — it would have settled and could have reinvoked the cancelled agent');

            console.log('      → cancel reached the sub-graph the workflow started');
        }
    },
];

for (const check of TaskGraphExecutionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('task-graph-execution', {
    Setup: async () => { /* each check builds and tears down its own graph */ },
    Teardown: async (ctx: IntegrationCheckContext) => {
        // FK order: dependency edges reference tasks, children reference the parent.
        for (const parentID of CREATED_PARENT_IDS) {
            const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            const children = childRes.Results ?? [];
            if (children.length > 0) {
                const ids = children.map((c) => `'${c.ID}'`).join(',');
                const depRes = await RunView.FromMetadataProvider(ctx.Provider).RunView(
                    { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${ids})`, ResultType: 'entity_object' }, ctx.User,
                );
                for (const dep of (depRes.Results ?? []) as Array<{ Delete: () => Promise<boolean> }>) {
                    await dep.Delete();
                }
            }
            for (const c of children) await c.Delete();

            const parentRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ID='${parentID}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const parent = parentRes.Results?.[0];
            if (parent) await parent.Delete();
        }
        CREATED_PARENT_IDS.length = 0;

        // Only removes a TaskType this bundle created; a pre-existing one is left alone.
        for (const id of CREATED_TASK_TYPE_IDS) {
            const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskTypeEntity>(
                { EntityName: 'MJ: Task Types', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object' }, ctx.User,
            );
            const row = res.Results?.[0];
            if (row) await row.Delete();
        }
        CREATED_TASK_TYPE_IDS.length = 0;
    },
});
