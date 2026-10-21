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

describe('ScanSQLForScreening PostgreSQL Unicode-escape identifiers (U&"…")', () => {
  it('reads U&"…" as one identifier and decodes its four- and six-digit escapes', () => {
    expect(tokensOf('U&"\\0053alary" > 1', 'postgresql')).toEqual([['identifier', 'Salary'], ['symbol', '>'], ['number', '1']]);
    expect(tokensOf('U&"S\\+000061lary"', 'postgresql')).toEqual([['identifier', 'Salary']]);
  });

  it('reads the prefix in either case', () => {
    expect(tokensOf('u&"S\\0061lary" > 1', 'postgresql')).toEqual([['identifier', 'Salary'], ['symbol', '>'], ['number', '1']]);
  });

  it('honors a UESCAPE clause, after whitespace or a comment, and consumes it', () => {
    expect(tokensOf("U&\"S!0061lary\" UESCAPE '!' > 1", 'postgresql')).toEqual([['identifier', 'Salary'], ['symbol', '>'], ['number', '1']]);
    expect(tokensOf("U&\"S!0061lary\" /* c */ uescape\n'!'", 'postgresql')).toEqual([['identifier', 'Salary']]);
  });

  it('undoes a doubled escape character and a doubled quote', () => {
    expect(tokensOf('U&"a\\\\b""c"', 'postgresql')).toEqual([['identifier', 'a\\b"c']]);
  });

  it('decodes a surrogate pair written as two escapes', () => {
    expect(tokensOf('U&"\\D83D\\DE00"', 'postgresql')).toEqual([['identifier', '\u{1F600}']]);
  });

  it.each([
    ['a bad escape', 'U&"\\00zz"'],
    ['a short escape', 'U&"\\005"'],
    ['a lone surrogate', 'U&"\\D800x"'],
    ['a NUL escape', 'U&"\\0000"'],
    ['a code point past U+10FFFF', 'U&"\\+110000"'],
    ['a UESCAPE of two characters', "U&\"x\" UESCAPE 'ab'"],
    ['a UESCAPE of a hex digit', "U&\"x\" UESCAPE 'a'"],
    ['a UESCAPE of a quote', "U&\"x\" UESCAPE ''''"],
    ['a UESCAPE with no string', 'U&"x" UESCAPE 1'],
    ['an unclosed identifier', 'U&"Salary'],
  ])('fails closed on %s', (_label, sql) => {
    expect(ScanSQLForScreening(sql, 'postgresql').Classified).toBe(false);
  });

  it('writes the decoded name into CodeWithIdentifiers and spans the whole construct', () => {
    const sql = "U&\"S!0061lary\" UESCAPE '!' = 1";
    const scan = ScanSQLForScreening(sql, 'postgresql');
    expect(scan.Spans).toEqual([{ Kind: 'identifier', Start: 0, End: sql.indexOf(' =') }]);
    expect(scan.CodeWithIdentifiers).toBe(' Salary  = 1');
  });

  it('leaves SQL Server reading U&"x" as a word, a symbol and an identifier', () => {
    expect(tokensOf('U&"x"', 'sqlserver')).toEqual([['word', 'U'], ['symbol', '&'], ['identifier', 'x']]);
  });

  it("reads E'…' as a string, never an identifier", () => {
    expect(tokensOf("E'Salary' = x", 'postgresql')).toEqual([['string', "E'Salary'"], ['symbol', '='], ['word', 'x']]);
  });
});
