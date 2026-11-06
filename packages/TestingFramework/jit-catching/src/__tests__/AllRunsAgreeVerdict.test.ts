import { describe, it, expect } from 'vitest';
import { AllRunsAgreeVerdict } from '../verdict/AllRunsAgreeVerdict';
import type { ExecutionResult, ExecutionStatus, FailureDetail } from '../types';

const fail = (assertion: string, actual = 'true'): FailureDetail => ({ Assertion: assertion, Expected: 'false', Actual: actual, Message: assertion, StackExcerpt: null, ErrorName: 'AssertionError' });
const r = (rev: 'Base' | 'Head', status: ExecutionStatus, i: number, f: FailureDetail | null = null): ExecutionResult => ({ CandidateTestID: 't', Revision: rev, RunIndex: i, Status: status, TestName: 'x', Failure: f, DurationMs: 1 });
const three = (rev: 'Base' | 'Head', status: ExecutionStatus, f?: FailureDetail) => [0, 1, 2].map((i) => r(rev, status, i, f ?? null));
const ok = new AllRunsAgreeVerdict({ Base: null, Head: null });

describe('AllRunsAgreeVerdict (§7)', () => {
  it('3/3 pass + 3/3 fail with the same failure → WeakCatch', () => {
    expect(ok.Classify(three('Base', 'Pass'), three('Head', 'Fail', fail('expected true to be false')))).toMatchObject({ Label: 'WeakCatch', Timeout: false });
  });
  it('3/3 pass + 3/3 fail with different failures → Flaky', () => {
    const head = [r('Head', 'Fail', 0, fail('a')), r('Head', 'Fail', 1, fail('b')), r('Head', 'Fail', 2, fail('a'))];
    expect(ok.Classify(three('Base', 'Pass'), head).Label).toBe('Flaky');
  });
  it('3/3 pass + 3/3 timeout → WeakCatch flagged timeout', () => {
    expect(ok.Classify(three('Base', 'Pass'), three('Head', 'Timeout', fail('timed out')))).toMatchObject({ Label: 'WeakCatch', Timeout: true });
  });
  it('3/3 pass + 3/3 pass → PassesBoth', () => { expect(ok.Classify(three('Base', 'Pass'), three('Head', 'Pass')).Label).toBe('PassesBoth'); });
  it('compiles on base, not on head → ApiChanged, whatever the runs say', () => {
    expect(new AllRunsAgreeVerdict({ Base: null, Head: 'TS2339' }).Classify(three('Base', 'Pass'), three('Head', 'Fail', fail('x'))).Label).toBe('ApiChanged');
  });
  it('any base failure → Invalid', () => {
    expect(ok.Classify([r('Base', 'Pass', 0), r('Base', 'Fail', 1, fail('x')), r('Base', 'Pass', 2)], three('Head', 'Pass')).Label).toBe('Invalid');
    expect(new AllRunsAgreeVerdict({ Base: 'TS1', Head: null }).Classify(three('Base', 'Pass'), three('Head', 'Pass')).Label).toBe('Invalid');
  });
  it('mixed head → Flaky', () => {
    expect(ok.Classify(three('Base', 'Pass'), [r('Head', 'Pass', 0), r('Head', 'Fail', 1, fail('x')), r('Head', 'Fail', 2, fail('x'))]).Label).toBe('Flaky');
  });
  it('a RunnerError anywhere → Invalid with the reason', () => {
    const v = ok.Classify(three('Base', 'Pass'), [r('Head', 'RunnerError', 0, fail('Cannot find module')), r('Head', 'Pass', 1), r('Head', 'Pass', 2)]);
    expect(v.Label).toBe('Invalid'); expect(v.Reason).toMatch(/RunnerError/);
  });
});
