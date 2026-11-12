import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MatchStep, type MatchDeps } from '../backtest/Match';
import { LedgerFile, type BacktestLedger, type LedgerEntry, type MatchRecord } from '../backtest/Ledger';
import { RedactionCheck } from '../sandbox/Redaction';
import { InfrastructureError } from '../target/VitestCatchTarget';
import { RunDir } from '../pipeline/RunDir';
import { DEFAULT_SETTINGS } from '../settings';
import type { CandidateTest, Catch, ExecutionResult, PreparedRevision, RevisionRef } from '../types';
import { candidate, generation, ID_A, ID_B, ID_C, PKG, results } from './helpers/pipelineFixtures';

const sha = (c: string) => c.repeat(40);
const LEDGER_ID = 'corpus-Tuning-Bug-gen-model';
const RUN_1 = '20261109-100000-pr1-aaaaaaa';
const RUN_3 = '20261109-110000-pr3-ccccccc';
const CATCH_A = '11111111-1111-4111-8111-111111111111';
const CATCH_B = '22222222-2222-4222-8222-222222222222';
const CATCH_C = '33333333-3333-4333-8333-333333333333';
const redaction = new RedactionCheck([]);

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });
let stderr: string[];
beforeEach(() => {
  stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => { stderr.push(String(s)); return true; });
});

function aCatch(id: string, testID: string, over: Partial<Catch> = {}): Catch {
  return { ID: id, RunID: RUN_1, CandidateTestID: testID, Verdict: { Label: 'WeakCatch', Timeout: false, Reason: 'fails on head' }, DroppedByRule: null, Boosts: [],
    TPProb: 0.4, JudgeBuckets: [], Median: 'High', Rank: 1, Reported: false, CommentID: null, ...over };
}
/** A reported weak catch on A, an unreported weak catch on B and a dropped catch on C. */
const weakCatches = (): Catch[] => [aCatch(CATCH_A, ID_A, { Reported: true }), aCatch(CATCH_B, ID_B), aCatch(CATCH_C, ID_C, { DroppedByRule: 'ApiChanged' })];

function entry(pr: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return { PR: pr, Set: 'Bug', BaseSHA: sha('0'), HeadSHA: sha(pr === 1 ? 'a' : 'c'), RunID: pr === 1 ? RUN_1 : RUN_3, Status: 'Assessed', Error: null, CostUSD: 1,
    StartedAt: '2026-11-09T10:00:00.000Z', EndedAt: '2026-11-09T10:10:00.000Z', Match: null, ...over };
}

/** A repo root with a corpus (bug PRs 1 and 3, fixed by 2 and 4), a ledger with `entries` and run folders for both runs. */
function setup(entries: LedgerEntry[]): { root: string; corpus: string; file: LedgerFile } {
  const root = mkdtempSync(join(tmpdir(), 'jit-match-')); dirs.push(root);
  const corpus = join(root, 'corpus.json');
  writeFileSync(corpus, JSON.stringify({ Version: 1, Seed: 1, Clean: [], Bug: [
    { BugPR: 1, FixPR: 2, BugMergeSHA: sha('a'), FixMergeSHA: sha('f'), Description: 'd', Slice: 'Tuning' },
    { BugPR: 3, FixPR: 4, BugMergeSHA: sha('c'), FixMergeSHA: sha('d'), Description: 'd', Slice: 'Tuning' },
  ] }));
  const tests = [candidate(ID_A), candidate(ID_B), candidate(ID_C)];
  for (const runID of [RUN_1, RUN_3]) new RunDir(root, runID, redaction).WriteExecution({ RunID: runID, Tests: tests, Results: [], Coverage: [], TypeErrors: {} });
  const ledger: BacktestLedger = { ID: LEDGER_ID, CorpusPath: corpus, Slice: 'Tuning', Set: 'Bug', Model: 'gen-model', CreatedAt: '2026-11-09T09:00:00.000Z', Entries: entries };
  const file = new LedgerFile(root, LEDGER_ID, redaction);
  file.Write(ledger);
  return { root, corpus, file };
}

/** Fakes where each test passes on the fixed head the number of times `passes` gives (default: never). */
function fakes(o: { catches?: Catch[]; passes?: Record<string, number>; applies?: boolean; runFails?: (rev: PreparedRevision) => boolean } = {}) {
  const run = vi.fn(async (rev: PreparedRevision, tests: CandidateTest[], repeats: number): Promise<ExecutionResult[]> => {
    if (o.runFails?.(rev)) throw new Error('sandbox broke');
    return tests.flatMap((t) => results(t.ID, 'Head', false, repeats).map((r, i) => (i < (o.passes?.[t.ID] ?? 0) ? { ...r, Status: 'Pass' as const, Failure: null } : r)));
  });
  return {
    Target: {
      Prepare: vi.fn(async (r: RevisionRef): Promise<PreparedRevision> => ({ Ref: r, RootDir: `/work/head-${r.SHA.slice(0, 1)}` })),
      BuildPackages: vi.fn(async () => undefined),
      WriteTests: vi.fn(async (_rev: PreparedRevision, _tests: CandidateTest[]) => undefined),
      Run: run,
      Cleanup: vi.fn(async () => undefined),
    },
    Repo: {
      FirstParent: vi.fn(async (s: string) => sha(s === sha('f') ? 'e' : 'b')), Diff: vi.fn(async (base: string, head: string) => `diff ${base.slice(0, 1)}..${head.slice(0, 1)}\n`),
      CommitWithPatch: vi.fn(async (base: string, _patchFile: string, _scratchDir: string) => (o.applies === false ? null : fixedOf(base))),
    },
    Store: { ListCatches: vi.fn(async () => o.catches ?? weakCatches()) },
    Redaction: redaction,
  } satisfies MatchDeps;
}

async function match(root: string, corpus: string, deps: MatchDeps): Promise<BacktestLedger> {
  return MatchStep({ LedgerID: LEDGER_ID, CorpusPath: corpus, RepoRoot: root, Settings: DEFAULT_SETTINGS, StoreDir: join(root, 'store'), Deps: deps });
}

/** The fixed commit the fake repo builds on each head: head a → 7, head c → 8. */
const fixedOf = (head: string) => sha(head === sha('a') ? '7' : '8');

const record = (over: Partial<MatchRecord>): MatchRecord => ({ Status: 'Matched', ReportedMatched: false, Tests: {}, At: expect.any(String), ...over });

describe('MatchStep', () => {
  it('records NoCatch when the run has no weak, non-dropped catch, without preparing head', async () => {
    const { root, corpus, file } = setup([entry(1)]);
    const d = fakes({ catches: [aCatch(CATCH_C, ID_C, { DroppedByRule: 'ApiChanged' }), aCatch(CATCH_A, ID_A, { Verdict: { Label: 'PassesBoth', Timeout: false, Reason: '' } })] });
    const l = await match(root, corpus, d);
    expect(l.Entries[0].Match).toEqual(record({ Status: 'NoCatch' }));
    expect(d.Store.ListCatches).toHaveBeenCalledWith(RUN_1);
    expect(d.Target.Prepare).not.toHaveBeenCalled();
    expect(file.Read().Entries[0].Match?.Status).toBe('NoCatch');
  });

  it('tries the fix merge when the fix does not apply on head, and records Head FixMerge', async () => {
    const { root, corpus, file } = setup([entry(1)]);
    const d = fakes({ applies: false, passes: { [ID_A]: 3 } });
    const l = await match(root, corpus, d);
    expect(d.Repo.Diff).toHaveBeenCalledWith(sha('e'), sha('f'));
    const work = join(new RunDir(root, RUN_1, redaction).Path, 'match', 'work');
    expect(d.Repo.CommitWithPatch).toHaveBeenCalledWith(sha('a'), join(work, 'fix.patch'), join(work, 'fix'));
    expect(readFileSync(join(work, 'fix.patch'), 'utf8')).toBe('diff e..f\n');
    expect(d.Target.Prepare.mock.calls.map((c) => c[0])).toEqual([{ Kind: 'Head', SHA: sha('f') }]);
    expect(stderr.join('')).toContain(`match ${LEDGER_ID}: PR #1: the fix does not apply on head; trying the fix merge fffffff\n`);
    expect(l.Entries[0].Match).toEqual(record({ Status: 'Matched', ReportedMatched: true, Tests: { [ID_A]: true, [ID_B]: false }, Head: 'FixMerge' }));
    expect(d.Target.Cleanup).toHaveBeenCalledTimes(1);
    expect(file.Read().Entries[0].Match?.Head).toBe('FixMerge');
  });

  it('records PrepareFailed with Head FixMerge when the fix does not apply on head and the fix merge does not prepare', async () => {
    const { root, corpus } = setup([entry(1)]);
    const d = fakes({ applies: false });
    d.Target.Prepare.mockRejectedValueOnce(new InfrastructureError('install failed on Head: merge'));
    const l = await match(root, corpus, d);
    expect(l.Entries[0].Match).toEqual(record({ Status: 'PrepareFailed', Head: 'FixMerge', Error: 'install failed on Head: merge' }));
    expect(d.Target.Prepare.mock.calls.map((c) => c[0])).toEqual([{ Kind: 'Head', SHA: sha('f') }]);
    expect(d.Target.Run).not.toHaveBeenCalled();
  });

  it('records Matched with ReportedMatched and Head Patched when the reported catch passes every repeat on the patched head', async () => {
    const { root, corpus, file } = setup([entry(1)]);
    const d = fakes({ passes: { [ID_A]: 3 } });
    const l = await match(root, corpus, d);
    expect(l.Entries[0].Match).toEqual(record({ Status: 'Matched', ReportedMatched: true, Tests: { [ID_A]: true, [ID_B]: false }, Head: 'Patched' }));
    expect(d.Target.Prepare).toHaveBeenCalledWith({ Kind: 'Head', SHA: fixedOf(sha('a')) });
    expect(d.Target.BuildPackages).toHaveBeenCalledWith(expect.objectContaining({ RootDir: '/work/head-7' }), [PKG]);
    expect(d.Target.WriteTests.mock.calls[0]?.[1].map((t) => t.ID)).toEqual([ID_A, ID_B]);
    expect(d.Target.Run).toHaveBeenCalledWith(expect.objectContaining({ RootDir: '/work/head-7' }), expect.any(Array), DEFAULT_SETTINGS.Repeats);
    expect(d.Target.Cleanup).toHaveBeenCalledTimes(1);
    expect(file.Read().Entries[0].Match?.Status).toBe('Matched');
  });

  it('calls no repository method with the prepared head worktree once head is prepared', async () => {
    const { root, corpus } = setup([entry(1)]);
    const d = fakes({ passes: { [ID_A]: 3 } });
    const repoCalls: string[][] = [];
    let prepared: string | null = null;
    const track = (name: string, args: string[]) => { if (prepared !== null) repoCalls.push([name, ...args]); };
    const repo = {
      FirstParent: async (s: string) => { track('FirstParent', [s]); return d.Repo.FirstParent(s); },
      Diff: async (base: string, head: string) => { track('Diff', [base, head]); return d.Repo.Diff(base, head); },
      CommitWithPatch: async (base: string, patchFile: string, scratchDir: string) => { track('CommitWithPatch', [base, patchFile, scratchDir]); return d.Repo.CommitWithPatch(base, patchFile, scratchDir); },
      ApplyPatch: async (dir: string, patchFile: string) => { track('ApplyPatch', [dir, patchFile]); return true; },
    };
    const target = {
      ...d.Target,
      Prepare: async (r: RevisionRef): Promise<PreparedRevision> => { const p = await d.Target.Prepare(r); prepared = p.RootDir; return p; },
      ApplyPatch: async (rev: PreparedRevision, _patch: string) => repo.ApplyPatch(rev.RootDir, join(rev.RootDir, '..', 'fix.patch')),
    };
    await match(root, corpus, { ...d, Repo: repo, Target: target });
    expect(repoCalls.filter((c) => c.some((a) => prepared !== null && a.startsWith(prepared)))).toEqual([]);
    expect(prepared).toBe('/work/head-7');
  });

  it('records Matched without ReportedMatched when only an unreported catch passes', async () => {
    const { root, corpus } = setup([entry(1)]);
    const l = await match(root, corpus, fakes({ passes: { [ID_B]: 3 } }));
    expect(l.Entries[0].Match).toEqual(record({ Status: 'Matched', ReportedMatched: false, Tests: { [ID_A]: false, [ID_B]: true }, Head: 'Patched' }));
  });

  it('records NotMatched with Head Patched when no catch passes every repeat on the patched head', async () => {
    const { root, corpus } = setup([entry(1)]);
    const l = await match(root, corpus, fakes({ passes: { [ID_A]: 2 } }));
    expect(l.Entries[0].Match).toEqual(record({ Status: 'NotMatched', ReportedMatched: false, Tests: { [ID_A]: false, [ID_B]: false }, Head: 'Patched' }));
  });

  it('skips entries already matched, Clean entries and entries that are not Assessed', async () => {
    const done = { Status: 'NotMatched' as const, ReportedMatched: false, Tests: {}, At: '2026-11-09T11:00:00.000Z' };
    const { root, corpus } = setup([entry(1, { Match: done }), entry(3, { Status: 'Failed', Error: 'boom' }), entry(5, { Set: 'Clean' })]);
    const d = fakes();
    const l = await match(root, corpus, d);
    expect(l.Entries.map((e) => e.Match)).toEqual([done, null, null]);
    expect(d.Store.ListCatches).not.toHaveBeenCalled();
    expect(d.Target.Prepare).not.toHaveBeenCalled();
    expect(stderr.join('')).toMatch(/#3/);
    expect(stderr.join('')).not.toMatch(/#1\b/);
  });

  it('cleans head up and keeps the entries already written when a run throws', async () => {
    const { root, corpus, file } = setup([entry(1), entry(3)]);
    const d = fakes({ passes: { [ID_A]: 3 }, runFails: (rev) => rev.Ref.SHA === fixedOf(sha('c')) });
    await expect(match(root, corpus, d)).rejects.toThrow('sandbox broke');
    expect(d.Target.Cleanup).toHaveBeenCalledTimes(2);
    expect(file.Read().Entries.map((e) => e.Match?.Status ?? null)).toEqual(['Matched', null]);
  });

  it('removes the pnpm store when preparing head throws', async () => {
    const { root, corpus } = setup([entry(1)]);
    const d = fakes();
    d.Target.Prepare.mockRejectedValueOnce(new Error('install failed'));
    const removeStore = vi.fn(async () => undefined);
    await expect(match(root, corpus, { ...d, RemoveStore: removeStore })).rejects.toThrow('install failed');
    expect(removeStore).toHaveBeenCalledTimes(1);
    expect(d.Target.Cleanup).not.toHaveBeenCalled();
  });

  it('falls back to the fix merge when the patched head does not prepare, and records Head FixMerge', async () => {
    const { root, corpus, file } = setup([entry(1)]);
    const d = fakes({ passes: { [ID_A]: 3 } });
    d.Target.Prepare.mockRejectedValueOnce(new InfrastructureError('install failed on Head: ERR_PNPM_OUTDATED_LOCKFILE\n* 1 dependencies were added'));
    const removeStore = vi.fn(async () => undefined);
    const l = await match(root, corpus, { ...d, RemoveStore: removeStore });
    expect(d.Target.Prepare.mock.calls.map((c) => c[0])).toEqual([{ Kind: 'Head', SHA: fixedOf(sha('a')) }, { Kind: 'Head', SHA: sha('f') }]);
    expect(stderr.join('')).toContain(`match ${LEDGER_ID}: PR #1: the fix on head does not prepare (install failed on Head: ERR_PNPM_OUTDATED_LOCKFILE); trying the fix merge fffffff\n`);
    expect(l.Entries[0].Match).toEqual(record({ Status: 'Matched', ReportedMatched: true, Tests: { [ID_A]: true, [ID_B]: false }, Head: 'FixMerge' }));
    expect(d.Target.Run).toHaveBeenCalledWith(expect.objectContaining({ RootDir: '/work/head-f' }), expect.any(Array), DEFAULT_SETTINGS.Repeats);
    expect(d.Target.Cleanup).toHaveBeenCalledTimes(1);
    expect(removeStore).toHaveBeenCalledTimes(1);
    expect(file.Read().Entries[0].Match?.Head).toBe('FixMerge');
  });

  it('names the first line of the prepare error, not its tail, when the patched head does not prepare', async () => {
    const { root, corpus } = setup([entry(1)]);
    const d = fakes({ passes: { [ID_A]: 3 } });
    const first = 'install failed on Head: Command failed: docker run --rm jit-sandbox pnpm install';
    const progress = Array.from({ length: 60 }, (_, i) => `Progress: resolved ${3100 + i}, reused 3122, downloaded 0, added 2171`).join('\n');
    expect(progress.length).toBeGreaterThan(3000);
    d.Target.Prepare.mockRejectedValueOnce(new InfrastructureError(`${first}\n${progress}`));
    await match(root, corpus, d);
    expect(stderr.join('')).toContain(`match ${LEDGER_ID}: PR #1: the fix on head does not prepare (${first}); trying the fix merge fffffff\n`);
  });

  it('records PrepareFailed with the error and goes on to the next entry when the fix merge does not prepare either', async () => {
    const { root, corpus, file } = setup([entry(1), entry(3)]);
    const d = fakes({ passes: { [ID_A]: 3 } });
    d.Target.Prepare.mockRejectedValueOnce(new InfrastructureError('install failed on Head: patched')).mockRejectedValueOnce(new InfrastructureError('install failed on Head: merge\n    at prepare (x.ts:1:1)'));
    const removeStore = vi.fn(async () => undefined);
    const l = await match(root, corpus, { ...d, RemoveStore: removeStore });
    expect(l.Entries[0].Match).toEqual(record({ Status: 'PrepareFailed', Head: 'FixMerge', Error: 'install failed on Head: merge' }));
    expect(l.Entries[1].Match).toEqual(record({ Status: 'Matched', ReportedMatched: true, Tests: { [ID_A]: true, [ID_B]: false }, Head: 'Patched' }));
    expect(d.Target.Prepare.mock.calls.map((c) => c[0].SHA)).toEqual([fixedOf(sha('a')), sha('f'), fixedOf(sha('c'))]);
    expect(d.Target.Cleanup).toHaveBeenCalledTimes(1);
    expect(removeStore).toHaveBeenCalledTimes(2);
    expect(file.Read().Entries.map((e) => e.Match?.Status ?? null)).toEqual(['PrepareFailed', 'Matched']);
  });
});
