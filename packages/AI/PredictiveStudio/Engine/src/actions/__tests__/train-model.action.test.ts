import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';

import { PredictiveStudioTrainModelAction } from '../train-model.action';
import { TrainingEngine } from '../../training/training-engine';
import type { TrainModelInput, TrainModelResult, TrainingDeps } from '../../training/types';

/**
 * Unit tests for the Train ML Model action. NO live DB, NO live sidecar — the
 * TrainingEngine is mocked via the action's overridable `createEngine` seam. These
 * prove the action stays thin: param validation, correctly-mapped delegation to
 * `TrainingEngine.trainModel`, and result→output-param mapping (incl. the leakage
 * flag read from the run notes).
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
    sidecar: {} as TrainingDeps['sidecar'],
    artifactStore: {} as TrainingDeps['artifactStore'],
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
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

function fakeModel(over: Partial<MJMLModelEntity> = {}): MJMLModelEntity {
  return { ID: 'model-1', Version: 5, HoldoutMetrics: JSON.stringify({ auc: 0.81 }), ...over } as unknown as MJMLModelEntity;
}
function fakeRun(notes: string | null): MJMLTrainingRunEntity {
  return { ID: 'run-1', Notes: notes } as unknown as MJMLTrainingRunEntity;
}
function params(list: ActionParam[]): RunActionParams {
  return { Params: list } as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}

describe('PredictiveStudioTrainModelAction — validation', () => {
  it('fails when PipelineID is missing', async () => {
    const engine = new MockTrainingEngine({ model: fakeModel(), run: fakeRun(null) });
    const result = await new TestableTrainAction(engine).run(params([]));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(engine.CallCount).toBe(0);
  });
});

describe('PredictiveStudioTrainModelAction — happy path', () => {
  it('delegates to TrainingEngine.trainModel with the mapped pipeline id + maps outputs', async () => {
    const engine = new MockTrainingEngine({
      model: fakeModel(),
      run: fakeRun('Training completed. No single-feature dominance detected.'),
    });
    const p = params([
      { Name: 'PipelineID', Type: 'Input', Value: 'pipe-99' },
      { Name: 'MaxRows', Type: 'Input', Value: 500 },
    ]);

    const result = await new TestableTrainAction(engine).run(p);

    expect(engine.CallCount).toBe(1);
    expect(engine.LastInput).toEqual({ pipelineId: 'pipe-99', maxRows: 500 });

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(out(p, 'ModelID')).toBe('model-1');
    expect(out(p, 'HoldoutMetrics')).toBe(JSON.stringify({ auc: 0.81 }));
    expect(out(p, 'LeakageFlagged')).toBe(false);
  });
});

describe('PredictiveStudioTrainModelAction — leakage flag', () => {
  it('surfaces LeakageFlagged=true when the run notes carry a LEAKAGE WARNING', async () => {
    const engine = new MockTrainingEngine({
      model: fakeModel(),
      run: fakeRun('LEAKAGE WARNING: one field ("cancelled_flag") is doing almost all the predicting'),
    });
    const p = params([{ Name: 'PipelineID', Type: 'Input', Value: 'pipe-1' }]);

    const result = await new TestableTrainAction(engine).run(p);

    expect(result.Success).toBe(true);
    expect(out(p, 'LeakageFlagged')).toBe(true);
    expect(result.Message?.toLowerCase()).toContain('leakage');
  });
});

describe('PredictiveStudioTrainModelAction — engine error', () => {
  it('maps a thrown engine error to a TRAINING_FAILED result', async () => {
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
  });
});
