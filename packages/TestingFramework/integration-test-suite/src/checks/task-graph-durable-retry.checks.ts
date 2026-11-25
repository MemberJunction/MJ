/**
 * @fileoverview IT181 — durable retry of workflow steps, against a live database.
 *
 * A retryable failure used to be retried by sleeping inside the claim that ran it, so a restart lost
 * the retry. Now the failure goes back to Pending with the attempt counted and the earliest moment it
 * may run again on the row, and claiming waits for that moment on the database clock. These checks
 * prove it with TWO dispatchers: one fails the step and stops, a second — a different instance, as
 * after a restart — picks the retry up only once it is due.
 *
 * Stub runners stand in for the agent framework and the model: no model calls are made.
 * Mutation-class throughout; every graph is torn down children-first.
 *
 * @module @memberjunction/integration-test-suite
 */
import type { TaskGraphSpecNode } from '@memberjunction/ai-core-plus';
import type {
    TaskAgentRunner,
    TaskAgentRunParams,
    TaskAgentRunResult,
    TaskPromptRunner,
    TaskPromptRunParams,
    TaskPromptRunResult,
} from '@memberjunction/task-graph';
import { Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck } from '@memberjunction/testing-integration';
import { TaskGraphLiveFixture } from './task-graph-live-fixture';

const FIXTURE = new TaskGraphLiveFixture('durable-retry');

/** A prompt runner that fails a given number of times, then succeeds, recording when it was called. */
class ScriptedPromptRunner implements TaskPromptRunner {
    public readonly CalledAt: Date[] = [];
    constructor(private failuresLeft: number) {}
    public async RunPromptForTask(_params: TaskPromptRunParams): Promise<TaskPromptRunResult> {
        this.CalledAt.push(new Date());
        if (this.failuresLeft > 0) {
            this.failuresLeft--;
            return { Success: false, ErrorMessage: 'upstream temporarily unavailable' };
        }
        return { Success: true, Output: { answered: true } };
    }
}

/** An agent runner that always fails, counting its runs. */
class FailingAgentRunner implements TaskAgentRunner {
    public Runs = 0;
    public async RunAgentForTask(_params: TaskAgentRunParams): Promise<TaskAgentRunResult> {
        this.Runs++;
        return { Success: false, ErrorMessage: 'agent failed' };
    }
}

const UNUSED_AGENT: TaskAgentRunner = { RunAgentForTask: async () => ({ Success: false, ErrorMessage: 'no agent expected' }) };

const promptStep = (name: string, promptName: string, retryCount: number): TaskGraphSpecNode =>
    ({ tempId: 'p', name, description: name, kind: 'Prompt', configuration: { promptName }, dependsOn: [], policy: { retryCount } });

export const TaskGraphDurableRetryChecks: NamedCheck[] = [
    {
        Id: 'task-graph-durable-retry.DR1',
        Name: 'DR1: a failed retryable step survives its dispatcher stopping, and another instance retries it once due',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            await FIXTURE.CancelUnfinished(ctx);
            const promptName = await FIXTURE.AnyName(ctx, 'MJ: AI Prompts');
            const parentID = await FIXTURE.Submit(ctx, {
                workflowName: 'mj-it-durable-retry (safe to delete)',
                tasks: [promptStep('DR1 Ask', promptName, 2)],
            });
            const stepID = (await FIXTURE.ChildNamed(ctx, parentID, 'DR1 Ask')).ID;

            // First instance: the run fails, the retry is scheduled on the row, then the instance stops.
            const first = new ScriptedPromptRunner(1);
            const scheduled = await FIXTURE.WithDispatcher(ctx, 'it-dr1-a', { Agent: UNUSED_AGENT, Prompt: first }, () =>
                FIXTURE.WaitFor(() => FIXTURE.LoadTask(ctx, stepID), (t) => t.AttemptCount === 1, 'the failure was never scheduled for a retry'),
            );
            AssertEqual(first.CalledAt.length, 1, 'the run is not retried inside the claim any more');
            AssertEqual(scheduled.Status, 'Pending', 'a scheduled retry is Pending, not Failed: nothing downstream may react to it yet');
            Assert(!scheduled.ClaimedBy, 'the claim is released with the retry, so any instance can take it');
            Assert(!!scheduled.NextAttemptAt, 'the earliest moment for the retry is on the row');
            AssertEqual(scheduled.ErrorMessage, 'upstream temporarily unavailable', 'the row says why it is waiting');

            // Second instance, as after a restart: it runs the retry, and not before it is due.
            const second = new ScriptedPromptRunner(0);
            const parent = await FIXTURE.WithDispatcher(ctx, 'it-dr1-b', { Agent: UNUSED_AGENT, Prompt: second }, () =>
                FIXTURE.WaitForParent(ctx, parentID),
            );
            AssertEqual(parent.Status, 'Complete', 'the retry succeeds and the graph completes');
            AssertEqual(second.CalledAt.length, 1, 'the other instance ran the retry exactly once');
            const dueAt = new Date(scheduled.NextAttemptAt!).getTime();
            // The database and this process share a host here; a few ms of clock rounding is not early.
            Assert(second.CalledAt[0].getTime() >= dueAt - 50, `the retry ran ${dueAt - second.CalledAt[0].getTime()}ms before it was due`);
            const done = await FIXTURE.LoadTask(ctx, stepID);
            AssertEqual(done.Status, 'Complete', 'the step completes on its retry');
            AssertEqual(done.AttemptCount, 1, 'the row records that one retry was used');
            console.log('      → failed on one instance, retried on another once due, completed');
        },
    },

    {
        Id: 'task-graph-durable-retry.DR2',
        Name: 'DR2: once its retries are spent, a step fails for good',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            await FIXTURE.CancelUnfinished(ctx);
            const promptName = await FIXTURE.AnyName(ctx, 'MJ: AI Prompts');
            const parentID = await FIXTURE.Submit(ctx, {
                workflowName: 'mj-it-retry-exhausted (safe to delete)',
                tasks: [promptStep('DR2 Ask', promptName, 1)],
            });
            const runner = new ScriptedPromptRunner(10);
            const parent = await FIXTURE.WithDispatcher(ctx, 'it-dr2', { Agent: UNUSED_AGENT, Prompt: runner }, () =>
                FIXTURE.WaitForParent(ctx, parentID),
            );
            AssertEqual(parent.Status, 'Failed', 'the graph fails once the step has no retries left');
            AssertEqual(runner.CalledAt.length, 2, 'one run, then its one retry — and no more');
            const step = await FIXTURE.ChildNamed(ctx, parentID, 'DR2 Ask');
            AssertEqual(step.Status, 'Failed', 'the step is Failed, not waiting');
            AssertEqual(step.AttemptCount, 1, 'the one retry the policy allowed was used');
            console.log('      → retried once, then failed for good');
        },
    },

    {
        Id: 'task-graph-durable-retry.DR3',
        Name: 'DR3: an Agent step is never retried, whatever its policy says',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            await FIXTURE.CancelUnfinished(ctx);
            const agentName = await FIXTURE.AnyName(ctx, 'MJ: AI Agents');
            const parentID = await FIXTURE.Submit(ctx, {
                workflowName: 'mj-it-agent-no-retry (safe to delete)',
                tasks: [{
                    tempId: 'a', name: 'DR3 Agent', description: 'agent', kind: 'Agent',
                    configuration: { agentName }, dependsOn: [], policy: { retryCount: 3 },
                }],
            });
            const agent = new FailingAgentRunner();
            const parent = await FIXTURE.WithDispatcher(ctx, 'it-dr3', { Agent: agent }, () => FIXTURE.WaitForParent(ctx, parentID));
            AssertEqual(parent.Status, 'Failed', 'the failed agent step fails the graph');
            AssertEqual(agent.Runs, 1, 'an agent may have called actions that must not run twice, so it is run once');
            AssertEqual((await FIXTURE.ChildNamed(ctx, parentID, 'DR3 Agent')).AttemptCount, 0, 'no retry was scheduled');
            console.log('      → agent step ran once and failed, no retry');
        },
    },
];

for (const check of TaskGraphDurableRetryChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('task-graph-durable-retry', {
    Setup: async () => { /* each check builds its own graph */ },
    Teardown: (ctx: IntegrationCheckContext) => FIXTURE.Teardown(ctx),
});
