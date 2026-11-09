import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CleanupBase, RunAll, RunAllError } from '../pipeline/Run';
import { ExecuteStep } from '../pipeline/Execute';
import { DEFAULT_SETTINGS } from '../settings';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import { candidate, generation, ID_A, RUN_ID } from './helpers/pipelineFixtures';

vi.mock('../pipeline/Preflight', () => ({ PreflightEnv: vi.fn() }));
vi.mock('../pipeline/Generate', () => ({ GenerateStep: vi.fn(async () => ({ RunID: 'r-7' })) }));
vi.mock('../pipeline/Execute', () => ({ ExecuteStep: vi.fn(async () => undefined) }));

describe('RunAll', () => {
  const o = { PR: 7, RepoRoot: '/repo', Settings: DEFAULT_SETTINGS, StoreDir: '/store' };
  it('wraps a failure after Generate in a RunAllError that carries the run ID, the step and the cause', async () => {
    const cause = new Error('install failed');
    vi.mocked(ExecuteStep).mockRejectedValueOnce(cause);
    const e = await RunAll(o).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RunAllError);
    expect(e).toMatchObject({ RunID: 'r-7', Step: 'Execute', cause, message: 'install failed' });
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
