/**
 * G0.10's pure comparison (OF4-53): every candidate a training run trains is compared with its own re-training — each
 * returned artifact by SHA-256 and each inner-CV candidate by its inner score — after both runs are shown to share the
 * snapshot, seed and code version. The single delivered artifact is not the measure: a run whose delivered simple
 * baseline reproduces while its finalist does not has not reproduced.
 */
import { describe, it, expect } from 'vitest';
import type { CandidateInnerScore, CodeVersion, StoredArtifactRef } from '@memberjunction/predictive-studio-core';
import { TrainingReproduction, type TrainerReproductionInputs } from '../ps-gate-reproduction';

const SNAPSHOT = 'C0000000-0000-4000-8000-00000000000C';
const CODE: CodeVersion = { psGitSha: 'f'.repeat(40), sidecarVersion: '1.0.0', libraryVersions: { sklearn: '1.5.2', xgboost: '2.1.1' }, threads: 1, seed: 42 };

function artifact(candidate: string, shaChar: string): StoredArtifactRef {
  return { candidate, sha256: shaChar.repeat(64), featureSchemaHash: 'e'.repeat(64), classOrder: ['0', '1'], fileId: `${candidate}-file` };
}
function inner(candidate: string, value: number): CandidateInnerScore {
  return { candidate, inner: { metric: 'log-loss', value, interval: { lower: value - 0.01, upper: value + 0.01, level: 0.95 }, n: 400 }, folds: 5, optimistic: true };
}
function trainer(over: Partial<TrainerReproductionInputs> = {}): TrainerReproductionInputs {
  return {
    codeVersion: CODE,
    artifacts: [artifact('random_forest', 'a'), artifact('one-feature:EventsAttended', 'b'), artifact('glm', 'c')],
    innerScores: [inner('random_forest', 0.4123)],
    ...over,
  };
}
function fingerprint(runId: string, t: TrainerReproductionInputs, snapshotId: string | null = SNAPSHOT) {
  return TrainingReproduction.FingerprintOf({ ID: runId, TrainingSnapshotID: snapshotId }, t);
}

describe('TrainingReproduction.Compare', () => {
  it('two trainings with every candidate equal reproduce, and every candidate is counted', () => {
    const c = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer()));
    expect([c.SameInputs, c.Reproduced, c.CandidatesCompared, c.Differing]).toEqual([true, true, 4, []]);
  });

  it('two differing candidates (the finalist and a simple baseline) are both named, and the run does not reproduce', () => {
    const second = trainer({ artifacts: [artifact('random_forest', '1'), artifact('one-feature:EventsAttended', 'b'), artifact('glm', '2')] });
    const c = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', second));
    expect([c.Reproduced, c.Differing]).toEqual([false, ['artifact glm', 'artifact random_forest']]);
    expect(c.Detail).toContain(`random_forest ${'a'.repeat(12)} ≠ ${'1'.repeat(12)}`);
  });

  it('the delivered simple baseline reproducing does not hide a finalist that does not (OF4-53)', () => {
    const second = trainer({ artifacts: [artifact('random_forest', '9'), artifact('one-feature:EventsAttended', 'b'), artifact('glm', 'c')] });
    const c = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', second));
    expect([c.Reproduced, c.Differing]).toEqual([false, ['artifact random_forest']]);
  });

  it('an inner-CV candidate whose score moves past 1e-9 differs even when every artifact is equal', () => {
    const c = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer({ innerScores: [inner('random_forest', 0.4124)] })));
    expect([c.Reproduced, c.Differing]).toEqual([false, ['inner random_forest']]);
    const within = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer({ innerScores: [inner('random_forest', 0.4123 + 1e-12)] })));
    expect(within.Reproduced).toBe(true);
  });

  it('a candidate one training has and the other lacks differs', () => {
    const c = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer({ artifacts: [artifact('random_forest', 'a'), artifact('glm', 'c')] })));
    expect([c.Reproduced, c.Differing]).toEqual([false, ['artifact one-feature:EventsAttended']]);
    expect(c.Detail).toContain('one-feature:EventsAttended missing from run-2');
  });

  it('a different snapshot, seed or code version is not a re-training: SameInputs false, not reproduced', () => {
    const otherSnapshot = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer(), SNAPSHOT.replace('C0', 'D0')));
    const noSnapshot = TrainingReproduction.Compare(fingerprint('run-1', trainer(), null), fingerprint('run-2', trainer(), null));
    const otherSeed = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer({ codeVersion: { ...CODE, seed: 43 } })));
    const otherLib = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer({ codeVersion: { ...CODE, libraryVersions: { sklearn: '1.5.3', xgboost: '2.1.1' } } })));
    expect([otherSnapshot, noSnapshot, otherSeed, otherLib].map((c) => [c.SameInputs, c.Reproduced])).toEqual([[false, false], [false, false], [false, false], [false, false]]);
    expect(otherSeed.Detail).toContain('not the same snapshot, seed and code version');
  });

  it('the snapshot ID compares case-insensitively and library versions in any key order', () => {
    const reordered: CodeVersion = { ...CODE, libraryVersions: { xgboost: '2.1.1', sklearn: '1.5.2' } };
    const c = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('run-2', trainer({ codeVersion: reordered }), SNAPSHOT.toLowerCase()));
    expect([c.SameInputs, c.Reproduced]).toEqual([true, true]);
  });

  it('the same training run twice is not a re-training, and a run with no candidate proves nothing', () => {
    const same = TrainingReproduction.Compare(fingerprint('run-1', trainer()), fingerprint('RUN-1', trainer()));
    const empty = TrainingReproduction.Compare(fingerprint('run-1', trainer({ artifacts: [], innerScores: [] })), fingerprint('run-2', trainer({ artifacts: [], innerScores: [] })));
    expect([same.SameInputs, same.Reproduced, empty.Reproduced, empty.CandidatesCompared]).toEqual([false, false, false, 0]);
  });

  it('a run that returns one candidate twice is refused rather than compared on the last one', () => {
    expect(() => fingerprint('run-1', trainer({ artifacts: [artifact('glm', 'c'), artifact('glm', 'd')] }))).toThrow(/returned candidate 'glm' twice/);
  });
});
