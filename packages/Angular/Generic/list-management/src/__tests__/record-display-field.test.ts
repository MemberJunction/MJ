import { describe, it, expect } from 'vitest';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import {
  GetRecordDisplayField,
  IsTextSearchableField,
  FormatRecordDisplayValue,
} from '../lib/utils/record-display-field';

/** Minimal structural stand-ins — the helper only reads these members. */
function makeField(partial: Partial<EntityFieldInfo>): EntityFieldInfo {
  return {
    Name: 'Field',
    Type: 'nvarchar',
    IsPrimaryKey: false,
    RelatedEntityID: null,
    ...partial,
  } as unknown as EntityFieldInfo;
}

function makeEntity(fields: EntityFieldInfo[], nameField: EntityFieldInfo | undefined): EntityInfo {
  return { Fields: fields, NameField: nameField } as unknown as EntityInfo;
}

const pk = makeField({ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true });

describe('GetRecordDisplayField', () => {
  it('returns the NameField when the entity has one', () => {
    const name = makeField({ Name: 'Name' });
    const result = GetRecordDisplayField(makeEntity([pk, name], name));
    expect(result.Field?.Name).toBe('Name');
    expect(result.IsNameField).toBe(true);
  });

  it('falls back to the first non-PK, non-FK, non-system field', () => {
    const fk = makeField({ Name: 'UserID', Type: 'uniqueidentifier', RelatedEntityID: 'some-entity' });
    const sys = makeField({ Name: '__mj_CreatedAt', Type: 'datetimeoffset' });
    const good = makeField({ Name: 'Description' });
    const result = GetRecordDisplayField(makeEntity([pk, fk, sys, good], undefined));
    expect(result.Field?.Name).toBe('Description');
    expect(result.IsNameField).toBe(false);
  });

  it('falls back to the first non-PK field when every candidate is FK or system', () => {
    const fk = makeField({ Name: 'UserID', Type: 'uniqueidentifier', RelatedEntityID: 'some-entity' });
    const sys = makeField({ Name: '__mj_CreatedAt', Type: 'datetimeoffset' });
    const result = GetRecordDisplayField(makeEntity([pk, fk, sys], undefined));
    expect(result.Field?.Name).toBe('UserID');
    expect(result.IsNameField).toBe(false);
  });

  it('returns null Field for an entity with only key fields', () => {
    const result = GetRecordDisplayField(makeEntity([pk], undefined));
    expect(result.Field).toBeNull();
    expect(result.IsNameField).toBe(false);
  });
});

describe('IsTextSearchableField', () => {
  it('accepts text types including parameterized ones', () => {
    expect(IsTextSearchableField(makeField({ Type: 'nvarchar(255)' }))).toBe(true);
    expect(IsTextSearchableField(makeField({ Type: 'varchar' }))).toBe(true);
  });

  it('rejects non-text types and null', () => {
    expect(IsTextSearchableField(makeField({ Type: 'uniqueidentifier' }))).toBe(false);
    expect(IsTextSearchableField(makeField({ Type: 'int' }))).toBe(false);
    expect(IsTextSearchableField(null)).toBe(false);
  });
});

describe('FormatRecordDisplayValue', () => {
  const name = makeField({ Name: 'Name' });
  const fallback = makeField({ Name: 'Description' });

  it('shows the value alone for a real NameField', () => {
    expect(FormatRecordDisplayValue('id-1', 'Acme', { Field: name, IsNameField: true })).toBe('Acme');
  });

  it('shows "id — value" for a fallback field', () => {
    expect(FormatRecordDisplayValue('id-1', 'Some text', { Field: fallback, IsNameField: false })).toBe('id-1 — Some text');
  });

  it('degrades to the id when the value is empty or null', () => {
    expect(FormatRecordDisplayValue('id-1', null, { Field: fallback, IsNameField: false })).toBe('id-1');
    expect(FormatRecordDisplayValue('id-1', '  ', { Field: name, IsNameField: true })).toBe('id-1');
  });
});
