import { describe, it, expect } from 'vitest';
import { TruthCsv } from '../csv';

describe('loader CSV handling', () => {
  it('parses an unquoted CSV without a trailing newline (the world files have none)', () => {
    expect(TruthCsv.Parse('ID,Renewed\na,1\nb,')).toEqual({ Header: ['ID', 'Renewed'], Rows: [['a', '1'], ['b', '']] });
  });
  it('refuses quoted fields (the generators never quote; a quote means a file it cannot split safely)', () => {
    expect(() => TruthCsv.Parse('ID,Name\na,"x,y"')).toThrow(/quote/);
  });
  it('accepts a header that is an ordered subset of the table columns and refuses any other', () => {
    expect(() => TruthCsv.AssertHeaderOrder(['ID', 'Renewed'], ['ID', 'Year', 'Renewed', 'TruthScore'])).not.toThrow();
    expect(() => TruthCsv.AssertHeaderOrder(['Renewed', 'ID'], ['ID', 'Year', 'Renewed'])).toThrow(/order/);
    expect(() => TruthCsv.AssertHeaderOrder(['ID', 'TrueP'], ['ID', 'Renewed'])).toThrow(/TrueP/);
  });
  it('coerces cells by SQL type; empty is NULL', () => {
    expect(TruthCsv.CoerceCell('', 'INT')).toBeNull();
    expect(TruthCsv.CoerceCell('42', 'INT')).toBe(42);
    expect(() => TruthCsv.CoerceCell('4.5', 'INT')).toThrow(/not an integer/);
    expect(TruthCsv.CoerceCell('0.0789', 'FLOAT')).toBe(0.0789);
    expect(TruthCsv.CoerceCell('1', 'BIT')).toBe(true);
    expect(TruthCsv.CoerceCell('2026-01-01', 'DATE')).toEqual(new Date(Date.UTC(2026, 0, 1)));
  });
  it('refuses truth files by name, not by directory', () => {
    expect(() => TruthCsv.AssertNotTruthFile('/x/TruthSuite/.data/world/W1-signal/abc/seed-42/truth.csv')).toThrow(/truth file/);
    expect(() => TruthCsv.AssertNotTruthFile('/x/TruthSuite/.data/world/W1-signal/abc/seed-42/rows.csv')).not.toThrow();
  });
});
