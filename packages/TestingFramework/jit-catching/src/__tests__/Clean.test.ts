import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CleanRun, FinishedRunIDs } from '../pipeline/Clean';

const temps: string[] = [];
function temp(): string { const d = mkdtempSync(join(tmpdir(), 'jit-clean-')); temps.push(d); return d; }
afterEach(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true }); });

function runFolder(root: string, id: string, files: string[]): string {
  const p = join(root, '.jit-catch', 'runs', id); mkdirSync(p, { recursive: true });
  for (const f of files) writeFileSync(join(p, f), '{}');
  return p;
}

describe('CleanRun', () => {
  it('removes work, pnpm-store, scratch and match through git first and keeps generation.json and base-src', async () => {
    const root = temp(); const p = runFolder(root, 'r1', ['generation.json']);
    for (const d of ['work/base', 'work/head', 'pnpm-store', 'scratch', 'match/work/pnpm-store', 'base-src/packages/X']) mkdirSync(join(p, d), { recursive: true });
    const repo = { RemoveWorktree: vi.fn(async (_d: string) => undefined) };

    await CleanRun(root, 'r1', repo);

    expect(repo.RemoveWorktree.mock.calls.map((c) => c[0]).sort()).toEqual([join(p, 'work/base'), join(p, 'work/head')]);
    for (const d of ['work', 'pnpm-store', 'scratch', 'match']) expect(existsSync(join(p, d))).toBe(false);
    expect(existsSync(join(p, 'generation.json'))).toBe(true);
    expect(existsSync(join(p, 'base-src/packages/X'))).toBe(true);
  });

  it('rejects an invalid run ID', async () => {
    const repo = { RemoveWorktree: vi.fn(async (_d: string) => undefined) };
    await expect(CleanRun(temp(), '../x', repo)).rejects.toThrow(/run ID/);
    expect(repo.RemoveWorktree).not.toHaveBeenCalled();
  });
});

describe('FinishedRunIDs', () => {
  it('lists only runs with an assessment.json', () => {
    const root = temp();
    runFolder(root, 'done', ['generation.json', 'assessment.json']); runFolder(root, 'open', ['generation.json']);
    expect(FinishedRunIDs(root)).toEqual(['done']);
  });
});
