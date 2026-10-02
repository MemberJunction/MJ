import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { RecommendationEngineBase } from '../Engine';

/**
 * Primary-key handling when the engine selects the source records for a recommendation
 * request. The source entity is whatever a List or caller points at — a customer entity
 * keyed by any column name(s) — so the filter must come from the entity's real primary
 * key(s), not from its first column. Ids are compact CompositeKey URL segments (what
 * `MJ: List Details.RecordID` holds): the bare value for a single-column key, the full
 * `F1|v1||F2|v2` segment for a composite key.
 */

/** A minimal entity-info double exposing only the members BuildPrimaryKeyFilter reads. */
function fakeEntity(name: string, primaryKeys: Array<{ Name: string; NeedsQuotes: boolean }>): EntityInfo {
  return { ID: `${name}-id`, Name: name, PrimaryKeys: primaryKeys, FirstPrimaryKey: primaryKeys[0] } as unknown as EntityInfo;
}

/** Exposes the protected filter builder. */
class TestableEngine extends RecommendationEngineBase {
  public filterFor(entity: EntityInfo, ids: Array<string | number>): string {
    return this.BuildPrimaryKeyFilter(entity, ids);
  }
}

describe('RecommendationEngineBase.BuildPrimaryKeyFilter', () => {
  const engine = new TestableEngine();

  it('quotes a single string key column by its real name, escaping embedded quotes', () => {
    const filter = engine.filterFor(fakeEntity('Individuals', [{ Name: 'individual_id', NeedsQuotes: true }]), ['42', "a'b"]);
    expect(filter).toBe("individual_id IN ('42','a''b')");
  });

  it('leaves a single numeric key column unquoted', () => {
    const filter = engine.filterFor(fakeEntity('Products', [{ Name: 'ProductNo', NeedsQuotes: false }]), [7, 8]);
    expect(filter).toBe('ProductNo IN (7,8)');
  });

  it('emits one (F1=.. AND F2=..) term per record for a composite key instead of truncating it', () => {
    const filter = engine.filterFor(
      fakeEntity('OrderLines', [{ Name: 'OrderID', NeedsQuotes: false }, { Name: 'LineNo', NeedsQuotes: false }]),
      ['OrderID|11055||LineNo|3', 'OrderID|11055||LineNo|4'],
    );
    expect(filter).toBe("(OrderID='11055' AND LineNo='3') OR (OrderID='11055' AND LineNo='4')");
  });
});
