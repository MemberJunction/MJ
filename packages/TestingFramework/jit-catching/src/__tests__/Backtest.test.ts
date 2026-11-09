import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BacktestStep, DefaultCostOfRun, DefaultOrphanRunCost, type BacktestDeps, type BacktestOptions } from '../backtest/Backtest';
import { LedgerFile, LedgerID, type BacktestLedger } from '../backtest/Ledger';
import { RedactionCheck } from '../sandbox/Redaction';
import { DEFAULT_SETTINGS } from '../settings';
import { RunAllError, type RunAllOptions } from '../pipeline/Run';
import { RunDir } from '../pipeline/RunDir';
import type { Run } from '../types';
import { candidate, generation, ID_A, RUN_ID } from './helpers/pipelineFixtures';

const sha = (c: string) => c.repeat(40);
const parentOf = (s: string) => sha(String.fromCharCode(s.charCodeAt(0) + 1));
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
let stdout: string[];
let stderr: string[];
beforeEach(() => {
  stdout = []; stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((s: string | Uint8Array) => { stdout.push(String(s)); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => { stderr.push(String(s)); return true; });
});

/** Bug PRs 1 and 3 and clean PR 5 (plus `extraClean`) are Tuning; bug PR 7 is HeldOut. */
function writeCorpus(corpus: string, extraClean: number[] = []): void {
  writeFileSync(corpus, JSON.stringify({ Version: 1, Seed: 1,
    Bug: [
      { BugPR: 1, FixPR: 2, BugMergeSHA: sha('a'), FixMergeSHA: sha('9'), Description: 'd', Slice: 'Tuning' },
      { BugPR: 3, FixPR: 4, BugMergeSHA: sha('c'), FixMergeSHA: sha('9'), Description: 'd', Slice: 'Tuning' },
      { BugPR: 7, FixPR: 8, BugMergeSHA: sha('e'), FixMergeSHA: sha('9'), Description: 'd', Slice: 'HeldOut' },
    ],
    Clean: [{ PR: 5, MergeSHA: sha('0'), Slice: 'Tuning' }, ...extraClean.map((pr) => ({ PR: pr, MergeSHA: sha('0'), Slice: 'Tuning' }))] }));
}
function setup(extraClean: number[] = []): { root: string; corpus: string } {
  const root = mkdtempSync(join(tmpdir(), 'jit-backtest-')); dirs.push(root);
  const corpus = join(root, 'corpus.json');
  writeCorpus(corpus, extraClean);
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
    CostOfRun: vi.fn(async (): Promise<number | null> => 1.5),
    OrphanRunCost: vi.fn(async (): Promise<{ RunID: string; CostUSD: number }[]> => []),
    Redaction: new RedactionCheck(['super-secret-value-123']),
  };
}
const failing = (prs: number[]) => fakes(async (o) => { if (o.PR !== null && prs.includes(o.PR)) throw new Error('boom'); return { RunID: `run-${o.PR}`, Reported: [] }; });

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
    expect(l.Entries[1].Status).toBe('Assessed');
  });

  it('records the run ID and the recovered cost of a run that failed after Generate, and counts it toward MaxUsd', async () => {
    const { root, corpus } = setup();
    const d = fakes(async (o) => { throw new RunAllError(`run-${o.PR}`, 'Execute', new Error('install failed\n  at stack')); });
    d.CostOfRun = vi.fn(async (): Promise<number | null> => 2);
    const l = await BacktestStep(options(root, corpus, d, { MaxUsd: 1.5 }));
    expect(d.CostOfRun).toHaveBeenCalledWith('run-1');
    expect(l.Entries[0]).toEqual(expect.objectContaining({ Status: 'Failed', RunID: 'run-1', CostUSD: 2, Error: 'install failed' }));
    expect(l.Entries[1].Status).toBe('Pending');
  });

  it('records the usage cost of a Generate failure that left no stored run and no generation file', async () => {
    const { root, corpus } = setup();
    const usage = [{ Model: 'm', Role: 'Analyzer' as const, InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.25 }, { Model: 'g', Role: 'Generator' as const, InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0.5 }];
    const d = fakes(async (o) => { throw new RunAllError(`run-${o.PR}`, 'Generate', new Error('refusing to write generation.json'), usage); });
    d.CostOfRun = DefaultCostOfRun({ GetRun: async () => null }, root, new RedactionCheck([]));
    const l = await BacktestStep(options(root, corpus, d, { Only: [1] }));
    expect(l.Entries[0]).toEqual(expect.objectContaining({ Status: 'Failed', RunID: 'run-1', CostUSD: 0.75 }));
  });

  it('writes the entry with its StartedAt to the ledger file before the run starts', async () => {
    const { root, corpus } = setup();
    let onDisk: { Status: string; StartedAt: string | null } | null = null;
    const d = fakes(async (o) => {
      const e = new LedgerFile(root, LedgerID(corpus, 'Tuning', 'Bug', 'gen-model'), new RedactionCheck([])).Read().Entries[0];
      onDisk = { Status: e.Status, StartedAt: e.StartedAt };
      return { RunID: `run-${o.PR}`, Reported: [] };
    });
    await BacktestStep(options(root, corpus, d, { Only: [1] }));
    expect(onDisk).toEqual({ Status: 'Pending', StartedAt: expect.any(String) });
  });

  it('on resume adds the cost of an orphan run to a started Pending entry, names it on stderr and keeps the entry Pending', async () => {
    const { root, corpus } = setup();
    const file = new LedgerFile(root, LedgerID(corpus, 'Tuning', 'Bug', 'gen-model'), new RedactionCheck([]));
    const started = '2026-11-09T10:00:00.000Z';
    const ledger: BacktestLedger = { ID: LedgerID(corpus, 'Tuning', 'Bug', 'gen-model'), CorpusPath: corpus, Slice: 'Tuning', Set: 'Bug', Model: 'gen-model', CreatedAt: started, Entries: [
      { PR: 1, Set: 'Bug', BaseSHA: parentOf(sha('a')), HeadSHA: sha('a'), RunID: null, Status: 'Pending', Error: null, CostUSD: 1, StartedAt: started, EndedAt: null, Match: null },
      { PR: 3, Set: 'Bug', BaseSHA: parentOf(sha('c')), HeadSHA: sha('c'), RunID: 'run-3', Status: 'Assessed', Error: null, CostUSD: 1, StartedAt: started, EndedAt: started, Match: null },
    ] };
    file.Write(ledger);
    const d = fakes();
    d.OrphanRunCost = vi.fn(async () => [{ RunID: 'orphan-1', CostUSD: 4 }]);
    const l = await BacktestStep(options(root, corpus, d, { MaxUsd: 5 }));
    expect(d.OrphanRunCost).toHaveBeenCalledTimes(1);
    expect(d.OrphanRunCost).toHaveBeenCalledWith(1, sha('a'), new Set(['run-3']), started);
    expect(l.Entries[0]).toEqual(expect.objectContaining({ Status: 'Pending', CostUSD: 5 }));
    expect(d.calls).toEqual([]);
    expect(stderr.join('')).toMatch(/PR #1: recovered 4\.00 USD of run orphan-1/);
  });

  it('runs only the Pending entries of an existing ledger', async () => {
    const { root, corpus } = setup();
    const l = await BacktestStep(options(root, corpus, failing([1]), { Only: [1] }));
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

  it('runs only the PRs given in Only and names each Only PR it skips', async () => {
    const { root, corpus } = setup();
    await BacktestStep(options(root, corpus, failing([3]), { Set: 'Both', Only: [1, 3] }));
    const d = fakes();
    const l = await BacktestStep(options(root, corpus, d, { Set: 'Both', Only: [1, 3, 5, 99] }));
    expect(d.calls.map((c) => c.PR)).toEqual([5]);
    expect(l.Entries.map((e) => e.Status)).toEqual(['Assessed', 'Failed', 'Assessed']);
    const out = stdout.join('');
    expect(out).toMatch(/PR #1 skipped: Assessed/);
    expect(out).toMatch(/PR #3 skipped: Failed/);
    expect(out).toMatch(/PR #99 skipped: not in the ledger/);
  });

  it('stops after 3 Failed entries in a row and leaves the rest Pending', async () => {
    const { root, corpus } = setup([6, 9]);
    const d = failing([1, 3, 5, 6, 9]);
    const l = await BacktestStep(options(root, corpus, d, { Set: 'Both' }));
    expect(d.calls.map((c) => c.PR)).toEqual([1, 3, 5]);
    expect(l.Entries.map((e) => e.Status)).toEqual(['Failed', 'Failed', 'Failed', 'Pending', 'Pending']);
    expect(stderr.join('')).toMatch(/stopped after 3 failed runs in a row/);
  });

  it('runs a Failed entry again with RetryFailed and adds the new cost to the recorded one', async () => {
    const { root, corpus } = setup();
    const first = fakes(async () => { throw new RunAllError('run-old', 'Execute', new Error('install failed')); });
    first.CostOfRun = vi.fn(async (): Promise<number | null> => 2);
    const failed = await BacktestStep(options(root, corpus, first, { Only: [1] }));
    expect(failed.Entries[0]).toEqual(expect.objectContaining({ Status: 'Failed', CostUSD: 2 }));
    const d = fakes();
    const l = await BacktestStep(options(root, corpus, d, { Only: [1], RetryFailed: true }));
    expect(d.calls.map((c) => c.PR)).toEqual([1]);
    expect(l.Entries[0]).toEqual(expect.objectContaining({ Status: 'Assessed', RunID: 'run-1', Error: null, CostUSD: 3.5 }));
  });

  it('refuses to resume a ledger made for another model and leaves the file unchanged', async () => {
    const { root, corpus } = setup();
    await BacktestStep(options(root, corpus, fakes(), { Model: 'gen.model', Only: [1] }));
    const file = new LedgerFile(root, LedgerID(corpus, 'Tuning', 'Bug', 'gen.model'), new RedactionCheck([]));
    const before = readFileSync(file.Path, 'utf8');
    const d = fakes();
    await expect(BacktestStep(options(root, corpus, d, { Model: 'gen_model' }))).rejects.toThrow(/Model/);
    expect(d.calls).toEqual([]);
    expect(readFileSync(file.Path, 'utf8')).toBe(before);
  });

  it('appends a Pending entry for a PR added to the corpus and keeps the Assessed entries', async () => {
    const { root, corpus } = setup();
    await BacktestStep(options(root, corpus, fakes(), { Set: 'Clean' }));
    writeCorpus(corpus, [6]);
    const d = fakes();
    const l = await BacktestStep(options(root, corpus, d, { Set: 'Clean', MaxUsd: 1.5 }));
    expect(l.Entries.map((e) => [e.PR, e.Status, e.RunID])).toEqual([[5, 'Assessed', 'run-5'], [6, 'Pending', null]]);
    expect(l.Entries[1]).toEqual(expect.objectContaining({ BaseSHA: parentOf(sha('0')), HeadSHA: sha('0') }));
  });

  it('names the PR when the first parent of its landing commit cannot be found', async () => {
    const { root, corpus } = setup();
    const d = fakes();
    d.Repo.FirstParent = vi.fn(async (s: string) => { if (s === sha('c')) throw new Error('unknown revision'); return parentOf(s); });
    await expect(BacktestStep(options(root, corpus, d))).rejects.toThrow(/PR #3/);
  });
});

describe('DefaultOrphanRunCost', () => {
  it('sums the generation costs of the Backtest runs of the PR and head that the ledger does not know and that started at or after the entry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-orphan-')); dirs.push(root);
    const write = (id: string, over: Partial<Run>) => {
      const dir = new RunDir(root, id, new RedactionCheck([]));
      const gen = generation(join(dir.Path, 'work', 'base'), [candidate(ID_A)]);
      gen.Run = { ...storedRun(id, [1, 0.5]), PRNumber: 1, HeadSHA: sha('a'), StartedAt: '2026-11-09T10:00:01.000Z', ...over };
      dir.WriteGeneration(gen);
    };
    write('orphan', {});
    write('known', {});
    write('other-pr', { PRNumber: 2 });
    write('other-head', { HeadSHA: sha('b') });
    write('local', { Trigger: 'Local' });
    write('older', { StartedAt: '2026-11-09T09:00:00.000Z' });
    const orphans = DefaultOrphanRunCost(root, new RedactionCheck([]));
    expect(await orphans(1, sha('a'), new Set(['known']), '2026-11-09T10:00:00.000Z')).toEqual([{ RunID: 'orphan', CostUSD: 1.5 }]);
  });
});

describe('DefaultCostOfRun', () => {
  it('sums the stored run costs, or the generation file costs when the store has no run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jit-cost-')); dirs.push(root);
    const store = { GetRun: vi.fn(async (id: string) => (id === 'stored' ? storedRun(id, [1, 0.25]) : null)) };
    const dir = new RunDir(root, RUN_ID, new RedactionCheck([]));
    const gen = generation(join(dir.Path, 'work', 'base'), [candidate(ID_A)]);
    gen.Run.TokensByModel = storedRun(RUN_ID, [0.5, 0.75]).TokensByModel;
    dir.WriteGeneration(gen);
    const cost = DefaultCostOfRun(store, root, new RedactionCheck([]));
    expect(await cost('stored')).toBe(1.25);
    expect(await cost(RUN_ID)).toBe(1.25);
    expect(await cost('missing')).toBeNull();
  });
});
