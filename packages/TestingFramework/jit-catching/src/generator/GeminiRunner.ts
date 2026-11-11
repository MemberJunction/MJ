import { z } from 'zod';
import type { BaseLLM, ChatMessage, ChatMessageContentBlock, ChatTool, ChatToolCall } from '@memberjunction/ai';
import type { TokenUsage } from '../types';
import { CreateLLM } from '../judges/ProviderFactory';
import { SafeChat } from '../judges/SafeChat';
import { AddUsage, NoUsage, SessionError, UsageFromChat } from './UsageCounter';
import { Glob, Grep, READ_TOOLS, ReadFile, type ReadToolResult } from './ReadTools';
import { RunTestShape, WriteTestShape } from './ToolShapes';
import type { AgentHooks, AgentMessage, AgentRunner, AgentRunOptions } from './ClaudeAgentGenerator';

const MAX_OUTPUT_TOKENS = 8192;
const MAX_TOOL_RESULT_CHARS = 20_000;
const TRUNCATED_TAIL = '… [truncated]';

const WRITE_TEST: ChatTool = { name: 'write_test', description: 'Write the full source of one of the listed test files.',
    inputSchema: { type: 'object', properties: {
        File: { type: 'string', description: 'Repo-relative path of the test file.' },
        Source: { type: 'string', description: 'The full file source.' },
    }, required: ['File', 'Source'] } };
const RUN_TEST: ChatTool = { name: 'run_test', description: 'Run one generated vitest file on base, or on base plus a mutant. Returns Status Pass/Fail/Timeout and the failure detail.',
    inputSchema: { type: 'object', properties: {
        File: { type: 'string', description: 'Repo-relative path of the test file.' },
        Mutant: { type: 'object', description: 'Edits applied to the base source for this run only.', properties: {
            Edits: { type: 'array', items: { type: 'object', properties: {
                File: { type: 'string', description: 'Repo-relative path of the source file to edit.' },
                Find: { type: 'string', description: 'Exact text to replace.' },
                Replace: { type: 'string', description: 'Replacement text.' },
            }, required: ['File', 'Find', 'Replace'] } },
        }, required: ['Edits'] },
    }, required: ['File'] } };
const TOOLS: ChatTool[] = [...READ_TOOLS, WRITE_TEST, RUN_TEST];

const ReadFileArgs = z.object({ path: z.string(), offset: z.number().int().optional(), limit: z.number().int().optional() });
const GrepArgs = z.object({ pattern: z.string(), path: z.string().optional(), glob: z.string().optional() });
const GlobArgs = z.object({ pattern: z.string(), path: z.string().optional() });

/** A tool failure the model sees as an error result; the session goes on. */
class ToolRefusal extends Error {}

/** A runner on `llm` (or on the LLM `llm()` creates at the first call). */
export function GeminiRunnerWith(llm: BaseLLM | (() => BaseLLM)): AgentRunner {
    let made: BaseLLM | null = null;
    const get = (): BaseLLM => (made ??= typeof llm === 'function' ? llm() : llm);
    return (prompt, system, o) => runSession(get, prompt, system, o);
}

/** The real runner: GeminiLLM from GEMINI_API_KEY through judges/ProviderFactory.ts `CreateLLM('Gemini')`. */
export const GeminiRunner: AgentRunner = GeminiRunnerWith(() => CreateLLM('Gemini'));

/**
 * One tool loop: each turn is one ChatCompletion; the reply's tool calls run in order and their results go back as one
 * tool message. Ends with a `result` message when a reply has no tool calls or a turn, token or USD limit is reached.
 * A provider failure or a thrown hook throws a `SessionError` carrying the usage so far.
 */
async function* runSession(llm: () => BaseLLM, prompt: string, system: string, o: AgentRunOptions): AsyncIterable<AgentMessage> {
    let usage: TokenUsage = NoUsage(o.Model);
    let model: BaseLLM;
    try { model = llm(); } catch (e) { throw new SessionError(errorText(e), usage); }
    const history: ChatMessage[] = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    let turns = 0;
    const result = (subtype: string): AgentMessage => ({ Type: 'result', Usage: { InputTokens: usage.InputTokens, OutputTokens: usage.OutputTokens, CacheReadTokens: usage.CacheReadTokens }, CostUSD: usage.CostUSD, Turns: turns, Subtype: subtype });
    for (;;) {
        const stop = limitReached(usage, turns, o);
        if (stop) { yield result(stop); return; }
        const r = await SafeChat(model, { model: o.Model, messages: [...history], tools: TOOLS, toolChoice: 'auto', maxOutputTokens: MAX_OUTPUT_TOKENS, enableCaching: true });
        if (!r.Ok) throw new SessionError(r.Error, usage);
        turns++;
        usage = AddUsage(usage, UsageFromChat(o.Model, r.Result.data.usage, o.Price));
        const msg = r.Result.data.choices[0]?.message;
        const content = msg?.content ?? ''; const toolCalls = msg?.toolCalls;
        yield { Type: 'assistant', Text: JSON.stringify({ content, toolCalls }).slice(0, 500) };
        history.push({ role: 'assistant', content, toolCalls, reasoning: msg?.reasoning });
        if (!toolCalls || toolCalls.length === 0) { yield result('success'); return; }
        const blocks: ChatMessageContentBlock[] = [];
        for (const call of toolCalls) {
            let out: ReadToolResult;
            try { out = await runTool(call, o); } catch (e) { throw new SessionError(errorText(e), usage); }
            const text = out.Text.length > MAX_TOOL_RESULT_CHARS ? out.Text.slice(0, MAX_TOOL_RESULT_CHARS - TRUNCATED_TAIL.length) + TRUNCATED_TAIL : out.Text;
            blocks.push({ type: 'tool_result', toolCallId: call.id, toolName: call.name, content: text, ...(out.IsError ? { isError: true } : {}) });
            yield { Type: 'tool', Name: call.name, Input: call.arguments, Output: text };
        }
        history.push({ role: 'tool', content: blocks });
    }
}

/** The end reason when a limit stops the session before the next call, or null. */
function limitReached(usage: TokenUsage, turns: number, o: AgentRunOptions): string | null {
    if (turns >= o.MaxTurns) return 'error_max_turns';
    if (usage.InputTokens + usage.OutputTokens + usage.CacheReadTokens > o.TokenBudget) return 'aborted_token_budget';
    if (usage.CostUSD > o.BudgetUsd) return 'error_max_budget_usd';
    return null;
}

/** Runs one tool call. Bad arguments, unknown tools and read failures come back as error results; a hook that throws throws. */
async function runTool(call: ChatToolCall, o: AgentRunOptions): Promise<ReadToolResult> {
    try {
        switch (call.name) {
            case 'read_file': return ReadFile(o.Cwd, parse(ReadFileArgs, call.arguments));
            case 'grep': return Grep(o.Cwd, parse(GrepArgs, call.arguments));
            case 'glob': return Glob(o.Cwd, parse(GlobArgs, call.arguments));
            case 'write_test': return await writeTest(o.Hooks, parse(z.object(WriteTestShape), call.arguments));
            case 'run_test': return await runTest(o.Hooks, parse(z.object(RunTestShape), call.arguments));
            default: return { Text: `unknown tool ${call.name}`, IsError: true };
        }
    } catch (e) {
        if (e instanceof ToolRefusal || !isHook(call.name)) return { Text: `error: ${errorText(e)}`, IsError: true };
        throw e;
    }
}

function isHook(name: string): boolean { return name === 'write_test' || name === 'run_test'; }

async function writeTest(hooks: AgentHooks, input: { File: string; Source: string }): Promise<ReadToolResult> {
    const text = await hooks.WriteFile(input.File, input.Source);
    return { Text: text, IsError: text.startsWith('denied:') };
}

async function runTest(hooks: AgentHooks, input: z.infer<z.ZodObject<typeof RunTestShape>>): Promise<ReadToolResult> {
    return { Text: JSON.stringify(await hooks.RunTest(input.File, input.Mutant)), IsError: false };
}

/** The arguments parsed by `schema`; throws a `ToolRefusal` naming the problem when they do not fit. */
function parse<T>(schema: z.ZodType<T>, args: Record<string, unknown>): T {
    const r = schema.safeParse(args);
    if (!r.success) throw new ToolRefusal(`invalid arguments: ${r.error.message}`);
    return r.data;
}

function errorText(e: unknown): string { return e instanceof Error ? e.message : String(e); }
