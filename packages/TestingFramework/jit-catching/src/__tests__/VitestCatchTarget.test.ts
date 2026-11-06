import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CountCoveredChangedLines, InfrastructureError, VitestCatchTarget } from '../target/VitestCatchTarget';
import { Sandbox, type SandboxRunOptions } from '../sandbox/Sandbox';
import { DEFAULT_SETTINGS } from '../settings';
import type { CandidateTest } from '../types';

function fakeTarget(onRun: (o: SandboxRunOptions) => { Stdout: string; ExitCode: number }) {
  const calls: SandboxRunOptions[] = [];
  const sandbox = new Sandbox(DEFAULT_SETTINGS.Sandbox, async (_f, _a) => ({ ExitCode: 0, TimedOut: false, Stdout: '', Stderr: '', DurationMs: 1 }));
  vi.spyOn(sandbox, 'Run').mockImplementation(async (o) => { calls.push(o); const r = onRun(o); return { ExitCode: r.ExitCode, TimedOut: false, Stdout: r.Stdout, Stderr: '', DurationMs: 1 }; });
  const target = new VitestCatchTarget({ Repo: { Root: '/repo' } as never, Sandbox: sandbox, Settings: DEFAULT_SETTINGS, WorkRoot: '/work', StoreDir: '/work/pnpm-store', PackageMap: { Get: (n: string) => ({ Name: n, Dir: 'packages/MJCore', HasVitest: true, HasTests: true }) } as never });
  return { target, calls };
}
const test = (id: string): CandidateTest => ({ ID: id, RunID: 'r', Package: '@memberjunction/core', Method: 'DodgyDiff', RiskID: null, RiskText: null, Mutant: null, MutantFailure: null,
  FilePath: `packages/MJCore/src/__tests__/jit/${id}.jit.test.ts`, Source: 'x', GenerationOutcome: 'Produced', FailureReason: null, Tokens: { Model: 'm', InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 }, TranscriptURL: null });
const ID1 = '11111111-1111-1111-1111-111111111111';

describe('VitestCatchTarget.Run', () => {
  it('runs each package once per repeat with the fixed seed and the custom reporter, in the sandbox, and maps results', async () => {
    const jit = { Tests: [{ File: `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`, Name: 't', State: 'passed', DurationMs: 1, Errors: [] }], ModuleErrors: [] };
    const { target, calls } = fakeTarget(() => ({ Stdout: `JIT_REPORT ${JSON.stringify(jit)}\n`, ExitCode: 0 }));
    const results = await target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: '/work/head' }, [test(ID1)], 3);
    expect(calls).toHaveLength(3);
    const cmd = calls[0].Command.join(' ');
    expect(cmd).toContain('vitest run'); expect(cmd).toContain('--reporter=/jit-reporter/jit-reporter.mjs'); expect(cmd).not.toContain('--reporter=json');
    expect(cmd).toContain('--sequence.seed=1'); expect(cmd).toContain(`src/__tests__/jit/${ID1}.jit.test.ts`);
    expect(calls[0].Env).toMatchObject({ TZ: 'UTC' });
    expect(calls[0].Mounts.find((m) => m.Container === '/work')?.Mode).toBe('ro');
    expect(calls[0].Mounts.find((m) => m.Container === '/jit-reporter')?.Mode).toBe('ro');
    expect(results.map((r) => [r.RunIndex, r.Status])).toEqual([[0, 'Pass'], [1, 'Pass'], [2, 'Pass']]);
  });
  it('runs a repeat once more with --reporter=json when the custom reporter printed no JIT_REPORT line', async () => {
    const json = { testResults: [{ name: `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`, status: 'passed', assertionResults: [{ fullName: 't', status: 'passed', duration: 1, failureMessages: [] }] }] };
    const { target, calls } = fakeTarget((o) => ({ Stdout: o.Command.join(' ').includes('--reporter=json') ? JSON.stringify(json) : 'Error: Failed to load custom Reporter', ExitCode: 1 }));
    const results = await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: '/work/base' }, [test(ID1)], 1);
    expect(calls).toHaveLength(2); expect(calls[1].Command.join(' ')).toContain('--reporter=json');
    expect(results.map((r) => r.Status)).toEqual(['Pass']);
  });
  it('turns a sandbox timeout into Timeout results for every test in that package', async () => {
    const { target } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    vi.spyOn((target as never as { sandbox: Sandbox }).sandbox, 'Run').mockResolvedValue({ ExitCode: null, TimedOut: true, Stdout: '', Stderr: '', DurationMs: 9 });
    const results = await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: '/work/base' }, [test(ID1)], 1);
    expect(results[0].Status).toBe('Timeout');
  });
  it('reads the JSON fallback report from an --outputFile in the jit folder, so test chatter on stdout cannot confuse it', async () => {
    const { target, calls } = fakeTarget((o) => ({ Stdout: o.Command.join(' ').includes('--reporter=json') ? '{"testResults":[]}' : 'no reporter', ExitCode: 1 }));
    await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: '/work/base' }, [test(ID1)], 1);
    const cmd = calls[1].Command.join(' ');
    expect(cmd).toMatch(/--outputFile=\/work\/packages\/MJCore\/src\/__tests__\/jit\/[^ ]+\.json/);
    expect(cmd).toMatch(/--reporter=json --outputFile=\S+ >\/dev\/null 2>&1; cat /);
  });
  it('maps a test file whose tests were all skipped or todo to RunnerError, not Pass', async () => {
    const file = `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`;
    const jit = { Tests: [{ File: file, Name: 'a', State: 'skipped', DurationMs: 0, Errors: [] }, { File: file, Name: 'b', State: 'pending', DurationMs: 0, Errors: [] }], ModuleErrors: [] };
    const { target } = fakeTarget(() => ({ Stdout: `JIT_REPORT ${JSON.stringify(jit)}\n`, ExitCode: 0 }));
    const results = await target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: '/work/head' }, [test(ID1)], 1);
    expect(results.map((r) => r.Status)).toEqual(['RunnerError']);
  });
  it('maps a JSON-fallback file whose assertions were all skipped or todo to RunnerError, not Pass', async () => {
    const json = { testResults: [{ name: `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`, status: 'passed', assertionResults: [{ fullName: 't', status: 'todo', duration: 0, failureMessages: [] }] }] };
    const { target } = fakeTarget((o) => ({ Stdout: o.Command.join(' ').includes('--reporter=json') ? JSON.stringify(json) : '', ExitCode: 0 }));
    const results = await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: '/work/base' }, [test(ID1)], 1);
    expect(results.map((r) => r.Status)).toEqual(['RunnerError']);
  });
});

describe('VitestCatchTarget.Prepare', () => {
  const LOCK = 'lockfileVersion: 9.0\n\npatchedDependencies:\n  type-graphql@2.0.0-beta.3:\n    hash: abc123\n    path: patches/type-graphql@2.0.0-beta.3.patch\n\nimporters:\n  .:\n    dependencies:\n      type-graphql:\n        version: 2.0.0-beta.3(patch_hash=abc123)(graphql@16.12.0)\n';
  function prepWorld(hostRunner: (f: string, a: string[], cwd: string) => Promise<string>) {
    const { target, calls } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    const work = mkdtempSync(join(tmpdir(), 'jit-prep-'));
    (target as never as { o: object }).o = { ...(target as never as { o: object }).o, WorkRoot: work, StoreDir: join(work, 'store'), HostRunner: hostRunner,
      Repo: { AddWorktree: async () => { mkdirSync(join(work, 'head', 'patches'), { recursive: true }); writeFileSync(join(work, 'head', 'pnpm-lock.yaml'), LOCK); writeFileSync(join(work, 'head', '.pnpmfile.cjs'), 'bad'); writeFileSync(join(work, 'head', 'patches', 'type-graphql@2.0.0-beta.3.patch'), 'diff'); }, RemoveWorktree: async () => {} } } as never;
    return { target, calls, work };
  }
  it('runs pnpm on the host only as `fetch`, in a folder holding just a lockfile copy without patch information, then installs offline in the sandbox with the worktree and the run store mounted rw', async () => {
    const host: { File: string; Args: string[]; Cwd: string; Files: string[]; Lock: string }[] = [];
    const { target, calls, work } = prepWorld(async (File, Args, Cwd) => { host.push({ File, Args, Cwd, Files: readdirSync(Cwd).sort(), Lock: readFileSync(join(Cwd, 'pnpm-lock.yaml'), 'utf8') }); return Args[0] === '--version' ? '10.33.0\n' : ''; });
    await target.Prepare({ Kind: 'Head', SHA: 'h' });
    expect(host.map((h) => [h.File, ...h.Args])).toEqual([['pnpm', '--version'], ['pnpm', 'fetch', '--store-dir', join(work, 'store')]]);
    expect(host[1].Cwd).not.toBe(join(work, 'head')); expect(host[1].Cwd).toBe(host[0].Cwd); expect(host[1].Files).toEqual(['package.json', 'pnpm-lock.yaml']);
    expect(JSON.parse(readFileSync(join(host[1].Cwd, 'package.json'), 'utf8'))).toEqual({ name: 'jit-fetch', private: true, packageManager: 'pnpm@10.33.0' });
    host.splice(0, 1);
    expect(host[0].Lock).not.toContain('patchedDependencies'); expect(host[0].Lock).not.toContain('patch_hash'); expect(host[0].Lock).toContain('version: 2.0.0-beta.3(graphql@16.12.0)');
    const install = calls[0]; expect(install.Command.join(' ')).toContain('pnpm install --offline --frozen-lockfile --ignore-scripts');
    expect(install.Mounts.find((m) => m.Container === '/work')?.Mode).toBe('rw'); expect(install.Mounts.find((m) => m.Container === '/pnpm-store')).toEqual({ Host: join(work, 'store'), Container: '/pnpm-store', Mode: 'rw' });
  });
  it('turns a failed host fetch into an InfrastructureError and never starts the sandbox', async () => {
    const { target, calls } = prepWorld(async (_f, a) => { if (a[0] === '--version') return '10.33.0'; throw new Error('ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED'); });
    await expect(target.Prepare({ Kind: 'Head', SHA: 'h' })).rejects.toBeInstanceOf(InfrastructureError);
    expect(calls).toHaveLength(0);
  });
  it('refuses to fetch when the host pnpm in the fetch folder is not the pinned version the image uses', async () => {
    const host: string[][] = [];
    const { target, calls } = prepWorld(async (_f, a) => { host.push(a); return '11.24.0\n'; });
    const err = await target.Prepare({ Kind: 'Head', SHA: 'h' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(InfrastructureError);
    expect((err as Error).message).toContain('11.24.0'); expect((err as Error).message).toContain('10.33.0');
    expect(host).toEqual([['--version']]); expect(calls).toHaveLength(0);
  });
});

describe('VitestCatchTarget.BuildPackages', () => {
  it('builds with --summarize and keeps the turbo run summary per revision', async () => {
    const work = mkdtempSync(join(tmpdir(), 'jit-build-')); const head = join(work, 'head');
    const { target, calls } = fakeTarget(() => { mkdirSync(join(head, '.turbo/runs'), { recursive: true }); writeFileSync(join(head, '.turbo/runs/abc.json'), '{"tasks":[]}'); return { Stdout: '', ExitCode: 0 }; });
    (target as never as { o: object }).o = { ...(target as never as { o: object }).o, WorkRoot: work } as never;
    await target.BuildPackages({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: head }, ['@memberjunction/core']);
    expect(calls[0].Command.join(' ')).toContain('--summarize');
    expect(readdirSync(join(work, 'turbo-summaries', 'head'))).toEqual(['abc.json']);
  });
});

describe('VitestCatchTarget.TypeCheck', () => {
  it('runs tsc --noEmit on the package with the jit file included and reports the error text per test', async () => {
    const { target, calls } = fakeTarget(() => ({ Stdout: `src/__tests__/jit/${ID1}.jit.test.ts(3,5): error TS2339: Property 'x' does not exist`, ExitCode: 2 }));
    const out = await target.TypeCheck({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: '/work/head' }, [test(ID1)]);
    expect(calls[0].Command.join(' ')).toContain('tsc --noEmit');
    expect(out.get(ID1)).toContain('TS2339');
  });
});

describe('CountCoveredChangedLines', () => {
  it('counts only the changed lines inside a statement that ran', () => {
    const cov = { '/work/packages/MJCore/src/a.ts': { statementMap: { '0': { start: { line: 3 }, end: { line: 4 } }, '1': { start: { line: 8 }, end: { line: 8 } } }, s: { '0': 2, '1': 0 } } };
    expect(CountCoveredChangedLines(JSON.stringify(cov), { 'packages/MJCore/src/a.ts': [4, 8, 20] }, '/work')).toBe(1);
  });
});
