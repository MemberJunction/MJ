import { describe, it, expect } from 'vitest';
import type { RunActionParams, ActionParam, ActionResultSimple } from '@memberjunction/actions-base';

import type { IMetadataProvider } from '@memberjunction/core';

import { PredictiveStudioScoreRecordSetAction } from '../score-record-set.action';
import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import type {
  IScoreRecordSetRunner,
  ScoreRecordSetRequest,
  ScoreRecordSetResult,
} from '../score-record-set.action';
import type { JsonObject } from '../base-predictive-studio.action';

/**
 * Unit tests for the Score Record Set action. NO live DB, NO live sidecar — the
 * scoring runner is mocked via the action's overridable `createRunner` seam. These
 * prove the action stays thin: param validation (ModelID + scope shape),
 * correctly-mapped delegation to the runner, and result→output-param mapping for
 * both the ephemeral-predictions path and the write-back path.
 */

/** A captured-call mock runner. */
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

function params(list: ActionParam[]): RunActionParams {
  return { Params: list } as RunActionParams;
}
function out(p: RunActionParams, name: string): unknown {
  return p.Params.find((x) => x.Name === name)?.Value;
}

describe('PredictiveStudioScoreRecordSetAction — validation', () => {
  it('fails when ModelID is missing', async () => {
    const runner = new MockRunner({ scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false });
    const result = await new TestableScoreAction(runner).run(
      params([{ Name: 'Scope', Type: 'Input', Value: { records: ['r1'] } }]),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(runner.CallCount).toBe(0);
  });

  it('fails when Scope is missing entirely', async () => {
    const runner = new MockRunner({ scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false });
    const result = await new TestableScoreAction(runner).run(
      params([{ Name: 'ModelID', Type: 'Input', Value: 'model-1' }]),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(runner.CallCount).toBe(0);
  });

  it('fails when Scope populates no selector', async () => {
    const runner = new MockRunner({ scoredCount: 0, failedCount: 0, skippedCount: 0, wroteBack: false });
    const result = await new TestableScoreAction(runner).run(
      params([
        { Name: 'ModelID', Type: 'Input', Value: 'model-1' },
        { Name: 'Scope', Type: 'Input', Value: {} },
      ]),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(runner.CallCount).toBe(0);
  });
});

describe('PredictiveStudioScoreRecordSetAction — ephemeral predictions', () => {
  it('delegates to the runner with the mapped model + scope and returns ephemeral predictions', async () => {
    const runner = new MockRunner({
      scoredCount: 2,
      failedCount: 0,
      skippedCount: 0,
      wroteBack: false,
      predictions: [
        { recordId: 'r1', score: 0.9, class: 'churn' },
        { recordId: 'r2', score: 0.1, class: 'retain' },
      ],
    });
    const p = params([
      { Name: 'ModelID', Type: 'Input', Value: 'model-7' },
      { Name: 'Scope', Type: 'Input', Value: { filter: { entityName: 'Members', extraFilter: "Status='Active'" } } },
    ]);

    const result = await new TestableScoreAction(runner).run(p);

    expect(runner.CallCount).toBe(1);
    expect(runner.LastRequest?.modelId).toBe('model-7');
    expect(runner.LastRequest?.scope.filter?.entityName).toBe('Members');
    expect(runner.LastRequest?.writeBack).toBeUndefined();

    expect(result.Success).toBe(true);
    expect(out(p, 'ScoredCount')).toBe(2);
    expect(out(p, 'WroteBack')).toBe(false);
    const predictions = JSON.parse(out(p, 'Predictions') as string);
    expect(predictions).toHaveLength(2);
    expect(predictions[0]).toEqual({ recordId: 'r1', score: 0.9, class: 'churn' });
  });

  it('accepts a JSON-string Scope param', async () => {
    const runner = new MockRunner({ scoredCount: 1, failedCount: 0, skippedCount: 0, wroteBack: false, predictions: [{ score: 0.5 }] });
    const p = params([
      { Name: 'ModelID', Type: 'Input', Value: 'model-1' },
      { Name: 'Scope', Type: 'Input', Value: JSON.stringify({ records: ['rec-1'] }) },
    ]);
    const result = await new TestableScoreAction(runner).run(p);
    expect(result.Success).toBe(true);
    expect(runner.LastRequest?.scope.records).toEqual(['rec-1']);
  });
});

describe('PredictiveStudioScoreRecordSetAction — write-back', () => {
  it('passes the write-back directive and confirms write-back instead of returning predictions', async () => {
    const runner = new MockRunner({ scoredCount: 5, failedCount: 0, skippedCount: 0, wroteBack: true });
    const p = params([
      { Name: 'ModelID', Type: 'Input', Value: 'model-1' },
      { Name: 'Scope', Type: 'Input', Value: { viewId: 'view-1' } },
      { Name: 'WriteBack', Type: 'Input', Value: { OutputMapping: { column: 'ChurnScore' } } },
    ]);

    const result = await new TestableScoreAction(runner).run(p);

    expect(runner.LastRequest?.writeBack).toEqual({ OutputMapping: { column: 'ChurnScore' } });
    expect(result.Success).toBe(true);
    expect(out(p, 'WroteBack')).toBe(true);
    expect(out(p, 'ScoredCount')).toBe(5);
    expect(out(p, 'Predictions')).toBeUndefined();
    expect(result.Message).toContain('written back');
  });

  it('treats WriteBack=true as a default-mapping write-back', async () => {
    const runner = new MockRunner({ scoredCount: 3, failedCount: 0, skippedCount: 0, wroteBack: true });
    const p = params([
      { Name: 'ModelID', Type: 'Input', Value: 'model-1' },
      { Name: 'Scope', Type: 'Input', Value: { listId: 'list-1' } },
      { Name: 'WriteBack', Type: 'Input', Value: true },
    ]);
    await new TestableScoreAction(runner).run(p);
    expect(runner.LastRequest?.writeBack).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C3 — the single-record scope's primary-key FIELD NAMES are untrusted and get
// interpolated into a SQL filter. The runner must validate each key against the
// entity's real fields and REJECT unknown names (SQL-injection defense) rather
// than concatenating them. NO live DB — a minimal metadata provider double
// supplies a known entity + field set.
// ---------------------------------------------------------------------------

/** A minimal entity-info double exposing only the members `primaryKeyFilter` reads. */
function fakeEntity(name: string, fieldNames: string[]) {
  return { Name: name, Fields: fieldNames.map((n) => ({ Name: n })) };
}

/** A spy provider resolving exactly one entity by (case-insensitive) name. */
function fakeProvider(name: string, fieldNames: string[]): IMetadataProvider {
  const entity = fakeEntity(name, fieldNames);
  return {
    EntityByName(n: string) {
      return n.trim().toLowerCase() === name.trim().toLowerCase() ? entity : undefined;
    },
  } as unknown as IMetadataProvider;
}

/** Subclass exposing the protected `primaryKeyFilter` for direct testing. */
class TestableRunner extends ProductionScoreRecordSetRunner {
  public buildFilter(entityName: string, pk: JsonObject, provider: IMetadataProvider): string {
    return this.primaryKeyFilter(entityName, pk, provider);
  }
}

describe('ProductionScoreRecordSetRunner.primaryKeyFilter — SQL-injection guard (C3)', () => {
  const runner = new TestableRunner();
  const provider = fakeProvider('Customers', ['ID', 'TenantID']);

  it('builds a Field=value filter for valid key names (and escapes the value)', () => {
    const filter = runner.buildFilter('Customers', { ID: "a'b" }, provider);
    expect(filter).toBe("ID='a''b'");
  });

  it('combines multiple valid keys with AND', () => {
    const filter = runner.buildFilter('Customers', { ID: '1', TenantID: '2' }, provider);
    expect(filter).toBe("ID='1' AND TenantID='2'");
  });

  it('REJECTS an unknown key name rather than concatenating it (injection vector)', () => {
    expect(() =>
      runner.buildFilter('Customers', { "ID='x' OR 1=1 --": 'y' }, provider),
    ).toThrow(/is not a field on entity 'Customers'/);
  });

  it('throws when the entity is unknown to metadata', () => {
    expect(() => runner.buildFilter('Ghosts', { ID: '1' }, provider)).toThrow(/not found in metadata/);
  });

  it('throws when no primary-key fields are supplied', () => {
    expect(() => runner.buildFilter('Customers', {}, provider)).toThrow(/no primary-key fields/);
  });
});
