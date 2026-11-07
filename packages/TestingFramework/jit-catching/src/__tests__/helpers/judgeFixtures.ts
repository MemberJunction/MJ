import { TestLLM, MakeSuccessChatResult } from '@memberjunction/unit-testing';
import type { ChatResultLogProbs } from '@memberjunction/ai';
import type { CatchContext, ExecutionResult } from '../../types';

/** A TestLLM that answers with the given replies in order; a reply with logprobs goes through a prebuilt ChatResult. */
export function scripted(...replies: { content: string; logprobs?: ChatResultLogProbs }[]): TestLLM {
  return new TestLLM().Script(...replies.map((r) => {
    if (!r.logprobs) return { kind: 'succeed' as const, content: r.content };
    const result = MakeSuccessChatResult(r.content);
    result.data.choices[0].logprobs = r.logprobs;
    return { kind: 'failResult' as const, result };
  }));
}

/** One weak catch on a feature PR with a single head failure; enough for BuildJudgeInput. */
export function ctx(): CatchContext {
  const head: ExecutionResult = { CandidateTestID: 't', Revision: 'Head', RunIndex: 0, Status: 'Fail', TestName: 'x', DurationMs: 1,
    Failure: { Assertion: 'expected 1 to be 2', Expected: '2', Actual: '1', Message: 'AssertionError: expected 1 to be 2', StackExcerpt: '❯ src/__tests__/jit/t.jit.test.ts:1:40', ErrorName: 'AssertionError' } };
  return { Run: {} as never, BaseRootDir: '/repo', Base: [], Head: [head], Boosts: ['MatchesRisk'], Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' },
    Analysis: { IntentType: 'feature', Summary: 'adds a per-user cache', Title: 'Add user cache', ChangedFiles: [{ Path: 'packages/X/src/cache.ts', Package: 'x', Hunks: [{ Path: 'packages/X/src/cache.ts', OldStart: 1, OldLines: 1, NewStart: 1, NewLines: 2, Lines: ['+const cache = new Map();'] }] }] } as never,
    Test: { Source: `it('x', () => { expect(1).toBe(2); });`, FilePath: 'packages/X/src/__tests__/jit/t.jit.test.ts', Package: 'x', RiskText: 'cache may ignore the user', Mutant: null } as never };
}
