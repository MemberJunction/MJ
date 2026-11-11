import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelUsage, type ChatMessage, type ChatMessageContentBlock, type ChatToolCall } from '@memberjunction/ai';
import { TestLLM, MakeSuccessChatResult, type TestLLMOutcome } from '@memberjunction/unit-testing';
import { GeminiRunnerWith } from '../generator/GeminiRunner';
import { SessionError } from '../generator/UsageCounter';
import type { AgentHooks, AgentMessage, AgentRunOptions } from '../generator/ClaudeAgentGenerator';

const PRICE = { Input: 1, Output: 2, CachedInput: 0.1 };
const DENIED = 'denied: reads stay inside the base worktree';

/** A successful reply with `toolCalls` that used `prompt` input and `completion` output tokens. `failResult` is the only TestLLM outcome kind that carries `toolCalls`. */
function reply(content: string, toolCalls?: ChatToolCall[], prompt = 100, completion = 10): TestLLMOutcome {
  const result = MakeSuccessChatResult(content, { usage: new ModelUsage(prompt, completion) });
  result.data.choices[0].message.toolCalls = toolCalls;
  return { kind: 'failResult', result };
}
const call = (id: string, name: string, args: Record<string, unknown>): ChatToolCall => ({ id, name, arguments: args });

function options(cwd: string, hooks: Partial<AgentHooks> = {}, limits: Partial<AgentRunOptions> = {}): AgentRunOptions {
  return { Cwd: cwd, Model: 'gemini-3.8-flash', MaxTurns: 10, TokenBudget: 1_000_000, BudgetUsd: 10, Price: PRICE,
    Hooks: { WriteFile: async () => 'ok', RunTest: async () => ({ Ran: true, Status: 'Pass', TestName: 't', Failure: null, DurationMs: 1 }), ...hooks }, ...limits };
}

async function collect(llm: TestLLM, o: AgentRunOptions): Promise<AgentMessage[]> {
  const out: AgentMessage[] = [];
  for await (const m of GeminiRunnerWith(llm)('task', 'system', o)) out.push(m);
  return out;
}

/** The tool_result blocks of the last tool message `llm` received in call `index`. */
function toolResults(llm: TestLLM, index: number): ChatMessageContentBlock[] {
  const tool = llm.Calls[index].messages.filter((m: ChatMessage) => m.role === 'tool').at(-1);
  return Array.isArray(tool?.content) ? tool.content : [];
}

function worktree(): string {
  const top = mkdtempSync(join(tmpdir(), 'jit-gem-')); const root = join(top, 'root');
  mkdirSync(join(root, 'src'), { recursive: true }); writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n'); writeFileSync(join(top, 'x'), 'secret\n');
  return root;
}

describe('GeminiRunner', () => {
  it('runs write_test and run_test through the hooks and replays the calls with their results', async () => {
    const root = worktree(); const writes: string[][] = []; const runs: unknown[][] = [];
    const calls = [{ ...call('c1', 'write_test', { File: 'f.jit.test.ts', Source: 'src' }), providerMetadata: { thoughtSignature: 'sig' } },
      call('c2', 'run_test', { File: 'f.jit.test.ts', Mutant: { Edits: [{ File: 'a.ts', Find: '1', Replace: '2' }] } })];
    const llm = new TestLLM().Script(reply('', calls), reply('done', undefined, 50, 5));
    const out = await collect(llm, options(root, { WriteFile: async (f, s) => { writes.push([f, s]); return 'ok'; },
      RunTest: async (f, m) => { runs.push([f, m]); return { Ran: true, Status: 'Fail', TestName: 't', Failure: null, DurationMs: 1 }; } }));
    expect(writes).toEqual([['f.jit.test.ts', 'src']]);
    expect(runs).toEqual([['f.jit.test.ts', { Edits: [{ File: 'a.ts', Find: '1', Replace: '2' }] }]]);
    const first = llm.Calls[0];
    expect(first).toMatchObject({ model: 'gemini-3.8-flash', toolChoice: 'auto', maxOutputTokens: 8192, enableCaching: true });
    expect(first.tools?.map((t) => t.name)).toEqual(['read_file', 'grep', 'glob', 'write_test', 'run_test']);
    const second = llm.Calls[1].messages;
    expect(second.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(second[2].toolCalls).toEqual(calls);
    expect(toolResults(llm, 1).map((b) => [b.type, b.toolCallId, b.toolName, b.content, b.isError ?? false])).toEqual([
      ['tool_result', 'c1', 'write_test', 'ok', false],
      ['tool_result', 'c2', 'run_test', JSON.stringify({ Ran: true, Status: 'Fail', TestName: 't', Failure: null, DurationMs: 1 }), false]]);
    expect(out.filter((m) => m.Type === 'tool').map((m) => m.Type === 'tool' && m.Name)).toEqual(['write_test', 'run_test']);
    expect(out.at(-1)).toEqual({ Type: 'result', Usage: { InputTokens: 150, OutputTokens: 15, CacheReadTokens: 0 }, CostUSD: (150 * 1 + 15 * 2) / 1_000_000, Turns: 2, Subtype: 'success' });
  });
  it('marks a write_test refusal as an error result', async () => {
    const llm = new TestLLM().Script(reply('', [call('c1', 'write_test', { File: 'x.ts', Source: 's' })]), reply('done'));
    await collect(llm, options(worktree(), { WriteFile: async () => 'denied: not a listed file' }));
    expect(toolResults(llm, 1)[0]).toMatchObject({ content: 'denied: not a listed file', isError: true });
  });
  it('stops after MaxTurns calls with error_max_turns', async () => {
    const llm = new TestLLM().Script(reply('', [call('c', 'glob', { pattern: '**/*.ts' })])); llm.RepeatLastOutcome = true;
    const out = await collect(llm, options(worktree(), {}, { MaxTurns: 3 }));
    expect(llm.CallCount).toBe(3);
    expect(out.at(-1)).toMatchObject({ Type: 'result', Turns: 3, Subtype: 'error_max_turns' });
  });
  it('stops at the token budget with the subtype of an aborted SDK session', async () => {
    const llm = new TestLLM().Script(reply('', [call('c', 'glob', { pattern: '*' })])); llm.RepeatLastOutcome = true;
    const out = await collect(llm, options(worktree(), {}, { TokenBudget: 150 }));
    expect(llm.CallCount).toBe(2);
    expect(out.at(-1)).toMatchObject({ Type: 'result', Usage: { InputTokens: 200, OutputTokens: 20, CacheReadTokens: 0 }, Turns: 2, Subtype: 'aborted_token_budget' });
  });
  it('stops at the USD budget with error_max_budget_usd', async () => {
    const llm = new TestLLM().Script(reply('', [call('c', 'glob', { pattern: '*' })])); llm.RepeatLastOutcome = true;
    const out = await collect(llm, options(worktree(), {}, { BudgetUsd: 0.00015 }));
    expect(llm.CallCount).toBe(2);
    expect(out.at(-1)).toMatchObject({ Type: 'result', Turns: 2, Subtype: 'error_max_budget_usd' });
  });
  it('refuses read_file outside the worktree, also through a symlink', async () => {
    const root = worktree(); symlinkSync(join(root, '..'), join(root, 'up'));
    const llm = new TestLLM().Script(reply('', [call('r1', 'read_file', { path: '../x' }), call('r2', 'read_file', { path: join(root, '../x') }), call('r3', 'read_file', { path: 'up/x' }), call('r4', 'read_file', { path: 'src/a.ts' })]), reply('done'));
    await collect(llm, options(root));
    expect(toolResults(llm, 1).map((b) => [b.content, b.isError ?? false])).toEqual([[DENIED, true], [DENIED, true], [DENIED, true], ['1\texport const a = 1;\n2\t', false]]);
  });
  it('answers an unknown tool and invalid run_test arguments with error results and continues', async () => {
    const llm = new TestLLM().Script(reply('', [call('u', 'bash', { cmd: 'ls' }), call('v', 'run_test', { Mutant: 3 })]), reply('done'));
    const out = await collect(llm, options(worktree()));
    expect(toolResults(llm, 1).map((b) => [b.toolCallId, b.isError])).toEqual([['u', true], ['v', true]]);
    expect(out.at(-1)).toMatchObject({ Subtype: 'success', Turns: 2 });
  });
  it('cuts a long tool result at 20 000 characters', async () => {
    const root = worktree(); writeFileSync(join(root, 'big.txt'), 'x'.repeat(30_000));
    const llm = new TestLLM().Script(reply('', [call('r', 'read_file', { path: 'big.txt' })]), reply('done'));
    await collect(llm, options(root));
    const text = toolResults(llm, 1)[0].content;
    expect(text.length).toBe(20_000); expect(text.endsWith('… [truncated]')).toBe(true);
  });
  it('throws a SessionError with the usage of earlier calls when the provider fails', async () => {
    const llm = new TestLLM().Script(reply('', [call('c', 'glob', { pattern: '*' })]), { kind: 'fail', error: new Error('503 overloaded') });
    const err = await collect(llm, options(worktree())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).Usage).toMatchObject({ InputTokens: 100, OutputTokens: 10 });
  });
  it('throws a SessionError with the usage so far when a hook throws', async () => {
    const llm = new TestLLM().Script(reply('', [call('c', 'run_test', { File: 'f' })]));
    const err = await collect(llm, options(worktree(), { RunTest: async () => { throw new Error('sandbox gone'); } })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).message).toBe('sandbox gone'); expect((err as SessionError).Usage).toMatchObject({ InputTokens: 100, OutputTokens: 10 });
  });
  it('throws a SessionError with zero usage when the LLM cannot be created', async () => {
    const runner = GeminiRunnerWith(() => { throw new Error('GEMINI_API_KEY is not set'); });
    const err = await (async () => { for await (const _ of runner('t', 's', options(worktree()))) { /* drain */ } })().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).Usage).toMatchObject({ InputTokens: 0, OutputTokens: 0, CostUSD: 0 });
  });
});
