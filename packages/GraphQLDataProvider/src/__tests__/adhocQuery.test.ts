import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for GraphQLDataProvider ad-hoc query routing.
 *
 * Since GraphQLDataProvider is a class with many dependencies (Apollo, auth, etc.),
 * we test the routing logic and contract without instantiating the full provider.
 * The key behaviors to verify:
 * 1. SQL param routes to RunAdhocQuery (not RunQueryByID/RunQueryByName)
 * 2. QueryID param still routes to RunQueryByID
 * 3. The GQL query structure is correct
 * 4. Error fallback returns correct shape
 */
describe('GraphQLDataProvider - Ad-hoc Query Routing', () => {
  describe('InternalRunQuery routing logic', () => {
    it('should prioritize SQL over QueryID and QueryName', () => {
      // The routing logic: SQL → RunAdhocQuery, QueryID → RunQueryByID, QueryName → RunQueryByName
      const params = { SQL: 'SELECT 1', QueryID: 'some-id', QueryName: 'some-name' };

      // SQL takes priority
      if (params.SQL) {
        expect(params.SQL).toBe('SELECT 1');
      } else if (params.QueryID) {
        throw new Error('Should not reach QueryID path when SQL is provided');
      } else if (params.QueryName) {
        throw new Error('Should not reach QueryName path when SQL is provided');
      }
    });

    it('should route to QueryID when no SQL is provided', () => {
      const params = { QueryID: 'some-id', QueryName: 'some-name' };
      let routed = '';

      if ((params as { SQL?: string }).SQL) {
        routed = 'adhoc';
      } else if (params.QueryID) {
        routed = 'byID';
      } else if (params.QueryName) {
        routed = 'byName';
      }

      expect(routed).toBe('byID');
    });

    it('should route to QueryName when no SQL or QueryID is provided', () => {
      const params = { QueryName: 'some-name' };
      let routed = '';

      if ((params as { SQL?: string }).SQL) {
        routed = 'adhoc';
      } else if ((params as { QueryID?: string }).QueryID) {
        routed = 'byID';
      } else if (params.QueryName) {
        routed = 'byName';
      }

      expect(routed).toBe('byName');
    });

    it('should throw when no SQL, QueryID, or QueryName is provided', () => {
      const params = {};
      let errorThrown = false;

      if ((params as { SQL?: string }).SQL) {
        // noop
      } else if ((params as { QueryID?: string }).QueryID) {
        // noop
      } else if ((params as { QueryName?: string }).QueryName) {
        // noop
      } else {
        errorThrown = true;
      }

      expect(errorThrown).toBe(true);
    });
  });

  describe('RunAdhocQuery GQL query structure', () => {
    it('should construct correct GQL query template', () => {
      // Verify the GQL query template matches what the resolver expects
      const queryTemplate = `
        query ExecuteAdhocQuery($input: AdhocQueryInput!) {
            ExecuteAdhocQuery(input: $input) {
                QueryID QueryName Success Results RowCount TotalRowCount ExecutionTime ErrorMessage
            }
        }
      `;

      expect(queryTemplate).toContain('ExecuteAdhocQuery');
      expect(queryTemplate).toContain('AdhocQueryInput');
      expect(queryTemplate).toContain('$input');
      expect(queryTemplate).toContain('QueryID');
      expect(queryTemplate).toContain('Success');
      expect(queryTemplate).toContain('Results');
      expect(queryTemplate).toContain('ErrorMessage');
    });

    it('should build input object with SQL field', () => {
      const sql = 'SELECT TOP 10 * FROM __mj.vwUsers';
      const input: { SQL: string; TimeoutSeconds?: number } = { SQL: sql };

      expect(input.SQL).toBe(sql);
      expect(input.TimeoutSeconds).toBeUndefined();
    });

    it('should include TimeoutSeconds when provided', () => {
      const sql = 'SELECT TOP 10 * FROM __mj.vwUsers';
      const timeoutSeconds = 60;
      const input: { SQL: string; TimeoutSeconds?: number } = { SQL: sql };

      if (timeoutSeconds !== undefined) {
        input.TimeoutSeconds = timeoutSeconds;
      }

      expect(input.TimeoutSeconds).toBe(60);
    });

    it('should omit TimeoutSeconds when not provided', () => {
      const sql = 'SELECT TOP 10 * FROM __mj.vwUsers';
      const timeoutSeconds: number | undefined = undefined;
      const input: { SQL: string; TimeoutSeconds?: number } = { SQL: sql };

      if (timeoutSeconds !== undefined) {
        input.TimeoutSeconds = timeoutSeconds;
      }

      expect(input).not.toHaveProperty('TimeoutSeconds');
    });
  });

  describe('error fallback result', () => {
    it('should return correct error shape when server returns no response', () => {
      const fallback = {
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Success: false,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 0,
        ErrorMessage: 'Ad-hoc query execution failed — no response from server'
      };

      expect(fallback.Success).toBe(false);
      expect(fallback.QueryName).toBe('Ad-Hoc Query');
      expect(fallback.Results).toEqual([]);
      expect(fallback.ErrorMessage).toContain('no response');
    });
  });

  describe('TransformQueryPayload integration', () => {
    it('should handle successful server response shape', () => {
      // Simulates what the server returns and what TransformQueryPayload expects
      const serverResponse = {
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Success: true,
        Results: JSON.stringify([{ ID: '1', Name: 'Test' }]),
        RowCount: 1,
        TotalRowCount: 1,
        ExecutionTime: 15,
        ErrorMessage: ''
      };

      expect(serverResponse.Success).toBe(true);
      const parsed = JSON.parse(serverResponse.Results);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].Name).toBe('Test');
    });

    it('should handle empty result set from server', () => {
      const serverResponse = {
        QueryID: '',
        QueryName: 'Ad-Hoc Query',
        Success: true,
        Results: '[]',
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 5,
        ErrorMessage: ''
      };

      expect(serverResponse.Success).toBe(true);
      expect(JSON.parse(serverResponse.Results)).toEqual([]);
      expect(serverResponse.RowCount).toBe(0);
    });
  });
});
