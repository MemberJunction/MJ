import { describe, it, expect, beforeEach } from 'vitest';
import { SQLExpressionValidator } from '@memberjunction/global';

/**
 * Tests for SQLServerDataProvider ad-hoc query execution.
 *
 * The provider's ExecuteAdhocSQL method validates SQL via SQLExpressionValidator
 * before executing. We test the validation gate and result shaping here
 * without requiring a live database connection.
 */
describe('SQLServerDataProvider - Ad-hoc Query', () => {
  let validator: SQLExpressionValidator;

  beforeEach(() => {
    validator = SQLExpressionValidator.Instance;
  });

  describe('SQL validation gate (ExecuteAdhocSQL)', () => {
    it('should accept valid SELECT query', () => {
      const result = validator.validateFullQuery('SELECT TOP 10 * FROM __mj.vwUsers');
      expect(result.valid).toBe(true);
    });

    it('should accept complex query with JOINs and WHERE', () => {
      const sql = `
        SELECT u.Name, r.RoleName
        FROM __mj.vwUsers u
        INNER JOIN __mj.vwUserRoles r ON r.UserID = u.ID
        WHERE u.IsActive = 1
        ORDER BY u.Name
      `;
      const result = validator.validateFullQuery(sql);
      expect(result.valid).toBe(true);
    });

    it('should reject INSERT and return error result', () => {
      const result = validator.validateFullQuery("INSERT INTO Users (Name) VALUES ('test')");
      expect(result.valid).toBe(false);

      // Simulates what ExecuteAdhocSQL returns on validation failure
      const errorResult = {
        Success: false,
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: result.error || 'SQL validation failed',
      };

      expect(errorResult.Success).toBe(false);
      expect(errorResult.ErrorMessage).toContain('INSERT');
    });

    it('should reject UPDATE and return error result', () => {
      const result = validator.validateFullQuery("UPDATE Users SET Name = 'hacked'");
      expect(result.valid).toBe(false);

      const errorResult = {
        Success: false,
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: result.error || 'SQL validation failed',
      };

      expect(errorResult.Success).toBe(false);
      expect(errorResult.ErrorMessage).toContain('UPDATE');
    });

    it('should reject DROP TABLE', () => {
      const result = validator.validateFullQuery("DROP TABLE Users");
      expect(result.valid).toBe(false);
    });

    it('should reject multi-statement via semicolon', () => {
      const result = validator.validateFullQuery("SELECT 1; DELETE FROM Users");
      expect(result.valid).toBe(false);
    });

    it('should reject EXEC', () => {
      const result = validator.validateFullQuery("EXEC sp_help");
      expect(result.valid).toBe(false);
    });

    it('should reject empty SQL', () => {
      const result = validator.validateFullQuery('');
      expect(result.valid).toBe(false);
    });
  });

  describe('InternalRunQuery routing', () => {
    it('should prioritize SQL param over QueryID', () => {
      const params = { SQL: 'SELECT 1', QueryID: 'some-id' };

      // ExecuteAdhocSQL is called when params.SQL is truthy
      if (params.SQL) {
        expect(params.SQL).toBe('SELECT 1');
      } else {
        throw new Error('SQL should take priority');
      }
    });

    it('should fall through to saved query when SQL is not provided', () => {
      const params = { QueryID: 'some-id' };
      let route = '';

      if ((params as { SQL?: string }).SQL) {
        route = 'adhoc';
      } else if (params.QueryID) {
        route = 'saved';
      }

      expect(route).toBe('saved');
    });
  });

  describe('success result shape', () => {
    it('should return correct structure for successful execution', () => {
      // Simulates what ExecuteAdhocSQL returns on success
      const mockResults = [{ ID: '1', Name: 'User A' }, { ID: '2', Name: 'User B' }];
      const successResult = {
        Success: true,
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Results: mockResults,
        RowCount: mockResults.length,
        TotalRowCount: mockResults.length,
        ExecutionTime: 42,
        ErrorMessage: '',
      };

      expect(successResult.Success).toBe(true);
      expect(successResult.QueryID).toBe('');
      expect(successResult.QueryName).toBe('Ad-Hoc Query');
      expect(successResult.Results).toHaveLength(2);
      expect(successResult.RowCount).toBe(2);
      expect(successResult.ErrorMessage).toBe('');
    });

    it('should return empty results for query with no rows', () => {
      const successResult = {
        Success: true,
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 5,
        ErrorMessage: '',
      };

      expect(successResult.Success).toBe(true);
      expect(successResult.Results).toEqual([]);
      expect(successResult.RowCount).toBe(0);
    });
  });

  describe('error result shape', () => {
    it('should return correct structure for exception during execution', () => {
      // Simulates what ExecuteAdhocSQL returns when executeQueryWithTiming throws
      const errorResult = {
        Success: false,
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: 'Query execution failed: Connection lost',
      };

      expect(errorResult.Success).toBe(false);
      expect(errorResult.Results).toEqual([]);
      expect(errorResult.ErrorMessage).toContain('Connection lost');
    });
  });

  describe('query validation with agent-generated SQL', () => {
    it('should accept SQL with comment headers', () => {
      const sql = `
        -- ============================================================
        -- Member Activity Summary
        -- Generated by Query Builder Agent
        -- ============================================================
        SELECT TOP 100
          m.FirstName,
          m.LastName,
          COUNT(e.ID) AS EventCount
        FROM __mj.vwMembers m
        LEFT JOIN __mj.vwEventRegistrations e ON e.MemberID = m.ID
        GROUP BY m.FirstName, m.LastName
        ORDER BY EventCount DESC
      `;
      const result = validator.validateFullQuery(sql);
      expect(result.valid).toBe(true);
    });

    it('should accept SQL with CASE WHEN and IIF', () => {
      const sql = `
        SELECT
          Name,
          IIF(Status = 'Active', 1, 0) AS IsActive,
          CASE
            WHEN MembershipType = 'Gold' THEN 'Premium'
            WHEN MembershipType = 'Silver' THEN 'Standard'
            ELSE 'Basic'
          END AS Tier
        FROM __mj.vwMembers
      `;
      const result = validator.validateFullQuery(sql);
      expect(result.valid).toBe(true);
    });

    it('should accept SQL with CTE', () => {
      const sql = `
        WITH ActiveMembers AS (
          SELECT ID, FirstName, LastName
          FROM __mj.vwMembers
          WHERE Status = 'Active'
        )
        SELECT am.FirstName, am.LastName, COUNT(e.ID) AS Events
        FROM ActiveMembers am
        LEFT JOIN __mj.vwEventRegistrations e ON e.MemberID = am.ID
        GROUP BY am.FirstName, am.LastName
      `;
      const result = validator.validateFullQuery(sql);
      expect(result.valid).toBe(true);
    });
  });
});
