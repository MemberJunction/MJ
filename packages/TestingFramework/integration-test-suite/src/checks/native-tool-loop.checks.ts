/**
 * native-tool-loop.checks.ts — the Loop agent as a provider-native tool loop, against a scripted
 * model (bundle `native-tool-loop`, IT130). The 6.1 line carries the history-ordering, thinking and
 * tool-calling-mode fixes; these checks cover those three.
 *
 * The model is a stand-in driver that plays back a script of turns and records every request it
 * receives, so each check asserts on exactly what the loop sent the model and on what it persisted:
 *
 *   NTL1  a Retry on a native turn answers the call with an is_error result directly after the call
 *         turn — no "Retrying due to" user message between them (the order Anthropic and OpenAI 400 on);
 *   NTL2  the model's reasoning blocks are replayed on its call turn in the next request;
 *   NTL3  every prompt run of a native run records its tool-calling path (it was persisted as NULL
 *         when the model call returned before the run's INSERT);
 *   NTL4  a tools-payload rejection retries once without tools, keeping the calls in the history as text.
 *
 * Self-cleaning: Setup creates the vendor, model, model-vendor row, prompt and agent (named
 * 'IT: NTL …', and removes any an interrupted earlier run left); Teardown purges every run and
 * deletes the fixtures.
 */
import { ChatMessageRole } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { TemplateEngineServer } from '@memberjunction/templates';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { AGENT_LIVE_SETTLE_MS, sleep } from './agent-live-shared';
import {
    AdjacencyViolations, CreateLoopAgent, CreateModel, CreateModelVendor, CreateNativePrompt, CreateVendor, FailedTurn,
    NewFixture, RemoveStaleFixtures, ResetScript, ResultBlocksOf, SCRIPTED_DRIVER, ScriptState,
    TeardownFixture, TextOf, TextTurn, ToolCallTurn, ToolCallingModesOf,
    type NativeLoopFixture, type RecordedRequest, type ScriptedTurn
} from './native-tool-loop-shared';

const PREFIX = 'IT: NTL ';
const ACTION_AGENT = `${PREFIX}Action Agent`;
const ACTION_NAME = 'Calculate Expression';
const ACTION_TOOL = 'calculate_expression';

// ─── Fixture ───────────────────────────────────────────────────────────────────

interface NtlFixture extends NativeLoopFixture {
    ModelID: string;
    VendorID: string;
}

let fixture: NtlFixture | undefined;

function fx(): NtlFixture {
    if (!fixture) throw new Error('native-tool-loop fixture not initialized — the bundle lifecycle Setup must run first.');
    return fixture;
}

const INSTRUCTIONS = '# Native Tool Loop Fixture\n\nDo what the user asks using your tools, then answer in one sentence.';

async function setup(ctx: IntegrationCheckContext): Promise<void> {
    await RemoveStaleFixtures(ctx, PREFIX);
    const f: NtlFixture = { ...NewFixture(), ModelID: '', VendorID: '' };
    fixture = f;
    // The prompt runner only calls a model it holds a credential for; the stand-in needs none.
    process.env[`AI_VENDOR_API_KEY__${SCRIPTED_DRIVER.toUpperCase()}`] ??= 'scripted';
    f.VendorID = await CreateVendor(ctx, f, `${PREFIX}Scripted Vendor`);
    f.ModelID = await CreateModel(ctx, f, `${PREFIX}Scripted Model`, {
        LLM: { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true, NativeControlFlow: 'implicit', NativeToolResults: true }
    });
    await CreateModelVendor(ctx, f, { ModelID: f.ModelID, VendorID: f.VendorID, DriverClass: SCRIPTED_DRIVER, APIName: 'it-ntl-scripted' });
    const actionPrompt = await CreateNativePrompt(ctx, f, `${ACTION_AGENT} - Prompt`, INSTRUCTIONS);
    await CreateLoopAgent(ctx, f, { Name: ACTION_AGENT, PromptID: actionPrompt, ActionNames: [ACTION_NAME] });
    // The prompt runner renders through the template engine's cache, which holds the new templates
    // only after a refresh; the agent and model catalogs likewise.
    await TemplateEngineServer.Instance.Config(true, ctx.User, ctx.Provider);
    await AIEngine.Instance.Config(true, ctx.User);
}

async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    await TeardownFixture(ctx, fixture);
    await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    fixture = undefined;
}

// ─── Running ───────────────────────────────────────────────────────────────────

interface Outcome {
    RunID: string;
    Status: string;
    ErrorMessage: string | null;
    Requests: RecordedRequest[];
}

/** Runs the fixture agent against the scripted model and returns what happened. */
async function run(ctx: IntegrationCheckContext, request: string, turns: ScriptedTurn[]): Promise<Outcome> {
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === ACTION_AGENT);
    Assert(!!agent, `fixture agent '${ACTION_AGENT}' is loaded in AIEngine`);
    ResetScript(turns);
    const result = await new AgentRunner().RunAgent({
        agent: agent!,
        conversationMessages: [{ role: ChatMessageRole.user, content: request }],
        contextUser: ctx.User,
        override: { modelId: fx().ModelID, vendorId: fx().VendorID }
    });
    const runID = result.agentRun?.ID;
    Assert(!!runID, `${ACTION_AGENT}: the run was recorded`);
    fx().RunIds.push(runID!);
    await sleep(AGENT_LIVE_SETTLE_MS);
    return { RunID: runID!, Status: result.agentRun?.Status ?? 'Unknown', ErrorMessage: result.agentRun?.ErrorMessage ?? null, Requests: [...ScriptState.Requests] };
}

function assertCompleted(o: Outcome, what: string): void {
    AssertEqual(o.Status, 'Completed', `${what}: run status (error: ${o.ErrorMessage ?? 'none'})`);
}

function request(o: Outcome, index: number, what: string): RecordedRequest {
    Assert(o.Requests.length > index, `${what}: expected at least ${index + 1} model requests, got ${o.Requests.length}`);
    return o.Requests[index];
}

/** The tool_result blocks answering a call, from every tool turn in a request's history. */
function answersTo(req: RecordedRequest, toolName: string): ReturnType<typeof ResultBlocksOf> {
    return req.Messages.filter((m) => m.role === ChatMessageRole.tool).flatMap(ResultBlocksOf).filter((b) => b.toolName === toolName);
}

function assertValidHistory(req: RecordedRequest, what: string): void {
    const problems = AdjacencyViolations(req.Messages);
    Assert(problems.length === 0, `${what}: history breaks the provider contract:\n    ${problems.join('\n    ')}`);
}

// ─── Checks ────────────────────────────────────────────────────────────────────

export const NativeToolLoopChecks: NamedCheck[] = [
    {
        Id: 'native-tool-loop.NTL1',
        Name: 'NTL1: a Retry on a native turn answers the call with an is_error result directly after the call turn, with no retry message between them',
        Fn: async (ctx) => {
            const o = await run(ctx, 'Compute 6 times 7.', [ToolCallTurn([{ name: 'it_not_a_tool' }]), TextTurn('Done.')]);
            assertCompleted(o, 'NTL1');
            const next = request(o, 1, 'NTL1');
            assertValidHistory(next, 'NTL1');
            const answer = answersTo(next, 'it_not_a_tool');
            AssertEqual(answer.length, 1, 'NTL1: the undeclared call is answered once');
            Assert(answer[0].isError === true && (answer[0].content ?? '').startsWith('Not executed.'), `NTL1: answered as not executed, got ${JSON.stringify(answer[0])}`);
            Assert((answer[0].content ?? '').includes('not a tool'), 'NTL1: the answer carries the retry reason');
            Assert(!next.Messages.some((m) => TextOf(m).includes('Retrying due to')), 'NTL1: no "Retrying due to" user message is sent');
        }
    },
    {
        Id: 'native-tool-loop.NTL2',
        Name: "NTL2: the model's reasoning blocks are replayed on its call turn in the next request",
        Fn: async (ctx) => {
            const reasoning = [{ provider: 'anthropic', kind: 'thinking' as const, text: 'Multiply them.', signature: 'it-signature-1' }];
            const o = await run(ctx, 'Compute 6 times 7.', [
                ToolCallTurn([{ name: ACTION_TOOL, args: { Expression: '6*7' } }], { reasoning }), TextTurn('It is 42.')
            ]);
            assertCompleted(o, 'NTL2');
            const next = request(o, 1, 'NTL2');
            assertValidHistory(next, 'NTL2');
            const callTurn = next.Messages.find((m) => m.role === ChatMessageRole.assistant && m.toolCalls?.some((c) => c.name === ACTION_TOOL));
            AssertEqual(JSON.stringify(callTurn?.reasoning ?? null), JSON.stringify(reasoning), 'NTL2: reasoning replayed unchanged');
            const answer = answersTo(next, ACTION_TOOL);
            Assert(answer.length === 1 && answer[0].isError === false && (answer[0].content ?? '').includes('42'), `NTL2: the Action's result answers the call, got ${JSON.stringify(answer)}`);
        }
    },
    {
        Id: 'native-tool-loop.NTL3',
        Name: 'NTL3: every prompt run of a native run records its tool-calling path',
        Fn: async (ctx) => {
            const o = await run(ctx, 'Compute 6 times 7.', [ToolCallTurn([{ name: ACTION_TOOL, args: { Expression: '6*7' } }]), TextTurn('It is 42.')]);
            assertCompleted(o, 'NTL3');
            const modes = await ToolCallingModesOf(ctx, o.RunID);
            AssertEqual(modes.length, 2, `NTL3: two prompt runs, got [${modes.join(', ')}]`);
            Assert(modes.every((m) => m === 'NativeImplicit'), `NTL3: each records NativeImplicit, got [${modes.join(', ')}]`);
        }
    },
    {
        Id: 'native-tool-loop.NTL4',
        Name: 'NTL4: a tools-payload rejection retries once without tools, with the earlier call kept in the history as text',
        Fn: async (ctx) => {
            const o = await run(ctx, 'Compute 6 times 7.', [
                ToolCallTurn([{ name: ACTION_TOOL, args: { Expression: '6*7' } }]),
                FailedTurn('tools.0.input_schema: invalid JSON Schema', 'InvalidRequest'),
                TextTurn('{"taskComplete": true, "message": "It is 42."}')
            ]);
            assertCompleted(o, 'NTL4');
            const retry = request(o, 2, 'NTL4');
            AssertEqual(retry.Tools.length, 0, 'NTL4: the retry sends no tools');
            Assert(!retry.Messages.some((m) => m.role === ChatMessageRole.tool || !!m.toolCalls?.length), 'NTL4: no native turns remain');
            const modes = await ToolCallingModesOf(ctx, o.RunID);
            Assert(modes.includes('NativeFallback'), `NTL4: the prompt run records the fallback, got [${modes.join(', ')}]`);
        }
    }
];

for (const check of NativeToolLoopChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('native-tool-loop', { Setup: setup, Teardown: teardown });
