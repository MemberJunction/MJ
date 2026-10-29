import { describe, it, expect } from 'vitest';
import type { OracleResult } from '@memberjunction/testing-engine-base';
import { PsGateJudge, type PsGateJudgeFn } from '../checks/ps-gates/ps-gate-judge';

/** An llm-judge result in the inline shape the oracle reports, failing the named criteria with their rationale. */
function judged(failed: Record<string, string>): OracleResult {
  const passed = Object.keys(failed).length === 0;
  return {
    oracleType: 'llm-judge', passed, score: passed ? 1 : 0, message: `inline: ${passed ? 'Passed' : 'Failed'}`,
    details: {
      inline: true,
      Criteria: PsGateJudge.Criteria.map((name, i) => ({
        Key: `c${i}`, Name: name, NormalizedScore: name in failed ? 0 : 1, GateFailed: name in failed, Rationale: failed[name] || 'fine',
      })),
    },
  };
}
const CAUSAL = PsGateJudge.Criteria[1]!;

describe('PsGateJudge.Verdict', () => {
  it('passes only when the oracle passed', () => {
    expect(PsGateJudge.Verdict({ oracleType: 'llm-judge', passed: true, score: 1, message: 'ok' })).toEqual({ Passed: true, Detail: 'ok', FailedCriteria: [] });
  });
  it('an unparseable judge answer fails with the judge message', () => {
    expect(PsGateJudge.Verdict({ oracleType: 'llm-judge', passed: false, score: 0, message: 'could not parse the judge reply' }))
      .toEqual({ Passed: false, Detail: 'could not parse the judge reply', FailedCriteria: [] });
  });
  it('a failed judgment carries each failed criterion with its rationale', () => {
    const v = PsGateJudge.Verdict(judged({ [CAUSAL]: 'says enabling AutoRenew reduces churn' }));
    expect(v.Passed).toBe(false);
    expect(v.FailedCriteria).toEqual([{ Criterion: CAUSAL, Rationale: 'says enabling AutoRenew reduces churn' }]);
    expect(v.Detail).toContain('says enabling AutoRenew reduces churn');
  });
});

describe('PsGateJudge.Chunks', () => {
  it('splits a group into chunks of at most 50 texts, labels the parts, and drops empty groups', () => {
    const many = Array.from({ length: 120 }, (_, i) => `text ${i}`);
    const chunks = PsGateJudge.Chunks([{ Label: 'a.ts', Texts: many }, { Label: 'b.html', Texts: ['one text'] }, { Label: 'c.ts', Texts: [] }]);
    expect(chunks.map((c) => [c.Label, c.Texts.length])).toEqual([
      ['a.ts (part 1/3)', 50], ['a.ts (part 2/3)', 50], ['a.ts (part 3/3)', 20], ['b.html', 1],
    ]);
    expect(chunks.slice(0, 3).flatMap((c) => c.Texts)).toEqual(many);
  });
});

describe('PsGateJudge.CalibrationChunk', () => {
  it('plants the control in the middle of the largest chunk, keeping the chunk at most 50 texts', () => {
    const many = Array.from({ length: 120 }, (_, i) => `text ${i}`);
    const planted = PsGateJudge.CalibrationChunk(PsGateJudge.Chunks([{ Label: 'b.html', Texts: ['one text'] }, { Label: 'a.ts', Texts: many }]));
    expect(planted).toHaveLength(50);
    expect(planted[24]).toBe(PsGateJudge.CalibrationControl);
    expect(planted.filter((t) => t !== PsGateJudge.CalibrationControl)).toEqual(many.slice(0, 49));
  });
  it('is the control alone when there are no chunks', () => {
    expect(PsGateJudge.CalibrationChunk([])).toEqual([PsGateJudge.CalibrationControl]);
  });
});

describe('PsGateJudge.JudgeAll', () => {
  const chunks = [{ Label: 'a.ts', Texts: ['Weighted by the model'] }, { Label: 'generated stories', Texts: ['A story'] }];
  /** A fake judge: fails the calibration control on the causal criterion, and fails any chunk containing `bad`. */
  const calibrated: PsGateJudgeFn = async (texts) =>
    texts.includes(PsGateJudge.CalibrationControl) ? judged({ [CAUSAL]: 'causal' })
      : texts.some((t) => t.includes('bad')) ? judged({ [CAUSAL]: 'claims a lever' }) : judged({});

  it('a judge that passes the causal control fails the gate', async () => {
    const r = await PsGateJudge.JudgeAll(chunks, async () => judged({}));
    expect(r.Passed).toBe(false);
    expect(r.Detail).toMatch(/^judge calibration failed/);
    expect(r.ChunksJudged).toBe(0);
  });
  it('a control the judge fails without naming a criterion (a judge error) is not calibration', async () => {
    const r = await PsGateJudge.JudgeAll(chunks, async () => ({ oracleType: 'llm-judge', passed: false, score: 0, message: 'LLM judge error: timeout' }));
    expect(r.Passed).toBe(false);
    expect(r.Detail).toMatch(/^judge calibration failed.*timeout/);
  });
  it('a judge that fails the control only when it is judged alone is not calibrated', async () => {
    const aloneOnly: PsGateJudgeFn = async (texts) =>
      texts.length === 1 && texts[0] === PsGateJudge.CalibrationControl ? judged({ [CAUSAL]: 'causal' }) : judged({});
    const r = await PsGateJudge.JudgeAll(chunks, aloneOnly);
    expect(r.Passed).toBe(false);
    expect(r.Detail).toMatch(/^judge calibration failed: the 2-text chunk/);
  });
  it('a calibrated judge passes clean chunks', async () => {
    expect(await PsGateJudge.JudgeAll(chunks, calibrated)).toEqual({ Passed: true, Detail: '2 of 2 chunks pass', ChunksJudged: 2, FailedChunks: [] });
  });
  it('one failing chunk fails the gate, named with the failed criterion and rationale', async () => {
    const r = await PsGateJudge.JudgeAll([...chunks, { Label: 'c.ts', Texts: ['a bad line'] }], calibrated);
    expect(r.Passed).toBe(false);
    expect(r.FailedChunks).toHaveLength(1);
    expect(r.Detail).toContain('c.ts');
    expect(r.Detail).toContain(CAUSAL);
    expect(r.Detail).toContain('claims a lever');
  });
});
