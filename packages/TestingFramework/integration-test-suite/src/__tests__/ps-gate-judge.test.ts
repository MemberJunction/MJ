import { describe, it, expect } from 'vitest';
import { PsGateJudge } from '../checks/ps-gates/ps-gate-judge';

describe('PsGateJudge.Verdict', () => {
  it('passes only when the oracle passed', () => {
    expect(PsGateJudge.Verdict({ oracleType: 'llm-judge', passed: true, score: 1, message: 'ok' })).toEqual({ Passed: true, Detail: 'ok' });
  });
  it('an unparseable judge answer fails with the judge message', () => {
    expect(PsGateJudge.Verdict({ oracleType: 'llm-judge', passed: false, score: 0, message: 'could not parse the judge reply' }))
      .toEqual({ Passed: false, Detail: 'could not parse the judge reply' });
  });
});
