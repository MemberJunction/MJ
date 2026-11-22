/**
 * @fileoverview IT180 — waiting steps (External, Wait, provider-Human) executed by the real dispatcher
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
import { RunView } from '@memberjunction/core';
import {
    BaseHumanTaskProvider,
    type HumanTaskRaiseContext,
    type HumanTaskRaiseResult,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
} from '@memberjunction/ai-core-plus';
import {
    TaskGraphWaitingSteps,
    WAITING_STEP_MARKER,
    type TaskAgentRunner,
    type TaskAgentRunParams,
    type TaskAgentRunResult,
} from '@memberjunction/task-graph';
import { RegisterClass, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { TaskGraphLiveFixture } from './task-graph-live-fixture';


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
/** The workflow step a raise was for; empty for any other subject. */
const stepIDOf = (context: HumanTaskRaiseContext): string => (context.Subject.Kind === 'WorkflowStep' ? context.Subject.TaskID : '');
@RegisterClass(BaseHumanTaskProvider, TEST_PROVIDER_KEY)
export class IntegrationTestHumanTaskProvider extends BaseHumanTaskProvider {
    public async RaiseTask(context: HumanTaskRaiseContext): Promise<HumanTaskRaiseResult> {
        RAISED.push(context);
        return { Outcome: 'raised', ExternalReference: `it-${stepIDOf(context)}` };
    }
}

const FIXTURE = new TaskGraphLiveFixture('waiting-steps', POLL_SECONDS, SETTLE_TIMEOUT_MS);
const RUNNERS = { Agent: RUNNER };

const resolveAgentName = (ctx: IntegrationCheckContext) => FIXTURE.AnyName(ctx, 'MJ: AI Agents');
const trySubmit = (ctx: IntegrationCheckContext, spec: TaskGraphSpec) => FIXTURE.TrySubmit(ctx, spec);
const submit = (ctx: IntegrationCheckContext, spec: TaskGraphSpec) => FIXTURE.Submit(ctx, spec);
const loadTask = (ctx: IntegrationCheckContext, id: string) => FIXTURE.LoadTask(ctx, id);
const childNamed = (ctx: IntegrationCheckContext, parentID: string, name: string) => FIXTURE.ChildNamed(ctx, parentID, name);
const waitFor = <T>(read: () => Promise<T>, done: (value: T) => boolean, what: string) => FIXTURE.WaitFor(read, done, what);
const waitForParent = (ctx: IntegrationCheckContext, parentID: string) => FIXTURE.WaitForParent(ctx, parentID);
const withDispatcher = <T>(ctx: IntegrationCheckContext, instanceID: string, body: () => Promise<T>) =>
    FIXTURE.WithDispatcher(ctx, instanceID, RUNNERS, body);

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
                await waitFor(async () => RAISED.filter((r) => UUIDsEqual(stepIDOf(r), human.ID)).length, (n) => n >= 1, 'the provider was never asked');
                await settle(1500);   // several polls: the provider must not be asked again
                const raises = RAISED.filter((r) => UUIDsEqual(stepIDOf(r), human.ID));
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
    Teardown: (ctx: IntegrationCheckContext) => FIXTURE.Teardown(ctx),
});
