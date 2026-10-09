import { describe, it, expect } from 'vitest';
import { ScanSQLForScreening, SQLScreeningDialect, SQLScreeningSpanKind } from '../SQLScreeningScanner';

/** The text of each span the scan found, with its kind. */
function spansOf(sql: string, dialect: SQLScreeningDialect): Array<[SQLScreeningSpanKind, string]> {
  return ScanSQLForScreening(sql, dialect).Spans.map(s => [s.Kind, sql.slice(s.Start, s.End)]);
}

describe('ScanSQLForScreening', () => {
  describe('string literals (both dialects)', () => {
    it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('reads doubled quotes as escaped quotes (%s)', dialect => {
      expect(spansOf("Name = 'O''Brien' AND 1 = 1", dialect)).toEqual([['string', "'O''Brien'"]]);
    });

    it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('treats a backslash as an ordinary character (%s)', dialect => {
      const scan = ScanSQLForScreening("x = 'a\\' ; SELECT 1", dialect);
      expect(scan.Classified).toBe(true);
      expect(scan.Code).toBe('x =   ; SELECT 1');
    });

    it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('includes the N prefix in the literal (%s)', dialect => {
      expect(spansOf("Name = N'x'", dialect)).toEqual([['string', "N'x'"]]);
    });
  });

  describe('quoted identifiers', () => {
    it('reads a SQL Server bracket identifier, with ]] as an escaped bracket, so a quote inside opens no literal', () => {
      const sql = "[a']]b'] = 1 ; SELECT 1";
      expect(spansOf(sql, 'sqlserver')).toEqual([['identifier', "[a']]b']"]]);
      expect(ScanSQLForScreening(sql, 'sqlserver').Code).toBe('  = 1 ; SELECT 1');
    });

    it('treats a bracket as code on PostgreSQL, where a quote inside it opens a literal', () => {
      expect(spansOf("x[1] = 'a'", 'postgresql')).toEqual([['string', "'a'"]]);
      expect(spansOf("[a'] = 1 ; SELECT 1 ; SELECT [b']", 'postgresql')).toEqual([
        ['string', "'] = 1 ; SELECT 1 ; SELECT [b'"],
      ]);
    });

    it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('reads a double-quoted identifier with "" escapes (%s)', dialect => {
      expect(spansOf('"a""b\'c" = 1', dialect)).toEqual([['identifier', '"a""b\'c"']]);
    });

    it('writes quoted identifiers as bare names in CodeWithIdentifiers', () => {
      const scan = ScanSQLForScreening('SELECT * FROM [sys].[sql_logins] WHERE [a]]b] = 1', 'sqlserver');
      expect(scan.Code).toBe('SELECT * FROM  .  WHERE   = 1');
      expect(scan.CodeWithIdentifiers).toBe('SELECT * FROM  sys . sql_logins  WHERE  a]b  = 1');
    });
  });

  describe('PostgreSQL strings', () => {
    it('reads a backslash-escaped quote inside an E string', () => {
      const sql = "Name = E'\\'' ; SELECT 1";
      expect(spansOf(sql, 'postgresql')).toEqual([['string', "E'\\''"]]);
      expect(ScanSQLForScreening(sql, 'postgresql').Code).toBe('Name =   ; SELECT 1');
    });

    it('reads E as an ordinary word on SQL Server', () => {
      expect(spansOf("Name = E'\\'' ; SELECT 1 ; '", 'sqlserver')).toEqual([['string', "'\\'' ; SELECT 1 ; '"]]);
    });

    it('opens an E string only at the start of a token', () => {
      // `x1e` and `name` are identifiers, so the quote after them opens a plain literal.
      expect(spansOf("x1e'\\'", 'postgresql')).toEqual([['string', "'\\'"]]);
      expect(spansOf("name'\\' ; SELECT 1", 'postgresql')).toEqual([['string', "'\\'"]]);
      // Operator characters do not extend a word, so `@@E'…'` is an operator and an E string.
      expect(spansOf("'a' @@E'\\'' ; SELECT 1", 'postgresql')).toEqual([
        ['string', "'a'"],
        ['string', "E'\\''"],
      ]);
      // An exponent needs digits, so in `1e'…'` the `e` opens an E string.
      expect(spansOf("1e'\\''", 'postgresql')).toEqual([['string', "e'\\''"]]);
    });

    it('reads dollar-quoted strings, with or without a tag', () => {
      expect(spansOf("x = $$it's$$ AND y = $fn$a$$b$fn$", 'postgresql')).toEqual([
        ['string', "$$it's$$"],
        ['string', '$fn$a$$b$fn$'],
      ]);
    });

    it('does not open a dollar quote inside a word or at a positional parameter', () => {
      expect(spansOf('a$$b$$ = $1', 'postgresql')).toEqual([]);
    });

    it('treats $ as code on SQL Server', () => {
      expect(spansOf("x = $$'$$ ; SELECT 1 ; '", 'sqlserver')).toEqual([['string', "'$$ ; SELECT 1 ; '"]]);
    });
  });

  describe('comments', () => {
    it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('reads a quote inside a comment as comment text (%s)', dialect => {
      const scan = ScanSQLForScreening("SELECT 1 -- it's\n; SELECT 2 /* it's */", dialect);
      expect(scan.Classified).toBe(true);
      expect(scan.CommentCount).toBe(2);
      expect(scan.Code).toBe('SELECT 1  \n; SELECT 2  ');
    });

    it('reads nested block comments', () => {
      expect(spansOf('/* a /* b */ c */ SELECT 1', 'sqlserver')).toEqual([['comment', '/* a /* b */ c */']]);
    });

    it('ends a line comment at \\r\\n and at the end of the input', () => {
      const scan = ScanSQLForScreening('SELECT 1 -- a\r\nFROM T -- b', 'sqlserver');
      expect(scan.Classified).toBe(true);
      expect(scan.Code).toBe('SELECT 1  \r\nFROM T  ');
    });
  });

  describe('leading word', () => {
    it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('skips whitespace and comments (%s)', dialect => {
      expect(ScanSQLForScreening('  -- c\n /* b */ select 1', dialect).LeadingWord).toBe('select');
      expect(ScanSQLForScreening('WithdrawFunds 1', dialect).LeadingWord).toBe('WithdrawFunds');
    });

    it.each<[string, string, SQLScreeningDialect]>([
      ['a bracket identifier', '[sp_who] SELECT 1', 'sqlserver'],
      ['a double-quoted identifier', '"sp_who" SELECT 1', 'postgresql'],
      ['a literal', "N'x' SELECT 1", 'sqlserver'],
      ['a number', '1 SELECT 1', 'postgresql'],
      ['a symbol', '(SELECT 1)', 'sqlserver'],
      ['a Unicode space', ' SELECT 1', 'sqlserver'],
      ['a word followed by a non-ASCII character', 'SELECT€1', 'sqlserver'],
      ['nothing but a comment', '-- only a comment', 'postgresql'],
    ])('is null when %s comes first', (_label, sql, dialect) => {
      expect(ScanSQLForScreening(sql, dialect).LeadingWord).toBeNull();
    });
  });

  describe('SQL Server words', () => {
    it('reads letters of any script as part of a word', () => {
      const scan = ScanSQLForScreening('Café = 1', 'sqlserver');
      expect(scan.LeadingWord).toBe('Café');
      expect(scan.Code).toBe('Café = 1');
    });

    it('reads a currency symbol as code, so the keyword after a money literal is a separate token', () => {
      expect(ScanSQLForScreening('ID = ¥1SELECT 1', 'sqlserver').Code).toBe('ID = ¥1 SELECT 1');
    });

    it('reads non-ASCII characters as part of a word on PostgreSQL', () => {
      expect(ScanSQLForScreening('ID = ¥1SELECT 1', 'postgresql').Code).toBe('ID = ¥1SELECT 1');
    });
  });

  describe('token boundaries', () => {
    it('separates a word written against a literal', () => {
      expect(ScanSQLForScreening("Name = N'x'UNION SELECT 1", 'sqlserver').Code).toBe('Name =  UNION SELECT 1');
    });

    it.each<SQLScreeningDialect>(['sqlserver', 'postgresql'])('separates a word written against a number (%s)', dialect => {
      expect(ScanSQLForScreening('ID = 1UNION SELECT 1', dialect).Code).toBe('ID = 1 UNION SELECT 1');
      expect(ScanSQLForScreening('ID = 0x1FUNION', dialect).Code).toBe('ID = 0x1F UNION');
      expect(ScanSQLForScreening('ID = 1e5', dialect).Code).toBe('ID = 1e5');
    });
  });

  describe('text that cannot be classified', () => {
    it.each<[string, string, SQLScreeningDialect]>([
      ['an unterminated literal', "Name = 'abc", 'sqlserver'],
      ['an unterminated N literal', "Name = N'abc", 'postgresql'],
      ['an unterminated bracket identifier', 'Name = [abc', 'sqlserver'],
      ['an unterminated double-quoted identifier', 'Name = "abc', 'postgresql'],
      ['an unterminated block comment', 'Name = 1 /* a /* b */', 'sqlserver'],
      ['an unterminated E string', "Name = E'abc\\'", 'postgresql'],
      ['an unterminated dollar-quoted string', 'Name = $$abc', 'postgresql'],
      ['a NUL character', 'Name = 1\0', 'sqlserver'],
      ['a lone carriage return in a line comment', "SELECT 1 --a\r'; SELECT 2 --'", 'postgresql'],
      ['a Unicode line separator in a line comment', 'SELECT 1 --a ; SELECT 2', 'sqlserver'],
      ['an E string followed by a continuation segment', "x = E'a'\n'\\'' ; SELECT 1 ; --'", 'postgresql'],
      ['a number followed by E and a word on SQL Server', 'ID = 1EXEC sp_who', 'sqlserver'],
      ['a money literal followed by E and a word on SQL Server', 'ID = £1EXEC sp_who', 'sqlserver'],
    ])('rejects %s', (_label, sql, dialect) => {
      const scan = ScanSQLForScreening(sql, dialect);
      expect(scan.Classified).toBe(false);
      expect(scan.Error).toBeTruthy();
    });

    it('leaves the unread text as written', () => {
      const scan = ScanSQLForScreening("x = 1 ; 'abc", 'sqlserver');
      expect(scan.Code).toBe("x = 1 ; 'abc");
    });

    it('rejects a dialect it does not know instead of guessing', () => {
      const fromConfig: string = 'mysql';
      const scan = ScanSQLForScreening('x = 1', fromConfig as SQLScreeningDialect);
      expect(scan.Classified).toBe(false);
      expect(scan.Code).toBe('x = 1');
    });
  });

  it('is linear-time on long input', () => {
    const sql = `Name = '${'a'.repeat(200000)}`;
    const start = Date.now();
    ScanSQLForScreening(sql, 'sqlserver');
    ScanSQLForScreening(sql, 'postgresql');
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
