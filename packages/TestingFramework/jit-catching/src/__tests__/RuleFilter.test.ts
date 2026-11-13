import { describe, it, expect } from 'vitest';
import { BaseCatchRule } from '../contracts/BaseCatchRule';
import { RuleFilter } from '../rules/RuleFilter';
import { AllRules } from '../rules/index';
import type { CatchContext, ExecutionResult, RuleKind } from '../types';

const FILE = 'packages/X/src/__tests__/jit/t.jit.test.ts';
function ctx(source: string): CatchContext {
  const head: ExecutionResult = { CandidateTestID: 't', Revision: 'Head', RunIndex: 0, Status: 'Fail', TestName: 'x', Failure: { Assertion: 'expected 1 to be 2', Expected: '2', Actual: '1', Message: 'AssertionError: expected 1 to be 2', StackExcerpt: null, ErrorName: 'AssertionError' }, DurationMs: 1 };
  return { Run: {} as never, Analysis: { IntentType: 'feature', ChangedFiles: [] } as never, Test: { Source: source, FilePath: FILE, Package: 'x', MutantFailure: null } as never, Base: [], Head: [head], Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, BaseRootDir: '/repo', Boosts: [] };
}
const imp = `import { it, expect } from 'vitest';`;

describe('RuleFilter', () => {
  it('stops at the first drop rule, records every outcome, and collects boosts', () => {
    const drop = (name: string, fires: boolean) => new (class extends BaseCatchRule { get Name() { return name; } get Kind(): RuleKind { return 'Drop'; } Evaluate() { return { Fired: fires, Reason: name }; } })();
    const boost = (name: string, fires: boolean) => new (class extends BaseCatchRule { get Name() { return name; } get Kind(): RuleKind { return 'Boost'; } Evaluate() { return { Fired: fires, Reason: name }; } })();
    const f = new RuleFilter([boost('B1', true), drop('D1', false), drop('D2', true), drop('D3', true), boost('B2', false)]);
    const r = f.Apply(ctx(`${imp} it('t', () => { expect(1).toBe(1); });`));
    expect(r.DroppedBy).toBe('D2'); expect(Object.keys(r.Outcomes)).toEqual(['D1', 'D2', 'B1', 'B2']); expect(r.Boosts).toEqual(['B1']);
  });
  it('AllRules lists every §9.1 rule by name', () => {
    expect(AllRules().map((r) => r.Name).sort()).toEqual(['AccessChange', 'AdditiveChangeBrokeOutput', 'BrokenMock', 'InternalCallCounting', 'MatchesRisk', 'NoBehaviorChangeExpected', 'NotImplemented', 'OrderSensitive', 'PrivateAccess', 'RunnerInfrastructure', 'SaveFailure', 'TestOwnError', 'UnexpectedEmpty']);
  });
});
