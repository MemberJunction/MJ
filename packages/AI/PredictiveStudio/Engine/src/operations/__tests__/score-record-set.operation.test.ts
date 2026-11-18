import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation } from '@memberjunction/core';

import { PredictiveStudioScoreRecordSetServerOperation } from '../score-record-set.operation';
import type {
  IScoreRecordSetRunner,
  ScoredRecordSet,
  ScoreRecordSetRequest,
} from '../../actions/score-record-set.action';
import { CapturingContext } from './helpers';

/**
 * Unit tests for the Score Record Set Remote Operation. NO live DB / sidecar — the
 * scoring runner is mocked via the operation's overridable `runner()` seam. These
 * prove the op stays thin: scope-selector validation, correctly-mapped delegation to
 * the runner (model, binding, as-of date, scope, user/provider), the completed run as
 * the typed output, LongRunning progress forwarding, and registration under the right
 * OperationKey. The world-backed cases are in `actions/__tests__/score-record-set.binding.test.ts`.
 */

class MockRunner implements IScoreRecordSetRunner {
  public LastRequest: ScoreRecordSetRequest | null = null;
  public CallCount = 0;
  constructor(private readonly result: ScoredRecordSet) {}
  public async run(request: ScoreRecordSetRequest): Promise<ScoredRecordSet> {
    this.CallCount++;
    this.LastRequest = request;
    return this.result;
  }
}

class TestableScoreOp extends PredictiveStudioScoreRecordSetServerOperation {
  constructor(private readonly mock: IScoreRecordSetRunner) {
    super();
  }
  protected override runner(): IScoreRecordSetRunner {
    return this.mock;
  }
}

describe('PredictiveStudioScoreRecordSetServerOperation — registration', () => {
  it('registers under PredictiveStudio.ScoreRecordSet with LongRunning + scope', () => {
    const op = new PredictiveStudioScoreRecordSetServerOperation();
    expect(op.OperationKey).toBe('PredictiveStudio.ScoreRecordSet');
    expect(op.ExecutionMode).toBe('LongRunning');
    expect(op.RequiredScope).toBe('predictive:execute');
  });

  it('is resolvable by key via the ClassFactory', () => {
    const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation>(
      BaseRemotableOperation,
      'PredictiveStudio.ScoreRecordSet',
    );
    expect(resolved).toBeInstanceOf(PredictiveStudioScoreRecordSetServerOperation);
  });
});

/** A completed run with `written` Feature Values and these predictions. */
function completed(written: number, predictions: ScoredRecordSet['Predictions'] = []): ScoredRecordSet {
  return {
    Result: { Status: 'completed', ScoringRunID: 'run-1', ModelID: 'm1', ModelVersion: 2, ArtifactSha256: 'a'.repeat(64), Total: Math.max(written, predictions.length), Written: written, DryRun: false },
    Predictions: predictions,
  };
}

describe('PredictiveStudioScoreRecordSetServerOperation — a completed run', () => {
  it('delegates with model+scope+user and returns the run and its predictions', async () => {
    const runner = new MockRunner(completed(0, [{ recordId: 'r1', score: 0.9, class: 'churn', inTraining: false }, { recordId: 'r2', score: 0.2, class: 'stay', inTraining: true }]));
    const op = new TestableScoreOp(runner);
    const ctx = new CapturingContext();

    const result = await op.ExecuteServer({ modelId: 'm1', scope: { records: ['r1', 'r2'] } }, ctx);

    expect(runner.CallCount).toBe(1);
    expect([runner.LastRequest?.modelId, runner.LastRequest?.contextUser, runner.LastRequest?.provider]).toEqual(['m1', ctx.user, ctx.provider]);
    expect(result.Success).toBe(true);
    expect(result.Output).toEqual({
      status: 'completed', scoringRunId: 'run-1', modelId: 'm1', modelVersion: 2, artifactSha256: 'a'.repeat(64), total: 2, written: 0, dryRun: false,
      predictions: [{ recordId: 'r1', score: 0.9, class: 'churn', inTraining: false }, { recordId: 'r2', score: 0.2, class: 'stay', inTraining: true }],
    });
    expect(ctx.Progress.length).toBeGreaterThanOrEqual(2);
  });

  it('with a binding passes bindingId, asOfDate and entityMapping, and returns no predictions when it wrote', async () => {
    const runner = new MockRunner(completed(3));
    const result = await new TestableScoreOp(runner).ExecuteServer(
      { modelId: 'm1', bindingId: 'b1', asOfDate: '2026-03-01', entityMapping: { entity: 'Memberships', id: 'x1' }, scope: { viewId: 'v1' } },
      new CapturingContext(),
    );
    expect([runner.LastRequest?.bindingId, runner.LastRequest?.asOfDate, runner.LastRequest?.entityMapping]).toEqual(['b1', '2026-03-01', { entity: 'Memberships', id: 'x1' }]);
    expect(result.Output?.written).toBe(3);
    expect(result.Output?.predictions).toBeUndefined();
  });
});

describe('PredictiveStudioScoreRecordSetServerOperation — validation', () => {
  it('refuses a missing modelId as invalid input', async () => {
    const runner = new MockRunner(completed(0));
    const result = await new TestableScoreOp(runner).ExecuteServer({ modelId: '', scope: { records: ['r1'] } }, new CapturingContext());
    expect([result.Success, result.ResultCode, runner.CallCount]).toEqual([false, 'INVALID_INPUT', 0]);
  });

  it('refuses more than one scope selector', async () => {
    const runner = new MockRunner(completed(0));
    const result = await new TestableScoreOp(runner).ExecuteServer({ modelId: 'm1', scope: { records: ['r1'], viewId: 'v1' } }, new CapturingContext());
    expect([result.Success, result.ResultCode, runner.CallCount]).toEqual([false, 'INVALID_INPUT', 0]);
    expect(result.ErrorMessage).toContain('exactly one');
  });

  it('refuses no scope selector', async () => {
    const runner = new MockRunner(completed(0));
    const result = await new TestableScoreOp(runner).ExecuteServer({ modelId: 'm1', scope: {} }, new CapturingContext());
    expect([result.Success, runner.CallCount]).toEqual([false, 0]);
  });
});

describe('PredictiveStudioScoreRecordSetServerOperation — dry run (W1 → S7.3, F-SCO-2)', () => {
  it('forwards dryRun to the runner so a preview writes nothing', async () => {
    const runner = new MockRunner(completed(0));
    await new TestableScoreOp(runner).ExecuteServer({ modelId: 'm1', scope: { records: ['r1'] }, dryRun: true }, new CapturingContext());
    expect(runner.LastRequest?.dryRun).toBe(true);
  });

  it('treats an omitted dryRun as a real run', async () => {
    const runner = new MockRunner(completed(1));
    await new TestableScoreOp(runner).ExecuteServer({ modelId: 'm1', scope: { records: ['r1'] } }, new CapturingContext());
    expect(runner.LastRequest?.dryRun).toBe(false);
  });
});
