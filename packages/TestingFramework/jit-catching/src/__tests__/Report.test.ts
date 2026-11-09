import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BaseCatchStore } from '../contracts/BaseCatchStore';
import { RunDir } from '../pipeline/RunDir';
import { RedactionCheck } from '../sandbox/Redaction';
import { BuildGateReport, RenderMarkdown, type GateReport } from '../report/Report';
import type { BacktestLedger, LedgerEntry, MatchRecord } from '../backtest/Ledger';
import type { Corpus } from '../corpus/Corpus';
import type { CandidateTest, Catch, ExecutionResult, Feedback, JudgeBucket, PromotionCandidate, Run, SessionRecord, TokenUsage } from '../types';
import { candidate } from './helpers/pipelineFixtures';

const AT = '2026-11-09T10:00:00.000Z';
const SHA = (c: string): string => c.repeat(40);
const PRICES = { gen: { Input: 4, Output: 20, CachedInput: 0.2 } };

/** An in-memory store that counts reads per run ID. */
class MemoryStore extends BaseCatchStore {
  public Runs: Run[] = []; public Catches: Catch[] = []; public Feedback: Feedback[] = []; public Sessions: SessionRecord[] = [];
  public Reads: Record<string, number> = {};
  public async SaveRun(): Promise<void> {}
  public async SaveCandidateTests(_t: CandidateTest[]): Promise<void> {}
  public async SaveExecutionResults(_r: ExecutionResult[]): Promise<void> {}
  public async SaveCatches(): Promise<void> {}
  public async SaveFeedback(): Promise<void> {}
  public async SavePromotionCandidates(_p: PromotionCandidate[]): Promise<void> {}
  public async SaveSessions(): Promise<void> {}
  public async GetRun(id: string): Promise<Run | null> { return this.Runs.filter((r) => r.ID === id)[0] ?? null; }
  public async ListRuns(): Promise<Run[]> { return this.Runs; }
  public async ListCatches(runId: string): Promise<Catch[]> { this.Reads[runId] = (this.Reads[runId] ?? 0) + 1; return this.Catches.filter((c) => c.RunID === runId); }
  public async ListFeedback(catchId: string): Promise<Feedback[]> { return this.Feedback.filter((f) => f.CatchID === catchId); }
  public async ListSessions(runId: string): Promise<SessionRecord[]> { return this.Sessions.filter((s) => s.RunID === runId); }
}

function runOf(id: string, tokens: TokenUsage[] = []): Run {
  return { ID: id, Trigger: 'Backtest', PRNumber: 1, BaseSHA: SHA('a'), HeadSHA: SHA('b'), Status: 'Assessed', GeneratorModel: 'gen', TokensByModel: tokens, RunnerMinutes: 0, StartedAt: AT, EndedAt: AT };
}
function catchOf(id: string, runID: string, testID: string, o: Partial<Catch> = {}): Catch {
  return { ID: id, RunID: runID, CandidateTestID: testID, Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, DroppedByRule: null, Boosts: [],
    TPProb: null, JudgeBuckets: [], Median: null, Rank: null, Reported: false, CommentID: null, ...o };
}
function buckets(a: JudgeBucket['Bucket'], b: JudgeBucket['Bucket']): JudgeBucket[] { return [{ Model: 'jA', Bucket: a, Reason: '' }, { Model: 'jB', Bucket: b, Reason: '' }]; }
function feedback(catchID: string, answer: Feedback['Answer'], at: string): Feedback { return { CatchID: catchID, User: 'u', Answer: answer, Source: 'Label', At: at }; }
function session(runID: string, end: string): SessionRecord {
  return { RunID: runID, Package: 'p', Method: 'DodgyDiff', RiskID: end + runID, EndReason: end, Turns: 1, Tokens: { Model: 'gen', InputTokens: 0, OutputTokens: 0, CacheReadTokens: 0, CostUSD: 0 }, TranscriptURL: null, Produced: 1, Failed: 0 };
}
function match(status: MatchRecord['Status'], reported: boolean, tests: Record<string, boolean>): MatchRecord { return { Status: status, ReportedMatched: reported, Tests: tests, At: AT }; }
function entry(pr: number, set: LedgerEntry['Set'], o: Partial<LedgerEntry>): LedgerEntry {
  return { PR: pr, Set: set, BaseSHA: SHA('a'), HeadSHA: SHA('b'), RunID: null, Status: 'Assessed', Error: null, CostUSD: 0, StartedAt: AT, EndedAt: AT, Match: null, ...o };
}
function ledger(id: string, set: BacktestLedger['Set'], model: string, entries: LedgerEntry[]): BacktestLedger {
  return { ID: id, CorpusPath: '/c.json', Slice: 'Tuning', Set: set, Model: model, CreatedAt: AT, Entries: entries };
}

const CORPUS: Corpus = {
  Version: 1, Seed: 1,
  Bug: [1, 2, 3].map((n) => ({ BugPR: n, FixPR: n + 100, BugMergeSHA: SHA('c'), FixMergeSHA: SHA('d'), Description: 'd', Slice: 'Tuning' as const })),
  Clean: [{ PR: 10, MergeSHA: SHA('e'), Slice: 'Tuning' }, { PR: 11, MergeSHA: SHA('e'), Slice: 'Tuning' }, { PR: 12, MergeSHA: SHA('e'), Slice: 'Tuning' }, { PR: 13, MergeSHA: SHA('e'), Slice: 'HeldOut' }],
};

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'; const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

function store(): MemoryStore {
  const s = new MemoryStore();
  s.Runs = [runOf('r1', [{ Model: 'gen', InputTokens: 1_000_000, OutputTokens: 100_000, CacheReadTokens: 1_000_000, CostUSD: 6 }]), runOf('r2'), runOf('r10'), runOf('r11'), runOf('r12'), runOf('r20')];
  s.Catches = [
    catchOf('c1', 'r1', 't1', { Reported: true, JudgeBuckets: buckets('High', 'Low') }),
    catchOf('c2', 'r2', 't2', { JudgeBuckets: buckets('High', null) }),
    catchOf('c3', 'r2', 't3', { JudgeBuckets: buckets('Low', 'High') }),
    catchOf('d2', 'r2', 't4', { DroppedByRule: 'NoAssertion' }),
    catchOf('c10', 'r10', 't10', { Reported: true, TPProb: -0.5, JudgeBuckets: buckets('High', 'Low') }),
    catchOf('d10', 'r10', 't11', { DroppedByRule: 'Mocked' }),
    catchOf('c11', 'r11', 't12', { Reported: true, TPProb: 0.3, JudgeBuckets: buckets('High', 'High') }),
    catchOf('c12', 'r12', 't13', { Reported: true, TPProb: 0.8, JudgeBuckets: buckets('Medium', 'Low') }),
    catchOf('d12', 'r12', 't14', { DroppedByRule: 'NoAssertion' }),
    catchOf('pb1', 'r12', P1, { Verdict: { Label: 'PassesBoth', Timeout: false, Reason: '' } }),
    catchOf('pb2', 'r12', P2, { Verdict: { Label: 'PassesBoth', Timeout: false, Reason: '' } }),
  ];
  s.Feedback = [feedback('c10', 'Bug', '2026-11-09T09:00:00.000Z'), feedback('c10', 'Intended', '2026-11-09T11:00:00.000Z'), feedback('c12', 'AuthorChangedPR', AT)];
  s.Sessions = [session('r1', 'Done'), session('r1', 'TurnLimit'), session('r10', 'Done'), session('r2', 'Done')];
  return s;
}

function ledgers(): BacktestLedger[] {
  return [
    ledger('c-Tuning-Bug-m1', 'Bug', 'm1', [
      entry(1, 'Bug', { RunID: 'r1', CostUSD: 2, Match: match('Matched', true, { t1: true }) }),
      entry(2, 'Bug', { RunID: 'r2', CostUSD: 1, Match: match('Matched', false, { t2: true, t3: false }) }),
      entry(3, 'Bug', { Status: 'Failed', Error: 'boom', CostUSD: 0.5 }),
    ]),
    ledger('c-Tuning-Clean-m1', 'Clean', 'm1', [
      entry(10, 'Clean', { RunID: 'r10', CostUSD: 1 }), entry(11, 'Clean', { RunID: 'r11', CostUSD: 1 }), entry(12, 'Clean', { RunID: 'r12', CostUSD: 0.5 }),
    ]),
    ledger('c-Tuning-Clean-m2', 'Clean', 'm2', [entry(10, 'Clean', { RunID: 'r20', CostUSD: 0.25 })]),
  ];
}

describe('BuildGateReport', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  async function build(s: MemoryStore): Promise<GateReport> {
    const root = mkdtempSync(join(tmpdir(), 'jit-report-')); dirs.push(root);
    const redaction = new RedactionCheck([]);
    const r12 = new RunDir(root, 'r12', redaction);
    r12.WriteExecution({ RunID: 'r12', Tests: [candidate(P1), candidate(P2)], Results: [], Coverage: [{ CandidateTestID: P1, CoveredChangedLines: 2 }], TypeErrors: {} });
    return BuildGateReport({ Ledgers: ledgers(), Corpus: CORPUS, Store: s, RunDirOf: (id) => new RunDir(root, id, redaction), Prices: PRICES });
  }

  it('gives one model report per generator model, combining ledgers of the same model', async () => {
    const r = await build(store());
    expect(r.Models.map((m) => [m.Model, m.Ledgers])).toEqual([['m1', ['c-Tuning-Bug-m1', 'c-Tuning-Clean-m1']], ['m2', ['c-Tuning-Clean-m2']]]);
  });

  it('counts a bug PR as caught only when a reported catch matched', async () => {
    const m1 = (await build(store())).Models[0];
    expect(m1.BugSet).toMatchObject({ PRs: 3, Run: 2, Failed: 1, AnyWeakMatched: 2, NoCatch: 0, ApplyFailed: 0 });
    expect(m1.BugSet.Caught).toMatchObject({ K: 1, N: 2, Rate: 0.5 });
    expect(m1.BugSet.Caught.Low).toBeCloseTo(0.095, 2);
  });

  it('counts false alarms only for labels Intended or TestFault, by the latest label, and keeps pending labels apart', async () => {
    const m1 = (await build(store())).Models[0];
    expect(m1.CleanSet).toMatchObject({ PRs: 3, Run: 3, Failed: 0, Reported: 3, Labeled: 2, Pending: 1, RealBugs: 1 });
    expect(m1.CleanSet.FalseAlarms).toMatchObject({ K: 1, N: 3 });
  });

  it('sums recorded costs and prices the run tokens from the table', async () => {
    const m1 = (await build(store())).Models[0];
    expect(m1.Cost.RecordedUSD).toBeCloseTo(6);
    expect(m1.Cost.TotalUSD).toBeCloseTo(6);
    expect(m1.Cost.PerPR).toBeCloseTo(1.2);
    expect(m1.Cost.PerMatchedCatch).toBeCloseTo(3);
    expect(m1.Cost.TableUSD).toBeCloseTo(6.2);
  });

  it('builds judge pairs per labeled or matched catch and counts High on Intended and Low on Bug', async () => {
    const m1 = (await build(store())).Models[0];
    const byModel = Object.fromEntries(m1.Judges.map((j) => [j.Model, j]));
    expect(byModel.jA.Agreement.SampleSize).toBe(5);
    expect(byModel.jB.Agreement.SampleSize).toBe(4);
    expect(byModel.jA).toMatchObject({ HighOnIntended: 1, LowOnBug: 0 });
    expect(byModel.jB).toMatchObject({ HighOnIntended: 0, LowOnBug: 2 });
  });

  it('groups TPProb by label with AuthorChangedPR as Bug, counts session end reasons, drop rules and unmeasured coverage', async () => {
    const m1 = (await build(store())).Models[0];
    expect(m1.TPProb).toEqual({ Bug: { N: 1, Mean: 0.8 }, Intended: { N: 1, Mean: -0.5 }, TestFault: { N: 0, Mean: null } });
    expect(m1.Sessions).toEqual({ Done: 3, TurnLimit: 1 });
    expect(m1.Drops).toEqual({ NoAssertion: 2, Mocked: 1 });
    expect(m1.CoverageNotMeasured).toBe(1);
  });

  it('reads the catches of each run once', async () => {
    const s = store();
    await build(s);
    expect(s.Reads).toEqual({ r1: 1, r2: 1, r10: 1, r11: 1, r12: 1, r20: 1 });
  });
});

describe('RenderMarkdown', () => {
  it('has one section per model and the interval next to each rate', async () => {
    const r = await BuildGateReport({ Ledgers: ledgers().slice(0, 1).concat(ledgers()[2]), Corpus: CORPUS, Store: store(), RunDirOf: () => { throw new Error('no run dir'); }, Prices: PRICES });
    const md = RenderMarkdown(r);
    expect(md.match(/^## /gm)).toHaveLength(2);
    expect(md).toContain('## m1');
    expect(md).toContain('## m2');
    expect(md).toContain('1/2 = 50.0% (95% CI 9.5%–90.5%)');
    expect(md).toMatch(/False alarms[^\n]*0\/1 = 0\.0% \(95% CI 0\.0%–79\.3%\)/);
  });
});
