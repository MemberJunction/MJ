import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
  MJMLModelEntity, MJMLTrainingRunEntity, PredictiveStudioTrainModelInput, RetiredTrainModelInputs,
} from '@memberjunction/core-entities';
import { GateRecords, TRAINING_RUN_RESULTS_SCHEMA, TrainerContract, type TrainerCompleted, type TrainingRunResults } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioTrainModelServerOperation } from '../train-model.operation';
import { TrainModelMapping } from '../train-model.mapping';
import { TrainingEngine } from '../../training/training-engine';
import { TrainingRefusedError } from '../../training/training-refusal';
import type { IEvaluationProtocolStore } from '../../training/evaluation-protocol-store';
import type { TrainModelInput, TrainModelResult, TrainingDeps } from '../../training/types';
import { CapturingContext } from './helpers';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { FakeEntityFactory, FakeEvaluationProtocolStore, FakeMLModel, FakeMLRun } from '../../__tests__/fakes/training-fakes';

/**
 * Unit tests for the Train ML Model Remote Operation. NO live DB / sidecar — the
 * TrainingEngine is mocked via the operation's overridable `engine()` seam and the
 * protocol rows are served by a fake store. These prove the op stays thin: retired
 * inputs refused by name before training, input→engine-input mapping, the output read
 * from the run's stored decision, LongRunning progress forwarding, and that the
 * subclass registers under the right OperationKey.
 */

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
  return resultOf({ Notes: notes, ValidationResults: storedResults(TrainerResultFixtures.CannedCompleted(RUN_ID, PROTOCOL)) }, { Version: 5, Status: 'Draft', HoldoutMetrics: JSON.stringify({ 'log-loss': 0.455 }) });
}

class MockTrainingEngine extends TrainingEngine {
  public LastInput: TrainModelInput | null = null;
  public CallCount = 0;
  constructor(private readonly result: TrainModelResult) {
    super();
  }
  public override async trainModel(input: TrainModelInput, _deps: TrainingDeps): Promise<TrainModelResult> {
    this.CallCount++;
    this.LastInput = input;
    return this.result;
  }
}

class TestableTrainOp extends PredictiveStudioTrainModelServerOperation {
  public readonly Protocols = new FakeEvaluationProtocolStore([ProtocolRowFixture.Row({ Version: 2 })]);
  constructor(private readonly mock: TrainingEngine) {
    super();
  }
  protected override engine(): TrainingEngine {
    return this.mock;
  }
  protected override protocolStore(_provider: IMetadataProvider, _user: UserInfo): IEvaluationProtocolStore {
    return this.Protocols;
  }
  /** Exposes the protected input mapping to the tests. */
  public MapInput(input: PredictiveStudioTrainModelInput): TrainModelInput {
    return this.toEngineInput(input);
  }
}

/** A call that still sends retired inputs, typed the way an outside caller (or a probe) sends them. */
type RetiredCall = PredictiveStudioTrainModelInput & RetiredTrainModelInputs;

async function runOp(input: RetiredCall, engine: TrainingEngine): Promise<{ result: Awaited<ReturnType<TestableTrainOp['ExecuteServer']>>; ctx: CapturingContext }> {
  const ctx = new CapturingContext();
  return { result: await new TestableTrainOp(engine).ExecuteServer(input, ctx), ctx };
}

describe('PredictiveStudioTrainModelServerOperation — registration', () => {
  it('registers under PredictiveStudio.TrainModel with LongRunning + scope', () => {
    const op = new PredictiveStudioTrainModelServerOperation();
    expect(op.OperationKey).toBe('PredictiveStudio.TrainModel');
    expect(op.ExecutionMode).toBe('LongRunning');
    expect(op.RequiredScope).toBe('predictive:execute');
  });

  it('is resolvable by key via the ClassFactory (last registration wins)', () => {
    const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation>(
      BaseRemotableOperation,
      'PredictiveStudio.TrainModel',
    );
    expect(resolved).toBeInstanceOf(PredictiveStudioTrainModelServerOperation);
  });
});

describe('PredictiveStudioTrainModelServerOperation — a run that shipped a member', () => {
  it('maps input→engine, returns the stored decision with the model, snapshot and protocol, and forwards progress', async () => {
    const engine = new MockTrainingEngine(await shippedRun('Training completed. No single-feature dominance detected.'));
    const op = new TestableTrainOp(engine);
    const ctx = new CapturingContext();

    const result = await op.ExecuteServer({ pipelineId: 'pipe-99', sidecarVersion: 'sc-1' }, ctx);

    expect(engine.CallCount).toBe(1);
    expect(engine.LastInput).toEqual({ pipelineId: 'pipe-99', sidecarVersion: 'sc-1' });
    expect(result.Success).toBe(true);
    expect(result.Output).toMatchObject({
      modelId: 'model-1', trainingRunId: 'run-1', version: 5, status: 'Draft', leakageFlagged: false,
      holdoutMetrics: JSON.stringify({ 'log-loss': 0.455 }),
      trainingSnapshotId: 'snap-1', evaluationProtocolId: ProtocolRowFixture.ID, evaluationProtocolVersion: 2,
      gateOutcome: 'keep-simple-baseline', gateBranch: 'b:keep-simple-baseline', shipped: 'glm',
    });
    expect(result.Output?.gateReason).toEqual(expect.any(String));
    expect(op.Protocols.Reads).toBe(1);
    expect(ctx.Progress.length).toBeGreaterThanOrEqual(2);
    expect(ctx.Progress[0].OperationKey).toBe('PredictiveStudio.TrainModel');
    expect(ctx.Progress[ctx.Progress.length - 1].Message).toBe('Trained model model-1 (v5).');
  });
});

describe('PredictiveStudioTrainModelServerOperation — a run that shipped no model', () => {
  it('succeeds with NoSignal, no model id or version, and the stored gate reason', async () => {
    const run = await resultOf({ Notes: 'Trainer completed.', ValidationResults: TrainerResultFixtures.NoSignalValidationResults() }, null);
    const { result, ctx } = await runOp({ pipelineId: 'pipe-99' }, new MockTrainingEngine(run));
    expect(result.Success).toBe(true);
    expect(result.Output).toEqual({
      trainingRunId: 'run-1', status: 'NoSignal', leakageFlagged: false,
      trainingSnapshotId: 'snap-1', evaluationProtocolId: ProtocolRowFixture.ID, evaluationProtocolVersion: 2,
      gateOutcome: 'no-signal', gateBranch: 'c:no-signal', gateReason: TrainerResultFixtures.NoSignalReason,
    });
    expect(ctx.Progress[ctx.Progress.length - 1].Message).toBe(`Training run run-1 completed and shipped no model: ${TrainerResultFixtures.NoSignalReason}`);
  });

  it('fails closed (EXECUTION_ERROR) when the run stored results that cannot be read', async () => {
    const run = await resultOf({ Notes: 'Trainer completed.', ValidationResults: '{"not":"an envelope"}' }, null);
    const { result } = await runOp({ pipelineId: 'p1' }, new MockTrainingEngine(run));
    expect([result.Success, result.ResultCode]).toEqual([false, 'EXECUTION_ERROR']);
    expect(result.ErrorMessage).toContain('training run run-1 stored results that cannot be read');
  });
});

describe('PredictiveStudioTrainModelServerOperation — retired inputs are refused by name, before training', () => {
  const sentence = (names: readonly string[]): string => TrainModelMapping.RetiredInputsMessage('TrainModel', names);

  it('refuses a point-in-time asOf input as AS_OF_NO_EFFECT without calling the engine', async () => {
    const engine = new MockTrainingEngine(await shippedRun(null));
    const { result, ctx } = await runOp({ pipelineId: 'p1', asOf: { Mode: 'offset', OffsetDays: 30 } }, engine);
    expect([result.Success, result.ResultCode, engine.CallCount, ctx.Progress.length]).toEqual([false, 'AS_OF_NO_EFFECT', 0, 0]);
    expect(result.ErrorMessage).toBe(`Refused (input-not-accepted): asOf — ${sentence(['asOf'])}`);
  });

  it("refuses asOf { Mode: 'none' } too: a retired key is refused by presence, whatever it asks for", async () => {
    const engine = new MockTrainingEngine(await shippedRun(null));
    const { result } = await runOp({ pipelineId: 'p1', asOf: { Mode: 'none' } }, engine);
    expect([result.Success, result.ResultCode, engine.CallCount]).toEqual([false, 'AS_OF_NO_EFFECT', 0]);
  });

  it('refuses maxRows, labelEventDates and primaryKeyField by name, naming every retired key sent', async () => {
    const engine = new MockTrainingEngine(await shippedRun(null));
    const { result } = await runOp({ pipelineId: 'p1', maxRows: 1000, labelEventDates: { 'rec-1': '2026-01-15' }, primaryKeyField: 'MembershipID' }, engine);
    expect([result.Success, result.ResultCode, engine.CallCount]).toEqual([false, 'EXECUTION_ERROR', 0]);
    expect(result.ErrorMessage).toBe(`Refused (input-not-accepted): labelEventDates — ${sentence(['labelEventDates', 'maxRows', 'primaryKeyField'])}`);
  });

  it('refuses a retired key sent with no value (an in-process caller that spreads an undefined option)', async () => {
    const engine = new MockTrainingEngine(await shippedRun(null));
    const { result } = await runOp({ pipelineId: 'p1', maxRows: undefined }, engine);
    expect([result.Success, engine.CallCount]).toEqual([false, 0]);
    expect(result.ErrorMessage).toContain(sentence(['maxRows']));
  });

  it('maps only the pipeline, the session iteration and the sidecar version onto the engine input', async () => {
    const op = new TestableTrainOp(new MockTrainingEngine(await shippedRun(null)));
    expect(op.MapInput({ pipelineId: 'p', experimentSessionIterationId: 'it-1', sidecarVersion: 's' })).toEqual({ pipelineId: 'p', experimentSessionIterationId: 'it-1', sidecarVersion: 's' });
    expect(op.MapInput({ pipelineId: 'p' })).toEqual({ pipelineId: 'p' });
  });
});

describe('PredictiveStudioTrainModelServerOperation — leakage flag', () => {
  it('surfaces leakageFlagged=true when run notes carry a LEAKAGE WARNING', async () => {
    const engine = new MockTrainingEngine(await shippedRun('LEAKAGE WARNING: one field ("cancelled_flag") dominates'));
    const { result } = await runOp({ pipelineId: 'p1' }, engine);
    expect(result.Success).toBe(true);
    expect(result.Output?.leakageFlagged).toBe(true);
  });
});

describe('PredictiveStudioTrainModelServerOperation — errors', () => {
  it('returns a wrapped failure when pipelineId is missing', async () => {
    const engine = new MockTrainingEngine(await shippedRun(null));
    const { result } = await runOp({ pipelineId: '' }, engine);
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(engine.CallCount).toBe(0);
  });

  it('wraps a thrown engine error as EXECUTION_ERROR', async () => {
    class ThrowingEngine extends TrainingEngine {
      public override async trainModel(): Promise<TrainModelResult> {
        throw new Error('sidecar unreachable');
      }
    }
    const { result } = await runOp({ pipelineId: 'p1' }, new ThrowingEngine());
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('sidecar unreachable');
  });

  it('returns a pipeline without an Evaluation Protocol as PROTOCOL_REQUIRED, not EXECUTION_ERROR', async () => {
    class RefusingEngine extends TrainingEngine {
      public override async trainModel(): Promise<TrainModelResult> {
        throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'p1' } });
      }
    }
    const { result } = await runOp({ pipelineId: 'p1' }, new RefusingEngine());
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('PROTOCOL_REQUIRED');
  });
});
