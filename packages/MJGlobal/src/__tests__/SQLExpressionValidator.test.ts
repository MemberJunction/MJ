import { describe, it, expect, beforeEach } from 'vitest';
import {
  SQLExpressionValidator,
  DANGEROUS_SQL_KEYWORDS,
  FULL_QUERY_ALLOWED_KEYWORDS,
  ALLOWED_SQL_FUNCTIONS,
  SQLValidationContext,
} from '../SQLExpressionValidator';

describe('SQLExpressionValidator', () => {
  let validator: SQLExpressionValidator;

  beforeEach(() => {
    validator = SQLExpressionValidator.Instance;
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = SQLExpressionValidator.Instance;
      const b = SQLExpressionValidator.Instance;
      expect(a).toBe(b);
    });
  });

  // ---------------------------------------------------------------
  // full_query context
  // ---------------------------------------------------------------
  describe('full_query context', () => {
    const ctx = { context: 'full_query' as SQLValidationContext };

    describe('valid queries', () => {
      it('should accept a simple SELECT', () => {
        const r = validator.validate('SELECT TOP 10 * FROM Users', ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept SELECT with JOINs, WHERE, GROUP BY, ORDER BY', () => {
        const sql = `
          SELECT a.Name, COUNT(r.ID) AS TotalRuns
          FROM __mj.vwAIAgents a
          INNER JOIN __mj.vwAIAgentRuns r ON r.AgentID = a.ID
          WHERE r.StartedAt >= DATEADD(DAY, -30, GETDATE())
          GROUP BY a.Name
          ORDER BY TotalRuns DESC
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept WITH (CTE) statement', () => {
        const sql = `
          WITH ActiveAgents AS (
            SELECT AgentID, COUNT(*) AS RunCount
            FROM __mj.vwAIAgentRuns
            GROUP BY AgentID
          )
          SELECT a.Name, aa.RunCount
          FROM __mj.vwAIAgents a
          INNER JOIN ActiveAgents aa ON aa.AgentID = a.ID
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept SELECT with EXISTS subquery', () => {
        const sql = `
          SELECT * FROM __mj.vwUsers u
          WHERE EXISTS (SELECT 1 FROM __mj.vwUserRoles ur WHERE ur.UserID = u.ID)
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept UNION queries', () => {
        const sql = `
          SELECT Name, 'Agent' AS Type FROM __mj.vwAIAgents
          UNION ALL
          SELECT Name, 'Model' AS Type FROM __mj.vwAIModels
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept INTERSECT queries', () => {
        const sql = `
          SELECT UserID FROM __mj.vwUserRoles WHERE RoleID = 'abc'
          INTERSECT
          SELECT UserID FROM __mj.vwUserRoles WHERE RoleID = 'def'
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept EXCEPT queries', () => {
        const sql = `
          SELECT UserID FROM __mj.vwUsers
          EXCEPT
          SELECT UserID FROM __mj.vwUserRoles
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept SQL with single-line comments (stripped, not rejected)', () => {
        const sql = `
          -- ============================================================
          -- Member Event Attendance Summary
          -- ============================================================
          SELECT TOP 100 m.FirstName, m.LastName
          FROM __mj.vwMembers m
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept SQL with block comments', () => {
        const sql = `
          /* Agent performance query */
          SELECT a.Name FROM __mj.vwAIAgents a
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept WHERE x > ANY(...)', () => {
        const sql = `
          SELECT * FROM __mj.vwOrders
          WHERE Total > ANY (SELECT AVG(Total) FROM __mj.vwOrders GROUP BY CustomerID)
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept WHERE x = ALL(...)', () => {
        const sql = `
          SELECT * FROM __mj.vwProducts
          WHERE Price >= ALL (SELECT MIN(Price) FROM __mj.vwProducts GROUP BY CategoryID)
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept IIF function (uses IF keyword internally)', () => {
        const sql = `SELECT IIF(Status = 'Active', 1, 0) AS IsActive FROM __mj.vwUsers`;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept queries with NULLIF, COALESCE, ISNULL', () => {
        const sql = `SELECT COALESCE(FirstName, 'Unknown'), ISNULL(LastName, ''), NULLIF(Status, '') FROM __mj.vwUsers`;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });

      it('should accept CASE WHEN expressions', () => {
        const sql = `
          SELECT Name,
            CASE WHEN Status = 'Active' THEN 'Yes' ELSE 'No' END AS IsActive
          FROM __mj.vwUsers
        `;
        const r = validator.validate(sql, ctx);
        expect(r.valid).toBe(true);
      });
    });

    describe('rejected queries', () => {
      it('should reject INSERT statement', () => {
        const r = validator.validate("INSERT INTO Users (Name) VALUES ('test')", ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('INSERT');
      });

      it('should reject UPDATE statement', () => {
        const r = validator.validate("UPDATE Users SET Name = 'test'", ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('UPDATE');
      });

      it('should reject DELETE statement', () => {
        const r = validator.validate('DELETE FROM Users WHERE ID = 1', ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('DELETE');
      });

      it('should reject DROP TABLE', () => {
        const r = validator.validate('DROP TABLE Users', ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('DROP');
      });

      it('should reject TRUNCATE', () => {
        const r = validator.validate('TRUNCATE TABLE Users', ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('TRUNCATE');
      });

      it('should reject EXEC', () => {
        const r = validator.validate('EXEC sp_help', ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('EXEC');
      });

      it('should reject EXECUTE', () => {
        const r = validator.validate("EXECUTE sp_executesql N'SELECT 1'", ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('EXECUTE');
      });

      it('should reject statements with semicolons', () => {
        const r = validator.validate('SELECT 1; DROP TABLE Users', ctx);
        expect(r.valid).toBe(false);
        // DROP is detected before semicolon in the keyword scan
        expect(r.trigger).toBe('DROP');
      });

      it('should reject query not starting with SELECT or WITH', () => {
        const r = validator.validate('CREATE TABLE Foo (ID INT)', ctx);
        expect(r.valid).toBe(false);
      });

      it('should reject WAITFOR DELAY', () => {
        const r = validator.validate("WAITFOR DELAY '00:00:05'", ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('WAITFOR');
      });

      it('should reject OPENROWSET', () => {
        const r = validator.validate("SELECT * FROM OPENROWSET('SQLNCLI', 'Server=hack;')", ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('OPENROWSET');
      });

      it('should reject GRANT', () => {
        const r = validator.validate('GRANT SELECT ON Users TO public', ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('GRANT');
      });

      it('should reject SHUTDOWN', () => {
        const r = validator.validate('SHUTDOWN', ctx);
        expect(r.valid).toBe(false);
        expect(r.trigger).toBe('SHUTDOWN');
      });
    });
  });

  // ---------------------------------------------------------------
  // validateFullQuery convenience method
  // ---------------------------------------------------------------
  describe('validateFullQuery', () => {
    it('should pass valid SELECT', () => {
      const r = validator.validateFullQuery('SELECT 1 AS One');
      expect(r.valid).toBe(true);
    });

    it('should pass valid CTE', () => {
      const r = validator.validateFullQuery('WITH cte AS (SELECT 1) SELECT * FROM cte');
      expect(r.valid).toBe(true);
    });

    it('should fail on mutation', () => {
      const r = validator.validateFullQuery("DELETE FROM Users");
      expect(r.valid).toBe(false);
    });

    it('should fail on empty string', () => {
      const r = validator.validateFullQuery('');
      expect(r.valid).toBe(false);
    });

    it('should normalize literal \\n sequences and pass SQL with comment header', () => {
      // Agent-generated SQL arrives with literal \n instead of real newlines
      const sql = '-- Header Comment\\nSELECT TOP 10 * FROM Users\\nWHERE Status = \'Active\'';
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should normalize literal \\r\\n sequences', () => {
      const sql = '-- Header\\r\\nSELECT 1 AS One';
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(true);
    });

    it('should still reject dangerous queries after normalization', () => {
      const sql = '-- Innocent header\\nDELETE FROM Users';
      const r = validator.validateFullQuery(sql);
      expect(r.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Existing contexts (where_clause, aggregate, etc.)
  // ---------------------------------------------------------------
  describe('where_clause context', () => {
    it('should accept simple field comparison', () => {
      const r = validator.validate("Status = 'Active'", { context: 'where_clause' });
      expect(r.valid).toBe(true);
    });

    it('should accept LIKE expression', () => {
      const r = validator.validate("Name LIKE '%test%'", { context: 'where_clause' });
      expect(r.valid).toBe(true);
    });

    it('should accept BETWEEN', () => {
      const r = validator.validate("Age BETWEEN 18 AND 65", { context: 'where_clause' });
      expect(r.valid).toBe(true);
    });

    it('should reject SELECT (subquery) by default', () => {
      const r = validator.validate("ID IN (SELECT ID FROM Users)", { context: 'where_clause' });
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('SELECT');
    });

    it('should allow SELECT when allowSubqueries is true', () => {
      const r = validator.validate("ID IN (SELECT ID FROM Users)", { context: 'where_clause', allowSubqueries: true });
      expect(r.valid).toBe(true);
    });

    it('should reject comments', () => {
      const r = validator.validate("Status = 'Active' -- comment", { context: 'where_clause' });
      expect(r.valid).toBe(false);
      expect(r.trigger).toBe('comment');
    });

    it('should reject semicolons', () => {
      const r = validator.validate("1=1; DROP TABLE Users", { context: 'where_clause' });
      expect(r.valid).toBe(false);
      // DROP is detected before semicolon in the keyword scan
      expect(r.trigger).toBe('DROP');
    });
  });

  describe('aggregate context', () => {
    it('should accept COUNT expression', () => {
      const r = validator.validate('COUNT(ID)', { context: 'aggregate' });
      expect(r.valid).toBe(true);
    });

    it('should accept SUM expression', () => {
      const r = validator.validate('SUM(OrderTotal)', { context: 'aggregate' });
      expect(r.valid).toBe(true);
    });

    it('should reject non-aggregate expression', () => {
      const r = validator.validate('FieldName', { context: 'aggregate' });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('aggregate function');
    });

    it('should allow non-aggregate when requireAggregate is false', () => {
      const r = validator.validate('FieldName', { context: 'aggregate', requireAggregate: false });
      expect(r.valid).toBe(true);
    });
  });

  describe('order_by context', () => {
    it('should accept simple field name', () => {
      const r = validator.validate('Name ASC', { context: 'order_by' });
      expect(r.valid).toBe(true);
    });

    it('should accept DESC ordering', () => {
      const r = validator.validate('CreatedAt DESC', { context: 'order_by' });
      expect(r.valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // String literal handling (false positive prevention)
  // ---------------------------------------------------------------
  describe('string literal handling', () => {
    it('should not flag keywords inside string literals', () => {
      const r = validator.validate(
        "SELECT * FROM __mj.vwUsers WHERE Description = 'This will DROP the ball'",
        { context: 'full_query' }
      );
      // The word DROP is inside a string literal, so it should be stripped before checking
      expect(r.valid).toBe(true);
    });

    it('should not flag INSERT inside a string literal', () => {
      const r = validator.validate(
        "SELECT * FROM __mj.vwLogs WHERE Message = 'INSERT completed successfully'",
        { context: 'full_query' }
      );
      expect(r.valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Constants exports
  // ---------------------------------------------------------------
  describe('exported constants', () => {
    it('DANGEROUS_SQL_KEYWORDS should include key mutation keywords', () => {
      expect(DANGEROUS_SQL_KEYWORDS).toContain('INSERT');
      expect(DANGEROUS_SQL_KEYWORDS).toContain('UPDATE');
      expect(DANGEROUS_SQL_KEYWORDS).toContain('DELETE');
      expect(DANGEROUS_SQL_KEYWORDS).toContain('DROP');
      expect(DANGEROUS_SQL_KEYWORDS).toContain('EXEC');
    });

    it('FULL_QUERY_ALLOWED_KEYWORDS should include set operations', () => {
      expect(FULL_QUERY_ALLOWED_KEYWORDS).toContain('UNION');
      expect(FULL_QUERY_ALLOWED_KEYWORDS).toContain('EXISTS');
      expect(FULL_QUERY_ALLOWED_KEYWORDS).toContain('ANY');
      expect(FULL_QUERY_ALLOWED_KEYWORDS).toContain('ALL');
    });

    it('ALLOWED_SQL_FUNCTIONS should include aggregate functions', () => {
      expect(ALLOWED_SQL_FUNCTIONS.aggregates).toContain('COUNT');
      expect(ALLOWED_SQL_FUNCTIONS.aggregates).toContain('SUM');
      expect(ALLOWED_SQL_FUNCTIONS.aggregates).toContain('AVG');
    });
  });
});
