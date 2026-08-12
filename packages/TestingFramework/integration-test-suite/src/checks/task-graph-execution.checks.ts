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
import { MJTaskEntity, MJTaskTypeEntity } from '@memberjunction/core-entities';
import type { TaskGraphSpec, TaskGraphSpecNode } from '@memberjunction/ai-core-plus';
import {
    ParseTaskGraphParentMetadata,
    TaskGraphDispatcher,
    TaskGraphService,
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
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Parent tasks this bundle submitted, unwound children-first in teardown. */
const CREATED_PARENT_IDS: string[] = [];
/** TaskTypes created only when the install had none. */
const CREATED_TASK_TYPE_IDS: string[] = [];

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
async function submitGraph(ctx: IntegrationCheckContext, spec: TaskGraphSpec): Promise<string> {
    await resolveTaskTypeID(ctx);
    const result = await new TaskGraphService().Submit(spec, {
        EnvironmentID: await resolveEnvironmentID(ctx),
        ConversationDetailID: null,
        ContextUser: ctx.User,
        Provider: ctx.Provider,
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
            ReconciliationIntervalSeconds: 3600,
            MaxConcurrentTasks: 5,
        },
        deliverer,  // usually absent: a test has no conversation to post into
        observer,
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
            + `session, will race every check here). Stop the other dispatcher and re-run.`,
        );
    }
    AssertEqual(started.length, expected, what);
    return started;
}

/** Statuses that mean a task was RUN by somebody, for the foreign-runner inference above. */
const TERMINAL_FOR_FOREIGN_CHECK: ReadonlySet<string> = new Set(['Complete', 'Failed']);

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

/** One agent-assigned node. Spec v2: `kind` selects the configuration shape. */
const agentTask = (tempId: string, name: string, agentName: string, dependsOn: string[] = []): TaskGraphSpecNode =>
    ({ tempId, name, description: name, kind: 'Agent', configuration: { agentName }, dependsOn });

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

            const settled = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx8-crashed'), parentID);
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
            const settled = await runUntilSettled(ctx, buildDispatcher(ctx, RUNNER, 'it-tx9-settler'), parentID);
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
