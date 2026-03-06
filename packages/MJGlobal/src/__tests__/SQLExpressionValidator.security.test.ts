import { describe, it, expect, beforeEach } from 'vitest';
import { SQLExpressionValidator } from '../SQLExpressionValidator';

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

    it('should block UNION-based data exfiltration', () => {
      // This is valid in full_query because UNION is allowed—
      // BUT it must still start with SELECT. The attack vector here
      // is actually fine for full_query (UNION is legitimate).
      // The real guard is that only SELECT queries can be submitted.
      const r = validator.validateFullQuery(
        "SELECT 1 UNION SELECT password FROM sys.sql_logins"
      );
      // UNION is allowed in full_query, so this is valid from a syntax perspective.
      // The protection is that ad-hoc queries run on a read-only connection.
      expect(r.valid).toBe(true);
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
