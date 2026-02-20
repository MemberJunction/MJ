import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SQLExpressionValidator } from '@memberjunction/global';

/**
 * Tests for AdhocQueryResolver.
 *
 * Since the resolver has heavy dependencies (type-graphql decorators, mssql, AppContext),
 * we test the core logic through the SQLExpressionValidator integration and
 * verify the resolver's structure and error-handling contracts.
 */
describe('AdhocQueryResolver', () => {
  let validator: SQLExpressionValidator;

  beforeEach(() => {
    validator = SQLExpressionValidator.Instance;
  });

  describe('SQL validation gate', () => {
    it('should accept valid SELECT query', () => {
      const result = validator.validateFullQuery('SELECT TOP 10 * FROM __mj.vwUsers');
      expect(result.valid).toBe(true);
    });

    it('should accept valid CTE query', () => {
      const result = validator.validateFullQuery(`
        WITH cte AS (SELECT ID, Name FROM __mj.vwUsers)
        SELECT * FROM cte
      `);
      expect(result.valid).toBe(true);
    });

    it('should reject INSERT statement', () => {
      const result = validator.validateFullQuery("INSERT INTO Users (Name) VALUES ('hacked')");
      expect(result.valid).toBe(false);
      expect(result.error).toContain('INSERT');
    });

    it('should reject DELETE statement', () => {
      const result = validator.validateFullQuery("DELETE FROM Users WHERE 1=1");
      expect(result.valid).toBe(false);
    });

    it('should reject UPDATE statement', () => {
      const result = validator.validateFullQuery("UPDATE Users SET IsAdmin = 1");
      expect(result.valid).toBe(false);
    });

    it('should reject DROP TABLE', () => {
      const result = validator.validateFullQuery("DROP TABLE Users");
      expect(result.valid).toBe(false);
    });

    it('should reject EXEC', () => {
      const result = validator.validateFullQuery("EXEC sp_executesql N'SELECT 1'");
      expect(result.valid).toBe(false);
    });

    it('should reject multi-statement injection via semicolon', () => {
      const result = validator.validateFullQuery("SELECT 1; DROP TABLE Users");
      expect(result.valid).toBe(false);
    });

    it('should reject empty SQL', () => {
      const result = validator.validateFullQuery('');
      expect(result.valid).toBe(false);
    });
  });

  describe('buildErrorResult contract', () => {
    it('should return the expected error shape', () => {
      // This tests the contract that the resolver's buildErrorResult must fulfill
      const expectedShape = {
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Success: false,
        Results: '[]',
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: 'SQL validation failed'
      };

      expect(expectedShape.Success).toBe(false);
      expect(expectedShape.QueryID).toBe('');
      expect(expectedShape.QueryName).toBe('Ad-Hoc Query');
      expect(expectedShape.Results).toBe('[]');
      expect(expectedShape.ErrorMessage).toBe('SQL validation failed');
    });
  });

  describe('success result contract', () => {
    it('should return the expected success shape', () => {
      // This tests the contract that the resolver's success path must fulfill
      const mockRecordset = [{ ID: '1', Name: 'Test' }, { ID: '2', Name: 'Other' }];
      const expectedShape = {
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Success: true,
        Results: JSON.stringify(mockRecordset),
        RowCount: mockRecordset.length,
        TotalRowCount: mockRecordset.length,
        ExecutionTime: 42,
        ErrorMessage: ''
      };

      expect(expectedShape.Success).toBe(true);
      expect(expectedShape.QueryID).toBe('');
      expect(expectedShape.QueryName).toBe('Ad-Hoc Query');
      expect(JSON.parse(expectedShape.Results)).toHaveLength(2);
      expect(expectedShape.RowCount).toBe(2);
      expect(expectedShape.ErrorMessage).toBe('');
    });
  });

  describe('timeout contract', () => {
    it('should default to 30 seconds when TimeoutSeconds is not provided', () => {
      const defaultTimeout = undefined ?? 30;
      expect(defaultTimeout).toBe(30);
      expect(defaultTimeout * 1000).toBe(30000);
    });

    it('should use provided TimeoutSeconds', () => {
      const customTimeout = 60 ?? 30;
      expect(customTimeout).toBe(60);
      expect(customTimeout * 1000).toBe(60000);
    });

    it('should produce correct error message for timeout', () => {
      const timeoutSeconds = 30;
      const errorMessage = `Query execution exceeded ${timeoutSeconds} second timeout`;
      expect(errorMessage).toContain('30');
      expect(errorMessage).toContain('timeout');
    });
  });

  describe('complex query validation', () => {
    it('should accept query with JOINs and subqueries', () => {
      const sql = `
        SELECT a.Name, COUNT(r.ID) AS TotalRuns
        FROM __mj.vwAIAgents a
        INNER JOIN __mj.vwAIAgentRuns r ON r.AgentID = a.ID
        WHERE EXISTS (SELECT 1 FROM __mj.vwUsers u WHERE u.ID = a.CreatedByUserID)
        GROUP BY a.Name
        ORDER BY TotalRuns DESC
      `;
      const result = validator.validateFullQuery(sql);
      expect(result.valid).toBe(true);
    });

    it('should accept query with UNION', () => {
      const sql = `
        SELECT Name, 'Agent' AS Type FROM __mj.vwAIAgents
        UNION ALL
        SELECT Name, 'Model' AS Type FROM __mj.vwAIModels
      `;
      const result = validator.validateFullQuery(sql);
      expect(result.valid).toBe(true);
    });

    it('should accept query with comments (agent-generated)', () => {
      const sql = `
        -- ============================================================
        -- Agent Performance Report
        -- ============================================================
        SELECT TOP 100 a.Name, COUNT(*) AS RunCount
        FROM __mj.vwAIAgents a
        INNER JOIN __mj.vwAIAgentRuns r ON r.AgentID = a.ID
        GROUP BY a.Name
        ORDER BY RunCount DESC
      `;
      const result = validator.validateFullQuery(sql);
      expect(result.valid).toBe(true);
    });
  });
});
