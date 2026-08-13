import { describe, it, expect } from 'vitest';
import { parseExcludeTableEntry } from '../Database/exclude-tables';

describe('parseExcludeTableEntry', () => {
  it('passes object entries through', () => {
    expect(parseExcludeTableEntry({ schema: 'aptify', table: 'EntityRecordVersions' })).toEqual({
      schema: 'aptify',
      table: 'EntityRecordVersions',
    });
  });

  it('splits schema.table on the last dot', () => {
    expect(parseExcludeTableEntry('aptify.EntityRecordVersions')).toEqual({
      schema: 'aptify',
      table: 'EntityRecordVersions',
    });
    expect(parseExcludeTableEntry('%.%History')).toEqual({
      schema: '%',
      table: '%History',
    });
  });

  it('treats a table-only string as any-schema', () => {
    expect(parseExcludeTableEntry('%Audit%')).toEqual({
      schema: '%',
      table: '%Audit%',
    });
    expect(parseExcludeTableEntry('EntityRecordVersions')).toEqual({
      schema: '%',
      table: 'EntityRecordVersions',
    });
  });

  it('rejects an empty string', () => {
    expect(() => parseExcludeTableEntry('   ')).toThrow(/empty/);
  });
});
