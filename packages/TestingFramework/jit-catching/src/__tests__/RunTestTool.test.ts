import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RunTestTool } from '../generator/RunTestTool';
import { Sandbox, type SandboxRunOptions } from '../sandbox/Sandbox';
import { DEFAULT_SETTINGS } from '../settings';

const parse = vi.hoisted(() => ({ empty: false }));
vi.mock('../target/VitestReport', async (importOriginal) => {
  const m = await importOriginal<typeof import('../target/VitestReport')>();
  return { ...m, ParseVitestOutput: (...a: Parameters<typeof m.ParseVitestOutput>) => (parse.empty ? [] : m.ParseVitestOutput(...a)) };
});
afterEach(() => { parse.empty = false; });

const ID = '11111111-1111-1111-1111-111111111111';
function setup(stdout: string, stderr = '') {
  const root = mkdtempSync(join(tmpdir(), 'jit-rt-')); mkdirSync(join(root, 'packages/MJCore/src/__tests__/jit'), { recursive: true });
  writeFileSync(join(root, 'packages/MJCore/src/a.ts'), 'export const f = () => 1;\n'); writeFileSync(join(root, 'packages/MJCore/package.json'), '{}');
  writeFileSync(join(root, `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`), 'x');
  const calls: SandboxRunOptions[] = [];
  const sandbox = new Sandbox(DEFAULT_SETTINGS.Sandbox, async () => ({ ExitCode: 0, TimedOut: false, Stdout: '', Stderr: '', DurationMs: 1 }));
  vi.spyOn(sandbox, 'Run').mockImplementation(async (o) => { calls.push(o); return { ExitCode: 1, TimedOut: false, Stdout: stdout, Stderr: stderr, DurationMs: 2 }; });
  const tool = new RunTestTool({ Sandbox: sandbox, BaseRootDir: root, PackageRelDir: 'packages/MJCore', PackageName: '@memberjunction/core', ScratchRoot: mkdtempSync(join(tmpdir(), 'jit-sc-')), Settings: DEFAULT_SETTINGS });
  return { tool, calls, root };
}
const jitLine = (o: object) => `JIT_REPORT ${JSON.stringify({ ModuleErrors: [], ...o })}\n`;
const passReport = jitLine({ Tests: [{ File: `/work/packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`, Name: 't', State: 'passed', DurationMs: 1, Errors: [] }] });
const failReport = jitLine({ Tests: [{ File: `/work/packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`, Name: 't kills', State: 'failed', DurationMs: 1,
  Errors: [{ Name: 'AssertionError', Message: 'expected 2 to be 1 // Object.is equality', Expected: '1', Actual: '2', Diff: null, Frame: null, Timeout: false }] }] });

describe('RunTestTool', () => {
  it('runs the file on base with the worktree read-only and the jit folder writable', async () => {
    const { tool, calls } = setup(passReport);
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts` });
    expect(out.Status).toBe('Pass');
    expect(calls[0].Mounts.map((m) => [m.Container, m.Mode])).toEqual([['/work', 'ro'], ['/work/packages/MJCore/src/__tests__/jit', 'rw'], ['/jit-reporter', 'ro']]);
    expect(calls[0].Command.join(' ')).toContain('--reporter=/jit-reporter/jit-reporter.mjs');
    expect(Object.keys(calls[0].Env ?? {})).not.toContain('ANTHROPIC_API_KEY');
  });
  it('refuses a file outside the jit folder', async () => {
    const { tool } = setup(passReport);
    const out = await tool.Run({ File: 'packages/MJCore/src/a.ts' });
    expect(out.Ran).toBe(false); expect(out.Error).toMatch(/jit/);
  });
  it('with a mutant, mounts a scratch copy over the package and records the mutant failure', async () => {
    const { tool, calls } = setup(failReport);
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`, Mutant: { Edits: [{ File: 'packages/MJCore/src/a.ts', Find: '=> 1', Replace: '=> 2' }] } });
    expect(out.Status).toBe('Fail');
    expect(calls[0].Mounts.some((m) => m.Container === '/work/packages/MJCore' && m.Mode === 'rw')).toBe(true);
    expect(tool.LastMutant?.Patch).toContain('+export const f = () => 2;');
    expect(tool.LastMutant?.Failure?.Actual).toBe('2');
  });
  it('reports an invalid mutant without running anything', async () => {
    const { tool, calls } = setup(failReport);
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`, Mutant: { Edits: [{ File: 'packages/MJCore/src/__tests__/x.test.ts', Find: 'a', Replace: 'b' }] } });
    expect(out.Ran).toBe(false); expect(calls).toHaveLength(0);
  });
  it('refuses a jit file that is a symlink to a file outside the worktree', async () => {
    const { tool, calls, root } = setup(passReport);
    const outside = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'secret.ts'); writeFileSync(outside, 'x');
    symlinkSync(outside, join(root, 'packages/MJCore/src/__tests__/jit/link.jit.test.ts'));
    const out = await tool.Run({ File: 'packages/MJCore/src/__tests__/jit/link.jit.test.ts' });
    expect(out.Ran).toBe(false); expect(calls).toHaveLength(0);
  });
  it('reports a RunnerError with the output excerpt when the report has no result for the file', async () => {
    parse.empty = true;
    const { tool } = setup('no report here', 'vitest crashed: boom');
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts` });
    expect(out.Ran).toBe(true); expect(out.Status).toBe('RunnerError'); expect(out.Error).toContain('vitest crashed: boom');
  });
  it('passes the file to vitest as one argument, not through a shell', async () => {
    const name = `packages/MJCore/src/__tests__/jit/a;touch x.jit.test.ts`;
    const { tool, calls, root } = setup(passReport);
    writeFileSync(join(root, name), 'x');
    await tool.Run({ File: name });
    expect(calls[0].Command).toContain('src/__tests__/jit/a;touch x.jit.test.ts');
    expect(calls[0].Command[0]).not.toBe('sh');
  });
});
