import { describe, it, expect } from 'vitest';
import type { CarveRefusal, PipelineRefusal } from '@memberjunction/predictive-studio-core';
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
        Reason: { kind: 'seeded-random-side-empty', side: 'locked-holdout', fraction: 0.1, rows: 3 },
        Sentence: 'Refused (seeded-random-side-empty): A seeded-random holdout of fraction 0.1 puts none of the 3 rows in the holdout; there is nothing to test on. Choose a larger fraction or train on more rows.',
      },
      {
        Reason: { kind: 'seeded-random-side-empty', side: 'development', fraction: 0.9, rows: 2 },
        Sentence: 'Refused (seeded-random-side-empty): A seeded-random holdout of fraction 0.9 puts all 2 rows in the holdout; nothing would be left to train on. Choose a smaller fraction or train on more rows.',
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

  it('states every protocol refusal of a search with its kind, naming the protocol and what does not fit', () => {
    const cases: readonly { readonly Reason: PipelineRefusal; readonly Sentence: string }[] = [
      {
        Reason: { kind: 'too-many-candidates', pipelineId: 'pipe-1', candidates: 3, maxCandidates: 2 },
        Sentence: "Refused (too-many-candidates): 3 candidates requested but the protocol's budget allows 2; raise the budget in a new protocol version or remove candidates.",
      },
      {
        Reason: { kind: 'protocol-created-after-run', protocolId: 'P1', protocolCreatedAt: '2026-05-01T10:00:00.001Z', runCreatedAt: '2026-05-01T10:00:00.000Z' },
        Sentence: 'Refused (protocol-created-after-run): the Evaluation Protocol P1 (created 2026-05-01T10:00:00.001Z) is newer than the run (created 2026-05-01T10:00:00.000Z).',
      },
      {
        Reason: { kind: 'protocol-unit-mismatch', protocolId: 'P1', problems: ['First.', 'Second.'] },
        Sentence: 'Refused (protocol-unit-mismatch): Evaluation Protocol P1 does not fit the Prediction Unit: First. Second.',
      },
      {
        Reason: { kind: 'protocol-invalid', protocolId: 'P1', errors: ['Holdout must be an object', 'Seed must be an integer'] },
        Sentence: 'Refused (protocol-invalid): Evaluation Protocol P1: Holdout must be an object; Seed must be an integer',
      },
    ];
    for (const c of cases) expect(new TrainingRefusedError({ stage: 'pipeline', reason: c.Reason }).message).toBe(c.Sentence);
  });
});
