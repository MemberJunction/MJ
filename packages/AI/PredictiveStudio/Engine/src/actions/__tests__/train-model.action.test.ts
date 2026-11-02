import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { GateRecords, TRAINING_RUN_RESULTS_SCHEMA, TrainerContract, type TrainerCompleted, type TrainingRunResults } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioTrainModelAction } from '../train-model.action';
import { TrainingEngine } from '../../training/training-engine';
import { TrainingRefusedError } from '../../training/training-refusal';
import type { TrainModelInput, TrainModelResult, TrainingDeps } from '../../training/types';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { FakeEntityFactory, FakeEvaluationProtocolStore, FakeMLModel, FakeMLRun } from '../../__tests__/fakes/training-fakes';
import type { IEvaluationProtocolStore } from '../../training/evaluation-protocol-store';

/**
 * Unit tests for the Train ML Model action. NO live DB, NO live sidecar — the
 * TrainingEngine is mocked via the action's overridable `createEngine` seam. These
 * prove the action stays thin: param validation, correctly-mapped delegation to
 * `TrainingEngine.trainModel`, the retired MaxRows refused by name, and the
 * stored decision mapped onto the output params (incl. the leakage flag read from the run notes).
 */

/** A captured-call mock TrainingEngine — records input/deps, returns canned model+run. */
class MockTrainingEngine extends TrainingEngine {
  public LastInput: TrainModelInput | null = null;
  public LastDeps: TrainingDeps | null = null;
  public CallCount = 0;

  constructor(private readonly result: TrainModelResult) {
    super();
  }

  public override async trainModel(input: TrainModelInput, deps: TrainingDeps): Promise<TrainModelResult> {
    this.CallCount++;
    this.LastInput = input;
    this.LastDeps = deps;
    return this.result;
  }
}

/** Inert deps bundle — the mock engine never reads it; it only proves threading. */
function inertDeps(): TrainingDeps {
  return {
    entityFactory: {} as TrainingDeps['entityFactory'],
    recordLoader: {} as TrainingDeps['recordLoader'],
    artifactStore: {} as TrainingDeps['artifactStore'],
    contextUser: {} as TrainingDeps['contextUser'],
    provider: {} as TrainingDeps['provider'],
  };
}

/** Test subclass injecting a mock engine + inert deps, exposing a clean `run`. */
class TestableTrainAction extends PredictiveStudioTrainModelAction {
  constructor(private readonly engine: TrainingEngine) {
    super();
  }
  protected override createEngine(): TrainingEngine {
    return this.engine;
  }
  protected override async buildDeps(): Promise<TrainingDeps> {
    return inertDeps();
  }
  protected override protocolStore(): IEvaluationProtocolStore {
    return new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ Version: 2 })]);
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

const PROTOCOL = ProtocolRowFixture.Spec();
const RUN_ID = '00000000-0000-0000-0000-0000000000a1';

/** The v2 envelope a completed run stores for `result` (the gate record built by the owner training uses). */
function storedResults(result: TrainerCompleted): string {
  const built = GateRecords.BuildStoredGateRecord({ Result: result, Protocol: PROTOCOL, Task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, Carve: null });
  if (built.Ok === false) throw new Error(`the fixture's gate record was refused: ${built.Refusal.kind}`);
  const envelope: TrainingRunResults = {
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 10, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 10, dataCutoff: '2026-01-01' },
    trainer: TrainerContract.ToStoredTrainerResult(result, new Map(result.artifacts.map((a, i): [string, string] => [a.candidate, `F${i + 1}`]))),
    trainerRequest: null, carve: null, gate: built.Record,
  };
  return JSON.stringify(envelope);
}

/** A typed engine result over the shared fake rows (the fake factory is the one seam that types them as entities). */
async function resultOf(run: Partial<FakeMLRun>, model: Partial<FakeMLModel> | null): Promise<TrainModelResult> {
  const r = Object.assign(new FakeMLRun('run-1'), { TrainingSnapshotID: 'snap-1', EvaluationProtocolID: ProtocolRowFixture.ID }, run);
  const m = model === null ? null : Object.assign(new FakeMLModel('model-1'), model);
  const factory = new FakeEntityFactory(() => m || new FakeMLModel('unused'), () => r);
  return {
    model: m === null ? null : await factory.getEntityObject<MJMLModelEntity>('MJ: ML Models'),
    run: await factory.getEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs'),
  };
}

/** A shipped-member run: model v5 (Draft) with stored scores, the gate keeping the simple baseline `glm`. */
function shippedRun(notes: string | null): Promise<TrainModelResult> {
  return resultOf({ Notes: notes, ValidationResults: storedResults(TrainerResultFixtures.CannedCompleted(RUN_ID, PROTOCOL)) }, { Version: 5, Status: 'Draft', HoldoutMetrics: JSON.stringify({ auc: 0.81 }) });
}
function params(list: ActionParam[]): RunActionParams {
  return { Params: list } as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}

describe('PredictiveStudioTrainModelAction — validation', () => {
  it('fails when PipelineID is missing', async () => {
    const engine = new MockTrainingEngine(await shippedRun(null));
    const result = await new TestableTrainAction(engine).run(params([]));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(engine.CallCount).toBe(0);
  });
});

describe('PredictiveStudioTrainModelAction — happy path', () => {
  it('delegates to TrainingEngine.trainModel with the pipeline id and maps the stored decision onto the outputs', async () => {
    const engine = new MockTrainingEngine(await shippedRun('Training completed. No single-feature dominance detected.'));
    const p = params([{ Name: 'PipelineID', Type: 'Input', Value: 'pipe-99' }]);

    const result = await new TestableTrainAction(engine).run(p);

    expect(engine.CallCount).toBe(1);
    expect(engine.LastInput).toEqual({ pipelineId: 'pipe-99' });
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(['ModelID', 'HoldoutMetrics', 'LeakageFlagged', 'GateOutcome', 'TrainingSnapshotID', 'EvaluationProtocolID'].map((n) => out(p, n)))
      .toEqual(['model-1', JSON.stringify({ auc: 0.81 }), false, 'keep-simple-baseline', 'snap-1', ProtocolRowFixture.ID]);
    expect(out(p, 'GateReason')).toEqual(expect.any(String));
  });

  it('refuses a supplied MaxRows by name, without training', async () => {
    const errors = ConsoleCapture.Errors();
    const engine = new MockTrainingEngine(await shippedRun(null));
    const p = params([{ Name: 'PipelineID', Type: 'Input', Value: 'pipe-99' }, { Name: 'MaxRows', Type: 'Input', Value: 500 }]);
    const result = await new TestableTrainAction(engine).run(p);
    expect([result.Success, result.ResultCode, engine.CallCount]).toEqual([false, 'TRAINING_FAILED', 0]);
    expect(result.Message).toBe('Training failed: Refused (input-not-accepted): maxRows — Train ML Model no longer accepts MaxRows: the Prediction Unit declares the decision date and the row key, and every eligible row is read. Remove them from the call.');
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining('Train ML Model no longer accepts MaxRows')]);
  });
});

describe('PredictiveStudioTrainModelAction — a run that shipped no model', () => {
  it('succeeds with ModelID null, the gate outcome and reason set, the message the stored gate reason', async () => {
    const run = await resultOf({ Notes: 'Trainer completed.', ValidationResults: TrainerResultFixtures.NoSignalValidationResults() }, null);
    const p = params([{ Name: 'PipelineID', Type: 'Input', Value: 'pipe-1' }]);
    const result = await new TestableTrainAction(new MockTrainingEngine(run)).run(p);
    expect([result.Success, out(p, 'ModelID'), out(p, 'HoldoutMetrics'), out(p, 'LeakageFlagged'), out(p, 'GateOutcome'), out(p, 'GateReason')])
      .toEqual([true, null, null, false, 'no-signal', TrainerResultFixtures.NoSignalReason]);
    expect(result.Message).toBe(`Training run run-1 completed and shipped no model: ${TrainerResultFixtures.NoSignalReason}`);
  });
});

describe('PredictiveStudioTrainModelAction — leakage flag', () => {
  it('surfaces LeakageFlagged=true when the run notes carry a LEAKAGE WARNING', async () => {
    const engine = new MockTrainingEngine(await shippedRun('LEAKAGE WARNING: one field ("cancelled_flag") is doing almost all the predicting'));
    const p = params([{ Name: 'PipelineID', Type: 'Input', Value: 'pipe-1' }]);

    const result = await new TestableTrainAction(engine).run(p);

    expect(result.Success).toBe(true);
    expect(out(p, 'LeakageFlagged')).toBe(true);
    expect(result.Message?.toLowerCase()).toContain('leakage');
  });
});

describe('PredictiveStudioTrainModelAction — engine error', () => {
  it('maps a thrown engine error to a TRAINING_FAILED result', async () => {
    const errors = ConsoleCapture.Errors();
    class ThrowingEngine extends TrainingEngine {
      public override async trainModel(): Promise<TrainModelResult> {
        throw new Error('sidecar unreachable');
      }
    }
    const result = await new TestableTrainAction(new ThrowingEngine()).run(
      params([{ Name: 'PipelineID', Type: 'Input', Value: 'pipe-1' }]),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('TRAINING_FAILED');
    expect(result.Message).toContain('sidecar unreachable');
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("sidecar unreachable")]);
  });

  it('keeps a refusal\'s typed code instead of TRAINING_FAILED', async () => {
    const errors = ConsoleCapture.Errors();
    class RefusingEngine extends TrainingEngine {
      public override async trainModel(): Promise<TrainModelResult> {
        throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-required', pipelineId: 'pipe-1', why: 'no unit' } });
      }
    }
    const result = await new TestableTrainAction(new RefusingEngine()).run(
      params([{ Name: 'PipelineID', Type: 'Input', Value: 'pipe-1' }]),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('UNIT_REQUIRED');
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("Refused (unit-required): pipeline pipe-1 \u2014 no unit")]);
  });
});
