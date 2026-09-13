import { describe, it, expect } from 'vitest';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { extractPrimaryKeyValues, isCompletePrimaryKeyLookup } from '../lib/record-primary-key';

/**
 * A subclass with no typed field properties — the same shape the ClassFactory hands back when an
 * entity's generated subclass is not registered in the process (a bare BaseEntity).
 */
class UntypedEntity extends BaseEntity {}

function entityInfo(primaryKeys: string[]): EntityInfo {
  return new EntityInfo({
    ID: '11111111-2222-3333-4444-555555555555',
    Name: 'Test Widgets',
    BaseTable: 'Widget',
    BaseView: 'vwWidgets',
    Status: 'Active',
    Fields: [
      ...primaryKeys.map((name, i) => ({ ID: `pk${i}`, Name: name, Type: 'nvarchar', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' })),
      { ID: 'f-name', Name: 'Name', Type: 'nvarchar', AllowsNull: false, Status: 'Active' },
    ],
  });
}

describe('extractPrimaryKeyValues', () => {
  it('reads the key of an entity with no typed properties, where record.ID is undefined', () => {
    const info = entityInfo(['ID']);
    const record = new UntypedEntity(info);
    record.Set('ID', 'A0000000-0000-4000-8000-000000000001');
    record.Set('Name', 'Widget 1');

    // The pre-fix read: the typed property does not exist on a bare BaseEntity.
    expect(Reflect.get(record, 'ID')).toBeUndefined();
    expect(extractPrimaryKeyValues(record, info)).toEqual({ ID: 'A0000000-0000-4000-8000-000000000001' });
  });

  it('gives every record its own key, so records can no longer collide', () => {
    const info = entityInfo(['ID']);
    const keys = ['k1', 'k2', 'k3'].map((id) => {
      const record = new UntypedEntity(info);
      record.Set('ID', id);
      return extractPrimaryKeyValues(record, info);
    });
    expect(new Set(keys.map((k) => k.ID)).size).toBe(3);
  });

  it('reads every column of a composite key', () => {
    const info = entityInfo(['TenantID', 'OrderNo']);
    const record = new UntypedEntity(info);
    record.Set('TenantID', 't-1');
    record.Set('OrderNo', '42');
    expect(extractPrimaryKeyValues(record, info)).toEqual({ TenantID: 't-1', OrderNo: '42' });
  });

  it('refuses a record whose key has no value instead of letting it overwrite others', () => {
    const info = entityInfo(['ID']);
    const record = new UntypedEntity(info);
    record.Set('Name', 'no key');
    expect(() => extractPrimaryKeyValues(record, info)).toThrow(/Cannot read primary key field 'ID' on a 'Test Widgets' record/);
  });
});

describe('isCompletePrimaryKeyLookup', () => {
  it('accepts lookups where every segment has a value', () => {
    expect(isCompletePrimaryKeyLookup('ID:abc')).toBe(true);
    expect(isCompletePrimaryKeyLookup('OrderNo:42|TenantID:t-1')).toBe(true);
    expect(isCompletePrimaryKeyLookup('ID:urn:x:1')).toBe(true);
  });

  it('rejects empty lookups and segments holding undefined, null or nothing', () => {
    expect(isCompletePrimaryKeyLookup('')).toBe(false);
    expect(isCompletePrimaryKeyLookup('ID:undefined')).toBe(false);
    expect(isCompletePrimaryKeyLookup('ID:null')).toBe(false);
    expect(isCompletePrimaryKeyLookup('ID:')).toBe(false);
    expect(isCompletePrimaryKeyLookup('OrderNo:42|TenantID:undefined')).toBe(false);
  });
});
