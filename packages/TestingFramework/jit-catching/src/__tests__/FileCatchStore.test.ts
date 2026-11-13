import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileCatchStore } from '../store/FileCatchStore';
import { RedactionCheck, RedactionError } from '../sandbox/Redaction';
import type { CandidateTest, Catch, Run, SessionRecord } from '../types';

const run: Run = { ID: 'r1', Trigger: 'Local', PRNumber: 12, BaseSHA: 'a'.repeat(40), HeadSHA: 'b'.repeat(40), Status: 'Generated',
  GeneratorModel: 'claude-haiku-5-5', TokensByModel: [], RunnerMinutes: 0, StartedAt: '2026-11-05T00:00:00.000Z', EndedAt: null };
const test: CandidateTest = { ID: 't1', RunID: 'r', Package: '@memberjunction/core', Method: 'DodgyDiff', RiskID: null, RiskText: null, Mutant: null, MutantFailure: null,
  FilePath: 'packages/MJCore/src/__tests__/jit/0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b.jit.test.ts', Source: 'x', GenerationOutcome: 'Produced', FailureReason: null,
  Tokens: { Model: 'm', InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0 }, TranscriptURL: null };
const catchRecord: Catch = { ID: 'c1', RunID: 'r', CandidateTestID: 't1', Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, DroppedByRule: null, Boosts: [],
  TPProb: 0.5, JudgeBuckets: [], Median: null, Rank: null, Reported: false, CommentID: null };
const session: SessionRecord = { RunID: 'A', Package: '@memberjunction/core', Method: 'IntentAware', RiskID: 'R1', EndReason: 'success', Turns: 4,
  Tokens: { Model: 'm', Role: 'Generator', InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0 }, TranscriptURL: null, Produced: 1, Failed: 0 };

describe('FileCatchStore', () => {
  const store = () => new FileCatchStore(mkdtempSync(join(tmpdir(), 'jit-store-')), new RedactionCheck(['sk-ant-SECRETSECRETSECRET']));
  it('round-trips a run and returns the latest version of a rewritten record', async () => {
    const s = store(); await s.SaveRun(run); await s.SaveRun({ ...run, Status: 'Assessed' });
    expect((await s.GetRun(run.ID))?.Status).toBe('Assessed'); expect(await s.ListRuns()).toHaveLength(1);
  });
  it('refuses a record that holds a secret and leaves the file unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jit-store-'));
    const s = new FileCatchStore(dir, new RedactionCheck(['sk-ant-SECRETSECRETSECRET']));
    await expect(s.SaveCandidateTests([{ ...test, Source: 'const k = "sk-ant-SECRETSECRETSECRET";' }])).rejects.toThrow(RedactionError);
    expect(existsSync(join(dir, 'candidate-tests.jsonl'))).toBe(false);
    expect(await s.ListCatches('r')).toEqual([]);
  });
  it('validates with the schema before writing', async () => { await expect(store().SaveCatches([{ ...catchRecord, TPProb: 7 }])).rejects.toThrow(); });
  it('ListCatches filters by run and ListFeedback by catch', async () => {
    const s = store(); await s.SaveCatches([catchRecord, { ...catchRecord, ID: 'c2', RunID: 'other' }]); await s.SaveFeedback({ CatchID: 'c1', User: 'u', Answer: 'Bug', Source: 'Label', At: new Date().toISOString() });
    expect((await s.ListCatches('r')).map((c) => c.ID)).toEqual(['c1']); expect(await s.ListFeedback('c1')).toHaveLength(1);
  });
  it('saves sessions and lists them by run', async () => {
    const s = store(); await s.SaveSessions([session, { ...session, RunID: 'B' }]);
    expect(await s.ListSessions('A')).toEqual([session]);
  });
});
