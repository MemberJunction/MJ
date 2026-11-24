import { describe, it, expect, vi } from 'vitest';
import { SampleQueryGenerator } from '../generators/SampleQueryGenerator.js';
import { PostgreSQLDriver } from '../drivers/PostgreSQLDriver.js';
import { MySQLDriver } from '../drivers/MySQLDriver.js';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { StateManager } from '../state/StateManager.js';
import type { DatabaseDocumentation, SchemaDefinition, TableDefinition } from '../types/state.js';
import type { SampleQueryGenerationConfig } from '../types/sample-queries.js';

function createMinimalSchema(): SchemaDefinition {
  const table: TableDefinition = {
    name: 'users',
    rowCount: 100,
    columns: [
      {
        name: 'id',
        dataType: 'int',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        descriptionIterations: [],
      },
      {
        name: 'status',
        dataType: 'varchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        descriptionIterations: [],
      },
    ],
    dependsOn: [],
    dependents: [],
    descriptionIterations: [],
  };
  return { name: 'public', tables: [table], descriptionIterations: [] };
}

function createMinimalState(schema: SchemaDefinition): DatabaseDocumentation {
  return {
    version: '1.0',
    summary: {
      createdAt: '2026-01-01',
      lastModified: '2026-01-01',
      totalIterations: 1,
      totalPromptsRun: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      totalSchemas: 1,
      totalTables: schema.tables.length,
      totalColumns: schema.tables[0].columns.length,
    },
    database: { name: 'testdb', server: 'localhost', analyzedAt: '2026-01-01' },
    seedContext: {},
    schemas: [schema],
    phases: { descriptionGeneration: [] },
  };
}

function createDriver(provider: 'postgresql' | 'mysql'): BaseAutoDocDriver {
  const conn = {
    provider,
    host: 'localhost',
    database: 'testdb',
    user: 'tester',
    password: 'secret',
  };
  return provider === 'postgresql' ? new PostgreSQLDriver(conn) : new MySQLDriver(conn);
}

function createGeneratorHarness(driver: BaseAutoDocDriver) {
  const schema = createMinimalSchema();
  const state = createMinimalState(schema);

  const promptEngine = new PromptEngine({ provider: 'gemini', model: 'test-model', apiKey: 'test-key' }, '');
  const executePrompt = vi.spyOn(promptEngine, 'executePrompt').mockImplementation(async (promptName: string) => {
    if (promptName === 'query-planning') {
      return {
        success: true,
        tokensUsed: 10,
        result: {
          queries: [
            {
              id: 'q1',
              name: 'Active Users',
              description: 'List active users',
              businessPurpose: 'User monitoring',
              queryType: 'operational',
              queryPattern: 'filtering',
              complexity: 'simple',
              primaryEntities: [{ schema: 'public', table: 'users' }],
              relatedEntities: [],
              RelatedQueryIds: [],
              confidence: 0.9,
            },
          ],
        },
      };
    }
    return {
      success: true,
      tokensUsed: 10,
      result: {
        sqlQuery: 'SELECT id FROM public.users WHERE status = @status;',
        parameters: [],
        sampleResultColumns: [],
        filteringRules: [],
        aggregationRules: [],
        joinRules: [],
      },
    };
  });

  const executeQuery = vi.spyOn(driver, 'executeQuery').mockResolvedValue({
    success: true,
    data: [{ id: 1 }],
  });
  const stateManager = new StateManager('/tmp/sample-query-generator-test.json');
  vi.spyOn(stateManager, 'load').mockResolvedValue(state);
  vi.spyOn(stateManager, 'save').mockResolvedValue(undefined);

  const config: SampleQueryGenerationConfig = {
    enabled: true,
    queriesPerTable: 1,
    maxExecutionTime: 5000,
    includeMultiQueryPatterns: false,
    validateAlignment: false,
    tokenBudget: 0,
    maxTables: 1,
    enableQueryFix: false,
    enableQueryRefinement: false,
  };

  const generator = new SampleQueryGenerator(config, promptEngine, driver, 'test-model', stateManager);
  return { generator, schema, executePrompt, executeQuery };
}

describe('SampleQueryGenerator', () => {
  describe('FormatDatabaseType', () => {
    it('maps each supported provider to its human-readable dialect name', () => {
      expect(SampleQueryGenerator.FormatDatabaseType('sqlserver')).toBe('SQL Server');
      expect(SampleQueryGenerator.FormatDatabaseType('postgresql')).toBe('PostgreSQL');
      expect(SampleQueryGenerator.FormatDatabaseType('mysql')).toBe('MySQL');
      expect(SampleQueryGenerator.FormatDatabaseType('oracle')).toBe('Oracle');
    });
  });

  describe('PrepareValidationQuery', () => {
    it('injects LIMIT 10 on PostgreSQL and MySQL instead of TOP 10', () => {
      const pgSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id, name FROM public.users WHERE status = @status;',
        'postgresql'
      );
      expect(pgSql).not.toMatch(/\bTOP 10\b/i);
      expect(pgSql).toBe("SELECT id, name FROM public.users WHERE status = 'Active' LIMIT 10;");

      const mysqlSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id FROM users',
        'mysql'
      );
      expect(mysqlSql).not.toMatch(/\bTOP 10\b/i);
      expect(mysqlSql).toBe('SELECT id FROM users LIMIT 10');
    });

    it('puts LIMIT 10 on a new line when a query ends with a SQL line comment, without breaking strings containing --', () => {
      const commented = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id FROM users -- fetch active rows',
        'postgresql'
      );
      expect(commented).toBe('SELECT id FROM users -- fetch active rows\nLIMIT 10');

      const stringWithDashes = SampleQueryGenerator.PrepareValidationQuery(
        "SELECT id FROM users WHERE code = '--not-a-comment'",
        'postgresql'
      );
      expect(stringWithDashes).toBe("SELECT id FROM users WHERE code = '--not-a-comment' LIMIT 10");
    });

    it('injects TOP 10 on SQL Server after SELECT DISTINCT and into the outer SELECT of CTEs', () => {
      const distinctSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT DISTINCT CustomerID FROM dbo.Orders',
        'sqlserver'
      );
      expect(distinctSql).toBe('SELECT DISTINCT TOP 10 CustomerID FROM dbo.Orders');

      const cteSql = SampleQueryGenerator.PrepareValidationQuery(
        'WITH recent AS (SELECT OrderID FROM dbo.Orders WHERE CustomerID = @customerId) SELECT OrderID FROM recent',
        'sqlserver'
      );
      expect(cteSql).toBe(
        'WITH recent AS (SELECT OrderID FROM dbo.Orders WHERE CustomerID = 1) SELECT TOP 10 OrderID FROM recent'
      );
    });

    it('preserves existing top-level TOP, TOP (n), LIMIT, FETCH FIRST/NEXT, and ROWNUM clauses', () => {
      expect(
        SampleQueryGenerator.PrepareValidationQuery('SELECT TOP (5) CustomerID FROM dbo.Orders', 'sqlserver')
      ).toBe('SELECT TOP (5) CustomerID FROM dbo.Orders');

      expect(
        SampleQueryGenerator.PrepareValidationQuery('SELECT id FROM users LIMIT 5', 'postgresql')
      ).toBe('SELECT id FROM users LIMIT 5');

      expect(
        SampleQueryGenerator.PrepareValidationQuery(
          'SELECT id FROM dbo.Orders ORDER BY id OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY',
          'sqlserver'
        )
      ).toBe('SELECT id FROM dbo.Orders ORDER BY id OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY');

      expect(
        SampleQueryGenerator.PrepareValidationQuery('SELECT id FROM users WHERE ROWNUM <= 5', 'oracle')
      ).toBe('SELECT id FROM users WHERE ROWNUM <= 5');
    });

    it('still applies an outer row limit when only a subquery contains TOP or LIMIT', () => {
      const sqlServerSubquery = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT o.OrderID FROM dbo.Orders o WHERE o.CustomerID IN (SELECT TOP 1 c.ID FROM dbo.Customers c)',
        'sqlserver'
      );
      expect(sqlServerSubquery).toBe(
        'SELECT TOP 10 o.OrderID FROM dbo.Orders o WHERE o.CustomerID IN (SELECT TOP 1 c.ID FROM dbo.Customers c)'
      );

      const pgSubquery = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT o.id FROM orders o WHERE o.customer_id IN (SELECT c.id FROM customers c LIMIT 1)',
        'postgresql'
      );
      expect(pgSubquery).toBe(
        'SELECT o.id FROM orders o WHERE o.customer_id IN (SELECT c.id FROM customers c LIMIT 1) LIMIT 10'
      );
    });

    it('emits FETCH FIRST 10 ROWS ONLY for Oracle instead of SQL Server TOP 10', () => {
      const oracleSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id FROM hr.employees WHERE start_date >= @startDate',
        'oracle'
      );
      expect(oracleSql).not.toMatch(/\bTOP 10\b/i);
      expect(oracleSql).toBe("SELECT id FROM hr.employees WHERE start_date >= '2024-01-01' FETCH FIRST 10 ROWS ONLY");
    });

    it('substitutes prefix-overlapping @params without collision and leaves strings, comments, and @@globals intact', () => {
      const sql = SampleQueryGenerator.PrepareValidationQuery(
        "SELECT @@ROWCOUNT, id FROM dbo.Users WHERE status_name = @statusName AND status = @status AND email = 'user@example.com' -- @author",
        'postgresql'
      );
      expect(sql).toBe(
        "SELECT @@ROWCOUNT, id FROM dbo.Users WHERE status_name = 'Active' AND status = 'Active' AND email = 'user@example.com' -- @author\nLIMIT 10"
      );
    });

    it('handles trailing newlines and semicolons inside trailing line comments cleanly', () => {
      expect(
        SampleQueryGenerator.PrepareValidationQuery(
          'SELECT id FROM users -- fetch active rows\n   ',
          'postgresql'
        )
      ).toBe('SELECT id FROM users -- fetch active rows\nLIMIT 10');

      expect(
        SampleQueryGenerator.PrepareValidationQuery(
          'SELECT id FROM users -- note: keep semicolon;',
          'postgresql'
        )
      ).toBe('SELECT id FROM users -- note: keep semicolon;\nLIMIT 10');
    });
  });

  describe('instance provider wiring', () => {
    it('passes the driver dialect to prompts and validates PostgreSQL queries with LIMIT 10', async () => {
      const { generator, schema, executePrompt, executeQuery } = createGeneratorHarness(createDriver('postgresql'));

      const result = await generator.GenerateQueries([schema]);

      expect(result.Success).toBe(true);
      expect(executePrompt).toHaveBeenCalledWith(
        'query-planning',
        expect.objectContaining({ databaseType: 'PostgreSQL' }),
        expect.anything()
      );
      expect(executePrompt).toHaveBeenCalledWith(
        'single-query-generation',
        expect.objectContaining({ databaseType: 'PostgreSQL' }),
        expect.anything()
      );
      expect(executeQuery).toHaveBeenCalledWith("SELECT id FROM public.users WHERE status = 'Active' LIMIT 10;");
    });

    it('passes MySQL dialect to prompts and validates MySQL queries with LIMIT 10', async () => {
      const { generator, schema, executePrompt, executeQuery } = createGeneratorHarness(createDriver('mysql'));

      const result = await generator.GenerateQueries([schema]);

      expect(result.Success).toBe(true);
      expect(executePrompt).toHaveBeenCalledWith(
        'query-planning',
        expect.objectContaining({ databaseType: 'MySQL' }),
        expect.anything()
      );
      expect(executeQuery).toHaveBeenCalledWith("SELECT id FROM public.users WHERE status = 'Active' LIMIT 10;");
    });

    it('fails fast with a clear error instead of falling back to SQL Server for an unsupported provider', async () => {
      const driver = createDriver('postgresql');
      vi.spyOn(driver, 'GetProviderName').mockReturnValue('sqlite');
      const { generator, schema, executePrompt, executeQuery } = createGeneratorHarness(driver);

      const result = await generator.GenerateQueries([schema]);

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('Unsupported database provider "sqlite"');
      expect(executePrompt).not.toHaveBeenCalled();
      expect(executeQuery).not.toHaveBeenCalled();
    });
  });
});
