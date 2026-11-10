import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CleanupBase, FinishRun, RunAll, RunAllError, type FinishTools } from '../pipeline/Run';
import { ExecuteStep } from '../pipeline/Execute';
import { GenerateError, GenerateStep } from '../pipeline/Generate';
import { DEFAULT_SETTINGS } from '../settings';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import type { PreparedRevision } from '../types';
import { candidate, generation, ID_A, PKG_DIR, RUN_ID } from './helpers/pipelineFixtures';

vi.mock('../pipeline/Preflight', () => ({ PreflightEnv: vi.fn() }));
vi.mock('../pipeline/Generate', async (importOriginal) => ({ ...(await importOriginal<typeof import('../pipeline/Generate')>()), GenerateStep: vi.fn(async () => ({ RunID: 'r-7' })) }));
vi.mock('../pipeline/Execute', () => ({ ExecuteStep: vi.fn(async () => undefined) }));
vi.mock('../pipeline/Assess', () => ({ AssessStep: vi.fn(async () => ({ Catches: [], Promotions: [] })) }));

describe('RunAll', () => {
  const o = { PR: 7, RepoRoot: '/repo', Settings: DEFAULT_SETTINGS, StoreDir: '/store' };
  it('wraps a failure after Generate in a RunAllError that carries the run ID, the step and the cause', async () => {
    const cause = new Error('install failed');
    vi.mocked(ExecuteStep).mockRejectedValueOnce(cause);
    const e = await RunAll(o).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RunAllError);
    expect(e).toMatchObject({ RunID: 'r-7', Step: 'Execute', cause, message: 'install failed' });
  });
  it('turns a GenerateError into a RunAllError of step Generate that carries the run ID, the usage and the cause', async () => {
    const cause = new Error('refusing to write generation.json');
    const usage = [{ Model: 'm', Role: 'Analyzer' as const, InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.25 }];
    vi.mocked(GenerateStep).mockRejectedValueOnce(new GenerateError('r-8', usage, cause));
    const e = await RunAll(o).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RunAllError);
    expect(e).toMatchObject({ RunID: 'r-8', Step: 'Generate', Usage: usage, cause });
  });
});

describe('RunAll finish', () => {
  it('returns the run when finishing it fails after Assess, and writes one redacted stderr line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-run-')); const dir = new RunDir(root, 'r-7', new RedactionCheck([]));
    const base = join(dir.Path, 'work', 'base'); mkdirSync(base, { recursive: true });
    dir.WriteGeneration(generation(base, [candidate(ID_A)]));
    const token = 'ghp_' + 'A1b2C3d4'.repeat(5);
    const target = { Cleanup: vi.fn(async () => { throw new Error(`worktree busy ${token}\n  at stack`); }), RemoveStore: vi.fn(async () => undefined) };
    const tools: FinishTools = { Target: target, PackageMap: { Get: () => null } };
    const stderr: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => { stderr.push(String(s)); return true; });
    try {
      await expect(RunAll({ PR: 7, RepoRoot: root, Settings: DEFAULT_SETTINGS, StoreDir: join(root, 'store'), FinishTools: () => tools })).resolves.toEqual({ RunID: 'r-7', Reported: [] });
      expect(target.Cleanup).toHaveBeenCalledTimes(1);
      expect(stderr.filter((l) => l.startsWith('finish run r-7: '))).toHaveLength(1);
      expect(stderr.join('')).not.toContain(token);
    } finally {
      spy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('CleanupBase', () => {
  it('never removes a recorded BaseRootDir outside the run folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-run-')); const dir = new RunDir(root, RUN_ID, new RedactionCheck([]));
    const outside = mkdtempSync(join(tmpdir(), 'jit-outside-')); writeFileSync(join(outside, 'keep.txt'), 'x');
    dir.WriteGeneration(generation(outside, [candidate(ID_A)]));
    const cleanup = vi.fn(async () => undefined);
    await expect(CleanupBase(dir, dir.ReadGeneration(), cleanup)).rejects.toThrow(/base worktree/);
    expect(cleanup).not.toHaveBeenCalled();
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true);
  });
  it('removes the base worktree inside the run folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-run-')); const dir = new RunDir(root, RUN_ID, new RedactionCheck([]));
    const base = join(dir.Path, 'work', 'base'); mkdirSync(base, { recursive: true });
    dir.WriteGeneration(generation(base, [candidate(ID_A)]));
    const cleanup = vi.fn(async () => undefined);
    await CleanupBase(dir, dir.ReadGeneration(), cleanup);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('FinishRun', () => {
  it('FinishRun snapshots the tested packages, records BaseSourceDir, removes the base worktree and the store', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-run-')); const dir = new RunDir(root, RUN_ID, new RedactionCheck([]));
    const base = join(dir.Path, 'work', 'base'); mkdirSync(join(base, PKG_DIR, 'src'), { recursive: true }); writeFileSync(join(base, PKG_DIR, 'src/svc.ts'), 'export {};\n');
    dir.WriteGeneration(generation(base, [candidate(ID_A)]));
    const calls: string[] = [];
    const target = { Cleanup: vi.fn(async (r: PreparedRevision) => { calls.push(`Cleanup ${r.RootDir}`); }), RemoveStore: vi.fn(async () => { calls.push('RemoveStore'); }) };

    await FinishRun(dir, target, [PKG_DIR]);

    const dest = join(dir.Path, 'base-src');
    expect(existsSync(join(dest, PKG_DIR, 'src/svc.ts'))).toBe(true);
    expect(dir.ReadGeneration().BaseSourceDir).toBe(dest);
    expect(calls).toEqual([`Cleanup ${base}`, 'RemoveStore']);
    rmSync(root, { recursive: true, force: true });
  });
});
