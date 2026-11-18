import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';

import { Metadata, type IMetadataProvider } from '@memberjunction/core';

import { PredictiveStudioScoreRecordSetAction } from '../score-record-set.action';
import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import { ModelNotScorableError } from '../../scoring/model-readiness';
import { ScoringRefusedError } from '../../scoring/scoring-refused-error';
import type { IScoreRecordSetRunner, ScoredRecordSet, ScoreRecordSetRequest } from '../score-record-set.action';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

/**
 * Unit tests for the Score Record Set action. NO live DB, NO live sidecar — the scoring runner is mocked via the
 * action's overridable `createRunner` seam. These prove the action stays thin: param validation (ModelID + scope
 * shape), the request it hands the runner (model, binding, as-of date, scope, user, provider), the scoring run's output
 * params, and a refused or failed run kept whole (its code, its run and its counts).
 */

/** A captured-call mock runner. */
class MockRunner implements IScoreRecordSetRunner {
  public LastRequest: ScoreRecordSetRequest | null = null;
  public CallCount = 0;
  constructor(private readonly result: ScoredRecordSet | Error) {}
  public async run(request: ScoreRecordSetRequest): Promise<ScoredRecordSet> {
    this.CallCount++;
    this.LastRequest = request;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

/** Test subclass injecting a mock runner, exposing a clean `run`. */
class TestableScoreAction extends PredictiveStudioScoreRecordSetAction {
  constructor(private readonly runner: IScoreRecordSetRunner) {
    super();
  }
  protected override createRunner(): IScoreRecordSetRunner {
    return this.runner;
  }
  public run(params: RunActionParams): Promise<ActionResultSimple> {
    return this.Run(params);
  }
}

/** A completed run with `written` Feature Values and these predictions. */
function completed(written: number, predictions: ScoredRecordSet['Predictions'] = []): ScoredRecordSet {
  return {
    Result: { Status: 'completed', ScoringRunID: 'run-1', ModelID: 'model-7', ModelVersion: 2, ArtifactSha256: 'a'.repeat(64), Total: Math.max(written, predictions.length), Written: written, DryRun: false },
    Predictions: predictions,
  };
}

function params(list: ActionParam[]): RunActionParams {
  // Server-side scoring is user-scoped: the action requires a ContextUser. A stub user is enough: the runner is mocked.
  return { Params: list, ContextUser: { ID: 'test-user' } } as unknown as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}
const scoreParams = (extra: ActionParam[] = []): RunActionParams => params([
  { Name: 'ModelID', Type: 'Input', Value: 'model-7' },
  { Name: 'Scope', Type: 'Input', Value: { records: ['r1'] } },
  ...extra,
]);

describe('PredictiveStudioScoreRecordSetAction — validation', () => {
  it('fails when ModelID is missing', async () => {
    const runner = new MockRunner(completed(0));
    const result = await new TestableScoreAction(runner).run(params([{ Name: 'Scope', Type: 'Input', Value: { records: ['r1'] } }]));
    expect([result.Success, result.ResultCode, runner.CallCount]).toEqual([false, 'VALIDATION_ERROR', 0]);
  });

  it('fails when Scope is missing entirely', async () => {
    const runner = new MockRunner(completed(0));
    const result = await new TestableScoreAction(runner).run(params([{ Name: 'ModelID', Type: 'Input', Value: 'm1' }]));
    expect([result.Success, result.ResultCode, runner.CallCount]).toEqual([false, 'VALIDATION_ERROR', 0]);
  });

  it('fails when Scope populates no selector, or more than one', async () => {
    const runner = new MockRunner(completed(0));
    for (const scope of [{ records: [] }, { records: ['r1'], viewId: 'v1' }]) {
      const result = await new TestableScoreAction(runner).run(params([{ Name: 'ModelID', Type: 'Input', Value: 'm1' }, { Name: 'Scope', Type: 'Input', Value: scope }]));
      expect(result.ResultCode).toBe('VALIDATION_ERROR');
    }
    expect(runner.CallCount).toBe(0);
  });
});

describe('PredictiveStudioScoreRecordSetAction — a completed run', () => {
  it('without a BindingID hands the runner the model and scope and returns the run and its predictions', async () => {
    const runner = new MockRunner(completed(0, [{ recordId: 'r1', score: 0.9, class: 'churn', adverseProbability: 0.9, inTraining: false }]));
    const p = scoreParams();
    const result = await new TestableScoreAction(runner).run(p);
    expect(result.Success).toBe(true);
    expect([runner.LastRequest?.modelId, runner.LastRequest?.bindingId, runner.LastRequest?.scope]).toEqual(['model-7', undefined, { records: ['r1'] }]);
    expect([out(p, 'ScoringRunID'), out(p, 'Status'), out(p, 'Total'), out(p, 'Written'), out(p, 'Failed')]).toEqual(['run-1', 'completed', 1, 0, 0]);
    expect(JSON.parse(String(out(p, 'Predictions')))).toEqual([{ recordId: 'r1', score: 0.9, class: 'churn', adverseProbability: 0.9, inTraining: false }]);
    expect(result.Message).toContain('run-1');
  });

  it('with a BindingID and AsOfDate passes both and reports what it wrote', async () => {
    const runner = new MockRunner(completed(3));
    const p = scoreParams([{ Name: 'BindingID', Type: 'Input', Value: 'binding-1' }, { Name: 'AsOfDate', Type: 'Input', Value: '2026-03-01' }]);
    const result = await new TestableScoreAction(runner).run(p);
    expect([runner.LastRequest?.bindingId, runner.LastRequest?.asOfDate]).toEqual(['binding-1', '2026-03-01']);
    expect([result.Success, out(p, 'Written')]).toEqual([true, 3]);
    expect(result.Message).toContain('wrote 3 Feature Value(s)');
  });

  it('accepts a JSON-string Scope param', async () => {
    const runner = new MockRunner(completed(0));
    await new TestableScoreAction(runner).run(params([{ Name: 'ModelID', Type: 'Input', Value: 'm1' }, { Name: 'Scope', Type: 'Input', Value: JSON.stringify({ records: ['rec-1'] }) }]));
    expect(runner.LastRequest?.scope).toEqual({ records: ['rec-1'] });
  });
});

describe('PredictiveStudioScoreRecordSetAction — a run that does not complete keeps its result', () => {
  it('a refused run fails with the refusal code and keeps the run as outputs', async () => {
    const runner = new MockRunner(new ScoringRefusedError({ Status: 'refused', ScoringRunID: 'run-9', ModelID: null, Reason: { kind: 'binding-withdrawn', bindingId: 'b1' } }));
    const p = scoreParams();
    const result = await new TestableScoreAction(runner).run(p);
    expect([result.Success, result.ResultCode]).toEqual([false, 'BINDING_WITHDRAWN']);
    expect([out(p, 'ScoringRunID'), out(p, 'Status'), out(p, 'Written')]).toEqual(['run-9', 'refused', 0]);
    expect(result.Message).toContain('run-9');
  });

  it('a failed run fails with SCORING_RUN_FAILED and its counts', async () => {
    const runner = new MockRunner(new ScoringRefusedError({ Status: 'failed', ScoringRunID: 'run-8', ModelID: 'm1', ModelVersion: 1, Total: 10, Failed: 4, FirstErrors: [{ recordId: 'r5', message: 'boom' }] }));
    const p = scoreParams();
    const result = await new TestableScoreAction(runner).run(p);
    expect([result.Success, result.ResultCode, out(p, 'Status'), out(p, 'Total'), out(p, 'Failed')]).toEqual([false, 'SCORING_RUN_FAILED', 'failed', 10, 4]);
  });

  it('keeps any other refusal error\'s typed code instead of SCORING_FAILED', async () => {
    const errors = ConsoleCapture.Errors();
    const result = await new TestableScoreAction(new MockRunner(new ModelNotScorableError('model-7', 'Archived'))).run(scoreParams());
    expect([result.Success, result.ResultCode]).toEqual([false, 'MODEL_NOT_SCORABLE']);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("ML Model 'model-7' is Archived and cannot score records")]);
  });
});

describe('PredictiveStudioScoreRecordSetAction — provider', () => {
  it('hands the runner the provider the caller passed', async () => {
    const runner = new MockRunner(completed(0));
    const scoped = { Name: 'scoped' } as unknown as IMetadataProvider; // test double: the mock runner only carries it
    const p = scoreParams();
    p.Provider = scoped;
    await new TestableScoreAction(runner).run(p);
    expect(runner.LastRequest?.provider).toBe(scoped);
  });

  it('falls back to the global provider when RunActionParams.Provider is absent (ActionEngine contract)', async () => {
    const previous = Metadata.Provider;
    const global = { Name: 'global' } as unknown as IMetadataProvider; // test double: the mock runner only carries it
    Metadata.Provider = global;
    try {
      const runner = new MockRunner(completed(0));
      const result = await new TestableScoreAction(runner).run(scoreParams());
      expect([result.Success, runner.LastRequest?.provider]).toEqual([true, global]);
    } finally {
      Metadata.Provider = previous;
    }
  });
});

/** The action with its production `createRunner` left in place, exposed for inspection. */
class DefaultRunnerScoreAction extends PredictiveStudioScoreRecordSetAction {
  public DefaultRunner(): IScoreRecordSetRunner {
    return this.createRunner();
  }
}

describe('PredictiveStudioScoreRecordSetAction — default runner', () => {
  it('builds the production runner over ScoringService', () => {
    expect(new DefaultRunnerScoreAction().DefaultRunner()).toBeInstanceOf(ProductionScoreRecordSetRunner);
  });
});
