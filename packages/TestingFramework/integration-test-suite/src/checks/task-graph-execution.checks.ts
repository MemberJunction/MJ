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
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import {
    TaskGraphDispatcher,
    TaskGraphService,
    type ProviderFactory,
    type TaskAgentRunner,
    type TaskAgentRunParams,
    type TaskAgentRunResult,
    type TaskGraphFrame,
    type TaskGraphObserver,
} from '@memberjunction/task-graph';
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

    /** The task's own name, read where the work happens — see SHARED_FAILURES. */
    private async resolveName(params: TaskAgentRunParams): Promise<string> {
        try {
            const t = await params.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', params.ContextUser);
            if (await t.Load(params.TaskID)) return t.Name;
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
 * Hands the dispatcher the check's own provider.
 *
 * Production mints one provider per task so parallel work never shares a transaction scope; a check
 * runs against a single connection and has no such contention, so sharing is both safe and simpler.
 * The seam is what is being exercised here, not the pooling.
 */
function providerFactory(provider: IMetadataProvider): ProviderFactory {
    return { CreateProvider: async () => provider };
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
): TaskGraphDispatcher {
    return new TaskGraphDispatcher(
        providerFactory(ctx.Provider),
        runner,
        ctx.User as UserInfo,
        {
            InstanceID: instanceID,
            PollIntervalSeconds: TEST_POLL_SECONDS,
            // Long enough that nothing self-reclaims mid-check; TX7 drives reconciliation explicitly.
            ClaimTTLSeconds: 300,
            ReconciliationIntervalSeconds: 3600,
            MaxConcurrentTasks: 5,
        },
        undefined,  // no continuation deliverer — a test has no conversation to post into
        observer,
    );
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

const agentTask = (tempId: string, name: string, agentName: string, dependsOn: string[] = []) =>
    ({ tempId, name, description: name, agentName, dependsOn });

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
            AssertEqual(RUNNER.StartedAmong(mine).length, 1, 'the single task ran exactly once');

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
            const started = RUNNER.StartedAmong(mine);
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
        Name: 'TX4: a false edge condition skips its branch and the graph still settles',
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

            const started = RUNNER.StartedAmong(mine);
            Assert(started.includes('A Gate'), 'the gate task must still run');
            Assert(
                !started.includes('B Conditional'),
                'a task behind a false condition must not execute — dropping its only prerequisite ' +
                'would make it eligible immediately, so "branch not taken" would run the branch',
            );

            const b = (await loadChildren(ctx, parentID)).get('B Conditional');
            AssertEqual(b!.Status, 'Blocked', 'the untaken branch must be Blocked, not left Pending forever');

            // Blocked, not Complete: the edge is a Prerequisite, so a graph that can never satisfy it
            // has genuinely not finished its work. Expressing "skip this branch and still complete"
            // is what an Optional dependency is for.
            AssertEqual(parent.Status, 'Blocked', 'the graph settles as Blocked when a prerequisite branch is untaken');

            console.log('      → false condition made its branch unreachable; graph settled as Blocked');
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
            AssertEqual(RUNNER.StartedAmong(mine).length, 1, 'the reclaimed task ran exactly once');

            const recovered = (await loadChildren(ctx, parentID)).get('R One')!;
            AssertEqual(recovered.Status, 'Complete', 'the reclaimed task completed');
            Assert(
                recovered.ClaimedBy !== 'it-tx7-dead-instance',
                'the dead instance still owns the claim — reconciliation did not reclaim it',
            );

            console.log('      → orphaned claim reclaimed after a simulated crash; graph completed');
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
