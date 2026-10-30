import { describe, it, expect } from 'vitest';
import type { CarveRefusal } from '@memberjunction/predictive-studio-core';
import { TrainingRefusedError } from '../training-refusal';

describe('TrainingRefusedError.DescribeTrainingRefusal', () => {
  it('states every holdout carve refusal with its kind and the carve sentence', () => {
    const cases: readonly { readonly Reason: CarveRefusal; readonly Sentence: string }[] = [
      { Reason: { kind: 'unparseable-cutoff', value: 'soon' }, Sentence: 'Refused (unparseable-cutoff): The holdout cutoff "soon" is not a date.' },
      {
        Reason: { kind: 'unparseable-carve-date', rowId: 'r7', value: 'never' },
        Sentence: 'Refused (unparseable-carve-date): Row r7 has carve date "never", which is not a date; the holdout cannot be carved.',
      },
      {
        Reason: { kind: 'missing-carve-date', rowId: 'r1', column: 'StartDate' },
        Sentence: 'Refused (missing-carve-date): Row r1 has no StartDate; the holdout is carved on that column.',
      },
      {
        Reason: { kind: 'no-development-rows', cutoff: '2019-01-01' },
        Sentence: 'Refused (no-development-rows): No row is dated before the cutoff 2019-01-01; nothing would be left to train on. Choose a later cutoff.',
      },
      {
        Reason: { kind: 'no-holdout-rows', cutoff: '2024-01-01', holdoutEnd: null },
        Sentence: 'Refused (no-holdout-rows): No row is dated on or after the cutoff 2024-01-01; there is nothing to test on. Choose an earlier cutoff.',
      },
      {
        Reason: { kind: 'no-holdout-rows', cutoff: '2024-01-01', holdoutEnd: '2025-01-01' },
        Sentence: 'Refused (no-holdout-rows): No row is dated on or after the cutoff 2024-01-01 and before 2025-01-01; there is nothing to test on. Choose an earlier cutoff.',
      },
      {
        Reason: { kind: 'too-few-periods', periods: 30, origins: 5, horizonPeriods: 3, gapPeriods: 2, minTrainPeriods: 24 },
        Sentence: 'Refused (too-few-periods): 30 periods cannot hold 5 origins of 3 periods and a gap of 2 periods after 24 training periods.',
      },
    ];
    for (const c of cases) {
      expect(TrainingRefusedError.DescribeTrainingRefusal({ stage: 'carve', reason: c.Reason })).toBe(c.Sentence);
      expect(new TrainingRefusedError({ stage: 'carve', reason: c.Reason }).message).toBe(c.Sentence);
    }
  });
});
