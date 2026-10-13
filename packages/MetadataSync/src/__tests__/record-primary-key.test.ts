import { describe, it, expect } from 'vitest';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { CreatePrimaryKeyLookup, ExtractPrimaryKeyValues, HasCompletePrimaryKey } from '../lib/record-primary-key';

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
    expect(ExtractPrimaryKeyValues(record, info)).toEqual({ ID: 'A0000000-0000-4000-8000-000000000001' });
  });

  it('gives every record its own key, so records can no longer collide', () => {
    const info = entityInfo(['ID']);
    const keys = ['k1', 'k2', 'k3'].map((id) => {
      const record = new UntypedEntity(info);
      record.Set('ID', id);
      return ExtractPrimaryKeyValues(record, info);
    });
    expect(new Set(keys.map((k) => k.ID)).size).toBe(3);
  });

  it('reads every column of a composite key', () => {
    const info = entityInfo(['TenantID', 'OrderNo']);
    const record = new UntypedEntity(info);
    record.Set('TenantID', 't-1');
    record.Set('OrderNo', '42');
    expect(ExtractPrimaryKeyValues(record, info)).toEqual({ TenantID: 't-1', OrderNo: '42' });
  });

  it('refuses a record whose key has no value instead of letting it overwrite others', () => {
    const info = entityInfo(['ID']);
    const record = new UntypedEntity(info);
    record.Set('Name', 'no key');
    expect(() => ExtractPrimaryKeyValues(record, info)).toThrow(/Cannot read primary key field 'ID' on a 'Test Widgets' record/);
  });

  it('accepts real key values that only look empty: an empty string and the text null', () => {
    const info = entityInfo(['ID']);
    for (const value of ['', 'null', 'undefined']) {
      const record = new UntypedEntity(info);
      record.Set('ID', value);
      expect(ExtractPrimaryKeyValues(record, info)).toEqual({ ID: value });
    }
  });
});

describe('hasCompletePrimaryKey', () => {
  it('accepts keys where every field holds a value, including values that only look empty', () => {
    expect(HasCompletePrimaryKey({ ID: 'abc' })).toBe(true);
    expect(HasCompletePrimaryKey({ TenantID: 't-1', OrderNo: 42 })).toBe(true);
    expect(HasCompletePrimaryKey({ ID: '' })).toBe(true);
    expect(HasCompletePrimaryKey({ ID: 'null' })).toBe(true);
    expect(HasCompletePrimaryKey({ Code: 'AB|CD' })).toBe(true);
  });

  it('rejects a missing or empty key object and fields holding undefined or null', () => {
    expect(HasCompletePrimaryKey(undefined)).toBe(false);
    expect(HasCompletePrimaryKey({})).toBe(false);
    expect(HasCompletePrimaryKey({ ID: undefined })).toBe(false);
    expect(HasCompletePrimaryKey({ ID: null })).toBe(false);
    expect(HasCompletePrimaryKey({ TenantID: 't-1', OrderNo: undefined })).toBe(false);
  });
});

describe('createPrimaryKeyLookup', () => {
  it('joins field:value segments sorted by field name', () => {
    expect(CreatePrimaryKeyLookup({ ID: 'abc' })).toBe('ID:abc');
    expect(CreatePrimaryKeyLookup({ TenantID: 't-1', OrderNo: 42 })).toBe('OrderNo:42|TenantID:t-1');
  });

  it('gives the same string for a number and its text, as file and database values can differ in type', () => {
    expect(CreatePrimaryKeyLookup({ ID: 42 })).toBe(CreatePrimaryKeyLookup({ ID: '42' }));
  });

  it('keeps composite keys distinct when a value contains the separator', () => {
    const a = CreatePrimaryKeyLookup({ A: '1|B:2', B: '3' });
    const b = CreatePrimaryKeyLookup({ A: '1', B: '2|B:3' });
    expect(a).not.toBe(b);
  });

  it('returns an empty string for a missing key object', () => {
    expect(CreatePrimaryKeyLookup(undefined)).toBe('');
  });
});
