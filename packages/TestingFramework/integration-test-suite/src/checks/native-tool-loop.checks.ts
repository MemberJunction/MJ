/**
 * native-tool-loop.checks.ts — the 'native-tool-loop' bundle (NTL1–NTL13): the Loop agent as a
 * provider-native tool loop, end to end through AgentRunner, the prompt runner's native gate and
 * the database, with a scripted stand-in model.
 *
 * DETERMINISTIC tier — no network, no credentials. The model is {@link ITScriptedToolLLM}, served by
 * fixture AI Model / Vendor / Model Vendor rows whose catalog declares native tool calling with
 * implicit control flow and native tool results — the configuration a production model gets. Each
 * check scripts the model's turns, runs a real fixture agent, and asserts on what the framework sent
 * the model (the recorded requests: history, tools, tool choice, system prompt) and on what it
 * persisted (run status, final step, payload, run steps, prompt-run modes):
 *
 *   NTL1  a Retry on a native turn answers the call with an is_error result directly after the call
 *         turn — no "Retrying due to" user message between them (the order Anthropic and OpenAI 400 on);
 *   NTL2  the model's reasoning blocks are replayed on its call turn in the next request;
 *   NTL3  agent-local tools: write → failing edit → successful edit, each a Tool run step, the failed
 *         edit returned to the model as an error, the payload the composed document;
 *   NTL4  a text-terminal agent's final permitted turn asks for text (toolChoice 'none');
 *   NTL5  native-only mode renders a tools-only system prompt and declares the framework tools; a
 *         scratchpad write made on a tool-call turn reaches the next turn's runtime state;
 *   NTL6  an agent without NativeOnly keeps the envelope-teaching prompt and its control tools;
 *   NTL7  with relaxed turn shapes, two payload_change_request calls in one turn apply in call order;
 *   NTL8  with relaxed turn shapes, complete_task after a payload write completes in one turn;
 *   NTL9  an Action plus ask_user in one turn: by default nothing runs and every call is answered
 *         with the reason; with relaxed turn shapes the Action runs and ask_user is declined;
 *   NTL10 a failed Action's guidance rides inside its own is_error result;
 *   NTL11 a tool call the provider rejected comes back as a corrective retry naming the tools;
 *   NTL12 a tools-payload rejection retries once without tools, keeping the calls in the history as text;
 *   NTL13 older large tool-call arguments are compacted when the agent opts in.
 *
 * Self-cleaning: Setup creates the vendor, model, model-vendor row, prompts and agents (named
 * 'IT: NTL …', and removes any an interrupted earlier run left); Teardown purges every run and
 * deletes the fixtures.
 */
import { RegisterClass } from '@memberjunction/global';
import { ChatMessageRole, CHAT_FINISH_REASON_UNEXPECTED_TOOL_CALL } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner, BaseAgent, type AgentToolDefinition } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { TemplateEngineServer } from '@memberjunction/templates';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { AGENT_LIVE_SETTLE_MS, Sleep } from './agent-live-shared';
import {
    AdjacencyViolations, CreateLoopAgent, CreateModel, CreateModelVendor, CreateNativePrompt, CreateVendor, FailedTurn,
    NewFixture, RejectedCallTurn, RemoveStaleFixtures, ResetScript, ResultBlocksOf, SCRIPTED_DRIVER, ScriptState, StepsOf,
    TeardownFixture, TextOf, TextTurn, ToolCallTurn, ToolCallingModesOf,
    type NativeLoopFixture, type RecordedRequest, type ScriptedTurn
} from './native-tool-loop-shared';

const PREFIX = 'IT: NTL ';
const ACTION_AGENT = `${PREFIX}Action Agent`;
const RELAXED_AGENT = `${PREFIX}Relaxed Agent`;
const DOC_AGENT = `${PREFIX}Doc Agent`;
const FINAL_TURN_AGENT = `${PREFIX}Final Turn Agent`;
const DOC_AGENT_DRIVER = 'ITNtlDocAgent';
const ACTION_NAME = 'Calculate Expression';
const ACTION_TOOL = 'calculate_expression';

// ─── The doc agent: state lives in the payload, written by its own tools ───────

type DocPayload = { doc?: string };

const DOC_TOOLS: AgentToolDefinition<DocPayload>[] = [
    {
        Name: 'write_doc',
        Description: 'Call this to write the whole document.',
        InputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
        Execute: async (args) => ({ Content: 'Document written.', IsError: false, PayloadChange: { newElements: { doc: String(args.content) } } })
    },
    {
        Name: 'edit_doc',
        Description: 'Call this to replace one exact passage of the document.',
        InputSchema: { type: 'object', properties: { old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['old_string', 'new_string'] },
        Execute: async (args, context) => {
            const doc = context.CurrentPayload.doc ?? '';
            const oldString = String(args.old_string);
            if (!doc.includes(oldString)) return { Content: `old_string not found: '${oldString}'`, IsError: true };
            return { Content: 'Edit applied.', IsError: false, PayloadChange: { updateElements: { doc: doc.replace(oldString, () => String(args.new_string)) } } };
        }
    }
];

@RegisterClass(BaseAgent, DOC_AGENT_DRIVER)
export class ITNtlDocAgent extends BaseAgent {
    protected override GetAgentTools(_params: ExecuteAgentParams): AgentToolDefinition[] {
        return DOC_TOOLS as AgentToolDefinition[];
    }
}

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
    const docPrompt = await CreateNativePrompt(ctx, f, `${DOC_AGENT} - Prompt`, INSTRUCTIONS);
    const docControl = { NativeControl: { Terminal: 'text', PayloadChangeTool: false, NativeOnly: true, CompactToolArguments: true } };
    await CreateLoopAgent(ctx, f, { Name: ACTION_AGENT, PromptID: actionPrompt, ActionNames: [ACTION_NAME] });
    await CreateLoopAgent(ctx, f, { Name: RELAXED_AGENT, PromptID: actionPrompt, ActionNames: [ACTION_NAME], TypeConfiguration: { NativeControl: { RelaxedTurnShapes: true } } });
    await CreateLoopAgent(ctx, f, { Name: DOC_AGENT, PromptID: docPrompt, DriverClass: DOC_AGENT_DRIVER, TypeConfiguration: docControl });
    await CreateLoopAgent(ctx, f, { Name: FINAL_TURN_AGENT, PromptID: docPrompt, DriverClass: DOC_AGENT_DRIVER, TypeConfiguration: docControl, MaxIterationsPerRun: 2 });
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
    FinalStep: string | null;
    ErrorMessage: string | null;
    Payload: Record<string, unknown>;
    Requests: RecordedRequest[];
}

/** Runs a fixture agent against the scripted model and returns what happened. */
async function run(ctx: IntegrationCheckContext, agentName: string, request: string, turns: ScriptedTurn[]): Promise<Outcome> {
    const agent = AIEngine.Instance.Agents.find((a) => a.Name === agentName);
    Assert(!!agent, `fixture agent '${agentName}' is loaded in AIEngine`);
    ResetScript(turns);
    const result = await new AgentRunner().RunAgent({
        agent: agent!,
        conversationMessages: [{ role: ChatMessageRole.user, content: request }],
        contextUser: ctx.User,
        override: { modelId: fx().ModelID, vendorId: fx().VendorID }
    });
    const runID = result.agentRun?.ID;
    Assert(!!runID, `${agentName}: the run was recorded`);
    fx().RunIds.push(runID!);
    await Sleep(AGENT_LIVE_SETTLE_MS);
    return {
        RunID: runID!,
        Status: result.agentRun?.Status ?? 'Unknown',
        FinalStep: result.agentRun?.FinalStep ?? null,
        ErrorMessage: result.agentRun?.ErrorMessage ?? null,
        Payload: (result.payload ?? {}) as Record<string, unknown>,
        Requests: [...ScriptState.Requests]
    };
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

const systemPrompt = (req: RecordedRequest): string => TextOf(req.Messages.find((m) => m.role === ChatMessageRole.system));

// ─── Checks ────────────────────────────────────────────────────────────────────

export const NativeToolLoopChecks: NamedCheck[] = [
    {
        Id: 'native-tool-loop.NTL1',
        Name: 'NTL1: a Retry on a native turn answers the call with an is_error result directly after the call turn, with no retry message between them',
        Fn: async (ctx) => {
            const o = await run(ctx, ACTION_AGENT, 'Compute 6 times 7.', [ToolCallTurn([{ name: 'it_not_a_tool' }]), TextTurn('Done.')]);
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
            const o = await run(ctx, ACTION_AGENT, 'Compute 6 times 7.', [
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
        Name: 'NTL3: agent-local tools — write, a failing edit, a successful edit — compose the payload, each a Tool step, the failure returned as an error',
        Fn: async (ctx) => {
            const o = await run(ctx, DOC_AGENT, 'Write the report, then fix it.', [
                ToolCallTurn([{ name: 'write_doc', args: { content: '# Report\nHello world' } }]),
                ToolCallTurn([{ name: 'edit_doc', args: { old_string: 'Goodbye', new_string: 'Hi' } }]),
                ToolCallTurn([{ name: 'edit_doc', args: { old_string: 'Hello', new_string: 'Hi' } }]),
                TextTurn('The report is written and fixed.')
            ]);
            assertCompleted(o, 'NTL3');
            AssertEqual(o.Payload.doc, '# Report\nHi world', 'NTL3: the payload is the composed document');
            const tools = (await StepsOf(ctx, o.RunID)).filter((s) => s.StepType === 'Tool');
            AssertEqual(JSON.stringify(tools.map((s) => [s.StepName, s.Success])),
                JSON.stringify([['Agent Tool: write_doc', true], ['Agent Tool: edit_doc', false], ['Agent Tool: edit_doc', true]]), 'NTL3: one Tool step per call');
            const afterFailure = request(o, 2, 'NTL3');
            assertValidHistory(afterFailure, 'NTL3');
            const failed = answersTo(afterFailure, 'edit_doc');
            Assert(failed.length === 1 && failed[0].isError === true && (failed[0].content ?? '').includes('Goodbye'), `NTL3: the failed edit reaches the model as an error, got ${JSON.stringify(failed)}`);
            const declared = request(o, 0, 'NTL3').Tools;
            Assert(declared.includes('write_doc') && declared.includes('edit_doc'), `NTL3: the agent's tools are declared, got [${declared.join(', ')}]`);
            Assert(!declared.includes('payload_change_request') && !declared.includes('complete_task'), `NTL3: payload_change_request and complete_task are not declared, got [${declared.join(', ')}]`);
        }
    },
    {
        Id: 'native-tool-loop.NTL4',
        Name: "NTL4: a text-terminal agent's final permitted turn asks for a text answer (toolChoice 'none')",
        Fn: async (ctx) => {
            const o = await run(ctx, FINAL_TURN_AGENT, 'Write a one-line note.', [ToolCallTurn([{ name: 'write_doc', args: { content: 'Note.' } }]), TextTurn('Written.')]);
            assertCompleted(o, 'NTL4');
            AssertEqual(request(o, 0, 'NTL4').ToolChoice, 'auto', 'NTL4: an ordinary turn offers tools');
            AssertEqual(request(o, 1, 'NTL4').ToolChoice, 'none', 'NTL4: the last permitted turn asks for text');
        }
    },
    {
        Id: 'native-tool-loop.NTL5',
        Name: 'NTL5: native-only mode renders a tools-only system prompt, declares the framework tools, and applies a scratchpad write made beside another call',
        Fn: async (ctx) => {
            const o = await run(ctx, DOC_AGENT, 'Note your plan, then write the report.', [
                ToolCallTurn([{ name: 'scratchpad_write', args: { notes: 'IT-NTL plan: one section.' } }, { name: 'write_doc', args: { content: 'One section.' } }]),
                TextTurn('Done.')
            ]);
            assertCompleted(o, 'NTL5');
            const first = request(o, 0, 'NTL5');
            const prompt = systemPrompt(first);
            Assert(prompt.includes('# How You Act'), 'NTL5: the tools-only prompt rendered');
            for (const envelope of ['LoopAgentResponse', 'nextStep', 'taskComplete']) {
                Assert(!prompt.includes(envelope), `NTL5: the tools-only prompt teaches no envelope, found '${envelope}'`);
            }
            Assert(first.Tools.includes('scratchpad_write'), `NTL5: scratchpad_write is declared, got [${first.Tools.join(', ')}]`);
            AssertEqual(first.ParallelToolCalls, undefined, 'NTL5: no parallel-calls flag is sent; each provider keeps its own default');
            const next = request(o, 1, 'NTL5');
            assertValidHistory(next, 'NTL5');
            Assert(answersTo(next, 'scratchpad_write').every((b) => b.isError === false), 'NTL5: the scratchpad call succeeded');
            Assert(TextOf(next.Messages[next.Messages.length - 1]).includes('IT-NTL plan: one section.'), 'NTL5: the note is in the next turn\'s runtime state');
            AssertEqual(o.Payload.doc, 'One section.', 'NTL5: the write beside it applied too');
        }
    },
    {
        Id: 'native-tool-loop.NTL6',
        Name: 'NTL6: an agent without NativeOnly keeps the envelope-teaching prompt and the default control tools',
        Fn: async (ctx) => {
            const o = await run(ctx, ACTION_AGENT, 'Say hello.', [TextTurn('Hello.')]);
            assertCompleted(o, 'NTL6');
            const first = request(o, 0, 'NTL6');
            Assert(systemPrompt(first).includes('LoopAgentResponse'), 'NTL6: the hybrid prompt still renders');
            for (const tool of [ACTION_TOOL, 'payload_change_request', 'ask_user', 'complete_task']) {
                Assert(first.Tools.includes(tool), `NTL6: '${tool}' is declared, got [${first.Tools.join(', ')}]`);
            }
            Assert(!first.Tools.includes('scratchpad_write'), 'NTL6: no framework tools without NativeOnly');
        }
    },
    {
        Id: 'native-tool-loop.NTL7',
        Name: 'NTL7: with relaxed turn shapes, two payload_change_request calls in one turn apply in call order, each answered',
        Fn: async (ctx) => {
            const o = await run(ctx, RELAXED_AGENT, 'Record the count.', [
                ToolCallTurn([{ name: 'payload_change_request', args: { newElements: { count: 1 } } }, { name: 'payload_change_request', args: { updateElements: { count: 2 } } }]),
                TextTurn('Recorded.')
            ]);
            assertCompleted(o, 'NTL7');
            AssertEqual(o.Payload.count, 2, 'NTL7: the second write applied after the first');
            const next = request(o, 1, 'NTL7');
            assertValidHistory(next, 'NTL7');
            const answers = answersTo(next, 'payload_change_request');
            Assert(answers.length === 2 && answers.every((b) => b.isError === false), `NTL7: both calls answered as applied, got ${JSON.stringify(answers)}`);
        }
    },
    {
        Id: 'native-tool-loop.NTL8',
        Name: 'NTL8: with relaxed turn shapes, complete_task after a payload write completes in that turn, with the write applied',
        Fn: async (ctx) => {
            const o = await run(ctx, RELAXED_AGENT, 'Record the status and finish.', [
                ToolCallTurn([{ name: 'payload_change_request', args: { newElements: { status: 'ready' } } }, { name: 'complete_task', args: { message: 'All done.' } }])
            ]);
            assertCompleted(o, 'NTL8');
            AssertEqual(o.Requests.length, 1, 'NTL8: one model turn');
            AssertEqual(o.FinalStep, 'Success', 'NTL8: the run ended on Success');
            AssertEqual(o.Payload.status, 'ready', 'NTL8: the write applied');
        }
    },
    {
        Id: 'native-tool-loop.NTL9',
        Name: 'NTL9: an Action and ask_user in one turn — strict by default, the Action alone under relaxed turn shapes',
        Fn: async (ctx) => {
            const mixed = () => ToolCallTurn([{ name: ACTION_TOOL, args: { Expression: '6*7' } }, { name: 'ask_user', args: { message: 'Which region should I use?' } }]);

            const strict = await run(ctx, ACTION_AGENT, 'Compute 6 times 7, then ask me something.', [mixed(), TextTurn('42.')]);
            assertCompleted(strict, 'NTL9 strict');
            Assert(!(await StepsOf(ctx, strict.RunID)).some((s) => s.StepType === 'Actions'), 'NTL9 strict: nothing ran');
            const strictNext = request(strict, 1, 'NTL9 strict');
            assertValidHistory(strictNext, 'NTL9 strict');
            const refused = answersTo(strictNext, 'ask_user');
            Assert(refused.length === 1 && refused[0].isError === true && (refused[0].content ?? '').includes('must be the only call'),
                `NTL9 strict: ask_user answered with the rule, got ${JSON.stringify(refused)}`);

            const relaxed = await run(ctx, RELAXED_AGENT, 'Compute 6 times 7, then ask me something.', [mixed(), TextTurn('42.')]);
            assertCompleted(relaxed, 'NTL9 relaxed');
            Assert((await StepsOf(ctx, relaxed.RunID)).some((s) => s.StepType === 'Actions' && s.Success === true), 'NTL9 relaxed: the Action ran');
            const relaxedNext = request(relaxed, 1, 'NTL9 relaxed');
            assertValidHistory(relaxedNext, 'NTL9 relaxed');
            Assert(answersTo(relaxedNext, ACTION_TOOL).every((b) => b.isError === false), 'NTL9 relaxed: the Action answered with its result');
            Assert(answersTo(relaxedNext, 'ask_user').every((b) => b.isError === true), 'NTL9 relaxed: ask_user answered as not run');
        }
    },
    {
        Id: 'native-tool-loop.NTL10',
        Name: "NTL10: a failed Action's guidance rides inside its own is_error result, not a separate message",
        Fn: async (ctx) => {
            const o = await run(ctx, ACTION_AGENT, 'Evaluate this.', [ToolCallTurn([{ name: ACTION_TOOL, args: { Expression: 'process.exit(0)' } }]), TextTurn('It failed.')]);
            assertCompleted(o, 'NTL10');
            const next = request(o, 1, 'NTL10');
            const answer = answersTo(next, ACTION_TOOL);
            Assert(answer.length === 1 && answer[0].isError === true, `NTL10: the failure is an error result, got ${JSON.stringify(answer)}`);
            Assert((answer[0].content ?? '').includes(`Action '${ACTION_NAME}'`), 'NTL10: the guidance is inside the result');
            Assert(!next.Messages.some((m) => TextOf(m).includes('Action Execution Failure Guidance')), 'NTL10: no separate guidance message');
        }
    },
    {
        Id: 'native-tool-loop.NTL11',
        Name: 'NTL11: a tool call the provider rejected becomes a corrective retry naming the available tools and what the provider received',
        Fn: async (ctx) => {
            const o = await run(ctx, ACTION_AGENT, 'Compute 6 times 7.', [
                RejectedCallTurn(CHAT_FINISH_REASON_UNEXPECTED_TOOL_CALL, 'Unexpected tool call: delete_everything'), TextTurn('Done.')
            ]);
            assertCompleted(o, 'NTL11');
            const retry = request(o, 1, 'NTL11').Messages.map(TextOf).find((t) => t.includes('not available on this turn'));
            Assert(!!retry, 'NTL11: the retry says the tool was not available');
            Assert(retry!.includes(ACTION_TOOL) && retry!.includes('delete_everything'), `NTL11: it names the tools and what was received, got ${retry}`);
        }
    },
    {
        Id: 'native-tool-loop.NTL12',
        Name: 'NTL12: a tools-payload rejection retries once without tools, with the earlier call kept in the history as text',
        Fn: async (ctx) => {
            const o = await run(ctx, ACTION_AGENT, 'Compute 6 times 7.', [
                ToolCallTurn([{ name: ACTION_TOOL, args: { Expression: '6*7' } }]),
                FailedTurn('tools.0.input_schema: invalid JSON Schema', 'InvalidRequest'),
                TextTurn('{"taskComplete": true, "message": "It is 42."}')
            ]);
            assertCompleted(o, 'NTL12');
            const retry = request(o, 2, 'NTL12');
            AssertEqual(retry.Tools.length, 0, 'NTL12: the retry sends no tools');
            Assert(retry.Messages.some((m) => m.role === ChatMessageRole.assistant && TextOf(m).includes(`[Called ${ACTION_TOOL}(`)), 'NTL12: the call survives as text');
            Assert(!retry.Messages.some((m) => m.role === ChatMessageRole.tool || !!m.toolCalls?.length), 'NTL12: no native turns remain');
            const modes = await ToolCallingModesOf(ctx, o.RunID);
            Assert(modes.includes('NativeFallback'), `NTL12: the prompt run records the fallback, got [${modes.join(', ')}]`);
        }
    },
    {
        Id: 'native-tool-loop.NTL13',
        Name: 'NTL13: with CompactToolArguments, older large tool-call arguments are stubbed and the two most recent call turns kept whole',
        Fn: async (ctx) => {
            const big = (n: number) => `Section ${n}. ${'x'.repeat(2500)}`;
            const o = await run(ctx, DOC_AGENT, 'Write three drafts.', [
                ToolCallTurn([{ name: 'write_doc', args: { content: big(1) } }]),
                ToolCallTurn([{ name: 'write_doc', args: { content: big(2) } }]),
                ToolCallTurn([{ name: 'write_doc', args: { content: big(3) } }]),
                TextTurn('Done.')
            ]);
            assertCompleted(o, 'NTL13');
            const last = request(o, 3, 'NTL13');
            assertValidHistory(last, 'NTL13');
            const calls = last.Messages.filter((m) => m.role === ChatMessageRole.assistant && m.toolCalls?.length).map((m) => String(m.toolCalls![0].arguments.content));
            AssertEqual(calls.length, 3, 'NTL13: three call turns in the history');
            Assert(calls[0].startsWith('[content omitted:'), `NTL13: the oldest argument is stubbed, got ${calls[0].slice(0, 60)}`);
            Assert(calls[1] === big(2) && calls[2] === big(3), 'NTL13: the two most recent are whole');
        }
    }
];

for (const check of NativeToolLoopChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('native-tool-loop', { Setup: setup, Teardown: teardown });

