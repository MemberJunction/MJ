/**
 * EnvSourcedValuesOf / FindEnvSourcedValue: the env values a record file uses, and where a database value holds one.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { EnvSourcedValuesOf, FindEnvSourcedValue } from '../lib/env-derived-fields';

const info = new EntityInfo({
  ID: 'dddddddd-0000-4000-8000-000000000000',
  Name: 'Test: Things',
  Status: 'Active',
  Fields: [
    { ID: 't-id', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Status: 'Active' },
    { ID: 't-code', Name: 'Code', Type: 'nvarchar', AllowsNull: false, Status: 'Active' },
  ],
});
const UUID = 'D0000000-0000-4000-8000-0000000000AB';

describe('EnvSourcedValuesOf', () => {
  it('collects key values and nested field references of set variables, and skips short non-UUID values', () => {
    const env = { KEY: UUID.toLowerCase(), LONG: 'long-value-1', SHORT: 'abc' };
    const values = EnvSourcedValuesOf(
      { primaryKey: { ID: '@env:KEY' }, fields: { A: '@env:SHORT', B: { inner: ['@env:LONG', '@env:UNSET'] }, C: 'plain' } },
      info,
      env
    );

    expect(values).toEqual([
      { VariableName: 'KEY', Value: UUID.toLowerCase(), IgnoreCase: true },
      { VariableName: 'LONG', Value: 'long-value-1', IgnoreCase: false },
    ]);
  });

  it('marks a UUID field value to match without case', () => {
    const values = EnvSourcedValuesOf({ fields: { ParentID: '@env:PARENT' } }, info, { PARENT: UUID.toLowerCase() });

    expect(values).toEqual([{ VariableName: 'PARENT', Value: UUID.toLowerCase(), IgnoreCase: true }]);
  });

  it('marks an upper-case UUID value to match without case, and not a longer value that contains a UUID', () => {
    const values = EnvSourcedValuesOf(
      { fields: { ParentID: '@env:UPPER', Before: '@env:ENDS_WITH', After: '@env:STARTS_WITH' } },
      info,
      { UPPER: UUID, ENDS_WITH: `id-${UUID}`, STARTS_WITH: `${UUID}-end` }
    );

    expect(values).toEqual([
      { VariableName: 'UPPER', Value: UUID, IgnoreCase: true },
      { VariableName: 'ENDS_WITH', Value: `id-${UUID}`, IgnoreCase: false },
      { VariableName: 'STARTS_WITH', Value: `${UUID}-end`, IgnoreCase: false },
    ]);
    expect(FindEnvSourcedValue(`/${UUID.toLowerCase()}/`, values)?.VariableName).toBe('UPPER');
  });

  it('gives nothing without an existing record', () => {
    expect(EnvSourcedValuesOf(undefined, info, {})).toEqual([]);
  });
});

describe('FindEnvSourcedValue', () => {
  const values = [
    { VariableName: 'KEY', Value: UUID.toLowerCase(), IgnoreCase: true },
    { VariableName: 'LONG', Value: 'long-value-1', IgnoreCase: false },
  ];

  it('finds a UUID without regard to case, and other values with case', () => {
    expect(FindEnvSourcedValue(`/${UUID}/`, values)?.VariableName).toBe('KEY');
    expect(FindEnvSourcedValue('x long-value-1 y', values)?.VariableName).toBe('LONG');
    expect(FindEnvSourcedValue('LONG-VALUE-1', values)).toBeUndefined();
    expect(FindEnvSourcedValue(null, values)).toBeUndefined();
  });

  it('looks inside an object value', () => {
    expect(FindEnvSourcedValue({ path: ['long-value-1'] }, values)?.VariableName).toBe('LONG');
  });
});
