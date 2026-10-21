import { describe, it, expect } from 'vitest';
import { ScanSQLForScreening, SQLScreeningDialect, SQLScreeningTokenKind } from '../SQLScreeningScanner';

/** Each token's kind and text. */
function tokensOf(sql: string, dialect: SQLScreeningDialect): Array<[SQLScreeningTokenKind, string]> {
  return ScanSQLForScreening(sql, dialect).Tokens.map(t => [t.Kind, t.Text]);
}

describe('ScanSQLForScreening tokens', () => {
  it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('splits words, numbers, strings and symbols (%s)', dialect => {
    expect(tokensOf("e.Salary > 10 AND Name = N'x'", dialect)).toEqual([
      ['word', 'e'], ['symbol', '.'], ['word', 'Salary'], ['symbol', '>'], ['number', '10'],
      ['word', 'AND'], ['word', 'Name'], ['symbol', '='], ['string', "N'x'"],
    ]);
  });

  it('reads a bracket identifier as its bare name, with doubled brackets undone', () => {
    expect(tokensOf('[Base Salary] = [a]]b]', 'sqlserver')).toEqual([
      ['identifier', 'Base Salary'], ['symbol', '='], ['identifier', 'a]b'],
    ]);
  });

  it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('reads a double-quoted identifier as its bare name (%s)', dialect => {
    expect(tokensOf('"Sal""ary" IS NULL', dialect)).toEqual([
      ['identifier', 'Sal"ary'], ['word', 'IS'], ['word', 'NULL'],
    ]);
  });

  it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('reports no token for comments or whitespace (%s)', dialect => {
    expect(tokensOf("a /* Salary */ = -- Salary\n 'Salary'", dialect)).toEqual([
      ['word', 'a'], ['symbol', '='], ['string', "'Salary'"],
    ]);
  });

  it('splits a number from a word written against it, as the database does', () => {
    expect(tokensOf('1Salary', 'sqlserver')).toEqual([['number', '1'], ['word', 'Salary']]);
  });

  it('keeps the offsets of each token', () => {
    const scan = ScanSQLForScreening('x = [y]', 'sqlserver');
    expect(scan.Tokens.map(t => [t.Start, t.End])).toEqual([[0, 1], [2, 3], [4, 7]]);
  });
});
