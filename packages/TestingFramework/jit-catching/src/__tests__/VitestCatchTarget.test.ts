import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CountCoveredChangedLines, HostEnv, InfrastructureError, VitestCatchTarget } from '../target/VitestCatchTarget';
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
const JIT = 'packages/MJCore/src/__tests__/jit';
/** A worktree root on disk with a real jit folder and real node_modules folders for packages/MJCore. */
function jitRoot(): string {
  const r = mkdtempSync(join(tmpdir(), 'jit-root-')); mkdirSync(join(r, JIT), { recursive: true });
  mkdirSync(join(r, 'packages/MJCore/node_modules')); mkdirSync(join(r, 'node_modules')); return r;
}

describe('VitestCatchTarget.Run', () => {
  it('runs each package once per repeat with the fixed seed and the custom reporter, in the sandbox, and maps results', async () => {
    const jit = { Tests: [{ File: `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`, Name: 't', State: 'passed', DurationMs: 1, Errors: [] }], ModuleErrors: [] };
    const { target, calls } = fakeTarget(() => ({ Stdout: `JIT_REPORT ${JSON.stringify(jit)}\n`, ExitCode: 0 }));
    const results = await target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, [test(ID1)], 3);
    expect(calls).toHaveLength(3);
    const cmd = calls[0].Command.join(' ');
    expect(cmd).toContain('vitest run'); expect(cmd).toContain('--reporter=/jit-reporter/jit-reporter.mjs'); expect(cmd).not.toContain('--reporter=json');
    expect(cmd).toContain('--sequence.seed=1'); expect(cmd).toContain(`src/__tests__/jit/${ID1}.jit.test.ts`);
    expect(calls[0].Env).toMatchObject({ TZ: 'UTC' });
    expect(calls[0].Mounts.find((m) => m.Container === '/work')?.Mode).toBe('ro');
    expect(calls[0].Mounts.find((m) => m.Container === '/jit-reporter')?.Mode).toBe('ro');
    expect(results.map((r) => [r.RunIndex, r.Status])).toEqual([[0, 'Pass'], [1, 'Pass'], [2, 'Pass']]);
  });
  it('removes a symlink that a test planted in the jit folder after the run', async () => {
    const root = jitRoot(); const outside = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'secret'); writeFileSync(outside, 'SECRET');
    const { target, calls } = fakeTarget(() => { if (calls.length === 1) symlinkSync(outside, join(root, JIT, 'helper.ts')); return { Stdout: '', ExitCode: 1 }; });
    await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: root }, [test(ID1)], 1);
    expect(readdirSync(join(root, JIT))).toEqual([]);
    expect(readFileSync(outside, 'utf8')).toBe('SECRET');
  });
  it('runs a repeat once more with --reporter=json when the custom reporter printed no JIT_REPORT line', async () => {
    const json = { testResults: [{ name: `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`, status: 'passed', assertionResults: [{ fullName: 't', status: 'passed', duration: 1, failureMessages: [] }] }] };
    const { target, calls } = fakeTarget((o) => ({ Stdout: o.Command.join(' ').includes('--reporter=json') ? JSON.stringify(json) : 'Error: Failed to load custom Reporter', ExitCode: 1 }));
    const results = await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: jitRoot() }, [test(ID1)], 1);
    expect(calls).toHaveLength(2); expect(calls[1].Command.join(' ')).toContain('--reporter=json');
    expect(results.map((r) => r.Status)).toEqual(['Pass']);
  });
  it('turns a sandbox timeout into Timeout results for every test in that package', async () => {
    const { target } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    vi.spyOn((target as never as { sandbox: Sandbox }).sandbox, 'Run').mockResolvedValue({ ExitCode: null, TimedOut: true, Stdout: '', Stderr: '', DurationMs: 9 });
    const results = await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: jitRoot() }, [test(ID1)], 1);
    expect(results[0].Status).toBe('Timeout');
  });
  it('reads the JSON fallback report from an --outputFile in the jit folder, so test chatter on stdout cannot confuse it', async () => {
    const { target, calls } = fakeTarget((o) => ({ Stdout: o.Command.join(' ').includes('--reporter=json') ? '{"testResults":[]}' : 'no reporter', ExitCode: 1 }));
    await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: jitRoot() }, [test(ID1)], 1);
    const cmd = calls[1].Command.join(' ');
    expect(cmd).toMatch(/--outputFile='?\/work\/packages\/MJCore\/src\/__tests__\/jit\/[^ ]+\.json/);
    expect(cmd).toMatch(/--reporter=json --outputFile=\S+ >\/dev\/null 2>&1; cat /);
  });
  it('puts the sandbox exit code and stderr in the RunnerError when neither reporter produced a report', async () => {
    const { target } = fakeTarget(() => ({ Stdout: '', ExitCode: 1 }));
    vi.spyOn((target as never as { sandbox: Sandbox }).sandbox, 'Run').mockResolvedValue({ ExitCode: 1, TimedOut: false, Stdout: '', Stderr: "Error: Cannot find module 'x'", DurationMs: 5 });
    const results = await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: jitRoot() }, [test(ID1)], 1);
    expect(results[0].Status).toBe('RunnerError');
    expect(results[0].Failure?.Message).toContain('exit 1'); expect(results[0].Failure?.Message).toContain('Cannot find module');
  });
  it('maps a test file whose tests were all skipped or todo to RunnerError, not Pass', async () => {
    const file = `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`;
    const jit = { Tests: [{ File: file, Name: 'a', State: 'skipped', DurationMs: 0, Errors: [] }, { File: file, Name: 'b', State: 'pending', DurationMs: 0, Errors: [] }], ModuleErrors: [] };
    const { target } = fakeTarget(() => ({ Stdout: `JIT_REPORT ${JSON.stringify(jit)}\n`, ExitCode: 0 }));
    const results = await target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, [test(ID1)], 1);
    expect(results.map((r) => r.Status)).toEqual(['RunnerError']);
  });
  it('maps a JSON-fallback file whose assertions were all skipped or todo to RunnerError, not Pass', async () => {
    const json = { testResults: [{ name: `/work/packages/MJCore/src/__tests__/jit/${ID1}.jit.test.ts`, status: 'passed', assertionResults: [{ fullName: 't', status: 'todo', duration: 0, failureMessages: [] }] }] };
    const { target } = fakeTarget((o) => ({ Stdout: o.Command.join(' ').includes('--reporter=json') ? JSON.stringify(json) : '', ExitCode: 0 }));
    const results = await target.Run({ Ref: { Kind: 'Base', SHA: 'b' }, RootDir: jitRoot() }, [test(ID1)], 1);
    expect(results.map((r) => r.Status)).toEqual(['RunnerError']);
  });
});

describe('VitestCatchTarget.Prepare', () => {
  const LOCK = 'lockfileVersion: 9.0\n\npatchedDependencies:\n  type-graphql@2.0.0-beta.3:\n    hash: abc123\n    path: patches/type-graphql@2.0.0-beta.3.patch\n\nimporters:\n  .:\n    dependencies:\n      type-graphql:\n        version: 2.0.0-beta.3(patch_hash=abc123)(graphql@16.12.0)\n';
  function prepWorld(hostRunner: (f: string, a: string[], cwd: string) => Promise<string>, onRun: (o: SandboxRunOptions) => { Stdout: string; ExitCode: number } = () => ({ Stdout: '', ExitCode: 0 })) {
    const { target, calls } = fakeTarget(onRun);
    const work = mkdtempSync(join(tmpdir(), 'jit-prep-'));
    const shown: string[][] = [];
    (target as never as { o: object }).o = { ...(target as never as { o: object }).o, WorkRoot: work, StoreDir: join(work, 'store'), HostRunner: hostRunner,
      Repo: { AddWorktree: async () => { mkdirSync(join(work, 'head', 'patches'), { recursive: true }); writeFileSync(join(work, 'head', 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n# WORKTREE COPY\n'); writeFileSync(join(work, 'head', '.pnpmfile.cjs'), 'bad'); writeFileSync(join(work, 'head', 'patches', 'type-graphql@2.0.0-beta.3.patch'), 'diff'); },
        Show: async (sha: string, path: string) => { shown.push([sha, path]); return LOCK; }, RemoveWorktree: async () => {} } } as never;
    return { target, calls, work, shown };
  }
  it('runs pnpm on the host only as `fetch`, in a folder holding just a lockfile copy without patch information, then installs offline in the sandbox with the worktree and the run store mounted rw', async () => {
    const host: { File: string; Args: string[]; Cwd: string; Files: string[]; Lock: string }[] = [];
    const { target, calls, work } = prepWorld(async (File, Args, Cwd) => { const Files = readdirSync(Cwd).sort(); host.push({ File, Args, Cwd, Files, Lock: Files.includes('pnpm-lock.yaml') ? readFileSync(join(Cwd, 'pnpm-lock.yaml'), 'utf8') : '' }); return Args[0] === '--version' ? '10.33.0\n' : ''; });
    await target.Prepare({ Kind: 'Head', SHA: 'h' });
    expect(host.map((h) => [h.File, ...h.Args])).toEqual([['pnpm', '--version'], ['pnpm', 'fetch', '--store-dir', join(work, 'store')]]);
    expect(host[1].Cwd).not.toBe(join(work, 'head')); expect(host[1].Files).toEqual(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);
    expect(host[0].Cwd).not.toBe(host[1].Cwd); expect(host[0].Files).toEqual(['package.json']);
    expect(JSON.parse(readFileSync(join(host[0].Cwd, 'package.json'), 'utf8'))).toMatchObject({ packageManager: 'pnpm@10.33.0' });
    expect(readFileSync(join(host[1].Cwd, 'pnpm-workspace.yaml'), 'utf8')).toBe('supportedArchitectures:\n  os: [current, linux]\n  cpu: [current, x64, arm64]\n  libc: [current, glibc]\n');
    expect(JSON.parse(readFileSync(join(host[1].Cwd, 'package.json'), 'utf8'))).toEqual({ name: 'jit-fetch', private: true, packageManager: 'pnpm@10.33.0' });
    host.splice(0, 1);
    expect(host[0].Lock).not.toContain('patchedDependencies'); expect(host[0].Lock).not.toContain('patch_hash'); expect(host[0].Lock).toContain('version: 2.0.0-beta.3(graphql@16.12.0)');
    const install = calls[0]; expect(install.Command.join(' ')).toContain('pnpm install --offline --frozen-lockfile --ignore-scripts');
    expect(install.Mounts.find((m) => m.Container === '/work')?.Mode).toBe('rw'); expect(install.Mounts.find((m) => m.Container === '/pnpm-store')).toEqual({ Host: join(work, 'store'), Container: '/pnpm-store', Mode: 'rw' });
  });
  it('gives host pnpm only PATH, HOME, TMPDIR and CI, never a key', () => {
    expect(HostEnv({ PATH: '/bin', HOME: '/h', TMPDIR: '/t', ANTHROPIC_API_KEY: 'k1', OPENAI_API_KEY: 'k2', GITHUB_TOKEN: 'k3', NPM_CONFIG_X: 'y' })).toEqual({ PATH: '/bin', HOME: '/h', TMPDIR: '/t', CI: '1' });
    expect(HostEnv({ PATH: '/bin', HOME: '/h' })).toEqual({ PATH: '/bin', HOME: '/h', CI: '1' });
  });
  it('reads the lockfile from git (the blob), never from the worktree, where it could be a symlink', async () => {
    const locks: string[] = [];
    const { target, shown } = prepWorld(async (_f, a, cwd) => { if (a[0] === 'fetch') locks.push(readFileSync(join(cwd, 'pnpm-lock.yaml'), 'utf8')); return a[0] === '--version' ? '10.33.0' : ''; });
    await target.Prepare({ Kind: 'Head', SHA: 'h' });
    expect(shown).toEqual([['h', 'pnpm-lock.yaml']]);
    expect(locks[0]).not.toContain('WORKTREE COPY'); expect(locks[0]).toContain('version: 2.0.0-beta.3(graphql@16.12.0)');
  });
  it('turns a failed host fetch into an InfrastructureError and never starts the sandbox', async () => {
    const { target, calls } = prepWorld(async (_f, a) => { if (a[0] === '--version') return '10.33.0'; throw new Error('ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED'); });
    await expect(target.Prepare({ Kind: 'Head', SHA: 'h' })).rejects.toBeInstanceOf(InfrastructureError);
    expect(calls).toHaveLength(0);
  });
  it('reads the pnpm version from the last non-empty line, so a self-switch progress line is not a mismatch', async () => {
    const { target } = prepWorld(async (_f, a) => (a[0] === '--version' ? 'Progress: resolved 1, reused 0, downloaded 1, added 1, done\n10.33.0\n\n' : ''));
    await expect(target.Prepare({ Kind: 'Head', SHA: 'h' })).resolves.toMatchObject({ Ref: { Kind: 'Head', SHA: 'h' } });
  });
  it('redacts token-shaped text in a host pnpm error before it goes into the InfrastructureError', async () => {
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const { target } = prepWorld(async (_f, a) => { if (a[0] === '--version') return '10.33.0'; throw new Error(`GET https://registry.example/x failed with ${token}`); });
    const err = await target.Prepare({ Kind: 'Head', SHA: 'h' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(InfrastructureError); expect((err as Error).message).not.toContain(token);
  });
  it('redacts token-shaped text in the sandbox install output before it goes into the InfrastructureError', async () => {
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const { target } = prepWorld(async (_f, a) => (a[0] === '--version' ? '10.33.0' : ''), () => ({ Stdout: `ERR fetching with ${token}`, ExitCode: 1 }));
    const err = await target.Prepare({ Kind: 'Head', SHA: 'h' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(InfrastructureError); expect((err as Error).message).toContain('install failed on Head'); expect((err as Error).message).not.toContain(token);
  });
  it('redacts token-shaped text in the build output before it goes into the build error', async () => {
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const { target } = fakeTarget(() => ({ Stdout: `turbo failed with ${token}`, ExitCode: 1 }));
    const err = await target.BuildPackages({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, ['@memberjunction/core']).catch((e: Error) => e);
    expect((err as Error).message).toContain('build failed on Head'); expect((err as Error).message).not.toContain(token);
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
  it('copies only regular summary files and skips a symlinked entry', async () => {
    const work = mkdtempSync(join(tmpdir(), 'jit-build-')); const head = join(work, 'head'); const secret = join(mkdtempSync(join(tmpdir(), 'jit-outside-')), 'host.json');
    writeFileSync(secret, '{"host":true}');
    const { target } = fakeTarget(() => { mkdirSync(join(head, '.turbo/runs'), { recursive: true }); writeFileSync(join(head, '.turbo/runs/abc.json'), '{"tasks":[]}'); symlinkSync(secret, join(head, '.turbo/runs/evil.json')); return { Stdout: '', ExitCode: 0 }; });
    (target as never as { o: object }).o = { ...(target as never as { o: object }).o, WorkRoot: work } as never;
    await target.BuildPackages({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: head }, ['@memberjunction/core']);
    expect(readdirSync(join(work, 'turbo-summaries', 'head'))).toEqual(['abc.json']);
  });
  it('copies nothing when the runs folder itself is a symlink', async () => {
    const work = mkdtempSync(join(tmpdir(), 'jit-build-')); const head = join(work, 'head'); const outside = mkdtempSync(join(tmpdir(), 'jit-outside-'));
    writeFileSync(join(outside, 'host.json'), '{}');
    const { target } = fakeTarget(() => { mkdirSync(join(head, '.turbo'), { recursive: true }); symlinkSync(outside, join(head, '.turbo/runs')); return { Stdout: '', ExitCode: 0 }; });
    (target as never as { o: object }).o = { ...(target as never as { o: object }).o, WorkRoot: work } as never;
    await target.BuildPackages({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: head }, ['@memberjunction/core']);
    expect(existsSync(join(work, 'turbo-summaries', 'head', 'host.json'))).toBe(false);
  });
});

describe('VitestCatchTarget.TypeCheck', () => {
  it('runs tsc --noEmit on the package with the jit file included and reports the error text per test', async () => {
    const { target, calls } = fakeTarget(() => ({ Stdout: `src/__tests__/jit/${ID1}.jit.test.ts(3,5): error TS2339: Property 'x' does not exist`, ExitCode: 2 }));
    const out = await target.TypeCheck({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, [test(ID1)]);
    expect(calls[0].Command.join(' ')).toContain('tsc --noEmit');
    expect(out.get(ID1)).toContain('TS2339');
  });
  it('reports a tsc failure with no per-file error as a type-check error for every test, with exit code and output', async () => {
    const { target } = fakeTarget(() => ({ Stdout: "error TS5058: The specified path does not exist: 'src/__tests__/jit/tsconfig.jit.json'.", ExitCode: 1 }));
    const out = await target.TypeCheck({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, [test(ID1)]);
    expect(out.get(ID1)).toContain('exit 1'); expect(out.get(ID1)).toContain('TS5058');
  });
  it('turns off tsc pretty output so colour codes cannot hide the per-file error lines', async () => {
    const { target, calls } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await target.TypeCheck({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, [test(ID1)]);
    expect(calls[0].Command.join(' ')).toContain('--pretty false');
  });
});

describe('VitestCatchTarget path safety', () => {
  it('refuses to write tests when the jit folder is a symlink, and writes nothing outside the worktree', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-root-')); const outside = mkdtempSync(join(tmpdir(), 'jit-outside-'));
    mkdirSync(join(root, 'packages/MJCore/src/__tests__'), { recursive: true }); symlinkSync(outside, join(root, JIT));
    const { target } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await expect(target.WriteTests({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: root }, [test(ID1)])).rejects.toThrow(/symlink/);
    expect(readdirSync(outside)).toEqual([]);
  });
  it('refuses to write a test whose target file is a symlink, and leaves the link target unchanged', async () => {
    const root = jitRoot(); const outside = join(mkdtempSync(join(tmpdir(), 'jit-outside-')), 'victim.txt');
    writeFileSync(outside, 'keep'); symlinkSync(outside, join(root, JIT, `${ID1}.jit.test.ts`));
    const { target } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await expect(target.WriteTests({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: root }, [test(ID1)])).rejects.toThrow(/symlink/);
    expect(readFileSync(outside, 'utf8')).toBe('keep');
  });
  it('writes a test into a real jit folder it creates inside the worktree', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-root-'));
    const { target } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await target.WriteTests({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: root }, [test(ID1)]);
    expect(readFileSync(join(root, JIT, `${ID1}.jit.test.ts`), 'utf8')).toBe('x');
  });
  it('refuses to create a tmpfs mount point through a symlinked node_modules, and creates nothing outside the worktree', async () => {
    const root = jitRoot(); const outside = mkdtempSync(join(tmpdir(), 'jit-outside-'));
    rmSync(join(root, 'packages/MJCore/node_modules'), { recursive: true }); symlinkSync(outside, join(root, 'packages/MJCore/node_modules'));
    const { target, calls } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await expect(target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: root }, [test(ID1)], 1)).rejects.toThrow(/symlink/);
    expect(calls).toHaveLength(0); expect(readdirSync(outside)).toEqual([]);
  });
  it('refuses to mount a symlinked jit folder read-write for a run, and starts no container', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-root-')); const outside = mkdtempSync(join(tmpdir(), 'jit-outside-'));
    mkdirSync(join(root, 'packages/MJCore/src/__tests__'), { recursive: true }); symlinkSync(outside, join(root, JIT));
    const { target, calls } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await expect(target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: root }, [test(ID1)], 1)).rejects.toThrow(/symlink/);
    expect(calls).toHaveLength(0); expect(existsSync(join(outside, 'x'))).toBe(false);
  });
});

describe('VitestCatchTarget FilePath checks', () => {
  const bad = (): CandidateTest => ({ ...test(ID1), FilePath: `packages/MJCore/src/__tests__/jit/../../../../../evil/${ID1}.jit.test.ts` });
  it('refuses a FilePath with .. segments before it writes anything', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-root-'));
    const { target } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await expect(target.WriteTests({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: root }, [bad()])).rejects.toThrow(/FilePath/);
    expect(readdirSync(root)).toEqual([]);
  });
  it('refuses a FilePath that is not <package>/src/__tests__/jit/<ID>.jit.test.ts before it runs anything', async () => {
    const { target, calls } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await expect(target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, [{ ...test(ID1), FilePath: `packages/MJCore/src/__tests__/jit/other.jit.test.ts` }], 1)).rejects.toThrow(/FilePath/);
    expect(calls).toHaveLength(0);
  });
  it('quotes the package folder and file names it passes to the shell', async () => {
    const { target, calls } = fakeTarget(() => ({ Stdout: '', ExitCode: 0 }));
    await target.Run({ Ref: { Kind: 'Head', SHA: 'h' }, RootDir: jitRoot() }, [test(ID1)], 1);
    const cmd = calls[0].Command.join(' ');
    expect(cmd).toContain(`cd '/work/packages/MJCore'`); expect(cmd).toContain(`'src/__tests__/jit/${ID1}.jit.test.ts'`);
  });
});

describe('CountCoveredChangedLines', () => {
  it('counts only the changed lines inside a statement that ran', () => {
    const cov = { '/work/packages/MJCore/src/a.ts': { statementMap: { '0': { start: { line: 3 }, end: { line: 4 } }, '1': { start: { line: 8 }, end: { line: 8 } } }, s: { '0': 2, '1': 0 } } };
    expect(CountCoveredChangedLines(JSON.stringify(cov), { 'packages/MJCore/src/a.ts': [4, 8, 20] }, '/work')).toBe(1);
  });
});
