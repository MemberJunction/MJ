import type { GenerationFile } from '../../schemas';
import type { CandidateTest, ChangeAnalysis, ExecutionResult, FailureDetail, Run } from '../../types';

export const RUN_ID = '20261106-120000-pr12-bbbbbbb';
export const BASE_SHA = 'a'.repeat(40);
export const HEAD_SHA = 'b'.repeat(40);
export const ID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const PKG = '@memberjunction/x';
export const PKG_DIR = 'packages/X';

export function run(): Run {
  return { ID: RUN_ID, Trigger: 'Local', PRNumber: 12, BaseSHA: BASE_SHA, HeadSHA: HEAD_SHA, Status: 'Generated', GeneratorModel: 'claude-opus-5-5',
    TokensByModel: [], RunnerMinutes: 0, StartedAt: '2026-11-06T12:00:00.000Z', EndedAt: '2026-11-06T12:10:00.000Z' };
}

export function analysis(): ChangeAnalysis {
  return { RunID: RUN_ID, IntentType: 'feature', Summary: 'adds Open to Svc', Risks: [], PackagesToTest: [PKG], CommitPrefix: 'feat', RiskScore: 1, Title: 'feat: open', Body: '',
    ChangedFiles: [{ Path: `${PKG_DIR}/src/svc.ts`, Package: PKG, AddedLines: [1, 2], RemovedLineCount: 0, Hunks: [] }] };
}

export function candidate(id: string, source = `it('t', () => {});`, outcome: CandidateTest['GenerationOutcome'] = 'Produced'): CandidateTest {
  return { ID: id, RunID: RUN_ID, Package: PKG, Method: 'DodgyDiff', RiskID: null, RiskText: null, Mutant: null, MutantFailure: null,
    FilePath: `${PKG_DIR}/src/__tests__/jit/${id}.jit.test.ts`, Source: source, GenerationOutcome: outcome, FailureReason: outcome === 'Failed' ? 'no test proved' : null,
    Tokens: { Model: 'claude-opus-5-5', InputTokens: 1, OutputTokens: 1, CacheReadTokens: 0, CostUSD: 0 }, TranscriptURL: null };
}

export function generation(baseRootDir: string, tests: CandidateTest[]): GenerationFile {
  return { Run: run(), Analysis: analysis(), Tests: tests, BaseRootDir: baseRootDir };
}

const FAILURE: FailureDetail = { Assertion: 'expected 4 to be 3', Expected: '3', Actual: '4', Message: 'AssertionError: expected 4 to be 3', StackExcerpt: null, ErrorName: 'AssertionError' };

/** `repeats` results of one test on one revision, all passing or all failing the same way. */
export function results(id: string, revision: ExecutionResult['Revision'], pass: boolean, repeats = 3): ExecutionResult[] {
  return Array.from({ length: repeats }, (_, i) => ({ CandidateTestID: id, Revision: revision, RunIndex: i, Status: pass ? 'Pass' as const : 'Fail' as const,
    TestName: 't', Failure: pass ? null : FAILURE, DurationMs: 1 }));
}

/** An environment with a placeholder value for every key the pipeline steps need, and no Claude Code marker. */
export const FULL_ENV: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'placeholder-anthropic', OPENAI_API_KEY: 'placeholder-openai', GEMINI_API_KEY: 'placeholder-gemini' };
