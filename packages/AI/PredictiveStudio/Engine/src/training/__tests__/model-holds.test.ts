import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
  EvaluationProtocol,
  TrainingRunResultsParser,
  type Actor,
  type CalibrationReport,
  type EvaluationProtocolSpec,
  type LeakageFlag,
  type SourceColumnImportance,
  type TrainerCompleted,
  type TrainerRequest,
} from '@memberjunction/predictive-studio-core';

import { TrainerResultFixtures } from './fixtures/trainer-result';
import { ProtocolRowFixture } from './fixtures/protocol-row';
import { FakeEvaluationProtocolStore, FakeMLModel, FakeTrainer, TrainingHarness } from '../../__tests__/fakes/training-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { TrainerModelLineageReader } from '../trainer-model-lineage';
import type { TrainModelResult } from '../types';
import { PipelineAutoTrainer } from '../../scoring/auto-train';
import type { AutoTrainRequest } from '../../scoring/types';
import { GateTestStore, GateWorld, type WorldModel } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { GateContexts } from '../../registry/gate-seams';
import type { GateContext } from '../../registry/gate-context';

/**
 * What a trainer run records decides what the lifecycle gate may do with its model: the run's leakage flags (stored on
 * the run's `ValidationResults.trainer`) and the finalist's calibration hold (on the model's Lineage, G-9). The model's
 * Lineage leakage audit (G-6) is still recorded, and the gate judges leakage only by the trainer's stored flags (PR 4
 * §5.1: the single-feature-dominance re-run is kept only for Unevaluated pre-change models). No live DB, no live
 * sidecar: the training fakes, then the real `LifecycleGate` over the `GateTestStore` world with the trained Lineage
 * and flags copied onto its rows.
 */

beforeEach(() => {
  vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const PIPELINE_ID = '8A1C44F3-938C-4E65-B6DE-D621BC4C3001';

/** The parsed protocol row the harness binds. */
function protocolSpec(): EvaluationProtocolSpec {
  const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(ProtocolRowFixture.Row());
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

/** A source column's held-out permutation importance, as the trainer reports it. */
function importanceOf(sourceColumn: string, value: number): SourceColumnImportance {
  return { sourceColumn, permutationImportance: TrainerResultFixtures.Mwi('log-loss', value, value, value, 8) };
}

/** A finalist importance one leaking column dominates (99% of the total). */
const LEAKING = [importanceOf('EventsAttended', 0.95), importanceOf('Region', 0.01)];

/** The gate keeps the GLM (a simple baseline member ships): `CannedCompleted`. */
function keptBaseline(over: Partial<TrainerCompleted> = {}): (r: TrainerRequest) => TrainerCompleted {
  return (r) => ({ ...TrainerResultFixtures.CannedCompleted(r.trainingRunId, protocolSpec(), r.snapshot.featureSchemaHash), ...over });
}

/** The gate ships the finalist `xgb`: `CannedModelWins`. */
function finalistShips(over: Partial<TrainerCompleted> = {}): (r: TrainerRequest) => TrainerCompleted {
  return (r) => ({ ...TrainerResultFixtures.CannedModelWins(r.trainingRunId, protocolSpec(), r.snapshot.featureSchemaHash), ...over });
}

const calibration = (slope: number): CalibrationReport => ({ method: 'auto', intercept: 0, slope, reliability: [] });

/** Train the unit-years pipeline (a binary unit) once with the given trainer answer. */
async function train(answer: (r: TrainerRequest) => TrainerCompleted): Promise<Omit<TrainModelResult, 'model'> & { model: FakeMLModel }> {
  const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
  harness.deps.protocols = new FakeEvaluationProtocolStore([TrainingHarness.UnitProtocolRow()]);
  harness.deps.trainer = new FakeTrainer(answer);
  const result = await harness.engine.trainModel({ pipelineId: harness.pipeline.ID }, harness.deps);
  const model = harness.models.find((m) => result.model !== null && UUIDsEqual(m.ID, result.model.ID));
  if (model === undefined) throw new Error(`training run ${result.run.ID} shipped no model`);
  return { ...result, model };
}

const storage = new MemoryStorageAccount('model-holds', []);
RegisterMemoryStorage('PS Model Holds Test Storage', storage);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Model Holds Storage', 'PS Model Holds Test Storage', true);
const human: Actor = { kind: 'human', userId: GateWorld.User.ID };

/** The real lifecycle gate over a `GateTestStore` world, its scoring-Action seam recorded. */
interface GateWorldRig { readonly Store: GateTestStore; readonly World: GateWorld; readonly Gate: LifecycleGate; readonly Ctx: GateContext }
function gateWorld(): GateWorldRig {
  storage.Reset();
  ServeStorageProviders([providerRow]);
  const store = new GateTestStore();
  const world = new GateWorld(store, storage);
  return { Store: store, World: world, Gate: new LifecycleGate(new StorageProviderArtifactLoader(), undefined, new RecordingScoringActions()), Ctx: GateContexts.ForRequest({ ContextUser: GateWorld.User, Provider: store.Provider() }) };
}

/** A world model of `status` carrying the trained model's Lineage (its calibration hold) and its run's stored leakage flags. */
function asWorldModel(rig: GateWorldRig, status: 'Draft' | 'Validated', trained: { readonly Lineage: string | null }, flags: readonly LeakageFlag[]): WorldModel {
  const model = rig.World.Model(status, 'model');
  const row = rig.Store.Row('MJ: ML Models', model.ID);
  if (row) row['Lineage'] = trained.Lineage;
  if (flags.length > 0) rig.Store.FlagLeakage(model.ID, flags);
  return model;
}

/** The trainer leakage flags a run stores on `ValidationResults.trainer`. */
function storedFlags(run: { readonly ValidationResults: string | null }): readonly LeakageFlag[] {
  const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
  if (!parsed.Ok || parsed.Value.status !== 'completed') throw new Error('the run stores no completed envelope');
  return parsed.Value.trainer?.leakageFlags || [];
}

/** The production auto-trainer over the gate world: its train step returns `model` (its ID and run), no reuse or repoint. */
class WorldAutoTrainer extends PipelineAutoTrainer {
  public readonly Repointed: string[] = [];
  constructor(rig: GateWorldRig, model: WorldModel) {
    // Single deliberate test-double cast: auto-train reads only the trained row's ID and TrainingRunID.
    super({ gate: rig.Gate, train: async () => ({ ID: model.ID, TrainingRunID: model.RunID }) as unknown as MJMLModelEntity });
  }
  protected override async findReusableModel(): Promise<string | null> {
    return null;
  }
  protected override async repoint(_r: AutoTrainRequest, modelId: string): Promise<void> {
    this.Repointed.push(modelId);
  }
}

const AUTO_TRAIN: AutoTrainRequest = { pipelineId: PIPELINE_ID, currentModelId: null, recordProcessId: null };
const LEAKY_FLAG: LeakageFlag = { kind: 'single-feature-auc', sourceColumn: 'EventsAttended', heldOutAuc: 0.97 };

describe('G-6: a kept simple baseline carries the run\'s leakage audit to promotion', () => {
  it("records the finalist importance's top feature and share on the kept baseline's Lineage, whose own importance is {}", async () => {
    const { model, run } = await train(keptBaseline({ importance: LEAKING }));
    expect(JSON.parse(model.Lineage || '{}')).toMatchObject({ shippedMember: 'glm' });
    expect(model.FeatureImportance).toBe('{}');
    const audit = TrainerModelLineageReader.LeakageAuditOf(model.Lineage);
    expect(audit?.topFeature).toBe('EventsAttended');
    expect(audit?.topShare).toBeCloseTo(0.95 / 0.96, 10);
    expect(run.Notes).toContain('LEAKAGE WARNING: one field ("EventsAttended")');
  });

  it('records the audit on a shipped finalist too, and none when the trainer measured no importance', async () => {
    const shipped = await train(finalistShips({ importance: LEAKING }));
    expect(TrainerModelLineageReader.LeakageAuditOf(shipped.model.Lineage)?.topFeature).toBe('EventsAttended');
    const unmeasured = await train(keptBaseline());
    expect(JSON.parse(unmeasured.model.Lineage || '{}')).toMatchObject({ trainingLeakageAudit: null });
  });

  it("stores the trainer's leakage flags on the run, and the lifecycle gate withholds the publish of the model they flag", async () => {
    const { model, run } = await train(finalistShips({ importance: LEAKING, leakageFlags: [LEAKY_FLAG] }));
    expect(storedFlags(run)).toEqual([LEAKY_FLAG]);
    const rig = gateWorld();
    const candidate = asWorldModel(rig, 'Validated', model, storedFlags(run));
    const request = { modelId: candidate.ID, purpose: 'publish' as const, initiator: human, signOffId: null, reason: null };
    expect(await rig.Gate.Publish(request, rig.Ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'unacknowledged-leakage-flags', flags: ['single-feature-auc'] }, Transient: false });
    expect(rig.Store.Status(candidate.ID)).toBe('Validated');
  });

  it('auto-train evaluates a flagged model but does not serve it: the error names the flag, and nothing is repointed', async () => {
    const { model, run } = await train(finalistShips({ leakageFlags: [LEAKY_FLAG] }));
    const rig = gateWorld();
    const trained = asWorldModel(rig, 'Draft', model, storedFlags(run));
    const trainer = new WorldAutoTrainer(rig, trained);
    await expect(trainer.EnsureTrainedModel(AUTO_TRAIN, GateWorld.User, rig.Store.Provider())).rejects.toThrow(/single-feature-auc.*sign-off/);
    expect([rig.Store.Status(trained.ID), trainer.Repointed, rig.Store.PublishRecords(trained.ID)]).toEqual(['Validated', [], []]);
  });
});

describe('G-9: a shipped finalist whose calibration hides its family is held', () => {
  it('holds a finalist whose holdout slope is 0.5: Draft, the hold on its Lineage and a CALIBRATION HOLD note', async () => {
    const { model, run } = await train(finalistShips({ calibration: calibration(0.5) }));
    expect(model.Status).toBe('Draft');
    expect(TrainerModelLineageReader.CalibrationHoldOf(model.Lineage)).toEqual({ slope: 0.5 });
    expect(run.Notes).toContain('CALIBRATION HOLD: the model\'s probabilities are miscalibrated on the held-back rows (calibration slope 0.50, outside the 0.8–1.2 range)');
  });

  it('holds a binary finalist with no calibration report: the slope could not be measured', async () => {
    const { model, run } = await train(finalistShips({ calibration: null }));
    expect(TrainerModelLineageReader.CalibrationHoldOf(model.Lineage)).toEqual({ slope: null });
    expect(run.Notes).toContain('CALIBRATION HOLD: the calibration slope of the model\'s probabilities could not be measured on the held-back rows');
  });

  it('holds nothing when the slope is 1.0, and does not judge a kept baseline by the finalist\'s report', async () => {
    for (const answer of [finalistShips({ calibration: calibration(1.0) }), keptBaseline({ calibration: calibration(0.5) })]) {
      const { model, run } = await train(answer);
      expect(JSON.parse(model.Lineage || '{}')).toMatchObject({ calibrationHold: null });
      expect(run.Notes).not.toContain('CALIBRATION HOLD');
    }
  });

  it('the lifecycle gate refuses calibration-held for the trained Lineage at Evaluate and at Publish (an interactive user included); Archive is allowed', async () => {
    const { model } = await train(finalistShips({ calibration: calibration(0.5) }));
    const rig = gateWorld();
    const draft = asWorldModel(rig, 'Draft', model, []);
    expect(await rig.Gate.Evaluate({ modelId: draft.ID }, human, rig.Ctx)).toEqual({ Kind: 'refused', Refusal: { kind: 'calibration-held', slope: 0.5 } });
    const validated = asWorldModel(rig, 'Validated', model, []);
    const request = { modelId: validated.ID, purpose: 'publish' as const, initiator: human, signOffId: null, reason: null };
    expect(await rig.Gate.Publish(request, rig.Ctx)).toMatchObject({ Kind: 'withheld', Refusal: { kind: 'calibration-held', slope: 0.5 } });
    expect(await rig.Gate.Archive(validated.ID, 'held for calibration', human, rig.Ctx)).toMatchObject({ Ok: true, To: 'Archived' });
    expect([rig.Store.Status(draft.ID), rig.Store.Status(validated.ID)]).toEqual(['Draft', 'Archived']);
  });

  it('auto-train does not serve a held model: the gate refuses its evaluation and it stays Draft', async () => {
    const { model } = await train(finalistShips({ calibration: calibration(0.5) }));
    const rig = gateWorld();
    const held = asWorldModel(rig, 'Draft', model, []);
    const trainer = new WorldAutoTrainer(rig, held);
    await expect(trainer.EnsureTrainedModel(AUTO_TRAIN, GateWorld.User, rig.Store.Provider())).rejects.toThrow(/calibration/);
    expect([rig.Store.Status(held.ID), trainer.Repointed]).toEqual(['Draft', []]);
  });
});

