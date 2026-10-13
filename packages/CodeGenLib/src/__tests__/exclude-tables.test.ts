import { describe, it, expect } from 'vitest';
import { ParseExcludeTableEntry } from '../Database/exclude-tables';

describe('parseExcludeTableEntry', () => {
  it('passes object entries through', () => {
    expect(ParseExcludeTableEntry({ schema: 'aptify', table: 'EntityRecordVersions' })).toEqual({
      schema: 'aptify',
      table: 'EntityRecordVersions',
    });
  });

  it('splits schema.table on the last dot', () => {
    expect(ParseExcludeTableEntry('aptify.EntityRecordVersions')).toEqual({
      schema: 'aptify',
      table: 'EntityRecordVersions',
    });
    expect(ParseExcludeTableEntry('%.%History')).toEqual({
      schema: '%',
      table: '%History',
    });
  });

  it('treats a table-only string as schema-agnostic', () => {
    expect(ParseExcludeTableEntry('%Audit%')).toEqual({
      schema: '%',
      table: '%Audit%',
    });
    expect(ParseExcludeTableEntry('EntityRecordVersions')).toEqual({
      schema: '%',
      table: 'EntityRecordVersions',
    });
  });

  it('rejects an empty string', () => {
    expect(() => ParseExcludeTableEntry('   ')).toThrow(/empty/);
  });

  it('keeps LIKE wildcards on both sides of a dotted pair', () => {
    expect(ParseExcludeTableEntry('aptify.%Log')).toEqual({ schema: 'aptify', table: '%Log' });
    expect(ParseExcludeTableEntry('%.sysdiagrams')).toEqual({ schema: '%', table: 'sysdiagrams' });
  });

  it('does not treat a trailing dot as a split', () => {
    expect(ParseExcludeTableEntry('orphan.')).toEqual({ schema: '%', table: 'orphan.' });
  });
});
