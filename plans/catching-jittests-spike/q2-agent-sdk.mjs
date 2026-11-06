// Q2 probe: can the Claude Agent SDK be held to the JiT agent's limits?
// Usage: node q2-agent-sdk.mjs <path-to-a-base-checkout>
// Env: MAX_TURNS (default 12), TOKEN_BUDGET (default 150000),
//      WRITE_IN_ALLOWED=1 lists Write/Edit in allowedTools (auto-approve) instead of only in `tools`,
//      NO_DISALLOWED=1 leaves out disallowedTools (only `tools` limits the built-ins).
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { realpathSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const cwd = resolve(process.argv[2]);                  // a checkout of MJ at base
const allowedWriteRoot = resolve(cwd, 'packages/MJGlobal/src/__tests__/jit') + sep;
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 12);
const TOKEN_BUDGET = Number(process.env.TOKEN_BUDGET ?? 150_000);
const WRITE_IN_ALLOWED = process.env.WRITE_IN_ALLOWED === '1';
const NO_DISALLOWED = process.env.NO_DISALLOWED === '1';
const denied = [];
const canUseToolCalls = [];
const trace = [];
const trim = (s, n = 200) => (s.length > n ? s.slice(0, n) + '…' : s);

const jit = createSdkMcpServer({
  name: 'jit',
  version: '0.0.1',
  tools: [
    tool('run_test', 'Run one vitest file on base. Returns pass/fail per test as JSON.',
      { file: z.string().describe('path relative to the repo root') },
      async ({ file }) => ({ content: [{ type: 'text', text: JSON.stringify({ file, ran: true, passed: 0, failed: 0, note: 'stub' }) }] })),
  ],
});

const abort = new AbortController();
let inputTokens = 0, outputTokens = 0, turns = 0, aborted = false;
const seenMessageIds = new Set();
const builtIns = ['Read', 'Grep', 'Glob', 'Write', 'Edit'];

const result = {};
try {
  for await (const msg of query({
    prompt: 'Create a vitest test file packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts with one passing test, run it with run_test, then try to write packages/MJGlobal/src/probe.ts (expect that to be denied), then try to run `ls` with Bash (expect that to be unavailable). Report what happened.',
    options: {
      cwd,
      model: 'claude-haiku-5-5',
      maxTurns: MAX_TURNS,
      settingSources: [],                                 // do not load the repo's CLAUDE.md, hooks or skills
      tools: builtIns,                                    // the only built-in tools the model sees
      allowedTools: WRITE_IN_ALLOWED                      // auto-approved; anything else goes through canUseTool
        ? [...builtIns, 'mcp__jit__run_test']
        : ['Read', 'Grep', 'Glob', 'mcp__jit__run_test'],
      ...(NO_DISALLOWED ? {} : { disallowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'NotebookEdit'] }),
      permissionMode: 'default',                          // ask canUseTool, not the auto-mode classifier
      mcpServers: { jit },
      abortController: abort,
      canUseTool: async (name, input) => {
        canUseToolCalls.push(name);
        if (name === 'Write' || name === 'Edit') {
          const target = resolve(cwd, String(input.file_path ?? ''));
          const real = (() => { try { return realpathSync(target); } catch { return target; } })();
          if (!real.startsWith(allowedWriteRoot)) { denied.push(`${name} ${target}`); return { behavior: 'deny', message: 'Writes are allowed only under packages/<X>/src/__tests__/jit/' }; }
        }
        return { behavior: 'allow', updatedInput: input };
      },
    },
  })) {
    if (msg.type === 'system' && msg.subtype === 'init') trace.push({ init: { model: msg.model, apiKeySource: msg.apiKeySource, permissionMode: msg.permissionMode, tools: msg.tools } });
    if (msg.type === 'assistant' && msg.message?.usage) {
      // One API message arrives as one SDK message per content block, each with the same usage; count it once.
      const u = msg.message.usage;
      const firstBlock = !seenMessageIds.has(msg.message.id);
      seenMessageIds.add(msg.message.id);
      if (firstBlock) {
        inputTokens += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        outputTokens += u.output_tokens ?? 0; turns++;
      }
      const toolUses = (msg.message.content ?? []).filter((c) => c.type === 'tool_use').map((c) => `${c.name} ${trim(JSON.stringify(c.input), 120)}`);
      trace.push({ assistant: { id: msg.message.id, usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_input_tokens: u.cache_read_input_tokens, cache_creation_input_tokens: u.cache_creation_input_tokens }, toolUses } });
      if (inputTokens + outputTokens > TOKEN_BUDGET && !aborted) { aborted = true; trace.push({ abort: { inputTokens, outputTokens } }); abort.abort(); }
    }
    if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
      for (const c of msg.message.content) {
        if (c.type !== 'tool_result') continue;
        const text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((p) => p.text ?? '').join('');
        trace.push({ toolResult: { is_error: c.is_error ?? false, text: trim(text) } });
      }
    }
    if (msg.type === 'result') Object.assign(result, { subtype: msg.subtype, is_error: msg.is_error, num_turns: msg.num_turns, usage: msg.usage, total_cost_usd: msg.total_cost_usd, permission_denials: msg.permission_denials, text: msg.result ? trim(msg.result, 600) : undefined });
  }
} catch (err) {
  result.thrown = `${err?.name}: ${trim(String(err?.message ?? err), 300)}`;
}
const files = {
  testFileWritten: existsSync(resolve(cwd, 'packages/MJGlobal/src/__tests__/jit/probe.jit.test.ts')),
  outsideFileWritten: existsSync(resolve(cwd, 'packages/MJGlobal/src/probe.ts')),
};
console.log(JSON.stringify({ config: { MAX_TURNS, TOKEN_BUDGET, WRITE_IN_ALLOWED, NO_DISALLOWED }, trace, result, counted: { inputTokens, outputTokens, turns, aborted }, canUseToolCalls, denied, files }, null, 2));
