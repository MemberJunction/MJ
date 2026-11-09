import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import type { UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
  EvaluationProtocol,
  type CalibrationReport,
  type EvaluationProtocolSpec,
  type SourceColumnImportance,
  type TrainerCompleted,
  type TrainerRequest,
} from '@memberjunction/predictive-studio-core';

import { TrainerResultFixtures } from './fixtures/trainer-result';
import { ProtocolRowFixture } from './fixtures/protocol-row';
import { FakeEvaluationProtocolStore, FakeMLModel, FakeTrainer, TrainingHarness, fakeProvider } from '../../__tests__/fakes/training-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { TrainerModelLineageReader } from '../trainer-model-lineage';
import type { TrainModelResult } from '../types';
import { ProductionModelPromotionGate } from '../../actions/promote-model.gate';
import type { PromoteModelRequest } from '../../actions/promote-model.action';
import { PipelineAutoTrainer } from '../../scoring/auto-train';
import type { AutoTrainRequest } from '../../scoring/types';

/**
 * What a trainer run records on its model decides what promotion may do with it: the run's leakage audit (G-6) and the
 * finalist's calibration hold (G-9) travel on the model's Lineage, and the real promotion gate and auto-train path read
 * them there. No live DB, no live sidecar: the training fakes and a gate whose model load is the trained fake.
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

/** The real promotion gate over one trained model fake, with the pipeline's dominance threshold. */
class TrainedModelGate extends ProductionModelPromotionGate {
  constructor(private readonly model: FakeMLModel, private readonly threshold = 0.6) {
    super();
  }
  protected override async loadModel(modelId: string): Promise<MJMLModelEntity | null> {
    // Single deliberate test-double cast: the fake exposes the typed members the gate reads and Save().
    return UUIDsEqual(modelId, this.model.ID) ? (this.model as unknown as MJMLModelEntity) : null;
  }
  protected override async resolveThreshold(): Promise<number> {
    return this.threshold;
  }
}

function request(model: FakeMLModel, over: Partial<PromoteModelRequest> = {}): PromoteModelRequest {
  return { modelId: model.ID, targetStatus: 'Validated', signOff: false, provider: fakeProvider, ...over };
}

/** The production auto-trainer with its train step returning the trained model and no reuse or repoint. */
class TrainedModelAutoTrainer extends PipelineAutoTrainer {
  public readonly Repointed: string[] = [];
  constructor(model: FakeMLModel) {
    super({ gate: new TrainedModelGate(model), train: async () => model as unknown as MJMLModelEntity });
  }
  protected override async findReusableModel(): Promise<string | null> {
    return null;
  }
  protected override async repoint(_r: AutoTrainRequest, modelId: string): Promise<void> {
    this.Repointed.push(modelId);
  }
}

const AUTO_TRAIN: AutoTrainRequest = { pipelineId: PIPELINE_ID, currentModelId: null, recordProcessId: null };
/** No acting user: the gate then skips its scoring-action sync, which reads Action metadata. */
const NO_USER = undefined as unknown as UserInfo;

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

  it('refuses to promote the kept baseline without a sign-off, and promotes it with a sign-off and a reason', async () => {
    const { model } = await train(keptBaseline({ importance: LEAKING }));
    const status = ConsoleCapture.Status();
    const refused = await new TrainedModelGate(model).promote(request(model));
    expect(refused).toMatchObject({ kind: 'refused-leakage', topFeature: 'EventsAttended' });
    expect([model.Status, model.SaveCallCount]).toEqual(['Draft', 1]);
    const signedOff = await new TrainedModelGate(model).promote(request(model, { signOff: true, reason: 'EventsAttended is recorded before the decision date.' }));
    expect(signedOff).toMatchObject({ kind: 'promoted', newStatus: 'Validated' });
    expect(signedOff.kind === 'promoted' ? signedOff.signOffNote : '').toContain('on feature "EventsAttended"');
    // the sign-off override is logged for audit
    expect(ConsoleCapture.Lines(status)).toEqual([expect.stringContaining("Leakage sign-off override for ML Model 'model-1'")]);
  });

  it("judges the audit against the pipeline's current threshold, as it judges the importance", async () => {
    const { model } = await train(keptBaseline({ importance: [importanceOf('EventsAttended', 0.7), importanceOf('Region', 0.3)] }));
    expect(await new TrainedModelGate(model, 0.6).promote(request(model))).toMatchObject({ kind: 'refused-leakage', topFeature: 'EventsAttended', topShare: 0.7 });
    expect(await new TrainedModelGate(model, 0.8).promote(request(model))).toMatchObject({ kind: 'promoted', newStatus: 'Validated' });
  });

  it('auto-train does not publish the kept baseline: it stays Draft and nothing is repointed', async () => {
    const { model } = await train(keptBaseline({ importance: LEAKING }));
    const trainer = new TrainedModelAutoTrainer(model);
    await expect(trainer.EnsureTrainedModel(AUTO_TRAIN, NO_USER, fakeProvider)).rejects.toThrow(/possible target leakage on "EventsAttended" needs human sign-off/);
    expect([model.Status, trainer.Repointed]).toEqual(['Draft', []]);
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

  it('refuses to move a held model to Validated or Published, even with a sign-off and a reason; Archived is allowed', async () => {
    const { model } = await train(finalistShips({ calibration: calibration(0.5) }));
    const gate = new TrainedModelGate(model);
    expect(await gate.promote(request(model))).toEqual({ kind: 'refused-calibration', slope: 0.5 });
    expect(await gate.promote(request(model, { signOff: true, reason: 'looks fine to me' }))).toEqual({ kind: 'refused-calibration', slope: 0.5 });
    model.Status = 'Validated';
    expect(await gate.promote(request(model, { targetStatus: 'Published', signOff: true, reason: 'ship it' }))).toEqual({ kind: 'refused-calibration', slope: 0.5 });
    expect(await gate.promote(request(model, { targetStatus: 'Archived' }))).toMatchObject({ kind: 'promoted', newStatus: 'Archived' });
  });

  it('auto-train does not publish a held model', async () => {
    const { model } = await train(finalistShips({ calibration: calibration(0.5) }));
    const trainer = new TrainedModelAutoTrainer(model);
    await expect(trainer.EnsureTrainedModel(AUTO_TRAIN, NO_USER, fakeProvider)).rejects.toThrow(/calibration/);
    expect([model.Status, trainer.Repointed]).toEqual(['Draft', []]);
  });
});

