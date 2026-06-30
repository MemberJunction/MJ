import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseRemotableOperation } from '@memberjunction/core';
import type { ProcessRunResult, ProgressInfo } from '@memberjunction/record-set-processor-base';
import type { RunRecordProcessOptions } from '@memberjunction/record-set-processor';

import {
  PredictiveStudioRunFeaturePipelineServerOperation,
  type IFeaturePipelineRunner,
} from '../run-feature-pipeline.operation';
import { CapturingContext } from './helpers';

/**
 * Unit tests for the Run Feature Pipeline Remote Operation. NO live DB — the Record
 * Process facade (`RecordProcessExecutor.RunByID`) is mocked via the operation's
 * overridable `runner()` seam. These prove the op delegates the pipeline id + options
 * (single-record / dry-run / scope override) to the substrate, maps the
 * ProcessRunResult onto the typed output (written = Success), forwards the executor's
 * per-batch progress, and registers under the right OperationKey.
 */

class MockFacade implements IFeaturePipelineRunner {
  public LastID: string | null = null;
  public LastOptions: RunRecordProcessOptions | null = null;
  public CallCount = 0;
  constructor(private readonly result: ProcessRunResult) {}
  public async RunByID(recordProcessID: string, options: RunRecordProcessOptions): Promise<ProcessRunResult> {
    this.CallCount++;
    this.LastID = recordProcessID;
    this.LastOptions = options;
    // Drive a progress emission so the forwarding path is exercised.
    options.onProgress?.({ Processed: 5, Success: 4, Error: 0, Skipped: 1, Total: 10 } as ProgressInfo);
    return this.result;
  }
}

class TestableRunFeatureOp extends PredictiveStudioRunFeaturePipelineServerOperation {
  constructor(private readonly mock: IFeaturePipelineRunner) {
    super();
  }
  protected override runner(): IFeaturePipelineRunner {
    return this.mock;
  }
}

function fakeRunResult(over: Partial<ProcessRunResult> = {}): ProcessRunResult {
  return {
    ProcessRunID: 'run-1',
    Status: 'Completed',
    Processed: 10,
    Success: 8,
    Error: 1,
    Skipped: 1,
    Total: 10,
    ...over,
  } as ProcessRunResult;
}

describe('PredictiveStudioRunFeaturePipelineServerOperation — registration', () => {
  it('registers under PredictiveStudio.RunFeaturePipeline with LongRunning + scope', () => {
    const op = new PredictiveStudioRunFeaturePipelineServerOperation();
    expect(op.OperationKey).toBe('PredictiveStudio.RunFeaturePipeline');
    expect(op.ExecutionMode).toBe('LongRunning');
    expect(op.RequiredScope).toBe('predictive:execute');
  });

  it('is resolvable by key via the ClassFactory', () => {
    const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRemotableOperation>(
      BaseRemotableOperation,
      'PredictiveStudio.RunFeaturePipeline',
    );
    expect(resolved).toBeInstanceOf(PredictiveStudioRunFeaturePipelineServerOperation);
  });
});

describe('PredictiveStudioRunFeaturePipelineServerOperation — happy path', () => {
  it('delegates id + options to the substrate and maps the run summary', async () => {
    const facade = new MockFacade(fakeRunResult());
    const op = new TestableRunFeatureOp(facade);
    const ctx = new CapturingContext();

    const result = await op.ExecuteServer(
      { featurePipelineID: 'fp-1', dryRun: true, scope: { Kind: 'view', ViewID: 'v9' } },
      ctx,
    );

    expect(facade.CallCount).toBe(1);
    expect(facade.LastID).toBe('fp-1');
    expect(facade.LastOptions?.triggeredBy).toBe('OnDemand');
    expect(facade.LastOptions?.dryRun).toBe(true);
    expect(facade.LastOptions?.scope).toEqual({ Kind: 'view', ViewID: 'v9' });
    expect(facade.LastOptions?.contextUser).toBe(ctx.user);
    expect(facade.LastOptions?.provider).toBe(ctx.provider);

    expect(result.Success).toBe(true);
    expect(result.Output).toEqual({
      processRunID: 'run-1',
      status: 'Completed',
      processed: 10,
      written: 8, // mapped from ProcessRunResult.Success
      skipped: 1,
      error: 1,
      errorMessage: undefined,
    });
    // The substrate's onProgress was forwarded as typed RemoteOpProgress.
    expect(ctx.Progress.length).toBeGreaterThanOrEqual(1);
    expect(ctx.Progress[0].Processed).toBe(5);
    expect(ctx.Progress[0].Total).toBe(10);
  });
});

describe('PredictiveStudioRunFeaturePipelineServerOperation — validation/errors', () => {
  it('fails when featurePipelineID is missing', async () => {
    const facade = new MockFacade(fakeRunResult());
    const result = await new TestableRunFeatureOp(facade).ExecuteServer(
      { featurePipelineID: '' },
      new CapturingContext(),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('EXECUTION_ERROR');
    expect(facade.CallCount).toBe(0);
  });

  it('surfaces a Failed run summary (status + errorMessage) without throwing', async () => {
    const facade = new MockFacade(fakeRunResult({ Status: 'Failed', ErrorMessage: 'boom' }));
    const result = await new TestableRunFeatureOp(facade).ExecuteServer(
      { featurePipelineID: 'fp-1' },
      new CapturingContext(),
    );
    expect(result.Success).toBe(true);
    const out = result.Output as { status: string; errorMessage?: string };
    expect(out.status).toBe('Failed');
    expect(out.errorMessage).toBe('boom');
  });
});
