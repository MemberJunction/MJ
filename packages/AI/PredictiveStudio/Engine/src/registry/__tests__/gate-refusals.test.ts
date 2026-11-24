/** `GateRefusals` (Task M3.2): every refusal kind in plain words, and the withheld StatusReason by initiator. */
import { describe, expect, it } from 'vitest';
import type { TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { GateRefusals } from '../gate-refusals';

describe('GateRefusals.Describe', () => {
  it('words the kinds M3.2 adds and the widened illegal-transition', () => {
    const refusals: TransitionRefusal[] = [
      { kind: 'calibration-held', slope: 1.6 }, { kind: 'calibration-held', slope: null }, { kind: 'not-servable', reason: 'no artifact file' },
      { kind: 'model-not-found', modelId: 'X' }, { kind: 'reason-required' }, { kind: 'illegal-transition', from: 'keep-baseline', to: 'validated' },
      { kind: 'incumbent-not-current', comparedWith: 'A', current: 'B' },
    ];
    expect(refusals.map((r) => GateRefusals.Describe(r))).toEqual([
      'The model is held for calibration: its calibration slope 1.60 is outside the accepted range.',
      'The model is held for calibration: its calibration slope could not be measured on the held-back rows.',
      'The model cannot be served: no artifact file',
      "No ML Model has the ID 'X'.",
      'A reason is required.',
      'A model in the keep-baseline state cannot move to validated.',
      'The training run was compared with model A, but model B is Published now; retrain to compare with it.',
    ]);
  });
  it('words the not-servable refusals of a publish whose evidence cannot be built from stored rows (D4-128)', () => {
    expect(GateRefusals.Describe({ kind: 'not-servable', reason: 'ML Model M names no Training Snapshot to build evidence from' }))
      .toBe('The model cannot be served: ML Model M names no Training Snapshot to build evidence from');
    expect(GateRefusals.Describe({ kind: 'not-servable', reason: 'Training Snapshot S that ML Model M names does not exist, so no evidence can be built from it' }))
      .toBe('The model cannot be served: Training Snapshot S that ML Model M names does not exist, so no evidence can be built from it');
  });
  it('words the not-servable refusal of an Evaluate whose OutputSemantics does not parse (D4-129)', () => {
    expect(GateRefusals.Describe({ kind: 'not-servable', reason: "ML Model M's OutputSemantics does not parse: OutputSemantics is empty; it must hold JSON" }))
      .toBe("The model cannot be served: ML Model M's OutputSemantics does not parse: OutputSemantics is empty; it must hold JSON");
  });
  it('prefixes the StatusReason "Automatic publish withheld" for an automated initiator only', () => {
    expect(GateRefusals.WithheldStatusReason({ kind: 'no-sign-off' }, { kind: 'scheduled-job', scheduledJobRunId: 'J' })).toMatch(/^Automatic publish withheld: /);
    expect(GateRefusals.WithheldStatusReason({ kind: 'no-sign-off' }, { kind: 'human', userId: 'U' })).toMatch(/^Publish withheld: /);
  });
});
