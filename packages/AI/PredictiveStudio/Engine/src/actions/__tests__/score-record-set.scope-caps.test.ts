import { describe, it, expect } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';
import type { ScoringScope } from '../score-record-set.action';

/** A loaded row as the runner reads it (PrimaryKey + EntityInfo only). */
interface FakeLoadedRow {
  PrimaryKey: { ToString(): string };
  EntityInfo: { ID: string };
}

/** Provider fake: behaves like RunView — serves `matched` rows, or at most MaxRows / the 1,000 entity cap. */
class ScopeProvider {
  public readonly Params: RunViewParams[] = [];
  constructor(private readonly matched: number) {}
  public EntityByName(name: string): { ID: string; Name: string } {
    return { ID: `${name}-id`, Name: name };
  }
  async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.Params.push(params);
    const cap = params.IgnoreMaxRows === true ? this.matched : (params.MaxRows || 1000);   // no MaxRows → the entity's 1,000 cap
    const served = Math.min(this.matched, cap);
    const rows: FakeLoadedRow[] = Array.from({ length: served }, (_v, i) => ({
      PrimaryKey: { ToString: () => `r${i}` },
      EntityInfo: { ID: 'Members-id' },
    }));
    return {
      // Test double: the runner reads only PrimaryKey and EntityInfo from each loaded row.
      Success: true, Results: rows as unknown as T[], RowCount: served, TotalRowCount: this.matched, ExecutionTime: 0, ErrorMessage: '',
    } as RunViewResult<T>;
  }
}

class TestableRunner extends ProductionScoreRecordSetRunner {
  public Resolve(scope: ScoringScope, provider: ScopeProvider): Promise<RecordRef[]> {
    // Test doubles: resolveScope reads only the user's ID and the provider's RunView/EntityByName.
    return this.resolveScope(scope, { ID: 'u1' } as unknown as UserInfo, provider as unknown as IMetadataProvider);
  }
}

describe('ProductionScoreRecordSetRunner — scope reads are complete (W1 → S7.5, F-L3-2)', () => {
  it('a filter scope with no maxRows reads every matching row (16,776 of 16,776)', async () => {
    const provider = new ScopeProvider(16776);
    const refs = await new TestableRunner().Resolve({ filter: { entityName: 'Members', extraFilter: '1=1' } }, provider);
    expect(refs).toHaveLength(16776);
    expect(provider.Params[0].IgnoreMaxRows).toBe(true);
  });

  it('a view scope reads every row of the view', async () => {
    const provider = new ScopeProvider(1500);
    const refs = await new TestableRunner().Resolve({ viewId: 'view-1' }, provider);
    expect(refs).toHaveLength(1500);
    expect(provider.Params[0].IgnoreMaxRows).toBe(true);
  });

  it('refuses a filter scope whose explicit maxRows would score only part of the match', async () => {
    const provider = new ScopeProvider(16776);
    const refusal = new TestableRunner().Resolve({ filter: { entityName: 'Members', maxRows: 1000 } }, provider);
    await expect(refusal).rejects.toBeInstanceOf(ReadCapExceededError);
    await expect(refusal).rejects.toThrow("Score Record Set: the scope matches 16776 rows of 'Members' but maxRows=1000 would score only 1000.");
  });

  it('accepts an explicit maxRows that covers the whole match', async () => {
    const provider = new ScopeProvider(40);
    const refs = await new TestableRunner().Resolve({ filter: { entityName: 'Members', maxRows: 100 } }, provider);
    expect(refs).toHaveLength(40);
    expect(provider.Params[0].IgnoreMaxRows).toBe(false);
  });
});
