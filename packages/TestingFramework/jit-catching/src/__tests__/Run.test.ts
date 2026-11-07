import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CleanupBase } from '../pipeline/Run';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import { candidate, generation, ID_A, RUN_ID } from './helpers/pipelineFixtures';

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
