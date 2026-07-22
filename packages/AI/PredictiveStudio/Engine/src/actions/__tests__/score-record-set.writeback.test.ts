import { describe, it, expect } from 'vitest';
import type { BaseEntity, EntityInfo } from '@memberjunction/core';
import type { RecordRef, RecordProcessorContext, RecordResult } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import type { ScoreRecordSetRequest, ScoreRecordSetResult } from '../score-record-set.action';
import type { MLInferenceResultPayload } from '../../scoring/ml-model-inference-processor';

/**
 * Unit tests for the Score Record Set runner's WRITE-BACK pass. NO live DB / sidecar.
 *
 * These prove the gap closure: when the request carries a write-back `OutputMapping`
 * (the substrate's `{ fields: { EntityField: '$.payloadPath' } }` shape), the runner
 * resolves each succeeded record, validates the mapped field names against the
 * entity's real fields, sets them from the prediction payload, and `Save()`s —
 * reporting `wroteBack=true`. A failed Save reclassifies the record scored→failed,
 * `dryRun` suppresses all writes, and an unknown target field is rejected.
 *
 * `resolveTargetEntity` is overridden to hand back a fully-controlled fake entity so
 * the test exercises the write-back ORCHESTRATION (map → validate → Set → Save →
 * reclassify) without constructing a live `BaseEntity` or touching a provider.
 */

/** A minimal `BaseEntity` test double: captures Set() calls and a scripted Save() result. */
class FakeEntity {
  public readonly SetCalls: Array<{ field: string; value: unknown }> = [];
  public SaveCalled = 0;
  public LatestResult: { CompleteMessage: string } | undefined;

  constructor(
    private readonly fieldNames: string[],
    private readonly saveSucceeds: boolean,
    saveError?: string,
  ) {
    if (!saveSucceeds) {
      this.LatestResult = { CompleteMessage: saveError ?? 'save failed' };
    }
  }

  /** The runner reads `.EntityInfo.Fields` to validate mapped field names. */
  public get EntityInfo(): EntityInfo {
    return {
      Name: 'Members',
      Fields: this.fieldNames.map((n) => ({ Name: n })),
    } as unknown as EntityInfo;
  }

  public Set(field: string, value: unknown): void {
    this.SetCalls.push({ field, value });
  }

  public async Save(): Promise<boolean> {
    this.SaveCalled++;
    return this.saveSucceeds;
  }
}

/** Test runner: scripts `resolveTargetEntity` and exposes the protected write-back/summarize seams. */
class TestableWriteBackRunner extends ProductionScoreRecordSetRunner {
  /** Map of RecordID -> the fake entity to hand back for that record. */
  public Entities = new Map<string, FakeEntity>();

  protected override async resolveTargetEntity(record: RecordRef): Promise<BaseEntity> {
    const entity = this.Entities.get(record.RecordID);
    if (!entity) {
      throw new Error(`no fake entity registered for '${record.RecordID}'`);
    }
    return entity as unknown as BaseEntity;
  }

  public applyWriteBackPublic(
    records: RecordRef[],
    results: RecordResult[],
    request: ScoreRecordSetRequest,
  ): Promise<{ wroteBack: boolean; failedIndexes: Set<number> }> {
    const ctx = { contextUser: { ID: 'u1' }, provider: {} } as unknown as RecordProcessorContext;
    return (this as unknown as {
      applyWriteBack(
        r: RecordRef[],
        x: RecordResult[],
        req: ScoreRecordSetRequest,
        c: RecordProcessorContext,
      ): Promise<{ wroteBack: boolean; failedIndexes: Set<number> }>;
    }).applyWriteBack(records, results, request, ctx);
  }

  public summarizePublic(
    records: RecordRef[],
    results: RecordResult[],
    request: ScoreRecordSetRequest,
    writeBack: { wroteBack: boolean; failedIndexes: Set<number> },
  ): ScoreRecordSetResult {
    return (this as unknown as {
      summarize(
        r: RecordRef[],
        x: RecordResult[],
        req: ScoreRecordSetRequest,
        w: { wroteBack: boolean; failedIndexes: Set<number> },
      ): ScoreRecordSetResult;
    }).summarize(records, results, request, writeBack);
  }
}

function ref(id: string): RecordRef {
  return { EntityID: 'ent-members', RecordID: id };
}
function succeeded(score: number, klass?: string): RecordResult {
  const payload: MLInferenceResultPayload = { modelId: 'm1', target: 'Renewed', problemType: 'classification', score, class: klass };
  return { Status: 'Succeeded', ResultPayload: payload };
}
const MAPPING = { OutputMapping: { fields: { RenewalScore: '$.score', RenewalClass: '$.class' } } };

describe('ProductionScoreRecordSetRunner write-back — Saves mapped fields', () => {
  it('sets the mapped fields from the payload, Saves, and reports wroteBack=true', async () => {
    const runner = new TestableWriteBackRunner();
    const entity = new FakeEntity(['ID', 'RenewalScore', 'RenewalClass'], true);
    runner.Entities.set('m1', entity);

    const records = [ref('m1')];
    const results = [succeeded(0.83, 'renew')];
    const request: ScoreRecordSetRequest = { modelId: 'm1', scope: { records: ['m1'] }, writeBack: MAPPING };

    const wb = await runner.applyWriteBackPublic(records, results, request);

    expect(wb.wroteBack).toBe(true);
    expect(wb.failedIndexes.size).toBe(0);
    expect(entity.SaveCalled).toBe(1);
    expect(entity.SetCalls).toEqual([
      { field: 'RenewalScore', value: 0.83 },
      { field: 'RenewalClass', value: 'renew' },
    ]);

    // And the summary surfaces it: scored, no ephemeral predictions.
    const summary = runner.summarizePublic(records, results, request, wb);
    expect(summary.scoredCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(summary.wroteBack).toBe(true);
    expect(summary.predictions).toBeUndefined();
  });

  it('reclassifies a record scored→failed when its Save fails', async () => {
    const runner = new TestableWriteBackRunner();
    runner.Entities.set('ok', new FakeEntity(['ID', 'RenewalScore', 'RenewalClass'], true));
    runner.Entities.set('bad', new FakeEntity(['ID', 'RenewalScore', 'RenewalClass'], false, 'FK violation'));

    const records = [ref('ok'), ref('bad')];
    const results = [succeeded(0.9, 'renew'), succeeded(0.1, 'lapse')];
    const request: ScoreRecordSetRequest = { modelId: 'm1', scope: { records: ['ok', 'bad'] }, writeBack: MAPPING };

    const wb = await runner.applyWriteBackPublic(records, results, request);

    expect(wb.wroteBack).toBe(true); // at least one Save succeeded
    expect(wb.failedIndexes.has(1)).toBe(true);

    const summary = runner.summarizePublic(records, results, request, wb);
    expect(summary.scoredCount).toBe(1); // 'ok'
    expect(summary.failedCount).toBe(1); // 'bad' moved out of scored
    expect(summary.wroteBack).toBe(true);
  });
});

describe('ProductionScoreRecordSetRunner write-back — dryRun & validation', () => {
  it('does NOT write when dryRun is true (even with an OutputMapping)', async () => {
    const runner = new TestableWriteBackRunner();
    const entity = new FakeEntity(['ID', 'RenewalScore', 'RenewalClass'], true);
    runner.Entities.set('m1', entity);

    const records = [ref('m1')];
    const results = [succeeded(0.83, 'renew')];
    const request: ScoreRecordSetRequest = { modelId: 'm1', scope: { records: ['m1'] }, writeBack: MAPPING, dryRun: true };

    const wb = await runner.applyWriteBackPublic(records, results, request);

    expect(wb.wroteBack).toBe(false);
    expect(entity.SaveCalled).toBe(0);
    expect(entity.SetCalls).toHaveLength(0);

    // Predictions are surfaced ephemerally since nothing was written back.
    const summary = runner.summarizePublic(records, results, request, wb);
    expect(summary.wroteBack).toBe(false);
    expect(summary.predictions).toEqual([{ recordId: 'm1', score: 0.83, class: 'renew' }]);
  });

  it('rejects an unknown target field name (no Save)', async () => {
    const runner = new TestableWriteBackRunner();
    const entity = new FakeEntity(['ID', 'RenewalScore'], true); // RenewalClass missing
    runner.Entities.set('m1', entity);

    const records = [ref('m1')];
    const results = [succeeded(0.83, 'renew')];
    const request: ScoreRecordSetRequest = { modelId: 'm1', scope: { records: ['m1'] }, writeBack: MAPPING };

    const wb = await runner.applyWriteBackPublic(records, results, request);

    // The unknown field throws inside writeBackRecord → record counted as failed,
    // nothing written, and the record never reaches Save().
    expect(wb.wroteBack).toBe(false);
    expect(wb.failedIndexes.has(0)).toBe(true);
    expect(entity.SaveCalled).toBe(0);
  });

  it('treats the boolean write-back form as "no mapping to apply here" (no write)', async () => {
    const runner = new TestableWriteBackRunner();
    const entity = new FakeEntity(['ID', 'RenewalScore'], true);
    runner.Entities.set('m1', entity);

    const records = [ref('m1')];
    const results = [succeeded(0.83, 'renew')];
    const request: ScoreRecordSetRequest = { modelId: 'm1', scope: { records: ['m1'] }, writeBack: true };

    const wb = await runner.applyWriteBackPublic(records, results, request);

    expect(wb.wroteBack).toBe(false);
    expect(entity.SaveCalled).toBe(0);
  });
});
