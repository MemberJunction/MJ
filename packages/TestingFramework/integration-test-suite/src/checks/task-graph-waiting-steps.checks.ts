/**
 * @fileoverview IT179 — waiting steps (External, Wait, provider-Human) executed by the real dispatcher
 * against a live database.
 *
 * Each check submits a graph, starts a dispatcher with a stub agent runner (no model calls), and
 * drives the waiting step the way production would: a clock for a Wait, a signal for an External,
 * a provider's completion for a Human step handed to a plugged-in provider. What is asserted is the
 * observable contract — the step waits, completes on the right event, hands the WHOLE payload on, and
 * the graph settles — not the internal calls that got it there.
 *
 * Mutation-class throughout; every graph is torn down children-first.
 *
 * @module @memberjunction/integration-test-suite
 */
import { RunView, ServerOperationScopeManager, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { MJTaskEntity, MJTaskTypeEntity, MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION, type TaskGraphSpec, type TaskGraphSpecNode } from '@memberjunction/ai-core-plus';
import {
    BaseHumanTaskProvider,
    TaskGraphDispatcher,
    TaskGraphService,
    TaskGraphWaitingSteps,
    WAITING_STEP_MARKER,
    type HumanTaskRaiseContext,
    type HumanTaskRaiseResult,
    type ProviderFactory,
    type TaskAgentRunner,
    type TaskAgentRunParams,
    type TaskAgentRunResult,
} from '@memberjunction/task-graph';
import { SQLServerDataProvider, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { RegisterClass, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Parent tasks this bundle submitted, unwound children-first in teardown. */
const CREATED_PARENT_IDS: string[] = [];
/** TaskTypes created only when the install had none. */
const CREATED_TASK_TYPE_IDS: string[] = [];

const POLL_SECONDS = 0.25;
const SETTLE_TIMEOUT_MS = 30_000;

/** Every run of the bundle gets its own keys, so a leftover step from an earlier run is never signalled. */
const RUN_TAG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * Runs agent steps without the agent framework, echoing what it received.
 *
 * It calls no actions and no model, so there is nothing a tainted run could misuse: declaring that it
 * enforces the envelope is true of it. What it does instead is record the taint each node was handed,
 * so the checks can assert the steps after a waiting step see exactly the taint the rule says.
 */
class EchoAgentRunner implements TaskAgentRunner {
    public readonly EnforcesSecurityEnvelope = true;
    public readonly TaintByTask = new UUIDMap<boolean>();
    public async RunAgentForTask(params: TaskAgentRunParams): Promise<TaskAgentRunResult> {
        this.TaintByTask.Set(params.TaskID, params.SecurityEnvelope?.IsRunTainted === true);
        const received: Record<string, unknown> = {};
        for (const output of params.DependencyOutputs.values()) {
            if (output && typeof output === 'object' && !Array.isArray(output)) Object.assign(received, output);
        }
        return { Success: true, Output: { ranBy: 'echo', receivedKeys: Object.keys(received).sort() } };
    }
}

/** The taint the echo runner was handed for a task, or undefined when it never ran it. */
function taintSeenBy(taskID: string): boolean | undefined {
    return RUNNER.TaintByTask.Get(taskID);
}
const RUNNER = new EchoAgentRunner();

/**
 * A human-task provider registered the way an app would register one. Records every raise, so the
 * check can prove it was asked exactly once and was handed the right step.
 */
const TEST_PROVIDER_KEY = 'IntegrationTestHumanProvider';
const RAISED: HumanTaskRaiseContext[] = [];
@RegisterClass(BaseHumanTaskProvider, TEST_PROVIDER_KEY)
export class IntegrationTestHumanTaskProvider extends BaseHumanTaskProvider {
    public async RaiseTask(context: HumanTaskRaiseContext): Promise<HumanTaskRaiseResult> {
        RAISED.push(context);
        return { Outcome: 'raised', ExternalReference: `it-${context.TaskID}` };
    }
}

function providerFactory(ctx: IntegrationCheckContext): ProviderFactory {
    const pool = ctx.Pool;
    if (!pool) return { CreateProvider: async () => ctx.Provider };
    return {
        CreateProvider: async () => {
            const config = new SQLServerProviderConfigData(pool, ctx.Schema ?? '__mj', 0, undefined, undefined, false);
            const provider = new SQLServerDataProvider();
            await provider.Config(config);
            return provider as unknown as IMetadataProvider;
        },
    };
}

function buildDispatcher(ctx: IntegrationCheckContext, instanceID: string): TaskGraphDispatcher {
    return new TaskGraphDispatcher(providerFactory(ctx), RUNNER, ctx.User as UserInfo, {
        InstanceID: instanceID,
        PollIntervalSeconds: POLL_SECONDS,
        ClaimTTLSeconds: 300,
        ReconciliationIntervalSeconds: 3600,
        MaxConcurrentTasks: 5,
    });
}

async function firstID(ctx: IntegrationCheckContext, entity: string): Promise<string | undefined> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: entity, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    return res.Results?.[0]?.ID;
}

async function ensureTaskType(ctx: IntegrationCheckContext): Promise<void> {
    if (await firstID(ctx, 'MJ: Task Types')) return;
    const tt = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
    tt.NewRecord();
    tt.Name = 'mj-integration-test-waiting-task-type (safe to delete)';
    tt.Description = 'Created by the task-graph-waiting-steps integration bundle.';
    Assert(await tt.Save(), `could not create a TaskType fixture: ${tt.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    CREATED_TASK_TYPE_IDS.push(tt.ID);
}

async function resolveAgentName(ctx: IntegrationCheckContext): Promise<string> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Name: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['Name'], ResultType: 'simple', MaxRows: 1 }, ctx.User,
    );
    const name = res.Results?.[0]?.Name;
    Assert(!!name, 'could not resolve an AI Agent');
    return name!;
}

async function trySubmit(ctx: IntegrationCheckContext, spec: TaskGraphSpec): Promise<{ ParentTaskID?: string; ErrorMessage?: string }> {
    await ensureTaskType(ctx);
    const environmentID = await firstID(ctx, 'MJ: Environments');
    Assert(!!environmentID, 'could not resolve an Environment');
    const result = await new TaskGraphService().Submit(spec, {
        EnvironmentID: environmentID!,
        ConversationDetailID: null,
        ContextUser: ctx.User,
        Provider: ctx.Provider,
    });
    if (result.ParentTaskID) CREATED_PARENT_IDS.push(result.ParentTaskID);
    return { ParentTaskID: result.ParentTaskID, ErrorMessage: result.Success ? undefined : result.ErrorMessage };
}

async function submit(ctx: IntegrationCheckContext, spec: TaskGraphSpec): Promise<string> {
    const r = await trySubmit(ctx, spec);
    Assert(!!r.ParentTaskID && !r.ErrorMessage, `submission failed: ${r.ErrorMessage}`);
    return r.ParentTaskID!;
}

async function loadTask(ctx: IntegrationCheckContext, id: string): Promise<MJTaskEntity> {
    const t = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
    Assert(await t.Load(id), `task ${id} could not be loaded`);
    return t;
}

async function childNamed(ctx: IntegrationCheckContext, parentID: string, name: string): Promise<MJTaskEntity> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
        { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
    );
    const child = (res.Results ?? []).find((t) => t.Name === name);
    Assert(!!child, `step "${name}" not found`);
    return child!;
}

/** Polls until `done`, or fails the check naming what it waited for. */
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string): Promise<T> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    let latest = await read();
    while (Date.now() < deadline && !done(latest)) {
        await settle(200);
        latest = await read();
    }
    Assert(done(latest), `${what} (last saw ${JSON.stringify(latest)})`);
    return latest;
}

const TERMINAL = new Set(['Complete', 'Failed', 'Cancelled', 'Blocked']);

async function waitForParent(ctx: IntegrationCheckContext, parentID: string): Promise<MJTaskEntity> {
    await waitFor(async () => (await loadTask(ctx, parentID)).Status, (s) => TERMINAL.has(s), `graph ${parentID} did not settle`);
    return loadTask(ctx, parentID);
}

/** Starts a dispatcher, runs `body`, and always stops it. */
async function withDispatcher<T>(ctx: IntegrationCheckContext, instanceID: string, body: () => Promise<T>): Promise<T> {
    const dispatcher = buildDispatcher(ctx, instanceID);
    await dispatcher.Start();
    try {
        return await body();
    } finally {
        await dispatcher.Stop();
    }
}

function parse(json: string | null | undefined): Record<string, unknown> {
    try {
        const v: unknown = JSON.parse(json ?? '{}');
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

const agent = (tempId: string, name: string, agentName: string, dependsOn: string[] = []): TaskGraphSpecNode =>
    ({ tempId, name, description: name, kind: 'Agent', configuration: { agentName }, dependsOn });

export const TaskGraphWaitingStepChecks: NamedCheck[] = [
    {
        Id: 'task-graph-waiting-steps.WS1',
        Name: 'WS1: a Wait step holds the graph until its moment, then hands the whole payload on',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const parentID = await submit(ctx, {
                workflowName: 'mj-it-wait (safe to delete)',
                tasks: [
                    agent('a', 'WS1 Before', agentName),
                    { tempId: 'w', name: 'WS1 Wait', description: 'wait', kind: 'Wait', configuration: { durationSeconds: 3 }, dependsOn: ['a'] },
                    agent('b', 'WS1 After', agentName, ['w']),
                ],
            });

            const parent = await withDispatcher(ctx, 'it-ws1', () => waitForParent(ctx, parentID));
            AssertEqual(parent.Status, 'Complete', 'the graph must complete once the wait is over');

            const before = await childNamed(ctx, parentID, 'WS1 Before');
            const wait = await childNamed(ctx, parentID, 'WS1 Wait');
            AssertEqual(wait.Status, 'Complete', 'the Wait step completes on its clock');
            const waitedMs = new Date(wait.CompletedAt!).getTime() - new Date(before.CompletedAt!).getTime();
            Assert(waitedMs >= 2500, `the Wait step must actually wait ~3s; it completed ${waitedMs}ms after its prerequisite`);

            const out = parse(wait.OutputPayload);
            Assert(typeof out['waitedUntil'] === 'string', 'the Wait step records when it waited until');
            AssertEqual(out['ranBy'], 'echo', 'the Wait step hands on the payload it was reached with — upstream output must not be dropped');
            const after = await childNamed(ctx, parentID, 'WS1 After');
            AssertEqual(taintSeenBy(after.ID), false, 'a Wait adds nothing: the step after it runs as clean as the step before it');
            console.log(`      → waited ${waitedMs}ms, payload passed through, taint unchanged`);
        },
    },

    {
        Id: 'task-graph-waiting-steps.WS2',
        Name: 'WS2: an External step waits for a signal by correlation key, and the signal payload reaches the payload',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const key = `it-ws2-${RUN_TAG}`;
            const parentID = await submit(ctx, {
                workflowName: 'mj-it-external (safe to delete)',
                tasks: [
                    { tempId: 'x', name: 'WS2 Await', description: 'await', kind: 'External', configuration: { domain: 'it', correlationKey: key }, dependsOn: [] },
                    agent('b', 'WS2 After', agentName, ['x']),
                ],
            });

            const parent = await withDispatcher(ctx, 'it-ws2', async () => {
                const external = await childNamed(ctx, parentID, 'WS2 Await');
                await waitFor(async () => (await loadTask(ctx, external.ID)).ClaimedBy, (c) => c === WAITING_STEP_MARKER, 'the External step was never reached');
                await settle(1000);
                AssertEqual((await loadTask(ctx, parentID)).Status === 'Complete', false, 'nothing may move past an External step before its signal');

                const result = await TaskGraphWaitingSteps.CompleteWaitingStep({ CorrelationKey: key, Payload: { approved: true } }, ctx.Provider, ctx.User);
                Assert(result.Success, `signal failed: ${result.ErrorMessage}`);
                AssertEqual(result.Completed.length, 1, 'the signal completes the one step waiting on the key');
                return waitForParent(ctx, parentID);
            });

            AssertEqual(parent.Status, 'Complete', 'the graph completes after the signal');
            const out = parse((await childNamed(ctx, parentID, 'WS2 Await')).OutputPayload);
            AssertEqual(out['approved'], true, 'the signal payload becomes the step output');
            const after = parse((await childNamed(ctx, parentID, 'WS2 After')).OutputPayload);
            Assert(Array.isArray(after['receivedKeys']) && (after['receivedKeys'] as string[]).includes('approved'),
                'the downstream step receives what the signal said');
            AssertEqual(taintSeenBy((await childNamed(ctx, parentID, 'WS2 After')).ID), true,
                'a signal payload is content from outside the graph: the step after it must run tainted');
            console.log('      → signal by key completed the step, its payload flowed downstream, and tainted it');
        },
    },

    {
        Id: 'task-graph-waiting-steps.WS3',
        Name: 'WS3: a signal that arrives before the step is reached is held, then applied when it is',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const key = `it-ws3-${RUN_TAG}`;
            const parentID = await submit(ctx, {
                workflowName: 'mj-it-early-signal (safe to delete)',
                tasks: [
                    { tempId: 'w', name: 'WS3 Wait', description: 'wait', kind: 'Wait', configuration: { durationSeconds: 2 }, dependsOn: [] },
                    { tempId: 'x', name: 'WS3 Await', description: 'await', kind: 'External', configuration: { domain: 'it', correlationKey: key }, dependsOn: ['w'] },
                ],
            });

            // Before any dispatcher runs: the step is not reached, so the signal must be HELD, not lost.
            const early = await TaskGraphWaitingSteps.CompleteWaitingStep({ CorrelationKey: key, Payload: { early: 'yes' } }, ctx.Provider, ctx.User);
            AssertEqual(early.Buffered.length, 1, `an early signal is held on the step (got ${JSON.stringify(early)})`);
            AssertEqual(early.Completed.length, 0, 'an early signal must not complete an unreached step');

            const parent = await withDispatcher(ctx, 'it-ws3', () => waitForParent(ctx, parentID));
            AssertEqual(parent.Status, 'Complete', 'the held signal completes the step the moment it is reached');
            AssertEqual(parse((await childNamed(ctx, parentID, 'WS3 Await')).OutputPayload)['early'], 'yes', 'the held payload is applied');
            console.log('      → early signal held, then applied on reach');
        },
    },

    {
        Id: 'task-graph-waiting-steps.WS4',
        Name: 'WS4: an External step past its deadline fails instead of waiting forever',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const parentID = await submit(ctx, {
                workflowName: 'mj-it-expiry (safe to delete)',
                tasks: [
                    // 0.0005 h = 1.8 s
                    { tempId: 'x', name: 'WS4 Await', description: 'await', kind: 'External', configuration: { domain: 'it', expiresInHours: 0.0005 }, dependsOn: [] },
                ],
            });
            const parent = await withDispatcher(ctx, 'it-ws4', () => waitForParent(ctx, parentID));
            const step = await childNamed(ctx, parentID, 'WS4 Await');
            AssertEqual(step.Status, 'Failed', 'a step nothing completed before its deadline fails');
            Assert((step.ErrorMessage ?? '').includes('deadline'), `the failure names the deadline (got "${step.ErrorMessage}")`);
            AssertEqual(parent.Status, 'Failed', 'and the graph settles rather than hanging');
            console.log('      → deadline failed the step and the graph settled');
        },
    },

    {
        Id: 'task-graph-waiting-steps.WS5',
        Name: 'WS5: a Human step handed to a plugged-in provider is raised once there and completed through it — not the inbox',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const parentID = await submit(ctx, {
                workflowName: 'mj-it-provider-human (safe to delete)',
                tasks: [
                    agent('a', 'WS5 Draft', agentName),
                    {
                        tempId: 'h', name: 'WS5 Approve', description: 'approve', kind: 'Human',
                        configuration: { instructions: 'Approve the draft', provider: TEST_PROVIDER_KEY, providerConfiguration: { queue: 'it' } },
                        dependsOn: ['a'],
                    },
                    agent('b', 'WS5 Publish', agentName, ['h']),
                ],
            });
            const human = await childNamed(ctx, parentID, 'WS5 Approve');

            const parent = await withDispatcher(ctx, 'it-ws5', async () => {
                await waitFor(async () => RAISED.filter((r) => UUIDsEqual(r.TaskID, human.ID)).length, (n) => n >= 1, 'the provider was never asked');
                await settle(1500);   // several polls: the provider must not be asked again
                const raises = RAISED.filter((r) => UUIDsEqual(r.TaskID, human.ID));
                AssertEqual(raises.length, 1, 'the provider is asked exactly once, however many polls pass');
                AssertEqual(raises[0].Instructions, 'Approve the draft', 'the provider gets the step instructions');
                AssertEqual(raises[0].ProviderConfiguration['queue'], 'it', 'the provider gets its configuration untouched');
                AssertEqual(raises[0].Payload['ranBy'], 'echo', 'the provider gets the payload the step was reached with');

                const done = await TaskGraphWaitingSteps.CompleteWaitingStep(
                    { TaskID: human.ID, Payload: { decision: 'approved' }, CompletedByUserID: ctx.User.ID }, ctx.Provider, ctx.User,
                );
                Assert(done.Success, `completion failed: ${done.ErrorMessage}`);
                return waitForParent(ctx, parentID);
            });

            AssertEqual(parent.Status, 'Complete', 'the graph completes after the provider decides');
            const out = parse((await childNamed(ctx, parentID, 'WS5 Approve')).OutputPayload);
            AssertEqual(out['decision'], 'approved', 'the decision becomes the step output');

            const inbox = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
                { EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingTaskID='${human.ID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, ctx.User,
            );
            AssertEqual((inbox.Results ?? []).length, 0, 'a provider-owned step must not also raise a built-in inbox request');
            console.log('      → raised once with the provider, completed through it, no inbox request');
        },
    },

    {
        Id: 'task-graph-waiting-steps.WS6',
        Name: 'WS6: submit refuses a Human step naming an unregistered provider, and a Wait step cannot be signalled',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const refused = await trySubmit(ctx, {
                workflowName: 'mj-it-bad-provider (safe to delete)',
                tasks: [{ tempId: 'h', name: 'WS6 Approve', description: 'a', kind: 'Human', configuration: { provider: 'NoSuchProvider' }, dependsOn: [] }],
            });
            Assert(!refused.ParentTaskID, 'nothing is written for a graph naming an unregistered provider');
            Assert((refused.ErrorMessage ?? '').includes('NoSuchProvider'), `the refusal names the provider (got "${refused.ErrorMessage}")`);

            const parentID = await submit(ctx, {
                workflowName: 'mj-it-wait-signal (safe to delete)',
                tasks: [{ tempId: 'w', name: 'WS6 Wait', description: 'w', kind: 'Wait', configuration: { durationSeconds: 3600 }, dependsOn: [] }],
            });
            const wait = await childNamed(ctx, parentID, 'WS6 Wait');
            const signalled = await TaskGraphWaitingSteps.CompleteWaitingStep({ TaskID: wait.ID }, ctx.Provider, ctx.User);
            AssertEqual(signalled.Success, false, 'a Wait step completes on its clock, never on a signal');
            Assert((signalled.ErrorMessage ?? '').includes('own clock'), `the refusal says why (got "${signalled.ErrorMessage}")`);
            console.log('      → unregistered provider and Wait-signal both refused by name');
        },
    },

    {
        Id: 'task-graph-waiting-steps.WS7',
        Name: 'WS7: a signal that only releases an External step adds no taint',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const agentName = await resolveAgentName(ctx);
            const parentID = await submit(ctx, {
                workflowName: 'mj-it-release-only (safe to delete)',
                tasks: [
                    { tempId: 'x', name: 'WS7 Await', description: 'await', kind: 'External', configuration: { domain: 'it' }, dependsOn: [] },
                    agent('b', 'WS7 After', agentName, ['x']),
                ],
            });

            const parent = await withDispatcher(ctx, 'it-ws7', async () => {
                const external = await childNamed(ctx, parentID, 'WS7 Await');
                await waitFor(async () => (await loadTask(ctx, external.ID)).ClaimedBy, (c) => c === WAITING_STEP_MARKER, 'the External step was never reached');
                // By task ID, with no payload: "go on", nothing more.
                const result = await TaskGraphWaitingSteps.CompleteWaitingStep({ TaskID: external.ID }, ctx.Provider, ctx.User);
                Assert(result.Success, `release failed: ${result.ErrorMessage}`);
                return waitForParent(ctx, parentID);
            });

            AssertEqual(parent.Status, 'Complete', 'the graph completes after the release');
            AssertEqual(taintSeenBy((await childNamed(ctx, parentID, 'WS7 After')).ID), false,
                'a release with no payload brings nothing in from outside, so the step after it runs clean');
            console.log('      → released by task ID; downstream ran clean');
        },
    },
];

for (const check of TaskGraphWaitingStepChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('task-graph-waiting-steps', {
    Setup: async () => { /* each check builds its own graph */ },
    Teardown: async (ctx: IntegrationCheckContext) => {
        for (const parentID of CREATED_PARENT_IDS) {
            const childRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJTaskEntity>(
                { EntityName: 'MJ: Tasks', ExtraFilter: `ParentID='${parentID}'`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
            );
            const children = childRes.Results ?? [];
            if (children.length > 0) {
                const ids = children.map((c) => `'${c.ID}'`).join(',');
                const depRes = await RunView.FromMetadataProvider(ctx.Provider).RunView(
                    { EntityName: 'MJ: Task Dependencies', ExtraFilter: `TaskID IN (${ids})`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
                );
                for (const dep of (depRes.Results ?? []) as Array<{ Delete: () => Promise<boolean> }>) {
                    await ServerOperationScopeManager.Instance.RunWithAuthority(
                        { operationKey: TASK_GRAPH_RUNTIME_SECURITY_OPERATION, source: 'ServerEngine', allowedEntities: ['MJ: Task Dependencies'], userId: ctx.User.ID },
                        () => dep.Delete(),
                    );
                }
                const requestRes = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJAIAgentRequestEntity>(
                    { EntityName: 'MJ: AI Agent Requests', ExtraFilter: `OriginatingTaskID IN (${ids})`, ResultType: 'entity_object', BypassCache: true }, ctx.User,
                );
                for (const request of requestRes.Results ?? []) await request.Delete();
            }
            for (const c of children) await c.Delete();
            const parent = await ctx.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', ctx.User);
            if (await parent.Load(parentID)) await parent.Delete();
        }
        CREATED_PARENT_IDS.length = 0;

        for (const id of CREATED_TASK_TYPE_IDS) {
            const row = await ctx.Provider.GetEntityObject<MJTaskTypeEntity>('MJ: Task Types', ctx.User);
            if (await row.Load(id)) await row.Delete();
        }
        CREATED_TASK_TYPE_IDS.length = 0;
    },
});
