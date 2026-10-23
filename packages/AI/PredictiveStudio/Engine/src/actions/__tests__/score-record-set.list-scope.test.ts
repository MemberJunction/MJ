import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';

/**
 * The list scope reads only the target rows' primary keys (`simple` + PK `Fields`) and keys each ref with
 * its compact CompositeKey segment, so write-back can load the record by key. NO live DB.
 */

/** A minimal entity-info double exposing only the members the list scope reads. */
function fakeEntity(name: string, primaryKeys: string[]): EntityInfo {
  const pks = primaryKeys.map((n) => ({ Name: n }));
  return { ID: `${name}-id`, Name: name, PrimaryKeys: pks, FirstPrimaryKey: pks[0] } as unknown as EntityInfo;
}

/** A row keyed by field name, as a `simple` RunView returns it. */
type Row = Record<string, string>;

/** Provider fake serving one list, its member ids, and the member rows. */
class ListProvider {
  public readonly BatchParams: RunViewParams[] = [];
  constructor(
    private readonly entity: EntityInfo,
    private readonly memberIds: string[],
    private readonly rowFor: (memberId: string) => Row,
  ) {}
  public EntityByID(id: string): EntityInfo | undefined {
    return id === this.entity.ID ? this.entity : undefined;
  }
  async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    const rows: Row[] =
      params.EntityName === 'MJ: Lists' ? [{ EntityID: this.entity.ID }] : this.memberIds.map((id) => ({ RecordID: id }));
    // Test double: the list scope reads EntityID from MJ: Lists and RecordID from MJ: List Details.
    return { Success: true, Results: rows as unknown as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
  }
  async RunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
    this.BatchParams.push(...params);
    let served = 0;
    return params.map(() => {
      const chunk = this.memberIds.slice(served, served + 100).map((id) => this.rowFor(id));
      served += chunk.length;
      // Test double: each chunk serves the next 100 members' key rows.
      return { Success: true, Results: chunk as unknown as T[], RowCount: chunk.length, TotalRowCount: chunk.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    });
  }
}

class TestableRunner extends ProductionScoreRecordSetRunner {
  public Resolve(provider: ListProvider): Promise<RecordRef[]> {
    // Test doubles: resolveList reads only the provider's RunView/RunViews/EntityByID.
    return this.resolveList('list-1', { ID: 'u1' } as unknown as UserInfo, provider as unknown as IMetadataProvider);
  }
}

describe('ProductionScoreRecordSetRunner.resolveList', () => {
  it('reads only the primary-key columns as simple rows and keys refs by the compact segment', async () => {
    const entity = fakeEntity('Individuals', ['individual_id']);
    const provider = new ListProvider(entity, ['42', '43'], (id) => ({ individual_id: id }));
    const refs = await new TestableRunner().Resolve(provider);

    expect(provider.BatchParams).toHaveLength(1);
    expect(provider.BatchParams[0].ResultType).toBe('simple');
    expect(provider.BatchParams[0].Fields).toEqual(['individual_id']);
    expect(refs.map((r) => r.RecordID)).toEqual(['42', '43']);
    expect(refs[0].EntityID).toBe('Individuals-id');
    expect(refs[0].Record).toEqual({ individual_id: '42' });
  });

  it('keys a composite-key member by its full segment', async () => {
    const entity = fakeEntity('OrderLines', ['OrderID', 'LineNo']);
    const provider = new ListProvider(entity, ['OrderID|11055||LineNo|3'], () => ({ OrderID: '11055', LineNo: '3' }));
    const refs = await new TestableRunner().Resolve(provider);

    expect(provider.BatchParams[0].Fields).toEqual(['OrderID', 'LineNo']);
    expect(refs.map((r) => r.RecordID)).toEqual(['OrderID|11055||LineNo|3']);
  });

  it('batches more than 100 members into one RunViews call of 100-member chunks', async () => {
    const entity = fakeEntity('Members', ['ID']);
    const ids = Array.from({ length: 250 }, (_v, i) => `m${i}`);
    const provider = new ListProvider(entity, ids, (id) => ({ ID: id }));
    const refs = await new TestableRunner().Resolve(provider);

    expect(provider.BatchParams).toHaveLength(3);
    expect(refs).toHaveLength(250);
    expect(refs[249].RecordID).toBe('m249');
  });
});
