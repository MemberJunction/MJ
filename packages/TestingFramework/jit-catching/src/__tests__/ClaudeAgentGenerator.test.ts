import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClaudeAgentGenerator, FilterProcessWarnings, RunnerForModel, SdkRunner, type AgentMessage } from '../generator/ClaudeAgentGenerator';
import { GeminiRunner } from '../generator/GeminiRunner';
import { RunTestTool } from '../generator/RunTestTool';
import { Sandbox } from '../sandbox/Sandbox';
import { DEFAULT_SETTINGS } from '../settings';
import { SessionError } from '../generator/UsageCounter';
import type { GenerationRequest } from '../types';

/** SDK messages the mocked `query` yields, and what it does after them. */
const sdk = vi.hoisted(() => ({ messages: [] as object[], after: 'end' as 'end' | 'throw' | 'wait-abort', calls: 0, options: null as null | { canUseTool: (name: string, input: Record<string, unknown>, o: { signal: AbortSignal }) => Promise<{ behavior: string }> } }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  tool: (name: string) => ({ name }),
  createSdkMcpServer: () => ({ type: 'sdk', name: 'jit' }),
  query: ({ options }: { options: { abortController: AbortController } }) => (async function* () {
    sdk.calls++; sdk.options = options as never;
    for (const m of sdk.messages) { if (options.abortController.signal.aborted) throw new Error('aborted'); yield m; }
    if (sdk.after === 'throw') throw new Error('Claude Code process exited with code 1');
    if (sdk.after === 'wait-abort' && options.abortController.signal.aborted) throw new Error('aborted');
  })(),
}));
afterEach(() => { sdk.messages = []; sdk.after = 'end'; sdk.calls = 0; sdk.options = null; vi.unstubAllEnvs(); });

function world() {
  const root = mkdtempSync(join(tmpdir(), 'jit-gen-')); mkdirSync(join(root, 'packages/MJCore/src/__tests__/jit'), { recursive: true }); writeFileSync(join(root, 'packages/MJCore/package.json'), '{"name":"@memberjunction/core"}');
  return root;
}
const req = (root: string): GenerationRequest => ({ Run: { ID: 'r' } as never, Analysis: { IntentType: 'perf', Summary: 's', Title: 't', Body: '', ChangedFiles: [{ Path: 'packages/MJCore/src/a.ts', Package: '@memberjunction/core', AddedLines: [1], RemovedLineCount: 0, Hunks: [] }] } as never,
  Package: '@memberjunction/core', PackageDir: join(root, 'packages/MJCore'), BaseRootDir: root, Method: 'DodgyDiff', Risks: [], Model: 'claude-haiku-5-5', Limits: { ...DEFAULT_SETTINGS.Limits, TestsPerPackage: 2 } });

/** The file IDs a session may write, as its system prompt lists them (`- <id>.jit.test.ts`). */
function IdsFromPrompt(prompt: string): string[] { return [...prompt.matchAll(/- ([0-9a-f-]{36})\.jit\.test\.ts/g)].map((m) => m[1]); }

/** A scripted agent: writes files and calls run_test through the same hooks the SDK wrapper exposes. */
function scriptedRunner(script: (hooks: { WriteFile: (p: string, s: string) => Promise<string>; RunTest: (file: string) => Promise<unknown> }, ids: string[]) => Promise<void>) {
  return async function* (_prompt: string, system: string, o: { Hooks: { WriteFile: (p: string, s: string) => Promise<string>; RunTest: (file: string) => Promise<unknown> } }): AsyncIterable<AgentMessage> {
    await script(o.Hooks, IdsFromPrompt(system));
    yield { Type: 'result', Usage: { InputTokens: 100, OutputTokens: 50, CacheReadTokens: 0 }, CostUSD: 0.01, Turns: 3, Subtype: 'success' };
  };
}

describe('ClaudeAgentGenerator', () => {
  it('keeps only tests the agent proved pass on base, in the pre-allocated files', async () => {
    const root = world(); const ran: string[] = [];
    const gen = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      Runner: scriptedRunner(async (h, ids) => { await h.WriteFile(`packages/MJCore/src/__tests__/jit/${ids[0]}.jit.test.ts`, 'proved'); await h.RunTest(`packages/MJCore/src/__tests__/jit/${ids[0]}.jit.test.ts`); await h.WriteFile(`packages/MJCore/src/__tests__/jit/${ids[1]}.jit.test.ts`, 'never run'); }),
      RunTestFactory: () => ({ Run: async (i: { File: string }) => { ran.push(i.File); return { Ran: true, Status: 'Pass', TestName: 't', Failure: null, DurationMs: 1 }; }, LastMutant: null }) as never });
    const r = await gen.Generate(req(root));
    expect(r.Tests.filter((t) => t.GenerationOutcome === 'Produced').map((t) => t.Source)).toEqual(['proved']);
    expect(r.Tests.find((t) => t.GenerationOutcome === 'Failed')?.FailureReason).toMatch(/never proved/);
    expect(r.Tokens).toMatchObject({ InputTokens: 100, OutputTokens: 50, Model: 'claude-haiku-5-5' });
  });
  it('reports the end reason and turns of the result message and tags its tokens as generator usage', async () => {
    const root = world();
    const gen = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      Runner: async function* () { yield { Type: 'result', Usage: { InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0 }, CostUSD: 0, Turns: 31, Subtype: 'error_max_turns' }; } });
    const result = await gen.Generate(req(root));
    expect(result.EndReason).toBe('error_max_turns'); expect(result.Turns).toBe(31);
    expect(result.Tokens.Role).toBe('Generator');
  });
  it('passes the GeneratorEffort setting to the runner as Effort', async () => {
    const root = world(); let effort: string | undefined = 'unset';
    const gen = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: { ...DEFAULT_SETTINGS, GeneratorEffort: 'low' }, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      Runner: async function* (_p, _s, o) { effort = o.Effort; yield { Type: 'result', Usage: { InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0 }, CostUSD: 0, Turns: 1, Subtype: 'success' }; } });
    await gen.Generate(req(root));
    expect(effort).toBe('low');
  });
  it('refuses a write outside the jit folder', async () => {
    const root = world(); let denied = '';
    const gen = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      Runner: scriptedRunner(async (h) => { denied = await h.WriteFile('packages/MJCore/src/a.ts', 'evil'); }), RunTestFactory: () => ({ Run: async () => ({ Ran: true, Status: 'Pass', TestName: null, Failure: null, DurationMs: 0 }), LastMutant: null }) as never });
    await gen.Generate(req(root));
    expect(denied).toMatch(/denied/);
  });
});

const JIT = 'packages/MJCore/src/__tests__/jit';
type Status = 'Pass' | 'Fail' | 'RunnerError';
/** A generator over `root` whose run_test answers `status`; `script` drives the agent with the allocated IDs. */
function generator(root: string, script: (h: { WriteFile: (p: string, s: string) => Promise<string>; RunTest: (file: string) => Promise<unknown> }, ids: string[]) => Promise<void>, status: Status = 'Pass', extra: AgentMessage[] = []) {
  const gen: ClaudeAgentGenerator = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: join(root, 'transcripts'),
    Runner: async function* (_p, system, o) { await script(o.Hooks, IdsFromPrompt(system)); yield* extra; yield { Type: 'result', Usage: { InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0 }, CostUSD: 0, Turns: 1, Subtype: 'success' }; },
    RunTestFactory: () => ({ Run: async () => ({ Ran: true, Status: status, TestName: null, Failure: null, DurationMs: 0 }), LastMutant: null }) as never });
  return gen;
}

describe('RunnerForModel', () => {
  it('runs gemini-* models on the Gemini runner and the others on the Agent SDK', () => {
    expect(RunnerForModel('gemini-3.8-flash')).toBe(GeminiRunner);
    expect(RunnerForModel('claude-sonnet-5-5')).toBe(SdkRunner);
  });
  it('Generate without a Runner option runs a gemini model on the Gemini runner', async () => {
    vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('ANTHROPIC_API_KEY', ''); const root = world();
    const gen = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      RunTestFactory: () => ({ Run: async () => ({ Ran: true, Status: 'Pass', TestName: null, Failure: null, DurationMs: 0 }), LastMutant: null }) as never });
    await expect(gen.Generate({ ...req(root), Model: 'gemini-x' })).rejects.toThrow('GEMINI_API_KEY is not set');
  });
});

describe('ClaudeAgentGenerator write_test guard', () => {
  it('refuses a symlink planted at an allocated file and leaves its target untouched', async () => {
    const root = world(); const outside = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'victim.ts'); writeFileSync(outside, 'original');
    let reply = '';
    await generator(root, async (h, ids) => { symlinkSync(outside, join(root, JIT, `${ids[0]}.jit.test.ts`)); reply = await h.WriteFile(`${JIT}/${ids[0]}.jit.test.ts`, 'evil'); }).Generate(req(root));
    expect(reply).toMatch(/denied/); expect(readFileSync(outside, 'utf8')).toBe('original');
  });
  it('refuses a dangling symlink planted at an allocated file', async () => {
    const root = world(); const outside = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'created.ts');
    let reply = '';
    await generator(root, async (h, ids) => { symlinkSync(outside, join(root, JIT, `${ids[0]}.jit.test.ts`)); reply = await h.WriteFile(`${JIT}/${ids[0]}.jit.test.ts`, 'evil'); }).Generate(req(root));
    expect(reply).toMatch(/denied/); expect(existsSync(outside)).toBe(false);
  });
  it('refuses writes when the jit folder itself is a symlink out of the worktree', async () => {
    const root = world(); const outside = mkdtempSync(join(tmpdir(), 'jit-out-'));
    rmSync(join(root, JIT), { recursive: true }); symlinkSync(outside, join(root, JIT));
    let reply = '';
    await generator(root, async (h, ids) => { reply = await h.WriteFile(`${JIT}/${ids[0]}.jit.test.ts`, 'evil'); }).Generate(req(root));
    expect(reply).toMatch(/denied/); expect(readdirSync(outside)).toEqual([]);
  });
  it('refuses an allocated file name in a sub-folder of the jit folder', async () => {
    const root = world(); let reply = '';
    mkdirSync(join(root, JIT, 'sub'));
    await generator(root, async (h, ids) => { reply = await h.WriteFile(`${JIT}/sub/${ids[0]}.jit.test.ts`, 'x'); }).Generate(req(root));
    expect(reply).toMatch(/denied/); expect(readdirSync(join(root, JIT, 'sub'))).toEqual([]);
  });
  it('refuses a symlink at an allocated file even when it points inside the jit folder', async () => {
    const root = world(); writeFileSync(join(root, JIT, 'other.txt'), 'original'); let reply = '';
    await generator(root, async (h, ids) => { symlinkSync(join(root, JIT, 'other.txt'), join(root, JIT, `${ids[0]}.jit.test.ts`)); reply = await h.WriteFile(`${JIT}/${ids[0]}.jit.test.ts`, 'evil'); }).Generate(req(root));
    expect(reply).toMatch(/denied/); expect(readFileSync(join(root, JIT, 'other.txt'), 'utf8')).toBe('original');
  });
});

describe('ClaudeAgentGenerator candidates', () => {
  it('does not keep a file whose run_test reported no passing result (for example only it.skip blocks)', async () => {
    const root = world();
    const r = await generator(root, async (h, ids) => { await h.WriteFile(`${JIT}/${ids[0]}.jit.test.ts`, "it.skip('x', () => {})"); await h.RunTest(`${JIT}/${ids[0]}.jit.test.ts`); }, 'RunnerError').Generate(req(root));
    expect(r.Tests).toHaveLength(1); expect(r.Tests[0].GenerationOutcome).toBe('Failed');
  });
  it('does not keep a proved file whose source changed on disk after the proof', async () => {
    const root = world();
    const r = await generator(root, async (h, ids) => { const f = `${JIT}/${ids[0]}.jit.test.ts`; await h.WriteFile(f, 'proved'); await h.RunTest(f); writeFileSync(join(root, f), 'swapped'); }).Generate(req(root));
    expect(r.Tests).toHaveLength(1); expect(r.Tests[0].GenerationOutcome).toBe('Failed'); expect(r.Tests[0].Source).toBe('proved');
  });
  it('does not read a symlink planted at an allocated file that the agent never wrote', async () => {
    const root = world(); const secret = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'secret'); writeFileSync(secret, 'TOP SECRET');
    const r = await generator(root, async (_h, ids) => { symlinkSync(secret, join(root, JIT, `${ids[0]}.jit.test.ts`)); }).Generate(req(root));
    expect(JSON.stringify(r.Tests)).not.toContain('TOP SECRET');
  });
});

describe('ClaudeAgentGenerator proof of the content that ran', () => {
  it('does not credit a run to a source written while that run was in progress', async () => {
    const root = world(); const f = `${JIT}/`;
    const gen: ClaudeAgentGenerator = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: join(root, 'transcripts'),
      Runner: async function* (_p, system, o) {
        const file = `${f}${IdsFromPrompt(system)[0]}.jit.test.ts`;
        await o.Hooks.WriteFile(file, 'v1'); await Promise.all([o.Hooks.RunTest(file), o.Hooks.WriteFile(file, 'v2 never run')]);
        yield { Type: 'result', Usage: { InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0 }, CostUSD: 0, Turns: 1, Subtype: 'success' };
      },
      RunTestFactory: () => ({ Run: async () => { await new Promise((res) => setTimeout(res, 20)); return { Ran: true, Status: 'Pass', TestName: null, Failure: null, DurationMs: 20 }; }, LastMutant: null }) as never });
    const r = await gen.Generate(req(root));
    expect(r.Tests).toHaveLength(1); expect(r.Tests[0].Source).toBe('v2 never run'); expect(r.Tests[0].GenerationOutcome).toBe('Failed'); expect(r.Tests[0].FailureReason).toMatch(/never proved/);
  });
});

describe('ClaudeAgentGenerator risk groups', () => {
  const risk = (id: string) => ({ ID: id, File: 'packages/MJCore/src/a.ts', Symbol: `sym${id}`, WhatCouldBreak: `breaks ${id}`, HowObserved: 'seen' });
  const group = (root: string, ids: string[]): GenerationRequest => ({ ...req(root), Method: 'IntentAware', Risks: ids.map(risk), Limits: { ...DEFAULT_SETTINGS.Limits, TestsPerRisk: 1, TurnsPerSession: 30, TokensPerSession: 1000, UsdPerSession: 2 } });
  const proving = () => ({ Run: async (i: { Mutant?: unknown }) => ({ Ran: true, Status: i.Mutant ? 'Fail' : 'Pass', TestName: 't', Failure: null, DurationMs: 1 }),
    LastMutant: { Edits: [{ File: 'packages/MJCore/src/a.ts', Find: '1', Replace: '2' }], Patch: 'p', Failure: null } });
  it('allocates TestsPerRisk files per risk and marks each produced test with its own risk', async () => {
    const root = world();
    const gen = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      Runner: scriptedRunner(async (h, ids) => { for (const id of ids) { const f = `${JIT}/${id}.jit.test.ts`; await h.WriteFile(f, `src ${id}`); await h.RunTest(f); await (h.RunTest as (file: string, m: object) => Promise<unknown>)(f, { Edits: [] }); } }),
      RunTestFactory: () => proving() as never });
    const r = await gen.Generate(group(root, ['R1', 'R2']));
    expect(r.Tests.map((t) => [t.RiskID, t.RiskText, t.GenerationOutcome])).toEqual([['R1', 'breaks R1 (symR1)', 'Produced'], ['R2', 'breaks R2 (symR2)', 'Produced']]);
  });
  it('scales the turn, token and USD limits by the number of risks in the group', async () => {
    const root = world(); let seen: number[] = [];
    const gen = new ClaudeAgentGenerator({ Sandbox: {} as never, ScratchRoot: root, Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      Runner: async function* (_p, _s, o) { seen = [o.MaxTurns, o.TokenBudget, o.BudgetUsd]; yield { Type: 'result', Usage: { InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0 }, CostUSD: 0, Turns: 1, Subtype: 'success' }; } });
    await gen.Generate(group(root, ['R1', 'R2', 'R3']));
    expect(seen).toEqual([90, 3000, 6]);
  });
});

describe('ClaudeAgentGenerator with type errors', () => {
  it('does not count a file that passes vitest but has type errors as proved on base', async () => {
    const root = world(); mkdirSync(join(root, 'node_modules')); mkdirSync(join(root, 'packages/MJCore/node_modules'));
    const sandbox = new Sandbox(DEFAULT_SETTINGS.Sandbox, async () => ({ ExitCode: 0, TimedOut: false, Stdout: '', Stderr: '', DurationMs: 1 }));
    let file = '';
    vi.spyOn(sandbox, 'Run').mockImplementation(async (o) => {
      const tsc = o.Command.join(' ').includes('tsc');
      const stdout = tsc ? `src/__tests__/jit/${file}(2,1): error TS2459: Module declares 'RunViewParams' locally, but it is not exported.`
        : `JIT_REPORT ${JSON.stringify({ ModuleErrors: [], Tests: [{ File: `/work/${JIT}/${file}`, Name: 't', State: 'passed', DurationMs: 1, Errors: [] }] })}\n`;
      return { ExitCode: tsc ? 2 : 0, TimedOut: false, Stdout: stdout, Stderr: '', DurationMs: 1 };
    });
    const gen = new ClaudeAgentGenerator({ Sandbox: sandbox, ScratchRoot: mkdtempSync(join(tmpdir(), 'jit-sc-')), Settings: DEFAULT_SETTINGS, PackageMap: { Get: () => ({ Name: '@memberjunction/core', Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never, TranscriptDir: root,
      Runner: scriptedRunner(async (h, ids) => { file = `${ids[0]}.jit.test.ts`; await h.WriteFile(`${JIT}/${file}`, 'typed wrong'); await h.RunTest(`${JIT}/${file}`); }),
      RunTestFactory: (x) => new RunTestTool(x) });
    const r = await gen.Generate(req(root));
    expect(r.Tests[0]).toMatchObject({ GenerationOutcome: 'Failed', FailureReason: 'never proved to pass on base' });
  });
});

describe('ClaudeAgentGenerator transcript', () => {
  it('redacts the transcript before writing it under TranscriptDir', async () => {
    const root = world(); const fakeKey = `sk-ant-${'a'.repeat(30)}`;
    const r = await generator(root, async () => {}, 'Pass', [{ Type: 'assistant', Text: `found ${fakeKey}` }]).Generate(req(root));
    expect(r.TranscriptPath).toBeTruthy(); expect(readFileSync(r.TranscriptPath!, 'utf8')).not.toContain(fakeKey);
  });
});

const runOptions = (budget = 1_000_000) => ({ Cwd: '/w', Model: 'claude-haiku-5-5', MaxTurns: 3, TokenBudget: budget, BudgetUsd: 1, Price: { Input: 1, Output: 5, CachedInput: 0.1 }, Hooks: {} as never });
async function collect(it: AsyncIterable<AgentMessage>): Promise<AgentMessage[]> { const out: AgentMessage[] = []; for await (const m of it) out.push(m); return out; }
const init = (source: string) => ({ type: 'system', subtype: 'init', apiKeySource: source });
const assistant = (id: string, input: number) => ({ type: 'assistant', message: { id, content: [], usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });

describe('SdkRunner', () => {
  const env = () => { vi.stubEnv('CLAUDECODE', ''); vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-not-real'); };
  it('refuses to start inside a Claude Code session', async () => {
    vi.stubEnv('CLAUDECODE', '1'); vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-not-real');
    await expect(collect(SdkRunner('p', 's', runOptions()))).rejects.toThrow(/Claude Code session/); expect(sdk.calls).toBe(0);
  });
  it('aborts with an error when the session credential is not the environment key', async () => {
    env(); sdk.messages = [init('none'), assistant('m1', 10)];
    await expect(collect(SdkRunner('p', 's', runOptions()))).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
  it('aborts at the token budget and reports the host count with an estimated cost', async () => {
    env(); sdk.messages = [init('ANTHROPIC_API_KEY'), assistant('m1', 600), assistant('m1', 600), assistant('m2', 600), assistant('m3', 600)];
    const out = await collect(SdkRunner('p', 's', runOptions(1000)));
    const result = out.find((m) => m.Type === 'result');
    expect(result).toMatchObject({ Subtype: 'aborted_token_budget', Turns: 2, Usage: { InputTokens: 1200, OutputTokens: 2, CacheReadTokens: 0 } });
    expect(result && result.Type === 'result' ? result.CostUSD : -1).toBeCloseTo((1200 * 1 + 2 * 5) / 1_000_000, 9);
  });
  it('refuses a session whose messages arrive before the init message', async () => {
    env(); sdk.messages = [assistant('m1', 5), { type: 'result', subtype: 'success', total_cost_usd: 0.1, num_turns: 1, usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, modelUsage: {} }];
    await expect(collect(SdkRunner('p', 's', runOptions()))).rejects.toThrow(/init/);
  });
  it('sums the result totals over every model in modelUsage', async () => {
    env();
    sdk.messages = [init('ANTHROPIC_API_KEY'), assistant('m1', 5), { type: 'result', subtype: 'success', total_cost_usd: 0.2, num_turns: 2, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      modelUsage: { a: { inputTokens: 10, outputTokens: 4, cacheReadInputTokens: 100, cacheCreationInputTokens: 20, webSearchRequests: 0, costUSD: 0.1, contextWindow: 1, maxOutputTokens: 1 }, b: { inputTokens: 3, outputTokens: 2, cacheReadInputTokens: 7, cacheCreationInputTokens: 1, webSearchRequests: 0, costUSD: 0.1, contextWindow: 1, maxOutputTokens: 1 } } }];
    const out = await collect(SdkRunner('p', 's', runOptions()));
    expect(out.find((m) => m.Type === 'result')).toMatchObject({ Usage: { InputTokens: 34, OutputTokens: 6, CacheReadTokens: 107 }, CostUSD: 0.2 });
  });
  it('gives the SDK a canUseTool that allows write_test and reads inside the worktree only', async () => {
    env(); const root = mkdtempSync(join(tmpdir(), 'jit-cut-')); writeFileSync(join(root, 'a.ts'), 'x');
    sdk.messages = [init('ANTHROPIC_API_KEY')];
    await collect(SdkRunner('p', 's', { ...runOptions(), Cwd: root }));
    const can = sdk.options!.canUseTool; const o = { signal: new AbortController().signal };
    expect((await can('mcp__jit__write_test', { File: 'x', Source: 'y' }, o)).behavior).toBe('allow');
    expect((await can('Read', { file_path: join(root, 'a.ts') }, o)).behavior).toBe('allow');
    expect((await can('Read', { file_path: '/etc/passwd' }, o)).behavior).toBe('deny');
    expect((await can('Bash', { command: 'ls' }, o)).behavior).toBe('deny');
  });
  it('a session that throws before its result message throws a SessionError with the host usage so far', async () => {
    env(); sdk.after = 'throw'; sdk.messages = [init('ANTHROPIC_API_KEY'), assistant('m1', 40), assistant('m2', 60)];
    const err = await collect(SdkRunner('p', 's', runOptions())).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(SessionError);
    expect((err as SessionError).Usage).toEqual({ Model: 'claude-haiku-5-5', InputTokens: 100, OutputTokens: 2, CacheReadTokens: 0, CostUSD: (100 * 1 + 2 * 5) / 1_000_000 });
    expect(err?.message).toMatch(/exited with code 1/);
  });
  it('keeps the result message when the SDK throws after error_max_turns', async () => {
    env(); sdk.after = 'throw';
    sdk.messages = [init('ANTHROPIC_API_KEY'), assistant('m1', 5), { type: 'result', subtype: 'error_max_turns', total_cost_usd: 0.5, num_turns: 4, usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 }, modelUsage: {} }];
    const out = await collect(SdkRunner('p', 's', runOptions()));
    expect(out.filter((m) => m.Type === 'result')).toEqual([{ Type: 'result', Subtype: 'error_max_turns', CostUSD: 0.5, Turns: 1, Usage: { InputTokens: 7, OutputTokens: 7, CacheReadTokens: 3 } }]);
  });
});

describe('FilterProcessWarnings', () => {
  const original = process.listeners('warning');
  afterEach(() => {
    process.removeAllListeners('warning');
    for (const l of original) process.on('warning', l);
    vi.unstubAllEnvs();
  });
  it('drops warnings with a filtered code and writes the others in Node format', async () => {
    vi.stubEnv('NODE_NO_WARNINGS', '0');
    vi.stubEnv('NODE_OPTIONS', '');
    const lines: string[] = [];
    FilterProcessWarnings(['CLAUDE_SDK_CAN_USE_TOOL_SHADOWED'], (s) => lines.push(s));
    process.emitWarning('x', { code: 'CLAUDE_SDK_CAN_USE_TOOL_SHADOWED' });
    process.emitWarning('y', { code: 'OTHER' });
    await new Promise((r) => setImmediate(r));
    expect(lines).toEqual([`(node:${process.pid}) [OTHER] Warning: y\n`]);
  });
  it('writes nothing when NODE_OPTIONS holds --no-warnings', async () => {
    vi.stubEnv('NODE_NO_WARNINGS', '0');
    vi.stubEnv('NODE_OPTIONS', '--max-old-space-size=4096  --no-warnings');
    const lines: string[] = [];
    FilterProcessWarnings(['CLAUDE_SDK_CAN_USE_TOOL_SHADOWED'], (s) => lines.push(s));
    process.emitWarning('y', { code: 'OTHER' });
    await new Promise((r) => setImmediate(r));
    expect(lines).toEqual([]);
  });
  it('writes nothing when NODE_NO_WARNINGS is 1', async () => {
    vi.stubEnv('NODE_NO_WARNINGS', '1');
    const lines: string[] = [];
    FilterProcessWarnings(['CLAUDE_SDK_CAN_USE_TOOL_SHADOWED'], (s) => lines.push(s));
    process.emitWarning('y', { code: 'OTHER' });
    await new Promise((r) => setImmediate(r));
    expect(lines).toEqual([]);
  });
});
