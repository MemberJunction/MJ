import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BacktestStep, type BacktestDeps, type BacktestOptions } from '../backtest/Backtest';
import { LedgerFile } from '../backtest/Ledger';
import { RedactionCheck } from '../sandbox/Redaction';
import { DEFAULT_SETTINGS } from '../settings';
import type { RunAllOptions } from '../pipeline/Run';
import type { Run } from '../types';

const sha = (c: string) => c.repeat(40);
const parentOf = (s: string) => sha(String.fromCharCode(s.charCodeAt(0) + 1));
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
let stdout: string[];
beforeEach(() => { stdout = []; vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { stdout.push(String(s)); return true; }); });

/** Bug PRs 1 and 3 and clean PR 5 are Tuning; bug PR 7 is HeldOut. */
function setup(): { root: string; corpus: string } {
  const root = mkdtempSync(join(tmpdir(), 'jit-backtest-')); dirs.push(root);
  const corpus = join(root, 'corpus.json');
  writeFileSync(corpus, JSON.stringify({ Version: 1, Seed: 1,
    Bug: [
      { BugPR: 1, FixPR: 2, BugMergeSHA: sha('a'), FixMergeSHA: sha('9'), Description: 'd', Slice: 'Tuning' },
      { BugPR: 3, FixPR: 4, BugMergeSHA: sha('c'), FixMergeSHA: sha('9'), Description: 'd', Slice: 'Tuning' },
      { BugPR: 7, FixPR: 8, BugMergeSHA: sha('e'), FixMergeSHA: sha('9'), Description: 'd', Slice: 'HeldOut' },
    ],
    Clean: [{ PR: 5, MergeSHA: sha('0'), Slice: 'Tuning' }] }));
  return { root, corpus };
}

function storedRun(id: string, costs: number[]): Run {
  return { ID: id, Trigger: 'Backtest', PRNumber: 1, BaseSHA: sha('a'), HeadSHA: sha('b'), Status: 'Assessed', GeneratorModel: 'm', RunnerMinutes: 0, StartedAt: '2026-11-09T10:00:00.000Z', EndedAt: null,
    TokensByModel: costs.map((c) => ({ Model: 'm', InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: c })) };
}

function fakes(runAll?: (o: RunAllOptions) => Promise<{ RunID: string; Reported: [] }>): BacktestDeps & { calls: RunAllOptions[] } {
  const calls: RunAllOptions[] = [];
  return {
    calls,
    RunAll: vi.fn(async (o: RunAllOptions) => { calls.push(o); return runAll ? runAll(o) : { RunID: `run-${o.PR}`, Reported: [] }; }),
    Repo: { FirstParent: vi.fn(async (s: string) => parentOf(s)), Fetch: vi.fn(async () => undefined) },
    Store: { GetRun: vi.fn(async (id: string) => storedRun(id, [1, 0.5])) },
    Redaction: new RedactionCheck(['super-secret-value-123']),
  };
}

function options(root: string, corpus: string, deps: BacktestDeps, over: Partial<BacktestOptions> = {}): BacktestOptions {
  return { CorpusPath: corpus, Slice: 'Tuning', Set: 'Bug', Model: 'gen-model', MaxUsd: 50, RepoRoot: root, Settings: DEFAULT_SETTINGS, StoreDir: join(root, 'store'), Deps: deps, ...over };
}

describe('BacktestStep', () => {
  it('creates a ledger with one entry per PR of the slice and set and runs each on its landing commit', async () => {
    const { root, corpus } = setup();
    const d = fakes();
    const l = await BacktestStep(options(root, corpus, d, { Set: 'Both' }));
    expect(l.Entries.map((e) => [e.PR, e.Set, e.Status])).toEqual([[1, 'Bug', 'Assessed'], [3, 'Bug', 'Assessed'], [5, 'Clean', 'Assessed']]);
    expect(d.Repo.Fetch).toHaveBeenCalledWith('next');
    expect(d.calls[0]).toEqual(expect.objectContaining({ PR: 1, BaseSHA: parentOf(sha('a')), HeadSHA: sha('a'), Trigger: 'Backtest', RepoRoot: root, StoreDir: join(root, 'store') }));
    expect(d.calls.every((c) => c.Settings.GeneratorModel === 'gen-model')).toBe(true);
    expect(l.Entries[0]).toEqual(expect.objectContaining({ RunID: 'run-1', CostUSD: 1.5, Error: null }));
    expect(new LedgerFile(root, l.ID, new RedactionCheck([])).Read()).toEqual(l);
    expect(stdout.join('')).toContain(`backtest ${l.ID}: PR #1 → run run-1 (1.50 USD, total 1.50)`);
  });

  it('marks an entry Failed with the redacted first line of the error and continues', async () => {
    const { root, corpus } = setup();
    vi.stubEnv('GITHUB_TOKEN', 'super-secret-value-123');
    const d = fakes(async (o) => { if (o.PR === 1) throw new Error('boom super-secret-value-123\n  at stack'); return { RunID: `run-${o.PR}`, Reported: [] }; });
    const l = await BacktestStep(options(root, corpus, d));
    expect(l.Entries[0].Status).toBe('Failed');
    expect(l.Entries[0].Error).toBe('boom [REDACTED]');
    expect(l.Entries[0].Error).not.toContain('super-secret-value-123');
    expect(l.Entries[0].Error).not.toContain('stack');
    expect(l.Entries[1].Status).toBe('Assessed');
  });

  it('runs only the Pending entries of an existing ledger', async () => {
    const { root, corpus } = setup();
    const first = fakes(async (o) => { if (o.PR === 1) throw new Error('boom'); return { RunID: `run-${o.PR}`, Reported: [] }; });
    const l = await BacktestStep(options(root, corpus, first, { Only: [1] }));
    expect(l.Entries.map((e) => e.Status)).toEqual(['Failed', 'Pending']);
    const second = fakes();
    const again = await BacktestStep(options(root, corpus, second));
    expect(second.calls.map((c) => c.PR)).toEqual([3]);
    expect(again.Entries.map((e) => e.Status)).toEqual(['Failed', 'Assessed']);
    const third = fakes();
    await BacktestStep(options(root, corpus, third));
    expect(third.calls).toEqual([]);
  });

  it('stops when the ledger cost reaches MaxUsd and leaves the rest Pending', async () => {
    const { root, corpus } = setup();
    const d = fakes();
    const l = await BacktestStep(options(root, corpus, d, { Set: 'Both', MaxUsd: 1.5 }));
    expect(d.calls.map((c) => c.PR)).toEqual([1]);
    expect(l.Entries.map((e) => e.Status)).toEqual(['Assessed', 'Pending', 'Pending']);
    expect(stdout.join('')).toMatch(/1\.50 USD.*reached --max-usd 1\.5/);
  });

  it('runs only the PRs given in Only', async () => {
    const { root, corpus } = setup();
    const d = fakes();
    const l = await BacktestStep(options(root, corpus, d, { Set: 'Both', Only: [3, 5] }));
    expect(d.calls.map((c) => c.PR)).toEqual([3, 5]);
    expect(l.Entries.map((e) => e.Status)).toEqual(['Pending', 'Assessed', 'Assessed']);
  });
});
