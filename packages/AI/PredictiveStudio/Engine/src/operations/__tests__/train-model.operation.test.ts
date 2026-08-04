import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';

import { PredictiveStudioTrainModelServerOperation } from '../train-model.operation';
import { TrainingEngine } from '../../training/training-engine';
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

  it('parses ISO labelEventDates into Date objects for the engine', async () => {
    const engine = new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) });
    await new TestableTrainOp(engine).ExecuteServer(
      { pipelineId: 'p1', labelEventDates: { 'rec-1': '2026-01-15T00:00:00.000Z' } },
      new CapturingContext(),
    );
    const dates = engine.LastInput?.labelEventDates;
    expect(dates?.['rec-1']).toBeInstanceOf(Date);
    expect(dates?.['rec-1'].toISOString()).toBe('2026-01-15T00:00:00.000Z');
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
});
