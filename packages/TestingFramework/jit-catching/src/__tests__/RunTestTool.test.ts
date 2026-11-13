import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
function setup(stdout: string, stderr = '', onRun: (root: string) => void = () => undefined) {
  const root = mkdtempSync(join(tmpdir(), 'jit-rt-')); mkdirSync(join(root, 'packages/MJCore/src/__tests__/jit'), { recursive: true });
  writeFileSync(join(root, 'packages/MJCore/src/a.ts'), 'export const f = () => 1;\n'); writeFileSync(join(root, 'packages/MJCore/package.json'), '{}');
  writeFileSync(join(root, `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`), 'x');
  mkdirSync(join(root, 'node_modules')); mkdirSync(join(root, 'packages/MJCore/node_modules'));
  const calls: SandboxRunOptions[] = [];
  const sandbox = new Sandbox(DEFAULT_SETTINGS.Sandbox, async () => ({ ExitCode: 0, TimedOut: false, Stdout: '', Stderr: '', DurationMs: 1 }));
  vi.spyOn(sandbox, 'Run').mockImplementation(async (o) => { calls.push(o); onRun(root); return { ExitCode: 1, TimedOut: false, Stdout: stdout, Stderr: stderr, DurationMs: 2 }; });
  const tool = new RunTestTool({ Sandbox: sandbox, BaseRootDir: root, PackageRelDir: 'packages/MJCore', PackageName: '@memberjunction/core', ScratchRoot: mkdtempSync(join(tmpdir(), 'jit-sc-')), Settings: DEFAULT_SETTINGS });
  return { tool, calls, root, sandbox };
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
  it('gives vite a writable .vite-temp folder on the base run and the mutant run', async () => {
    const { tool, calls } = setup(failReport);
    const file = `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`;
    await tool.Run({ File: file });
    await tool.Run({ File: file, Mutant: { Edits: [{ File: 'packages/MJCore/src/a.ts', Find: '=> 1', Replace: '=> 2' }] } });
    for (const c of calls) expect(c.Tmpfs).toContain('/work/packages/MJCore/node_modules/.vite-temp');
  });
  it('removes a symlink that the test planted in the jit folder after the run', async () => {
    const outside = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'secret'); writeFileSync(outside, 'SECRET');
    const { tool, root } = setup(passReport, '', (r) => symlinkSync(outside, join(r, 'packages/MJCore/src/__tests__/jit/helper.ts')));
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts` });
    expect(out.Status).toBe('Pass');
    expect(readdirSync(join(root, 'packages/MJCore/src/__tests__/jit'))).toEqual([`${ID}.jit.test.ts`]);
    expect(readFileSync(outside, 'utf8')).toBe('SECRET');
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
  it('refuses a mutant edit to a file that is a symlink, leaving the link target unchanged', async () => {
    const { tool, calls, root } = setup(failReport);
    const victim = join(mkdtempSync(join(tmpdir(), 'jit-victim-')), 'victim.ts'); writeFileSync(victim, 'SAFE');
    symlinkSync(victim, join(root, 'packages/MJCore/src/link.ts'));
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`, Mutant: { Edits: [{ File: 'packages/MJCore/src/link.ts', Find: 'SAFE', Replace: 'PWNED' }] } });
    expect(out.Ran).toBe(false); expect(out.Error).toMatch(/symlink/); expect(calls).toHaveLength(0);
    expect(readFileSync(victim, 'utf8')).toBe('SAFE');
  });
  it('refuses a run when the jit folder is a symlink', async () => {
    const { tool, calls, root } = setup(passReport);
    const jit = join(root, 'packages/MJCore/src/__tests__/jit');
    rmSync(jit, { recursive: true, force: true }); symlinkSync('../../../..', jit);
    writeFileSync(join(root, `${ID}.jit.test.ts`), 'x');
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts` });
    expect(out.Ran).toBe(false); expect(calls).toHaveLength(0);
  });
  it('keeps the end of a long stderr in the RunnerError, where vitest prints the error', async () => {
    parse.empty = true;
    const { tool } = setup('', `${' RUN  v4.0.18 /work/packages/MJCore\n'.repeat(100)}Error: Cannot find module 'missing-dep'`);
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts` });
    expect(out.Status).toBe('RunnerError'); expect(out.Error).toContain("Error: Cannot find module 'missing-dep'");
  });
  it('puts the stderr excerpt in Error for a RunnerError from the parser', async () => {
    const { tool } = setup('', 'boom-stderr');
    const out = await tool.Run({ File: `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts` });
    expect(out.Status).toBe('RunnerError'); expect(out.Error).toContain('boom-stderr');
  });
  it('refuses a file path with a ./ segment or a subfolder under the jit folder', async () => {
    const { tool, calls, root } = setup(passReport);
    mkdirSync(join(root, 'packages/MJCore/src/__tests__/jit/sub')); writeFileSync(join(root, 'packages/MJCore/src/__tests__/jit/sub/x.jit.test.ts'), 'x');
    writeFileSync(join(root, 'packages/MJCore/src/__tests__/jit/x.jit.test.ts'), 'x');
    for (const File of ['packages/MJCore/src/__tests__/jit/./x.jit.test.ts', 'packages/MJCore/src/__tests__/jit/sub/x.jit.test.ts']) {
      const out = await tool.Run({ File });
      expect(out.Ran).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });
});

describe('RunTestTool type check', () => {
  const FILE = `packages/MJCore/src/__tests__/jit/${ID}.jit.test.ts`;
  const TS_ERROR = `src/__tests__/jit/${ID}.jit.test.ts(4,20): error TS2345: Argument of type '"InternalRunViews"' is not assignable to parameter of type 'never'.`;
  /** A tool whose sandbox answers vitest with `vitest` and tsc with `tsc`, logging each command. */
  function typed(vitest: string, tsc: { Stdout: string; ExitCode: number }) {
    const { tool, calls, sandbox } = setup(vitest);
    vi.spyOn(sandbox, 'Run').mockImplementation(async (o) => {
      calls.push(o);
      const isTsc = o.Command.join(' ').includes('tsc');
      return { ExitCode: isTsc ? tsc.ExitCode : 1, TimedOut: false, Stdout: isTsc ? tsc.Stdout : vitest, Stderr: '', DurationMs: 2 };
    });
    const tscCalls = () => calls.filter((c) => c.Command.join(' ').includes('tsc'));
    return { tool, tscCalls };
  }
  it('reports CompileError with the tsc lines of the file when a passing file has type errors', async () => {
    const { tool } = typed(passReport, { Stdout: `${TS_ERROR}\nsrc/other.ts(1,1): error TS1: elsewhere`, ExitCode: 2 });
    const out = await tool.Run({ File: FILE });
    expect(out).toMatchObject({ Ran: true, Status: 'CompileError' });
    expect(out.Error).toContain('TS2345'); expect(out.Error).not.toContain('elsewhere');
  });
  it('keeps the vitest result when tsc cannot check the package', async () => {
    const { tool, tscCalls } = typed(passReport, { Stdout: "error TS5058: The specified path does not exist: 'tsconfig.json'.", ExitCode: 1 });
    const out = await tool.Run({ File: FILE });
    expect(tscCalls()).toHaveLength(1); expect(out.Status).toBe('Pass');
  });
  it('type-checks the passing base run and not the mutant run', async () => {
    const { tool, tscCalls } = typed(passReport, { Stdout: '', ExitCode: 0 });
    expect((await tool.Run({ File: FILE })).Status).toBe('Pass');
    await tool.Run({ File: FILE, Mutant: { Edits: [{ File: 'packages/MJCore/src/a.ts', Find: '=> 1', Replace: '=> 2' }] } });
    expect(tscCalls()).toHaveLength(1);
  });
});
