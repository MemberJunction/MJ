import { describe, it, expect, beforeEach } from 'vitest';
import { SQLExpressionValidator, StripSQLStringLiterals } from '../SQLExpressionValidator';

/**
 * Adversarial security tests for SQLExpressionValidator.
 * These tests simulate real-world SQL injection attempts that an attacker
 * (or a misguided LLM) might produce.
 */
describe('SQLExpressionValidator - Security', () => {
  let validator: SQLExpressionValidator;

  beforeEach(() => {
    validator = SQLExpressionValidator.Instance;
  });

  // ---------------------------------------------------------------
  // Classic SQL injection patterns (full_query context)
  // ---------------------------------------------------------------
  describe('SQL injection attempts (full_query)', () => {
    const ctx = { context: 'full_query' as const };

    it('should block tautology + stacked DROP', () => {
      const r = validator.validateFullQuery("SELECT * FROM Users WHERE 1=1; DROP TABLE Users");
      expect(r.valid).toBe(false);
      // DROP is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('DROP');
    });

    it('should block UNION-based data exfiltration from system catalogs', () => {
      // UNION itself is legitimate in full_query, but reading SQL Server system catalogs
      // (sys.sql_logins holds login password hashes) sits entirely outside MJ's
      // entity-permission model. The system-object denylist rejects it regardless of the
      // read-only connection, so a validated ad-hoc SELECT can't be used to exfiltrate credentials.
      const r = validator.validateFullQuery(
        "SELECT 1 UNION SELECT password FROM sys.sql_logins"
      );
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('system-object');
    });

    it('should still allow a legitimate UNION over application views', () => {
      // Regression guard: the system-catalog denylist must NOT block ordinary UNION queries
      // over application entity views — only true system/metadata objects are rejected.
      const r = validator.validateFullQuery(
        "SELECT ID FROM vwCustomers UNION SELECT ID FROM vwProspects"
      );
      expect(r.valid).toBe(true);
    });

    it('should block INFORMATION_SCHEMA enumeration', () => {
      const r = validator.validateFullQuery(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES"
      );
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('system-object');
    });

    it('should block stacked DELETE after SELECT', () => {
      const r = validator.validateFullQuery("SELECT 1; DELETE FROM Users");
      expect(r.valid).toBe(false);
      // DELETE is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('DELETE');
    });

    it('should block INSERT disguised after comment', () => {
      const r = validator.validateFullQuery(
        "SELECT 1 -- \nINSERT INTO Users (Name) VALUES ('hacked')"
      );
      // After stripping comments, "INSERT INTO Users..." is detected
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('INSERT');
    });

    it('should block EXEC sp_executesql', () => {
      const r = validator.validateFullQuery("EXEC sp_executesql N'SELECT 1'");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('EXEC');
    });

    it('should block EXECUTE xp_cmdshell', () => {
      const r = validator.validateFullQuery("EXECUTE xp_cmdshell 'dir'");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('EXECUTE');
    });

    it('should block WAITFOR DELAY (time-based blind injection)', () => {
      const r = validator.validateFullQuery("SELECT 1 WHERE 1=1 WAITFOR DELAY '00:00:10'");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('WAITFOR');
    });

    it('should block xp_cmdshell via keyword detection', () => {
      const r = validator.validateFullQuery("SELECT 1; EXEC xp_cmdshell 'whoami'");
      expect(r.valid).toBe(false);
      // EXEC is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('EXEC');
    });

    it('should block OPENROWSET file access', () => {
      const r = validator.validateFullQuery(
        "SELECT * FROM OPENROWSET('SQLNCLI', 'Server=evil;', 'SELECT 1')"
      );
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('OPENROWSET');
    });

    it('should block OPENDATASOURCE', () => {
      const r = validator.validateFullQuery(
        "SELECT * FROM OPENDATASOURCE('SQLNCLI', 'Data Source=evil;').db.dbo.Users"
      );
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('OPENDATASOURCE');
    });

    it('should block BULK INSERT', () => {
      const r = validator.validateFullQuery("BULK INSERT Users FROM '\\\\evil\\share\\data.csv'");
      expect(r.valid).toBe(false);
      // INSERT comes before BULK in the keyword scan order
      expect(r.trigger).toBe('INSERT');
    });

    it('should block CREATE TABLE', () => {
      const r = validator.validateFullQuery("CREATE TABLE Evil (ID INT)");
      expect(r.valid).toBe(false);
    });

    it('should block ALTER TABLE', () => {
      const r = validator.validateFullQuery("ALTER TABLE Users ADD HackedColumn NVARCHAR(100)");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('ALTER');
    });

    it('should block GRANT privilege escalation', () => {
      const r = validator.validateFullQuery("GRANT CONTROL ON DATABASE::mydb TO public");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('GRANT');
    });

    it('should block REVOKE', () => {
      const r = validator.validateFullQuery("REVOKE SELECT ON Users FROM someuser");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('REVOKE');
    });

    it('should block DENY', () => {
      const r = validator.validateFullQuery("DENY SELECT ON Users TO someuser");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('DENY');
    });

    it('should block SHUTDOWN', () => {
      const r = validator.validateFullQuery("SHUTDOWN WITH NOWAIT");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('SHUTDOWN');
    });

    it('should block RECONFIGURE', () => {
      const r = validator.validateFullQuery("RECONFIGURE WITH OVERRIDE");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('RECONFIGURE');
    });

    it('should block statement not starting with SELECT/WITH', () => {
      const r = validator.validateFullQuery("UPDATE Users SET IsAdmin = 1");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('UPDATE');
    });

    it('should block MERGE statement', () => {
      const r = validator.validateFullQuery(
        "MERGE INTO Users AS t USING (SELECT 1 AS ID) AS s ON t.ID = s.ID WHEN MATCHED THEN DELETE"
      );
      expect(r.valid).toBe(false);
      // DELETE comes before MERGE in the keyword scan order
      expect(r.trigger).toBe('DELETE');
    });

    it('should block TRUNCATE TABLE', () => {
      const r = validator.validateFullQuery("TRUNCATE TABLE Users");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('TRUNCATE');
    });
  });

  // ---------------------------------------------------------------
  // Obfuscation and bypass attempts
  // ---------------------------------------------------------------
  describe('obfuscation and bypass attempts', () => {
    it('should block keyword in mixed case (DrOp)', () => {
      const r = validator.validateFullQuery("DrOp TaBlE Users");
      expect(r.valid).toBe(false);
    });

    it('should block with extra whitespace around dangerous keyword', () => {
      const r = validator.validateFullQuery("  DELETE   FROM   Users  ");
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('DELETE');
    });

    it('should block multi-statement via semicolon with whitespace', () => {
      const r = validator.validateFullQuery("SELECT 1 ;  DROP TABLE Users");
      expect(r.valid).toBe(false);
      // DROP is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('DROP');
    });

    it('should block newline-separated stacked statements', () => {
      const r = validator.validateFullQuery("SELECT 1;\nDROP TABLE Users");
      expect(r.valid).toBe(false);
      // DROP is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('DROP');
    });

    it('should not be fooled by tab characters in keywords', () => {
      const r = validator.validateFullQuery("SELECT 1;\tDELETE FROM Users");
      expect(r.valid).toBe(false);
      // DELETE is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('DELETE');
    });
  });

  // ---------------------------------------------------------------
  // String literal false-positive prevention
  // ---------------------------------------------------------------
  describe('string literal false-positive prevention', () => {
    it('should allow DROP inside a string literal', () => {
      const r = validator.validateFullQuery(
        "SELECT * FROM __mj.vwLogs WHERE Message = 'We need to DROP the old approach'"
      );
      expect(r.valid).toBe(true);
    });

    it('should allow INSERT inside a string literal', () => {
      const r = validator.validateFullQuery(
        "SELECT * FROM __mj.vwAuditLog WHERE Action = 'INSERT completed'"
      );
      expect(r.valid).toBe(true);
    });

    it('should allow DELETE inside a string literal', () => {
      const r = validator.validateFullQuery(
        "SELECT * FROM __mj.vwUsers WHERE Bio LIKE '%DELETE old records%'"
      );
      expect(r.valid).toBe(true);
    });

    it('should allow EXEC inside a string literal', () => {
      const r = validator.validateFullQuery(
        "SELECT * FROM __mj.vwJobs WHERE Description = 'EXEC the plan'"
      );
      expect(r.valid).toBe(true);
    });

    it('should still block REAL DROP outside string context', () => {
      const r = validator.validateFullQuery(
        "SELECT 'safe text' FROM Users; DROP TABLE Users"
      );
      expect(r.valid).toBe(false);
      // DROP is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('DROP');
    });
  });

  // ---------------------------------------------------------------
  // Literal-stripper / parser agreement
  // ---------------------------------------------------------------
  /**
   * 🚨 The stripper runs BEFORE every other check (keyword denylist, function allowlist,
   * system-object denylist), so anything it wrongly treats as "inside a literal" is invisible to
   * all of them — while the database, which does not agree, still executes it.
   *
   * SQL Server and PostgreSQL (standard_conforming_strings=on) do NOT treat `\` as an escape
   * character. A stripper that honors `\'` swallows an entire stacked statement as one "literal".
   * These tests pin that behavior; see StripSQLStringLiterals.
   */
  describe('literal stripper must match database parsing (backslash is NOT an escape)', () => {
    it('strips a doubled-quote literal exactly, leaving injected code visible', () => {
      // The literal becomes one space, which keeps the token boundary the database sees.
      expect(StripSQLStringLiterals(`Name = 'O''Brien'`)).toBe('Name =  ');
      expect(StripSQLStringLiterals(`x = 'a\\') ; DROP TABLE Users; --'`)).toContain('DROP TABLE Users');
    });

    it('leaves an UNTERMINATED literal in place rather than swallowing the rest', () => {
      expect(StripSQLStringLiterals(`Name = 'abc; DROP TABLE t`)).toContain('DROP TABLE t');
    });

    it('does not over-strip across a double-quoted identifier', () => {
      // The match must end at the closing quote of "Name", NOT run to the final quote.
      expect(StripSQLStringLiterals(`"Name") ; DROP TABLE Users; --"`)).toContain('DROP TABLE Users');
    });

    it('blocks a backslash-hidden DROP in an aggregate expression', () => {
      const r = validator.validate(`SUM(A)+'\\'; DROP TABLE Users; --'`, {
        context: 'aggregate',
        entityFields: ['A'],
      });
      expect(r.valid).toBe(false);
    });

    it('blocks a backslash-hidden DROP with no trailing comment', () => {
      const r = validator.validate(`SUM(A)+'\\'; DROP TABLE Users; SELECT 1+'`, {
        context: 'aggregate',
        entityFields: ['A'],
      });
      expect(r.valid).toBe(false);
      // The literal closes at the second quote, so the trailing quote never closes and the text
      // is rejected before any keyword check.
      expect(r.trigger).toBe('unclassified');
    });

    it('blocks a backslash-hidden WAITFOR in an aggregate expression', () => {
      const r = validator.validate(`SUM(A)+'\\'; WAITFOR DELAY '0:0:5'; SELECT 1+'`, {
        context: 'aggregate',
        entityFields: ['A'],
      });
      expect(r.valid).toBe(false);
    });

    it('blocks a backslash-hidden stacked statement in a full query', () => {
      const r = validator.validateFullQuery(`SELECT 'a'+'\\'; DROP TABLE Users; --' FROM T`);
      expect(r.valid).toBe(false);
    });

    it('blocks backslash-hidden system-catalog exfiltration in a full query', () => {
      // Read-only connections still make this a credential-disclosure primitive, which is
      // exactly what the system-object denylist exists to stop.
      const r = validator.validateFullQuery(
        `SELECT 'a'+'\\'; SELECT name, password_hash FROM sys.sql_logins; --' FROM T`
      );
      expect(r.valid).toBe(false);
    });

    it('still allows legitimate literals containing backslashes', () => {
      const r = validator.validateFullQuery(`SELECT * FROM __mj.vwFiles WHERE Path = 'C:\\temp\\'`);
      expect(r.valid).toBe(true);
    });
  });

  /**
   * 🚨 A quote is only a literal delimiter where the database says it is. Inside a T-SQL `[…]`
   * identifier, a comment, or a PostgreSQL `$$…$$` string it is plain text; inside a PostgreSQL
   * `E'…'` string a backslash escapes it. A stripper that misses any of these opens a literal the
   * database never sees and hides the statement behind it. The payloads below run a harmless
   * second statement (`SELECT 1`) on the database they target.
   */
  describe('literal stripper must agree with the database on identifiers, dialect strings and comments', () => {
    const BRACKET_HIDDEN_STATEMENT = "Name = [a'] ; SELECT 1 ; SELECT [b']";

    it('rejects a stacked statement hidden behind a bracket identifier containing a quote (where_clause)', () => {
      const r = validator.validate(BRACKET_HIDDEN_STATEMENT, { context: 'where_clause' });
      expect(r.valid).toBe(false);
    });

    it('rejects a stacked statement hidden behind bracket identifiers in an aggregate', () => {
      const r = validator.validate("COUNT(*) AS [a'] ; SELECT 1 ; SELECT COUNT(*) AS [b'], COUNT(*)", {
        context: 'aggregate',
      });
      expect(r.valid).toBe(false);
    });

    it('rejects a stacked statement hidden behind bracket identifiers in a full query', () => {
      const r = validator.ValidateFullQuery("SELECT [a'] FROM T ; SELECT 1 ; SELECT [b'] FROM T");
      expect(r.valid).toBe(false);
    });

    it('rejects a stacked statement hidden behind a PostgreSQL E-string escaped quote', () => {
      const r = validator.validate("Name = E'\\'' ; SELECT 1 ; --'", { context: 'where_clause' });
      expect(r.valid).toBe(false);
    });

    it('rejects a stacked statement hidden behind a PostgreSQL dollar-quoted string', () => {
      const r = validator.validate("Name = $$'$$ ; SELECT 1 ; --'", { context: 'where_clause' });
      expect(r.valid).toBe(false);
    });

    it('rejects a stacked statement hidden behind an E string written against an operator (PostgreSQL full query)', () => {
      // `@@` is an operator, so PostgreSQL reads E'\'' as a one-character literal and runs SELECT 2.
      const r = validator.ValidateFullQuery("SELECT 'a' @@E'\\'' ; SELECT 2 ; --'", 'postgresql');
      expect(r.valid).toBe(false);
    });

    it('rejects a stacked statement hidden behind an apostrophe in a line comment (full query)', () => {
      const r = validator.ValidateFullQuery("SELECT 1 -- it's\n; SELECT 2 --'");
      expect(r.valid).toBe(false);
    });

    it('rejects a stacked statement hidden behind an apostrophe in a block comment (full query)', () => {
      const r = validator.ValidateFullQuery("SELECT 1 /* it's */ ; SELECT 2 ; /* ' */");
      expect(r.valid).toBe(false);
    });

    it('keeps a keyword that directly follows a literal visible', () => {
      // SQL Server ends N'x' at the quote, so SELECT starts a new statement.
      const r = validator.validate("Name = N'x'SELECT 1", { context: 'where_clause' });
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('SELECT');
    });

    it('StripSQLStringLiterals leaves the statement behind a bracket identifier visible', () => {
      expect(StripSQLStringLiterals(BRACKET_HIDDEN_STATEMENT)).toContain('SELECT 1');
    });

    it('keeps a keyword that directly follows a number visible', () => {
      const r = validator.validate('ID = 1SELECT 1', { context: 'where_clause' });
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('SELECT');
    });
  });

  describe('dialect-aware reading', () => {
    const POSSESSIVE_ALIAS = "SELECT COUNT(*) AS [Today's Count] FROM __mj.vwUsers WHERE Status = 'Active'";

    it('accepts a bracket identifier that contains a quote when the dialect is SQL Server', () => {
      expect(validator.ValidateFullQuery(POSSESSIVE_ALIAS, 'sqlserver').valid).toBe(true);
    });

    it('rejects it when the dialect is unknown, because PostgreSQL reads the quote as a literal', () => {
      const r = validator.ValidateFullQuery(POSSESSIVE_ALIAS);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('unclassified');
    });

    it('accepts E strings and dollar-quoted strings when the dialect is PostgreSQL', () => {
      const ctx = { context: 'where_clause' as const, Dialect: 'postgresql' as const };
      expect(validator.validate("Name = E'it\\'s'", ctx).valid).toBe(true);
      expect(validator.validate("Name = $$it's$$", ctx).valid).toBe(true);
    });

    it('does not read keywords inside quoted identifiers', () => {
      expect(validator.validate('[Delete Flag] = 1', { context: 'where_clause', Dialect: 'sqlserver' }).valid).toBe(true);
      expect(validator.validate('"Update" = 1', { context: 'where_clause' }).valid).toBe(true);
    });

    it('accepts an apostrophe in the header comment of a full query', () => {
      const r = validator.ValidateFullQuery("-- Customer's open orders\nSELECT * FROM __mj.vwOrders WHERE Status = 'Open'");
      expect(r.valid).toBe(true);
    });

    it('accepts a trailing semicolon followed by a comment in a full query', () => {
      expect(validator.ValidateFullQuery('SELECT Name FROM __mj.vwUsers ORDER BY Name; -- by name').valid).toBe(true);
    });

    it.each([
      'SELECT * FROM [INFORMATION_SCHEMA].[TABLES]',
      'SELECT name FROM [sys].[sql_logins]',
      'SELECT * FROM "pg_catalog"."pg_authid"',
    ])('catches a system catalog written with quoted names: %s', sql => {
      const r = validator.ValidateFullQuery(sql);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('system-object');
    });

    it('checks a quoted function name against the allowlist', () => {
      const r = validator.validate('[dbo].[fnSecret](1) = 1', { context: 'where_clause', Dialect: 'sqlserver' });
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('FNSECRET');
    });

    it('StripSQLStringLiterals reads the given dialect, and removes nothing when the dialects disagree', () => {
      expect(StripSQLStringLiterals("x = E'\\'' ; SELECT 1", 'postgresql')).toBe('x =   ; SELECT 1');
      expect(StripSQLStringLiterals("x = E'\\'' ; SELECT 1")).toBe("x = E'\\'' ; SELECT 1");
    });
  });

  // ---------------------------------------------------------------
  // Expression-level injection (where_clause context)
  // ---------------------------------------------------------------
  describe('expression-level injection (where_clause)', () => {
    const ctx = { context: 'where_clause' as const };

    it('should block subquery without allowSubqueries', () => {
      const r = validator.validate(
        "ID IN (SELECT ID FROM Users WHERE IsAdmin = 1)",
        ctx
      );
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('SELECT');
    });

    it('should block UNION injection in WHERE clause', () => {
      const r = validator.validate("1=1 UNION SELECT password FROM sys.sql_logins", ctx);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('UNION');
    });

    it('should block comment injection in WHERE clause', () => {
      const r = validator.validate("Status = 'Active' -- OR 1=1", ctx);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('comment');
    });

    it('should block block comment injection in WHERE clause', () => {
      const r = validator.validate("Status = 'Active' /* OR 1=1 */", ctx);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('comment');
    });

    it('should block semicolon injection in WHERE clause', () => {
      const r = validator.validate("1=1; DROP TABLE Users --", ctx);
      expect(r.valid).toBe(false);
      // Either semicolon or comment should trigger
    });

    it('should block EXEC in WHERE clause', () => {
      const r = validator.validate("1=1 AND EXEC sp_help", ctx);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('EXEC');
    });

    it('should block WAITFOR in WHERE clause', () => {
      const r = validator.validate("1=1 WAITFOR DELAY '00:00:05'", ctx);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('WAITFOR');
    });

    it('should block CREATE in WHERE clause', () => {
      const r = validator.validate("1=1 CREATE TABLE Evil (ID INT)", ctx);
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('CREATE');
    });
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  describe('edge cases', () => {
    it('should reject empty string', () => {
      const r = validator.validateFullQuery('');
      expect(r.valid).toBe(false);
    });

    it('should reject whitespace-only string', () => {
      const r = validator.validateFullQuery('   \n\t  ');
      expect(r.valid).toBe(false);
    });

    it('should handle very long SELECT query', () => {
      // Build a long but valid query
      const conditions = Array.from({ length: 100 }, (_, i) => `Field${i} = ${i}`).join(' AND ');
      const sql = `SELECT * FROM __mj.vwUsers WHERE ${conditions}`;
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should handle deeply nested subqueries', () => {
      const sql = `
        SELECT * FROM __mj.vwUsers
        WHERE ID IN (
          SELECT UserID FROM __mj.vwUserRoles
          WHERE RoleID IN (
            SELECT RoleID FROM __mj.vwRoles
            WHERE Name IN (
              SELECT RoleName FROM __mj.vwDefaultRoles
            )
          )
        )
      `;
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should handle query with only comments (no actual SQL)', () => {
      const sql = `
        -- This is just a comment
        /* Another comment */
      `;
      const r = validator.validateFullQuery(sql);
      // After stripping comments, there's no SELECT/WITH
      expect(r.valid).toBe(false);
    });

    it('should handle query with unicode characters in string literals', () => {
      const sql = "SELECT * FROM __mj.vwUsers WHERE Name = N'Ünïcödé Tëst'";
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should handle query with escaped single quotes', () => {
      const sql = "SELECT * FROM __mj.vwUsers WHERE Name = 'O''Brien'";
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should handle query with numeric literals', () => {
      const sql = "SELECT * FROM __mj.vwOrders WHERE Total > 1000.50 AND Quantity < 100";
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should handle query with multiple CTEs', () => {
      const sql = `
        WITH CTE1 AS (SELECT ID FROM __mj.vwUsers),
             CTE2 AS (SELECT UserID FROM __mj.vwUserRoles)
        SELECT * FROM CTE1 INNER JOIN CTE2 ON CTE1.ID = CTE2.UserID
      `;
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should handle CROSS APPLY and OUTER APPLY', () => {
      const sql = `
        SELECT u.Name, r.RoleName
        FROM __mj.vwUsers u
        CROSS APPLY (SELECT TOP 1 RoleName FROM __mj.vwUserRoles WHERE UserID = u.ID) r
      `;
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should handle window functions', () => {
      const sql = `
        SELECT Name,
          ROW_NUMBER() OVER (PARTITION BY Department ORDER BY HireDate) AS RowNum,
          RANK() OVER (ORDER BY Salary DESC) AS SalaryRank
        FROM __mj.vwEmployees
      `;
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });
  });
});
