import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import {
  ExistingRecordIndex,
  KeepPrimaryKeyEnvReferences,
  UnsetPrimaryKeyVariableError,
} from '../lib/existing-record-index';
import { CreatePrimaryKeyLookup } from '../lib/record-primary-key';
import type { RecordData } from '../lib/sync-engine';

const ID = 'B0000000-0000-4000-8000-000000000001';
const OTHER_ID = 'B0000000-0000-4000-8000-000000000002';

const tagInfo = new EntityInfo({
  ID: 'bbbbbbbb-0000-4000-8000-000000000000',
  Name: 'EnvTest: Tags',
  BaseTable: 'Tag',
  BaseView: 'vwTags',
  Status: 'Active',
  Fields: [
    { ID: 'f-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'f-name', Name: 'Name', Type: 'nvarchar', AllowsNull: false, Status: 'Active' },
  ],
});

const compositeInfo = new EntityInfo({
  ID: 'dddddddd-0000-4000-8000-000000000000',
  Name: 'EnvTest: Tag Codes',
  BaseTable: 'TagCode',
  BaseView: 'vwTagCodes',
  Status: 'Active',
  Fields: [
    { ID: 'c-tag', Name: 'TagID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 'c-code', Name: 'Code', Type: 'nvarchar', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
  ],
});

function rec(primaryKey: Record<string, unknown> | undefined, name = 'x'): RecordData {
  return { fields: { Name: name }, ...(primaryKey ? { primaryKey } : {}) };
}

describe('ExistingRecordIndex', () => {
  it('finds a record by a literal key', () => {
    const index = ExistingRecordIndex.Build([{ Record: rec({ ID }, 'a'), FilePath: '/x/.a.json' }], tagInfo, {});
    expect(index.Find({ ID })?.Record.fields.Name).toBe('a');
    expect(index.Find({ ID })?.FilePath).toBe('/x/.a.json');
    expect(index.Find({ ID: OTHER_ID })).toBeUndefined();
  });

  it('finds a record whose key is an @env: reference, using the trimmed variable', () => {
    const index = ExistingRecordIndex.Build([{ Record: rec({ ID: '@env:TAG_ID' }, 'env') }], tagInfo, { TAG_ID: `  ${ID}  ` });
    expect(index.Find({ ID })?.Record.fields.Name).toBe('env');
  });

  it('compares UUID key fields without case', () => {
    const lower = ExistingRecordIndex.Build([{ Record: rec({ ID: '@env:TAG_ID' }) }], tagInfo, { TAG_ID: ID.toLowerCase() });
    expect(lower.Find({ ID })).toBeDefined();
    const literalLower = ExistingRecordIndex.Build([{ Record: rec({ ID: ID.toLowerCase() }) }], tagInfo, {});
    expect(literalLower.Find({ ID })).toBeDefined();
  });

  it('compares a non-UUID key field with case', () => {
    const index = ExistingRecordIndex.Build([{ Record: rec({ TagID: ID, Code: 'abc' }) }], compositeInfo, {});
    expect(index.Find({ TagID: ID, Code: 'abc' })).toBeDefined();
    expect(index.Find({ TagID: ID, Code: 'ABC' })).toBeUndefined();
  });

  it('matches a padded fixed-width database key to the trimmed @env: value', () => {
    const index = ExistingRecordIndex.Build(
      [{ Record: rec({ TagID: ID, Code: '@env:TAG_CODE' }, 'padded') }],
      compositeInfo,
      { TAG_CODE: 'abc' }
    );
    expect(index.Find({ TagID: ID, Code: 'abc   ' })?.Record.fields.Name).toBe('padded');
  });

  it('matches a composite key with one @env: part', () => {
    const index = ExistingRecordIndex.Build(
      [{ Record: rec({ TagID: '@env:TAG_ID', Code: 'abc' }, 'composite') }],
      compositeInfo,
      { TAG_ID: ID }
    );
    expect(index.Find({ Code: 'abc', TagID: ID })?.Record.fields.Name).toBe('composite');
  });

  it('lists an unset key variable, does not match the record, and never holds a value', () => {
    const index = ExistingRecordIndex.Build(
      [{ Record: rec({ ID: '@env:MISSING_ID' }), FilePath: '/x/.a.json' }],
      tagInfo,
      {}
    );
    expect(index.UnsetKeyVariables).toEqual([{ VariableName: 'MISSING_ID', Field: 'ID', FilePath: '/x/.a.json' }]);
    expect(index.Find({ ID })).toBeUndefined();
  });

  it('throws UnsetPrimaryKeyVariableError naming the file, field and variable', () => {
    const index = ExistingRecordIndex.Build([{ Record: rec({ ID: '@env:MISSING_ID' }), FilePath: '/x/.a.json' }], tagInfo, {});
    expect(() => index.ThrowIfUnsetKeyVariables('EnvTest: Tags')).toThrow(UnsetPrimaryKeyVariableError);
    expect(() => index.ThrowIfUnsetKeyVariables('EnvTest: Tags')).toThrow(
      '/x/.a.json: primaryKey field ID uses @env:MISSING_ID, which is not set. Set it to pull EnvTest: Tags.'
    );
  });

  it('does not throw when every key variable is set', () => {
    const index = ExistingRecordIndex.Build([{ Record: rec({ ID: '@env:TAG_ID' }) }], tagInfo, { TAG_ID: ID });
    expect(() => index.ThrowIfUnsetKeyVariables('EnvTest: Tags')).not.toThrow();
  });

  it('keeps the first record for a repeated key and counts the repeat', () => {
    const index = ExistingRecordIndex.Build(
      [{ Record: rec({ ID }, 'first') }, { Record: rec({ ID: '@env:TAG_ID' }, 'second') }],
      tagInfo,
      { TAG_ID: ID }
    );
    expect(index.Find({ ID })?.Record.fields.Name).toBe('first');
    expect(index.DuplicateCount).toBe(1);
  });

  it('ignores a record without a primaryKey', () => {
    const index = ExistingRecordIndex.Build([{ Record: rec(undefined) }, { Record: rec({}) }], tagInfo, {});
    expect(index.DuplicateCount).toBe(0);
    expect(index.UnsetKeyVariables).toEqual([]);
  });

  it('works without entity info, comparing every field with case', () => {
    const index = ExistingRecordIndex.Build([{ Record: rec({ ID }) }], null, {});
    expect(index.Find({ ID })).toBeDefined();
    expect(index.Find({ ID: ID.toLowerCase() })).toBeUndefined();
  });

  it('gives the lookup string the file holds, for FileWriteBatch', () => {
    const record = rec({ ID: '@env:TAG_ID' });
    expect(ExistingRecordIndex.FileLookupOf(record)).toBe(CreatePrimaryKeyLookup({ ID: '@env:TAG_ID' }));
  });

  it('gives null from KeyOf when a key variable is not set', () => {
    const index = ExistingRecordIndex.Build([], tagInfo, {});
    expect(index.KeyOf(rec({ ID: '@env:MISSING_ID' }))).toBeNull();
    expect(index.KeyOf(rec({ ID }))).toBe(index.MatchKey({ ID }));
  });
});

describe('KeepPrimaryKeyEnvReferences', () => {
  it('keeps the @env: value when the variable equals the database key', () => {
    expect(KeepPrimaryKeyEnvReferences({ ID: '@env:TAG_ID' }, { ID }, tagInfo, { TAG_ID: ID })).toEqual({ ID: '@env:TAG_ID' });
  });

  it('keeps the @env: value when only the UUID case differs', () => {
    expect(KeepPrimaryKeyEnvReferences({ ID: '@env:TAG_ID' }, { ID }, tagInfo, { TAG_ID: ID.toLowerCase() })).toEqual({
      ID: '@env:TAG_ID',
    });
  });

  it('writes the database value when the variable differs or is not set', () => {
    expect(KeepPrimaryKeyEnvReferences({ ID: '@env:TAG_ID' }, { ID }, tagInfo, { TAG_ID: OTHER_ID })).toEqual({ ID });
    expect(KeepPrimaryKeyEnvReferences({ ID: '@env:TAG_ID' }, { ID }, tagInfo, {})).toEqual({ ID });
  });

  it('writes the database value for a literal or missing file key', () => {
    expect(KeepPrimaryKeyEnvReferences({ ID: ID.toLowerCase() }, { ID }, tagInfo, {})).toEqual({ ID });
    expect(KeepPrimaryKeyEnvReferences(undefined, { ID }, tagInfo, {})).toEqual({ ID });
  });

  it('keeps only the @env: part of a composite key', () => {
    expect(
      KeepPrimaryKeyEnvReferences({ TagID: '@env:TAG_ID', Code: 'abc' }, { TagID: ID, Code: 'abc' }, compositeInfo, { TAG_ID: ID })
    ).toEqual({ TagID: '@env:TAG_ID', Code: 'abc' });
  });
});
