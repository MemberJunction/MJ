import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation } from '@memberjunction/core';

import { PredictiveStudioScoreRecordSetServerOperation } from '../score-record-set.operation';
import type {
  IScoreRecordSetRunner,
  ScoreRecordSetRequest,
  ScoreRecordSetResult,
} from '../../actions/score-record-set.action';
import { CapturingContext } from './helpers';

/**
 * Unit tests for the Score Record Set Remote Operation. NO live DB / sidecar — the
 * scoring runner is mocked via the operation's overridable `runner()` seam. These
 * prove the op stays thin: scope-selector validation, correctly-mapped delegation to
 * the runner (model id + scope + write-back + user/provider), result→typed-output
 * mapping for both the ephemeral-predictions and write-back paths, LongRunning
 * progress forwarding, and registration under the right OperationKey.
 */

class MockRunner implements IScoreRecordSetRunner {
  public LastRequest: ScoreRecordSetRequest | null = null;
  public CallCount = 0;
  constructor(private readonly result: ScoreRecordSetResult) {}
  public async run(request: ScoreRecordSetRequest): Promise<ScoreRecordSetResult> {
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

describe('PredictiveStudioScoreRecordSetServerOperation — ephemeral path', () => {
  it('delegates with model+scope+user and maps counts + predictions', async () => {
    const runner = new MockRunner({
      scoredCount: 2,
      failedCount: 1,
      skippedCount: 0,
      wroteBack: false,
      predictions: [
        { recordId: 'r1', score: 0.9, class: 'churn' },
        { recordId: 'r2', score: 0.2, class: 'stay' },
      ],
    });
    const op = new TestableScoreOp(runner);
    const ctx = new CapturingContext();

    const result = await op.ExecuteServer({ modelId: 'm1', scope: { records: ['r1', 'r2'] } }, ctx);

    expect(runner.CallCount).toBe(1);
    expect(runner.LastRequest?.modelId).toBe('m1');
    expect(runner.LastRequest?.contextUser).toBe(ctx.user);
    expect(runner.LastRequest?.provider).toBe(ctx.provider);

    expect(result.Success).toBe(true);
    expect(result.Output).toEqual({
      scored: 2,
      failed: 1,
      skipped: 0,
      wroteBack: false,
      predictions: [
        { recordId: 'r1', score: 0.9, class: 'churn' },
        { recordId: 'r2', score: 0.2, class: 'stay' },
      ],
    });
    expect(ctx.Progress.length).toBeGreaterThanOrEqual(2);
  });
});

describe('PredictiveStudioScoreRecordSetServerOperation — write-back path', () => {
  it('omits predictions when the runner wrote back', async () => {
    const runner = new MockRunner({
      scoredCount: 3,
      failedCount: 0,
      skippedCount: 0,
      wroteBack: true,
      predictions: [{ recordId: 'r1', score: 0.5 }],
    });
    const result = await new TestableScoreOp(runner).ExecuteServer(
      { modelId: 'm1', scope: { viewId: 'v1' }, writeBack: true },
      new CapturingContext(),
    );
    expect(result.Success).toBe(true);
    const out = result.Output as { wroteBack: boolean; predictions?: unknown };
    expect(out.wroteBack).toBe(true);
    expect(out.predictions).toBeUndefined();
  });
});

describe('PredictiveStudioScoreRecordSetServerOperation — validation', () => {
  it('fails when modelId is missing', async () => {
    const runner = new MockRunner({ scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false });
    const result = await new TestableScoreOp(runner).ExecuteServer(
      { modelId: '', scope: { records: ['r1'] } },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(runner.CallCount).toBe(0);
  });

  it('fails when more than one scope selector is populated', async () => {
    const runner = new MockRunner({ scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false });
    const result = await new TestableScoreOp(runner).ExecuteServer(
      { modelId: 'm1', scope: { records: ['r1'], viewId: 'v1' } },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('exactly one');
    expect(runner.CallCount).toBe(0);
  });

  it('fails when no scope selector is populated', async () => {
    const runner = new MockRunner({ scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false });
    const result = await new TestableScoreOp(runner).ExecuteServer(
      { modelId: 'm1', scope: {} },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(runner.CallCount).toBe(0);
  });
});
