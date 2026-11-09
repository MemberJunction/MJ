import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CleanupBase, FinishRun } from '../pipeline/Run';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import type { PreparedRevision } from '../types';
import { candidate, generation, ID_A, PKG_DIR, RUN_ID } from './helpers/pipelineFixtures';

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
