import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentEnv, AssertApiKeySource, IsInside, ReadAllowed } from '../generator/AgentGuards';
import { BuildSdkOptions } from '../generator/ClaudeAgentGenerator';

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'jit-guard-')); const outside = mkdtempSync(join(tmpdir(), 'jit-out-'));
  const jit = join(root, 'packages/X/src/__tests__/jit'); mkdirSync(jit, { recursive: true }); symlinkSync(outside, join(jit, 'out'));
  return { root, jit, outside };
}

describe('IsInside', () => {
  it('follows symlinks for existing paths and for new files under a symlinked folder', () => {
    const { root, jit } = tree();
    expect(IsInside(jit, join(jit, 'a.jit.test.ts'))).toBe(true);
    expect(IsInside(jit, join(jit, 'out', 'a.jit.test.ts'))).toBe(false);
    expect(IsInside(jit, join(jit, 'out', 'new', 'deep.ts'))).toBe(false);
    expect(IsInside(jit, join(root, 'packages/X/src/a.ts'))).toBe(false);
  });
  it('resolves the allowed root too, so a root given through a symlink still matches its own files', () => {
    const { root, jit } = tree(); symlinkSync(jit, join(root, 'alias'));
    expect(IsInside(join(root, 'alias'), join(jit, 'a.jit.test.ts'))).toBe(true);
  });
  it('judges a dangling symlink by where it points', () => {
    const { jit, outside } = tree(); symlinkSync(join(outside, 'not-yet.ts'), join(jit, 'dangling.jit.test.ts'));
    expect(IsInside(jit, join(jit, 'dangling.jit.test.ts'))).toBe(false);
  });
});

describe('ReadAllowed', () => {
  it('keeps Read, Grep and Glob inside the base worktree and allows nothing else', () => {
    const { root } = tree();
    expect(ReadAllowed('Read', { file_path: join(root, 'packages/X/src/a.ts') }, root)).toBe(true);
    expect(ReadAllowed('Read', { file_path: '/etc/passwd' }, root)).toBe(false);
    expect(ReadAllowed('Read', { file_path: join(root, 'packages/X/src/__tests__/jit/out/secret') }, root)).toBe(false);
    expect(ReadAllowed('Grep', { pattern: 'x' }, root)).toBe(true);
    expect(ReadAllowed('Grep', { pattern: 'x', path: '/home' }, root)).toBe(false);
    expect(ReadAllowed('Glob', { pattern: '/etc/*' }, root)).toBe(false);
    expect(ReadAllowed('Glob', { pattern: '../**/*.env' }, root)).toBe(false);
    expect(ReadAllowed('Bash', { command: 'ls' }, root)).toBe(false);
  });
  it('rejects a parent segment hidden inside braces', () => {
    const { root } = tree();
    expect(ReadAllowed('Glob', { pattern: '{..,src}/**' }, root)).toBe(false);
    expect(ReadAllowed('Grep', { pattern: 'x', glob: '{..,a}/**' }, root)).toBe(false);
    expect(ReadAllowed('Glob', { pattern: 'src/**/*.ts' }, root)).toBe(true);
  });
  it('applies the Glob pattern rules to the glob filter of Grep', () => {
    const { root } = tree();
    expect(ReadAllowed('Grep', { pattern: 'x', glob: '*.ts' }, root)).toBe(true);
    expect(ReadAllowed('Grep', { pattern: 'x', glob: '../**/*.env' }, root)).toBe(false);
    expect(ReadAllowed('Grep', { pattern: 'x', glob: '/etc/*' }, root)).toBe(false);
  });
});

describe('AgentEnv and AssertApiKeySource', () => {
  it('gives the SDK child only PATH, an empty HOME and the key, and refuses to run inside a Claude Code session', () => {
    expect(AgentEnv({ PATH: '/bin', HOME: '/Users/me', ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'o' }, '/tmp/h')).toEqual({ PATH: '/bin', HOME: '/tmp/h', ANTHROPIC_API_KEY: 'k' });
    expect(() => AgentEnv({ PATH: '/bin', ANTHROPIC_API_KEY: 'k', CLAUDECODE: '1' }, '/tmp/h')).toThrow(/Claude Code session/);
    expect(() => AgentEnv({ PATH: '/bin' }, '/tmp/h')).toThrow(/ANTHROPIC_API_KEY/);
  });
  it('accepts only the environment key as the credential', () => {
    expect(() => AssertApiKeySource('ANTHROPIC_API_KEY')).not.toThrow();
    for (const s of ['none', '/login managed key', 'apiKeyHelper', undefined]) expect(() => AssertApiKeySource(s)).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('BuildSdkOptions', () => {
  it('restricts built-ins with tools, keeps reads and writes out of allowedTools, and uses the default permission mode', () => {
    const o = BuildSdkOptions({ Cwd: '/w', Model: 'm', MaxTurns: 30, TokenBudget: 1, BudgetUsd: 2, Price: null, Hooks: {} as never }, { System: 's', McpServer: {} as never, Abort: new AbortController(), CanUseTool: async () => ({ behavior: 'deny', message: 'x' }), Env: { PATH: '/bin', HOME: '/tmp/h', ANTHROPIC_API_KEY: 'k' } });
    expect(o.tools).toEqual(['Read', 'Grep', 'Glob']); expect(o.permissionMode).toBe('default'); expect(o.allowedTools).toEqual(['mcp__jit__run_test']);
    expect(o.disallowedTools).toEqual(expect.arrayContaining(['Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent']));
    expect(o.settingSources).toEqual([]); expect(o.maxTurns).toBe(30); expect(o.maxBudgetUsd).toBe(2); expect(o.env).toEqual({ PATH: '/bin', HOME: '/tmp/h', ANTHROPIC_API_KEY: 'k' });
  });
});
