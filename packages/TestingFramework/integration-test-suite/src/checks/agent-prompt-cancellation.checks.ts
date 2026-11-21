/**
 * agent-prompt-cancellation.checks.ts — the 'agent-prompt-cancellation' bundle (APC1–APC2): a caller
 * that cancels an agent run while its prompt's model call is in flight ends the run there.
 *
 * WHAT IT PROVES, against this database's metadata: the cancellation stops at the model call that was
 * in flight — the prompt's failover never moves on to another candidate — and every row records a
 * cancellation, not a failure: the agent run is Cancelled, its Prompt step says it was cancelled, and
 * the prompt run is Cancelled by the user, with only the real failures before the cancellation counted
 * as failover attempts.
 *
 * NO MODEL CALLS. Every chat call is answered by `TestLLM`, registered over the chat driver classes in
 * the lifecycle Setup and restored in Teardown. A call scripted `hangUntilAborted` waits on the
 * request's own abort signal the way an SDK call does, and its `onStart` aborts the run's token a
 * moment after the call begins. The runs pass a placeholder key per stand-in driver class under the
 * `RuntimeOnly` credential scope, so no platform key can bring a real vendor into the candidate list:
 * if failover walked on after the cancellation, it would reach only the stand-in, and the call count
 * shows it. Everything else is real: AgentRunner, BaseAgent, the Loop agent type, AIPromptRunner and
 * its failover loop, and every run, step and prompt-run row.
 *
 * TRANSPORT: SERVER-ONLY by necessity. The stand-in is a ClassFactory registration in this process; an
 * agent run over the wire executes inside MJAPI, which would resolve the real drivers.
 *
 * FIXTURES: the agent is seeded metadata (`IT: Echo Agent`, metadata-optional/integration-test/
 * ai-agents/.it-core-agents.json), referenced read-only. Every run, step and prompt run the bundle
 * creates is deleted in Teardown, children first.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { TestLLM, RegisterTestLLM, type TestLLMOutcome } from '@memberjunction/unit-testing';
import { Assert, AssertEqual, IntegrationCheckRegistry, Settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteById, MakeAIClient, RequireRows, UserTurn } from './agent-live-shared';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const BUNDLE = 'agent-prompt-cancellation';

/** A seeded Loop agent whose prompt has three model bindings, so a failover walk has somewhere to go. */
const AGENT_NAME = 'IT: Echo Agent';

/**
 * Every chat driver class a candidate for the seeded prompt could resolve to: the prompt's own
 * bindings (Gemini, OpenAI, Groq), the models' other vendors, and the drivers other bundles stand in
 * for. Each gets the stand-in and a placeholder key; any other driver class has no key in scope.
 */
const CHAT_DRIVER_CLASSES: readonly string[] = ['OpenAILLM', 'AzureLLM', 'OpenRouterLLM', 'AnthropicLLM', 'GeminiLLM', 'VertexLLM', 'CerebrasLLM', 'GroqLLM'];

/** A placeholder key for each stand-in driver class, so model selection accepts the bindings. Never sent anywhere. */
const SCRIPTED_API_KEYS = CHAT_DRIVER_CLASSES.map(driverClass => ({ driverClass, apiKey: 'it-agent-prompt-cancellation-no-network' }));

/** How long after the model call starts the run's token is aborted: the call is in flight by then. */
const ABORT_AFTER_CALL_START_MS = 50;

/** The abort reason the checks give, as a caller's Stop would. */
const ABORT_REASON = 'it: caller stopped the run';

/** How long to let queued step and prompt-run saves land before reading them back. */
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 1500);

/** A failure that fails over: the first candidate's real failure in APC2. */
const NETWORK_FAILURE = 'fetch failed: network socket disconnected';

/** Step types whose `TargetLogID` is an `MJ: AI Prompt Runs` row. */
const PROMPT_RUN_STEP_TYPES: readonly string[] = ['Prompt', 'Compaction', 'Tool', 'Decision'];

// ─── Fixture ─────────────────────────────────────────────────────────────────────────────────────

interface CancellationFixture {
    Agent: MJAIAgentEntityExtended;
    Llm: TestLLM;
    Restore: () => void;
    RunIDs: string[];
}

let cancellationFixture: CancellationFixture | undefined;

function requireFixture(): CancellationFixture {
    if (!cancellationFixture) {
        throw new Error(`${BUNDLE} fixture not initialized: the bundle lifecycle Setup must run before its checks.`);
    }
    return cancellationFixture;
}

// ─── Reading the rows back ───────────────────────────────────────────────────────────────────────

interface AgentRunRow {
    ID: string;
    Status: string;
    ErrorMessage: string | null;
}

interface StepRow {
    ID: string;
    StepNumber: number;
    StepType: string;
    Status: string;
    ErrorMessage: string | null;
    TargetLogID: string | null;
    ParentID: string | null;
}

interface PromptRunRow {
    ID: string;
    Status: string;
    Cancelled: boolean | null;
    CancellationReason: string | null;
    FailoverAttempts: number | null;
    ErrorDetails: string | null;
}

async function readAgentRun(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<AgentRunRow> {
    const result = await RunView.FromMetadataProvider(provider).RunView<AgentRunRow>({
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID='${EscapeSQLString(runId)}'`,
        Fields: ['ID', 'Status', 'ErrorMessage'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    const [row] = RequireRows(result, `agent run ${runId}`);
    Assert(!!row, `Agent run ${runId} was not found`);
    return row;
}

async function readSteps(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<StepRow[]> {
    const result = await RunView.FromMetadataProvider(provider).RunView<StepRow>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}'`,
        OrderBy: 'StepNumber ASC',
        Fields: ['ID', 'StepNumber', 'StepType', 'Status', 'ErrorMessage', 'TargetLogID', 'ParentID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return RequireRows(result, `steps of run ${runId}`);
}

async function readPromptRun(provider: IMetadataProvider, user: UserInfo, promptRunId: string): Promise<PromptRunRow> {
    const result = await RunView.FromMetadataProvider(provider).RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID='${EscapeSQLString(promptRunId)}'`,
        Fields: ['ID', 'Status', 'Cancelled', 'CancellationReason', 'FailoverAttempts', 'ErrorDetails'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    const [row] = RequireRows(result, `prompt run ${promptRunId}`);
    Assert(!!row, `Prompt run ${promptRunId} was not found`);
    return row;
}

// ─── Running a cancelled agent ───────────────────────────────────────────────────────────────────

/** What one cancelled run left behind. */
interface CancelledRunObservation {
    ModelCalls: number;
    Run: AgentRunRow;
    PromptStep: StepRow;
    PromptRun: PromptRunRow;
}

/**
 * Runs the agent with a cancellation token that aborts {@link ABORT_AFTER_CALL_START_MS} after the
 * stand-in's hanging call begins, then reads back what the run wrote. `before` scripts any outcomes
 * the calls ahead of the hanging one get.
 */
async function runAndCancel(ctx: IntegrationCheckContext, before: TestLLMOutcome[]): Promise<CancelledRunObservation> {
    const f = requireFixture();
    const controller = new AbortController();
    f.Llm.Reset();
    f.Llm.SetDefaultOutcome({ kind: 'fail', error: new Error(`${BUNDLE}: a call reached the stand-in after the run was cancelled`) });
    f.Llm.Script(...before, {
        kind: 'hangUntilAborted',
        onStart: () => { setTimeout(() => controller.abort(ABORT_REASON), ABORT_AFTER_CALL_START_MS); },
    });

    const result = await MakeAIClient(ctx.Provider, ctx.User).RunAIAgent({
        agent: f.Agent,
        conversationMessages: UserTurn('Say hello.'),
        apiKeys: SCRIPTED_API_KEYS,
        CredentialScope: 'RuntimeOnly',
        cancellationToken: controller.signal,
    });
    return observe(ctx, result, f.Llm.CallCount);
}

async function observe(ctx: IntegrationCheckContext, result: ExecuteAgentResult, modelCalls: number): Promise<CancelledRunObservation> {
    const f = requireFixture();
    const runId = result.agentRun?.ID;
    Assert(!!runId, `${AGENT_NAME}: AgentRunner returned no run (${result.errorMessage ?? 'no error message'})`);
    f.RunIDs.push(runId!);
    await Settle(SETTLE_MS);

    const steps = await readSteps(ctx.Provider, ctx.User, runId!);
    const promptStep = steps.find(s => s.StepType === 'Prompt');
    Assert(!!promptStep, `Run ${runId} recorded no Prompt step (steps: ${steps.map(s => s.StepType).join(', ') || 'none'})`);
    Assert(!!promptStep!.TargetLogID, `Run ${runId}'s Prompt step is not linked to a prompt run`);
    return {
        ModelCalls: modelCalls,
        Run: await readAgentRun(ctx.Provider, ctx.User, runId!),
        PromptStep: promptStep!,
        PromptRun: await readPromptRun(ctx.Provider, ctx.User, promptStep!.TargetLogID!),
    };
}

/** The rows every cancelled run must leave, whatever came before the cancellation. */
function assertRecordedAsCancelled(o: CancelledRunObservation, failoverAttempts: number): void {
    AssertEqual(o.Run.Status, 'Cancelled', 'The agent run must be Cancelled, not Failed');
    AssertEqual(o.PromptStep.Status, 'Failed', 'The Prompt step that was cancelled is not a completed step');
    AssertEqual(o.PromptStep.ErrorMessage, 'Cancelled during prompt execution', 'The Prompt step must say it was cancelled');
    AssertEqual(o.PromptRun.Status, 'Cancelled', 'The prompt run must be Cancelled, not Failed');
    AssertEqual(o.PromptRun.Cancelled, true, 'The prompt run must be flagged Cancelled');
    AssertEqual(o.PromptRun.CancellationReason, 'user_requested', 'A caller cancellation is user-requested');
    AssertEqual(o.PromptRun.FailoverAttempts ?? 0, failoverAttempts, 'Only real failures before the cancellation count as failover attempts');
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

export const AgentPromptCancellationChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.APC1`,
        Name: 'APC1: cancelling a run mid-call stops at that call — no failover — and records the run, step and prompt run as cancelled',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const o = await runAndCancel(ctx, []);

            AssertEqual(o.ModelCalls, 1, 'The cancellation must end the prompt at the call in flight: no other candidate is tried');
            assertRecordedAsCancelled(o, 0);
        },
    },
    {
        Id: `${BUNDLE}.APC2`,
        Name: 'APC2: a real failure fails over, and a cancellation during the next candidate stops there — the failure is kept as the one failover attempt',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const o = await runAndCancel(ctx, [{ kind: 'fail', error: new Error(NETWORK_FAILURE) }]);

            AssertEqual(o.ModelCalls, 2, 'The first candidate fails over to the second, and the cancellation stops the walk there');
            assertRecordedAsCancelled(o, 1);
        },
    },
];

for (const check of AgentPromptCancellationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        await AIEngine.Instance.Config(false, ctx.User);
        const agent = AIEngine.Instance.Agents.find(a => a.Name === AGENT_NAME);
        if (!agent) {
            throw new Error(`Agent '${AGENT_NAME}' is not in this database. Seed it: mj sync push --dir=metadata-optional/integration-test`);
        }
        const llm = new TestLLM();
        cancellationFixture = { Agent: agent, Llm: llm, Restore: RegisterTestLLM(llm, [...CHAT_DRIVER_CLASSES]), RunIDs: [] };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const f = cancellationFixture;
        cancellationFixture = undefined;
        if (!f) {
            return;
        }
        // A driver class with no registration before the bundle keeps resolving to the stand-in after
        // the restore, so it must stop answering: later bundles in this process get a failure, never a script.
        f.Llm.Reset();
        f.Llm.SetDefaultOutcome({ kind: 'fail', error: new Error(`The ${BUNDLE} TestLLM is not armed: its bundle has finished`) });
        f.Restore();
        for (const runId of f.RunIDs) {
            await purgeRun(ctx, runId).catch(err => console.error(`[${BUNDLE}] cleanup of run ${runId} failed:`, err));
        }
    },
});

// ─── Teardown helpers ────────────────────────────────────────────────────────────────────────────

/** Deletes a prompt run after its children (a hierarchical prompt's child runs point at their parent). */
async function deletePromptRunTree(ctx: IntegrationCheckContext, promptRunId: string): Promise<void> {
    const children = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ParentID='${EscapeSQLString(promptRunId)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    for (const child of children.Success ? children.Results : []) {
        await deletePromptRunTree(ctx, child.ID);
    }
    await DeleteById('MJ: AI Prompt Runs', promptRunId, ctx.Provider, ctx.User);
}

/** Deletes one run and everything it wrote: its steps (a child step before its parent), their prompt runs, then the run. */
async function purgeRun(ctx: IntegrationCheckContext, runId: string): Promise<void> {
    const steps = await readSteps(ctx.Provider, ctx.User, runId);
    let remaining = [...steps];
    while (remaining.length > 0) {
        const parents = new Set(remaining.map(s => s.ParentID).filter((id): id is string => !!id));
        const leaves = remaining.filter(s => !parents.has(s.ID));
        for (const step of leaves.length > 0 ? leaves : remaining) {
            await DeleteById('MJ: AI Agent Run Steps', step.ID, ctx.Provider, ctx.User);
        }
        remaining = leaves.length > 0 ? remaining.filter(s => !leaves.includes(s)) : [];
    }
    for (const step of steps.filter(s => s.TargetLogID && PROMPT_RUN_STEP_TYPES.includes(s.StepType))) {
        await deletePromptRunTree(ctx, step.TargetLogID!);
    }
    await DeleteById('MJ: AI Agent Runs', runId, ctx.Provider, ctx.User);
}
