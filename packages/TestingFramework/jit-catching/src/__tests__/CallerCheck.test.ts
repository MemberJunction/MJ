import { describe, it, expect, vi } from 'vitest';
import { ModelUsage, type ChatMessage, type ChatMessageContentBlock, type ChatToolCall } from '@memberjunction/ai';
import { TestLLM, MakeSuccessChatResult, type TestLLMOutcome } from '@memberjunction/unit-testing';
import { CallerCheck, type RevisionReader } from '../judges/CallerCheck';
import { ctx } from './helpers/judgeFixtures';
import type { CatchContext } from '../types';

const HEAD = 'h'.repeat(40);
const PRICE = { Input: 1, Output: 2, CachedInput: 0.1 };

/** A successful reply with `toolCalls`; `failResult` is the only TestLLM outcome kind that carries `toolCalls`. */
function reply(content: string, toolCalls?: ChatToolCall[], prompt = 100, completion = 10): TestLLMOutcome {
  const result = MakeSuccessChatResult(content, { usage: new ModelUsage(prompt, completion) });
  result.data.choices[0].message.toolCalls = toolCalls;
  return { kind: 'failResult', result };
}
const call = (id: string, name: string, args: Record<string, unknown>): ChatToolCall => ({ id, name, arguments: args });
const answer = (label: string, confidence = 'High', reason = 'the caller passes a Date'): string => JSON.stringify({ label, confidence, reason });

function catchAtHead(): CatchContext { return { ...ctx(), Run: { HeadSHA: HEAD } as never }; }

function fakeRepo(over: Partial<RevisionReader> = {}): RevisionReader {
  return {
    FileAt: vi.fn(async (_sha: string, _path: string) => ({ Ok: true as const, Text: 'line one\nline two\nline three\n' })),
    GrepAt: vi.fn(async (sha: string, _pattern: string, _path?: string) => ({ Ok: true as const, Text: `${sha}:packages/X/src/caller.ts:7:cache.get(user)\n` })),
    ...over,
  };
}

/** The tool_result blocks of the last tool message `llm` received in call `index`. */
function toolResults(llm: TestLLM, index: number): ChatMessageContentBlock[] {
  const tool = llm.Calls[index].messages.filter((m: ChatMessage) => m.role === 'tool').at(-1);
  return Array.isArray(tool?.content) ? tool.content : [];
}

describe('CallerCheck', () => {
  it('runs the tool calls against the head revision and returns the parsed label with the usage', async () => {
    const llm = new TestLLM().Script(
      reply('', [call('c1', 'read_file', { path: 'packages/X/src/cache.ts', offset: 2, limit: 1 }), call('c2', 'grep', { pattern: 'cache\\.get', path: 'packages/X' })]),
      reply(`Done. ${answer('TestFault', 'medium', 'no caller passes a string date')}`),
    );
    const repo = fakeRepo();
    const r = await new CallerCheck(llm, 'claude-opus-5-5', repo, PRICE).Check(catchAtHead());
    expect(r).toMatchObject({ Label: 'TestFault', Confidence: 'Medium', Reason: 'no caller passes a string date', Model: 'claude-opus-5-5' });
    expect(repo.FileAt).toHaveBeenCalledWith(HEAD, 'packages/X/src/cache.ts');
    expect(repo.GrepAt).toHaveBeenCalledWith(HEAD, 'cache\\.get', 'packages/X');
    expect(toolResults(llm, 1).map((b) => [b.toolCallId, b.content])).toEqual([['c1', '2\tline two'], ['c2', 'packages/X/src/caller.ts:7:cache.get(user)']]);
    expect(r.Usage).toMatchObject({ Model: 'claude-opus-5-5', InputTokens: 200, OutputTokens: 20 });
    expect(r.Usage.CostUSD).toBeCloseTo((200 * 1 + 20 * 2) / 1_000_000);
  });

  it('forces an answer without tools at the turn limit', async () => {
    const llm = new TestLLM().Script(...Array.from({ length: 24 }, (_, i) => reply('', [call(`c${i}`, 'grep', { pattern: 'x' })])), reply(answer('Bug')));
    const r = await new CallerCheck(llm, 'm', fakeRepo()).Check(catchAtHead());
    expect(llm.Calls).toHaveLength(25);
    const last = llm.Calls[24];
    expect(last.tools ?? []).toEqual([]);
    expect(last.messages.at(-1)).toEqual({ role: 'user', content: 'Stop reading now. Reply with the JSON answer.' });
    expect(llm.Calls[23].tools?.length).toBe(2);
    expect(r).toMatchObject({ Label: 'Bug', Confidence: 'High' });
  });

  it('gives a git failure to the model as an error text', async () => {
    const llm = new TestLLM().Script(reply('', [call('c1', 'read_file', { path: 'packages/X/src/gone.ts' })]), reply(answer('Intended')));
    const repo = fakeRepo({ FileAt: vi.fn(async () => ({ Ok: false as const, Error: 'fatal: path does not exist' })) });
    const r = await new CallerCheck(llm, 'm', repo).Check(catchAtHead());
    const [block] = toolResults(llm, 1);
    expect(block.content).toMatch(/^error: .*fatal: path does not exist/); expect(block.isError).toBe(true);
    expect(r.Label).toBe('Intended');
  });

  it('returns a null label with the reason on a provider error, and does not throw', async () => {
    const llm = new TestLLM().Script({ kind: 'throw', error: new Error('overloaded') });
    const r = await new CallerCheck(llm, 'm', fakeRepo()).Check(catchAtHead());
    expect(r).toMatchObject({ Label: null, Confidence: null, Model: 'm' }); expect(r.Reason).toMatch(/overloaded/);
  });

  it('returns a null label when the model gives no readable answer', async () => {
    const llm = new TestLLM().Script(reply('I think it is fine'), reply('still no json'));
    const r = await new CallerCheck(llm, 'm', fakeRepo()).Check(catchAtHead());
    expect(r.Label).toBeNull(); expect(r.Confidence).toBeNull();
  });

  it('stops when the session cost passes the limit', async () => {
    const llm = new TestLLM().Script(reply('', [call('c1', 'grep', { pattern: 'x' })], 2_000_000, 0), reply(answer('Bug')));
    const r = await new CallerCheck(llm, 'm', fakeRepo(), PRICE).Check(catchAtHead());
    expect(llm.Calls).toHaveLength(1); expect(r.Label).toBeNull();
  });
});
