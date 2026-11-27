/**
 * PR 5 milestone B3 — G7.6 (`C1 → S3.3`), F-FP-11 (scoring half): a model whose pinned Feature Pipeline version is not
 * the pipeline's Active version, or whose prediction pin names a model that is no longer its binding's pipeline's
 * Published model, is refused before any record is read (`feature-version-mismatch`), on every scoring entry path; and
 * training refuses a pin whose version row is gated and has no passing golden-set result, while an ungated version is
 * activated (D5-31, F-005).
 *
 * - attack 1: a model trained on version 1, the Active version moved to 2 → refused, 0 Feature Values written;
 * - attack 2: a new Published upstream model → downstream scoring refused until the downstream model is retrained;
 * - attack 3: `Score` (the binding path: Score Record Set with a binding, a scheduled scoring run, the PredictiveStudio
 *   operation), `Admit` (the bound Record Process's `MLModelInferenceProcessor.Preflight`) and `Predict` (the model path)
 *   → each refused the same way;
 * - attack 8 (training half): an ungated Active version is not refused; a gated one without a passing result is.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import type { FeatureValuePin, FeatureVersionPin, PredictionFeaturePin } from '@memberjunction/predictive-studio-core';

import { ScoringService } from '../scoring-service';
import { FeaturePinCheck } from '../feature-pin-check';
import { Records, ScoringServiceWorld, type WorldModelRef } from '../../__tests__/fakes/scoring-service-world';

const RP = 'B3000000-0000-4000-8000-0000000000A1';
const asOf = new Date('2026-03-04T00:00:00Z');
const scope = Records('r1', 'r2');

let world: ScoringServiceWorld;
let model: WorldModelRef;
let binding: MJMLModelScoringBindingEntity;

/** A version-1 pin of the fixture job-title pipeline. */
const v1: FeatureVersionPin = { featurePipelineRecordProcessId: RP, pipelineVersion: 1, promptVersionHash: 'pvh-1', aiModelId: null, parametersHash: 'ph-1' };

/** A unit-model lineage whose only Feature Value column is `name`, pinned to `pin`. */
function lineage(name: string, pin: FeatureValuePin): string {
  return JSON.stringify({
    predictionUnitId: 'unit-1', predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: 'Memberships', categoryLevels: {},
    trainingSnapshotId: 'snap-1', snapshotContentHash: 'hash-1',
    featureSpec: [{ name, source: { kind: 'feature-value', featureName: name, pin }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }],
  });
}

/** Version rows of the fixture pipeline: `active` is Active, the others Retired. */
function versions(active: number, rows: { Version: number; Gated?: boolean; Threshold?: number | null; ResultValue?: number | null; GoldenSetTestRunID?: string | null }[]): void {
  world.Store.Tables['MJ: Feature Pipeline Versions'] = rows.map((r) => ({
    ID: `ver-${r.Version}`, RecordProcessID: RP, Version: r.Version, Status: r.Version === active ? 'Active' : 'Retired', PromptVersionHash: `pvh-${r.Version}`,
    AIModelID: null, ParametersHash: `ph-${r.Version}`, Gated: r.Gated === true, Threshold: r.Threshold ?? null, ResultValue: r.ResultValue ?? null,
    GoldenSetTestRunID: r.GoldenSetTestRunID ?? null, ResultDetails: null,
  }));
}

/** Sets the model's stored lineage. */
function pinModel(m: WorldModelRef, name: string, pin: FeatureValuePin): void {
  const row = world.ModelRow(m);
  if (!row) throw new Error('no model row');
  row['Lineage'] = lineage(name, pin);
}

beforeEach(async () => {
  world = new ScoringServiceWorld();
  model = world.Model();
  binding = await world.Binding(model);
  pinModel(model, 'GateJobTitle', v1);
});

describe('FeaturePinCheck.Compare', () => {
  it('a pin of the Active version passes', async () => {
    versions(1, [{ Version: 1 }]);
    expect(await FeaturePinCheck.Compare([v1], world.Provider, ScoringServiceWorld.User)).toBeNull();
  });

  it('attack 1: the Active version moved to 2 → feature-version-mismatch naming the pinned and the active pin', async () => {
    versions(2, [{ Version: 1 }, { Version: 2 }]);
    const refusal = await FeaturePinCheck.Compare([v1], world.Provider, ScoringServiceWorld.User, () => 'GateJobTitle');
    expect(refusal).toEqual({
      kind: 'feature-version-mismatch', featureName: 'GateJobTitle', pinned: v1,
      active: { featurePipelineRecordProcessId: RP, pipelineVersion: 2, promptVersionHash: 'pvh-2', aiModelId: null, parametersHash: 'ph-2' },
    });
  });

  it('a pipeline with no Active version refuses (nothing to compare with is not a match)', async () => {
    versions(9, [{ Version: 1 }]);
    const refusal = await FeaturePinCheck.Compare([v1], world.Provider, ScoringServiceWorld.User);
    expect(refusal).toMatchObject({ kind: 'feature-version-mismatch', active: { featurePipelineRecordProcessId: RP, pipelineVersion: null } });
  });

  it('attack 2: a prediction pin whose binding\'s pipeline has another Published model refuses until the downstream model is retrained', async () => {
    const upstreamOld = world.Model({ Status: 'Archived' });
    const upstreamNew = world.Model({ Status: 'Published' }, upstreamOld.PipelineID);
    const upstreamBinding = await world.Binding(upstreamOld, { FeatureName: 'RenewalScore' });
    const pin: PredictionFeaturePin = { mlModelScoringBindingId: upstreamBinding.ID, mlModelId: upstreamOld.ID };
    expect(await FeaturePinCheck.Compare([pin], world.Provider, ScoringServiceWorld.User)).toEqual({
      kind: 'feature-version-mismatch', featureName: 'RenewalScore', pinned: pin, active: { mlModelScoringBindingId: upstreamBinding.ID, mlModelId: upstreamNew.ID },
    });
    // retrained on the new upstream model's predictions: its pin names the Published model
    expect(await FeaturePinCheck.Compare([{ ...pin, mlModelId: upstreamNew.ID }], world.Provider, ScoringServiceWorld.User)).toBeNull();
  });

  it('no pins: nothing to check', async () => {
    expect(await FeaturePinCheck.Compare([], world.Provider, ScoringServiceWorld.User)).toBeNull();
  });
});

describe('attack 3: every scoring entry path refuses a stale pin before any record', () => {
  beforeEach(() => versions(2, [{ Version: 1 }, { Version: 2 }]));
  const expected = { kind: 'feature-version-mismatch', featureName: 'GateJobTitle', pinned: v1 };

  it('ScoringService.Score (the binding path) → refused, a refused run row, 0 Feature Values written, no assembly', async () => {
    const r = await new ScoringService(world.Ctx()).Score(binding, scope, asOf, false);
    expect(r).toMatchObject({ Status: 'refused', ModelID: model.ID, Reason: expected });
    expect([world.Values.Calls(), world.Target.Writes, world.Runtime.AsOfArguments()]).toEqual([[], 0, []]);
    expect(world.Runs().map((x) => x['Status'])).toEqual(['refused']);
  });

  it('ScoringService.Admit (a bound Record Process\'s Preflight) → refused the same way', async () => {
    const r = await new ScoringService(world.Ctx()).Admit(binding, scope, asOf, false);
    expect(r).toMatchObject({ Status: 'refused', Reason: expected });
    expect(world.Values.Calls()).toEqual([]);
  });

  it('ScoringService.Predict (the model path) → refused the same way', async () => {
    const p = await new ScoringService({ ...world.Ctx(), Path: 'predict' }).Predict(world.RequestFor(model.ID, scope));
    expect(p.Result).toMatchObject({ Status: 'refused', Reason: expected });
    expect(p.Rows).toEqual([]);
  });

  it('a model pinned to the Active version scores (the check is not a blanket refusal)', async () => {
    versions(1, [{ Version: 1 }, { Version: 2 }]);
    const r = await new ScoringService(world.Ctx()).Score(binding, scope, asOf, false);
    expect(r).toMatchObject({ Status: 'completed' });
  });
});

describe('attack 4 / attack 8 (training half): FeaturePinCheck.TrainingActivation', () => {
  it('attack 8: an ungated Active version (no golden set) is not refused', async () => {
    versions(1, [{ Version: 1, Gated: false }]);
    expect(await FeaturePinCheck.TrainingActivation([{ Name: 'GateJobTitle', Pin: v1 }], world.Provider, ScoringServiceWorld.User)).toBeNull();
  });

  it('attack 4: a gated version without a passing golden-set result refuses training (unpinned-feature-version)', async () => {
    versions(1, [{ Version: 1, Gated: true, Threshold: 0.9, ResultValue: 0.5, GoldenSetTestRunID: 'gs-1' }]);
    expect(await FeaturePinCheck.TrainingActivation([{ Name: 'GateJobTitle', Pin: v1 }], world.Provider, ScoringServiceWorld.User))
      .toEqual({ kind: 'unpinned-feature-version', featureName: 'GateJobTitle' });
  });

  it('a gated version with a passing result trains', async () => {
    versions(1, [{ Version: 1, Gated: true, Threshold: 0.9, ResultValue: 0.95, GoldenSetTestRunID: 'gs-1' }]);
    expect(await FeaturePinCheck.TrainingActivation([{ Name: 'GateJobTitle', Pin: v1 }], world.Provider, ScoringServiceWorld.User)).toBeNull();
  });

  it('a prediction pin has no version row to activate', async () => {
    const pin: PredictionFeaturePin = { mlModelScoringBindingId: binding.ID, mlModelId: model.ID };
    expect(await FeaturePinCheck.TrainingActivation([{ Name: 'RenewalScore', Pin: pin }], world.Provider, ScoringServiceWorld.User)).toBeNull();
  });
});
