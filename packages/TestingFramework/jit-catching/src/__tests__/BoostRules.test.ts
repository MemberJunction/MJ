import { describe, it, expect } from 'vitest';
import { TestAst } from '../rules/TestAst';
import { NoBehaviorChangeExpected } from '../rules/boost/NoBehaviorChangeExpected';
import { AdditiveChangeBrokeOutput } from '../rules/boost/AdditiveChangeBrokeOutput';
import { AccessChange } from '../rules/boost/AccessChange';
import { UnexpectedEmpty } from '../rules/boost/UnexpectedEmpty';
import { SaveFailure } from '../rules/boost/SaveFailure';
import { MatchesRisk } from '../rules/boost/MatchesRisk';
import type { CandidateTest, CatchContext, ChangeAnalysis, ExecutionResult, FailureDetail } from '../types';

const lib = `export class Svc { public Open() { return 3; } private helper() { return 1; } } export function free() { return 1; }`;
const FILE = 'packages/X/src/__tests__/jit/t.jit.test.ts';
const asts = new Map<string, TestAst>();
function ctx(source: string, failure: Partial<FailureDetail> = {}, analysis: Partial<ChangeAnalysis> = {}, test: Partial<CandidateTest> = {}): CatchContext {
  const ast = asts.get(source) ?? TestAst.Load(source, '/repo', 'packages/X', FILE, { '/repo/packages/X/src/svc.ts': lib });
  asts.set(source, ast);
  const f: FailureDetail = { Assertion: 'expected 1 to be 2', Expected: '2', Actual: '1', Message: 'AssertionError: expected 1 to be 2', StackExcerpt: `❯ src/__tests__/jit/t.jit.test.ts:1:40`, ErrorName: 'AssertionError', ...failure };
  const head: ExecutionResult = { CandidateTestID: 't', Revision: 'Head', RunIndex: 0, Status: 'Fail', TestName: 'x', Failure: f, DurationMs: 1 };
  return { Run: {} as never, Analysis: { IntentType: 'feature', ChangedFiles: [], ...analysis } as never, Test: { Source: source, FilePath: FILE, Package: 'x', MutantFailure: null, ...test } as never, Base: [], Head: [head], Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, BaseRootDir: '/repo', Boosts: [], Ast: ast };
}
const imp = `import { it, expect, vi, beforeEach } from 'vitest'; import { Svc } from '../../svc'; import * as mod from '../../svc';`;

describe('NoBehaviorChangeExpected', () => { it('fires for refactor/perf/dead_code_removal intents', () => { for (const i of ['refactor', 'perf', 'dead_code_removal'] as const) expect(new NoBehaviorChangeExpected().Evaluate(ctx('', {}, { IntentType: i })).Fired).toBe(true); expect(new NoBehaviorChangeExpected().Evaluate(ctx('', {}, { IntentType: 'feature' })).Fired).toBe(false); }); });
describe('AdditiveChangeBrokeOutput', () => { it('fires for logging/config intents', () => { expect(new AdditiveChangeBrokeOutput().Evaluate(ctx('', {}, { IntentType: 'logging' })).Fired).toBe(true); }); });
describe('AccessChange', () => {
  it('fires when the test exercises access checks for a role string the diff does not mention', () => {
    const src = `${imp} it('t', () => { expect(svc.CanRead(user('guest'), 'Users')).toBe(false); });`;
    const hunks = [{ Path: 'packages/X/src/svc.ts', OldStart: 1, OldLines: 1, NewStart: 1, NewLines: 1, Lines: ['+  cache.set(entity, result);'] }];
    expect(new AccessChange().Evaluate(ctx(src, { Expected: 'false', Actual: 'true' }, { ChangedFiles: [{ Path: 'packages/X/src/svc.ts', Package: 'x', AddedLines: [1], RemovedLineCount: 0, Hunks: hunks }] })).Fired).toBe(true);
    const hunks2 = [{ ...hunks[0], Lines: ["+  if (role === 'guest') return false;"] }];
    expect(new AccessChange().Evaluate(ctx(src, { Expected: 'false', Actual: 'true' }, { ChangedFiles: [{ Path: 'packages/X/src/svc.ts', Package: 'x', AddedLines: [1], RemovedLineCount: 0, Hunks: hunks2 }] })).Fired).toBe(false);
  });
});
describe('UnexpectedEmpty', () => {
  it('fires when head returns an empty value where base returned a value, from an expression the diff did not touch', () => {
    const src = `${imp} it('t', () => { expect(svc.List()).toEqual(['a']); });`;
    expect(new UnexpectedEmpty().Evaluate(ctx(src, { Expected: "['a']", Actual: '[]' }, { ChangedFiles: [{ Path: 'p', Package: 'x', AddedLines: [], RemovedLineCount: 0, Hunks: [{ Path: 'p', OldStart: 1, OldLines: 1, NewStart: 1, NewLines: 1, Lines: ['+ other()'] }] }] })).Fired).toBe(true);
    expect(new UnexpectedEmpty().Evaluate(ctx(src, { Expected: "['a']", Actual: '[]' }, { ChangedFiles: [{ Path: 'p', Package: 'x', AddedLines: [], RemovedLineCount: 0, Hunks: [{ Path: 'p', OldStart: 1, OldLines: 1, NewStart: 1, NewLines: 1, Lines: ['-  List() {'] }] }] })).Fired).toBe(false);
    expect(new UnexpectedEmpty().Evaluate(ctx(src, { Expected: '1', Actual: '2' })).Fired).toBe(false);
  });
});
describe('SaveFailure', () => { it('fires when the test calls Save() and head reports false/throw where base succeeded', () => { expect(new SaveFailure().Evaluate(ctx(`${imp} it('t', async () => { expect(await e.Save()).toBe(true); });`, { Expected: 'true', Actual: 'false' })).Fired).toBe(true); }); });
describe('MatchesRisk', () => {
  it('fires when head fails with the mutant\'s assertion and actual value', () => {
    const mf = { Assertion: 'expected true to be false', Expected: 'false', Actual: 'true', Message: '', StackExcerpt: null, ErrorName: 'AssertionError' };
    expect(new MatchesRisk().Evaluate(ctx('', { Assertion: 'expected true to be false', Actual: 'true' }, {}, { MutantFailure: mf })).Fired).toBe(true);
    expect(new MatchesRisk().Evaluate(ctx('', { Assertion: 'expected 1 to be 2', Actual: '1' }, {}, { MutantFailure: mf })).Fired).toBe(false);
  });
});
