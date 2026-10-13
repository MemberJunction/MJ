import { describe, it, expect } from 'vitest';
import { BaseEntity, CompositeKey, type EntityInfo } from '@memberjunction/core';
import type { RecordRef, RecordProcessorContext } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';

/**
 * Primary-key handling in the Score Record Set runner. NO live DB.
 *
 * MJ entities can be keyed by any column name(s) — `individual_id`, or a composite
 * `(OrderID, LineNo)` — and the list-scope filter + write-back load key used to assume a
 * single column (and, for the list scope, fell back to a column literally named `ID`).
 * These prove both paths derive the key from the entity's real primary key(s), reading the
 * compact CompositeKey URL segments that `MJ: List Details.RecordID` / `RecordRef.RecordID`
 * carry.
 */

/** A minimal entity-info double exposing only the members the key-building code reads. */
function fakeEntity(name: string, primaryKeys: string[]): EntityInfo {
  const pks = primaryKeys.map((n) => ({ Name: n }));
  return { ID: `${name}-id`, Name: name, PrimaryKeys: pks, FirstPrimaryKey: pks[0] } as unknown as EntityInfo;
}

/** Captures the key handed to InnerLoad; stands in for the loaded target entity. */
class KeyCapturingEntity {
  public LoadedKey: CompositeKey | null = null;
  public async InnerLoad(key: CompositeKey): Promise<boolean> {
    this.LoadedKey = key;
    return true;
  }
}

/** Exposes the protected seams under test. */
class TestableRunner extends ProductionScoreRecordSetRunner {
  public filterFor(entity: EntityInfo, ids: string[]): string {
    return this.primaryKeyInFilter(entity, ids);
  }
  public resolve(record: RecordRef, context: RecordProcessorContext): Promise<BaseEntity> {
    return this.resolveTargetEntity(record, context);
  }
}

function contextFor(entity: EntityInfo, target: KeyCapturingEntity): RecordProcessorContext {
  return {
    contextUser: { ID: 'u1' },
    provider: {
      EntityByID: (id: string) => (id === entity.ID ? entity : undefined),
      GetEntityObject: async () => target,
    },
  } as unknown as RecordProcessorContext;
}

describe('ProductionScoreRecordSetRunner.primaryKeyInFilter', () => {
  const runner = new TestableRunner();

  it('uses the entity\'s real single key column — not a column named ID — in one IN()', () => {
    const filter = runner.filterFor(fakeEntity('Individuals', ['individual_id']), ['42', "a'b"]);
    expect(filter).toBe("individual_id IN ('42', 'a''b')");
  });

  it('emits one (F1=.. AND F2=..) term per record for a composite key instead of truncating it', () => {
    const filter = runner.filterFor(fakeEntity('OrderLines', ['OrderID', 'LineNo']), [
      'OrderID|11055||LineNo|3',
      'OrderID|11055||LineNo|4',
    ]);
    expect(filter).toBe("(OrderID='11055' AND LineNo='3') OR (OrderID='11055' AND LineNo='4')");
  });
});

describe('ProductionScoreRecordSetRunner.resolveTargetEntity — load key', () => {
  const runner = new TestableRunner();

  it('loads an id-only ref by the entity\'s real single key column', async () => {
    const entity = fakeEntity('Individuals', ['individual_id']);
    const target = new KeyCapturingEntity();
    await runner.resolve({ EntityID: entity.ID, RecordID: '42' }, contextFor(entity, target));
    expect(target.LoadedKey?.KeyValuePairs).toEqual([{ FieldName: 'individual_id', Value: '42' }]);
  });

  it('loads a composite-key ref from its full segment rather than rejecting or truncating it', async () => {
    const entity = fakeEntity('OrderLines', ['OrderID', 'LineNo']);
    const target = new KeyCapturingEntity();
    await runner.resolve({ EntityID: entity.ID, RecordID: 'OrderID|11055||LineNo|3' }, contextFor(entity, target));
    expect(target.LoadedKey?.KeyValuePairs).toEqual([
      { FieldName: 'OrderID', Value: '11055' },
      { FieldName: 'LineNo', Value: '3' },
    ]);
  });

  it('reuses an already-loaded BaseEntity on the ref without touching the provider', async () => {
    const entity = fakeEntity('Individuals', ['individual_id']);
    const target = new KeyCapturingEntity();
    const preloaded = Object.create(BaseEntity.prototype) as BaseEntity;
    const result = await runner.resolve(
      { EntityID: entity.ID, RecordID: '42', Record: preloaded },
      contextFor(entity, target),
    );
    expect(result).toBe(preloaded);
    expect(target.LoadedKey).toBeNull();
  });
});
