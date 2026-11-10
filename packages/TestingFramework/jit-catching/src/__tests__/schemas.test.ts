import { describe, it, expect } from 'vitest';
import { analysis } from './helpers/pipelineFixtures';
import { RunSchema, ChangeAnalysisSchema, CandidateTestSchema, ExecutionResultSchema, CatchSchema, ExecutionFileSchema, GenerationFileSchema, JitTestPath, MutantEditSchema } from '../schemas';

describe('record schemas', () => {
  it('accepts a complete Run and rejects a bad Trigger', () => {
    const run = { ID: 'r1', Trigger: 'Local', PRNumber: 12, BaseSHA: 'a'.repeat(40), HeadSHA: 'b'.repeat(40), Status: 'Generated',
      GeneratorModel: 'claude-haiku-5-5', TokensByModel: [], RunnerMinutes: 0, StartedAt: '2026-11-05T00:00:00.000Z', EndedAt: null };
    expect(RunSchema.parse(run)).toEqual(run);
    expect(() => RunSchema.parse({ ...run, Trigger: 'Comment' })).toThrow();
  });
  it('accepts more packages to test than three: Settings.Limits.PackagesPerPR is the limit', () => {
    const a = { ...analysis(), PackagesToTest: ['@a/1', '@a/2', '@a/3', '@a/4'] };
    expect(ChangeAnalysisSchema.parse(a).PackagesToTest).toHaveLength(4);
  });
  it('rejects a CandidateTest whose FilePath is outside __tests__/jit', () => {
    const t = { ID: 't1', RunID: 'r1', Package: '@memberjunction/core', Method: 'DodgyDiff', RiskID: null, RiskText: null, Mutant: null, MutantFailure: null,
      FilePath: 'packages/MJCore/src/__tests__/jit/0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b.jit.test.ts', Source: 'x', GenerationOutcome: 'Produced', FailureReason: null,
      Tokens: { Model: 'm', InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0 }, TranscriptURL: null };
    expect(CandidateTestSchema.parse(t).FilePath).toBe(t.FilePath);
    expect(() => CandidateTestSchema.parse({ ...t, FilePath: 'packages/MJCore/src/evil.ts' })).toThrow();
  });
  it('requires Failure when Status is Fail and forbids it when Pass', () => {
    const base = { CandidateTestID: 't1', Revision: 'Head', RunIndex: 0, TestName: 'x', DurationMs: 3 };
    expect(() => ExecutionResultSchema.parse({ ...base, Status: 'Fail', Failure: null })).toThrow();
    expect(() => ExecutionResultSchema.parse({ ...base, Status: 'Pass', Failure: { Assertion: null, Expected: null, Actual: null, Message: 'm', StackExcerpt: null, ErrorName: null } })).toThrow();
  });
  it('ExecutionFileSchema rejects a result that names an unknown test', () => {
    expect(() => ExecutionFileSchema.parse({ RunID: 'r1', Tests: [], Results: [{ CandidateTestID: 'ghost', Revision: 'Base', RunIndex: 0, Status: 'Pass', Failure: null, TestName: null, DurationMs: 1 }], Coverage: [], TypeErrors: {} })).toThrow(/unknown test|name a test/);
  });
  it('Catch keeps Median null until judged', () => {
    const c = { ID: 'c1', RunID: 'r1', CandidateTestID: 't1', Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, DroppedByRule: null, Boosts: [], TPProb: null, JudgeBuckets: [], Median: null, Rank: null, Reported: false, CommentID: null };
    expect(CatchSchema.parse(c).Median).toBeNull();
  });
  it('reads a generation file without Sessions as an empty list', () => {
    const run = { ID: 'r1', Trigger: 'Local', PRNumber: null, BaseSHA: 'a'.repeat(40), HeadSHA: 'b'.repeat(40), Status: 'Generated',
      GeneratorModel: 'claude-haiku-5-5', TokensByModel: [], RunnerMinutes: 0, StartedAt: '2026-11-05T00:00:00.000Z', EndedAt: null };
    expect(GenerationFileSchema.parse({ Run: run, Analysis: analysis(), Tests: [], BaseRootDir: '/work/base' }).Sessions).toEqual([]);
  });
});

describe('path schemas', () => {
  const uuid = '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b';
  it('JitTestPath rejects . and .. segments', () => {
    expect(JitTestPath.safeParse(`packages/../../etc/src/__tests__/jit/${uuid}.jit.test.ts`).success).toBe(false);
    expect(JitTestPath.safeParse(`packages/x/./src/__tests__/jit/${uuid}.jit.test.ts`).success).toBe(false);
  });
  it('JitTestPath accepts a nested package path', () => {
    const p = `packages/AI/Providers/Anthropic/src/__tests__/jit/${uuid}.jit.test.ts`;
    expect(JitTestPath.parse(p)).toBe(p);
  });
  it('MutantEditSchema.File rejects .. segments', () => {
    expect(MutantEditSchema.safeParse({ File: 'packages/x/src/../../../evil.ts', Find: 'a', Replace: 'b' }).success).toBe(false);
  });
  it('MutantEditSchema.File accepts a nested package path', () => {
    const e = { File: 'packages/AI/Providers/Anthropic/src/drivers/x.ts', Find: 'a', Replace: 'b' };
    expect(MutantEditSchema.parse(e)).toEqual(e);
  });
});
