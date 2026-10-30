import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity, PredictiveStudioTrainModelInput } from '@memberjunction/core-entities';

import { PredictiveStudioTrainModelServerOperation } from '../train-model.operation';
import { TrainingEngine } from '../../training/training-engine';
import { TrainingRefusedError } from '../../training/training-refusal';
import type { TrainModelInput, TrainModelResult, TrainingDeps } from '../../training/types';
import { CapturingContext } from './helpers';

/**
 * Unit tests for the Train ML Model Remote Operation. NO live DB / sidecar — the
 * TrainingEngine is mocked via the operation's overridable `engine()` seam. These
 * prove the op stays thin: input→engine-input mapping, correctly-mapped delegation
 * to `TrainingEngine.trainModel`, result→typed-output mapping (incl. the leakage
 * flag read from the run notes), LongRunning progress forwarding, and that the
 * subclass registers under the right OperationKey.
 */

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
  constructor(private readonly mock: TrainingEngine) {
    super();
  }
  protected override engine(): TrainingEngine {
    return this.mock;
  }
  /** Exposes the protected input mapping to the tests. */
  public MapInput(input: PredictiveStudioTrainModelInput): TrainModelInput {
    return this.toEngineInput(input);
  }
}

function fakeModel(over: Partial<MJMLModelEntity> = {}): MJMLModelEntity {
  return {
    ID: 'model-1',
    Version: 5,
    HoldoutMetrics: JSON.stringify({ auc: 0.81 }),
    Status: 'Draft',
    ...over,
  } as unknown as MJMLModelEntity;
}
function fakeRun(notes: string | null): MJMLTrainingRunEntity {
  return { ID: 'run-1', Notes: notes } as unknown as MJMLTrainingRunEntity;
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

describe('PredictiveStudioTrainModelServerOperation — happy path', () => {
  it('maps input→engine, returns mapped output, and forwards progress', async () => {
    const engine = new MockTrainingEngine({
      model: fakeModel(),
      run: fakeRun('Training completed. No single-feature dominance detected.'),
    });
    const op = new TestableTrainOp(engine);
    const ctx = new CapturingContext();

    const result = await op.ExecuteServer(
      { pipelineId: 'pipe-99', maxRows: 500, sidecarVersion: 'sc-1' },
      ctx,
    );

    expect(engine.CallCount).toBe(1);
    expect(engine.LastInput).toEqual({ pipelineId: 'pipe-99', maxRows: 500, sidecarVersion: 'sc-1' });

    expect(result.Success).toBe(true);
    expect(result.Output).toEqual({
      modelId: 'model-1',
      trainingRunId: 'run-1',
      version: 5,
      holdoutMetrics: JSON.stringify({ auc: 0.81 }),
      leakageFlagged: false,
      status: 'Draft',
    });
    // LongRunning: at least a start + finish progress event was emitted.
    expect(ctx.Progress.length).toBeGreaterThanOrEqual(2);
    expect(ctx.Progress[0].OperationKey).toBe('PredictiveStudio.TrainModel');
  });

});

describe('PredictiveStudioTrainModelServerOperation — inputs that decision dates replace are refused', () => {
  const op = new TestableTrainOp(new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) }));

  it('refuses a point-in-time asOf input by name, as a typed refusal', () => {
    expect(() => op.MapInput({ pipelineId: 'p', asOf: { Mode: 'column', Column: 'X' } })).toThrow(TrainingRefusedError);
    let caught: Error | null = null;
    try { op.MapInput({ pipelineId: 'p', asOf: { Mode: 'column', Column: 'X' } }); } catch (e) { caught = e as Error; }
    expect(caught).toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf' } } });
  });

  it('refuses labelEventDates by name, as a typed refusal', () => {
    let caught: Error | null = null;
    try { op.MapInput({ pipelineId: 'p', labelEventDates: { 'rec-1': '2026-01-15T00:00:00.000Z' } }); } catch (e) { caught = e as Error; }
    expect(caught).toBeInstanceOf(TrainingRefusedError);
    expect(caught).toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'labelEventDates' } } });
  });

  it("accepts an asOf input of Mode 'none' (it asks for nothing)", () => {
    expect(op.MapInput({ pipelineId: 'p', asOf: { Mode: 'none' } })).toEqual({ pipelineId: 'p' });
  });

  it('returns AS_OF_NO_EFFECT for a refused asOf input without calling the engine', async () => {
    const engine = new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) });
    const result = await new TestableTrainOp(engine).ExecuteServer({ pipelineId: 'p1', asOf: { Mode: 'offset', OffsetDays: 30 } }, new CapturingContext());
    expect(result.ResultCode).toBe('AS_OF_NO_EFFECT');
    expect(engine.CallCount).toBe(0);
  });
});

describe('PredictiveStudioTrainModelServerOperation — leakage flag', () => {
  it('surfaces leakageFlagged=true when run notes carry a LEAKAGE WARNING', async () => {
    const engine = new MockTrainingEngine({
      model: fakeModel(),
      run: fakeRun('LEAKAGE WARNING: one field ("cancelled_flag") dominates'),
    });
    const result = await new TestableTrainOp(engine).ExecuteServer({ pipelineId: 'p1' }, new CapturingContext());
    expect(result.Success).toBe(true);
    expect((result.Output as { leakageFlagged: boolean }).leakageFlagged).toBe(true);
  });
});

describe('PredictiveStudioTrainModelServerOperation — errors', () => {
  it('returns a wrapped failure when pipelineId is missing', async () => {
    const engine = new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) });
    const result = await new TestableTrainOp(engine).ExecuteServer({ pipelineId: '' }, new CapturingContext());
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
    const result = await new TestableTrainOp(new ThrowingEngine()).ExecuteServer(
      { pipelineId: 'p1' },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('sidecar unreachable');
  });

  it('returns a pipeline without an Evaluation Protocol as PROTOCOL_REQUIRED, not EXECUTION_ERROR', async () => {
    class RefusingEngine extends TrainingEngine {
      public override async trainModel(): Promise<TrainModelResult> {
        throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'p1' } });
      }
    }
    const result = await new TestableTrainOp(new RefusingEngine()).ExecuteServer({ pipelineId: 'p1' }, new CapturingContext());
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('PROTOCOL_REQUIRED');
  });
});

describe('PredictiveStudioTrainModelServerOperation — an asOf input that asks for nothing', () => {
  it("accepts asOf { Mode: 'none' }", async () => {
    const engine = new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) });
    const result = await new TestableTrainOp(engine).ExecuteServer({ pipelineId: 'p1', asOf: { Mode: 'none' } }, new CapturingContext());
    expect(result.Success).toBe(true);
    expect(engine.CallCount).toBe(1);
  });
});
