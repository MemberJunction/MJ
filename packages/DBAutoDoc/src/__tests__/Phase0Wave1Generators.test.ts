import { describe, it, expect, vi } from 'vitest';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator.js';
import { SQLGenerator } from '../generators/SQLGenerator.js';
import { SampleQueryGenerator } from '../generators/SampleQueryGenerator.js';
import type { PromptEngine } from '../prompts/PromptEngine.js';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import type { StateManager } from '../state/StateManager.js';
import type { SampleQuery, SampleQueryGenerationConfig } from '../types/sample-queries.js';
import type { DatabaseDocumentation, ColumnDefinition, TableDefinition } from '../types/state.js';
import type { PKCandidate, FKCandidate } from '../types/discovery.js';

function makeColumn(overrides: Partial<ColumnDefinition> & { name: string }): ColumnDefinition {
  return {
    dataType: 'int',
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    ...overrides,
  };
}

function makeTable(overrides: Partial<TableDefinition> & { name: string }): TableDefinition {
  return {
    rowCount: 100,
    dependsOn: [],
    dependents: [],
    columns: [],
    descriptionIterations: [],
    ...overrides,
  };
}

function makeState(tables: TableDefinition[], primaryKeys: PKCandidate[] = [], foreignKeys: FKCandidate[] = []): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2026-01-01',
      lastModified: '2026-01-01',
      totalIterations: 1,
      totalPromptsRun: 1,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      totalSchemas: 1,
      totalTables: tables.length,
      totalColumns: tables.reduce((n, t) => n + t.columns.length, 0),
    },
    database: { name: 'TestDB', server: 'localhost', analyzedAt: '2026-01-01' },
    phases: {
      descriptionGeneration: [],
      keyDetection: {
        triggered: true,
        triggerReason: 'missing_pks',
        triggerDetails: { tablesWithoutPK: 1, expectedFKs: 0, actualFKs: 0, fkDeficitPercentage: 0 },
        startedAt: '2026-01-01',
        tokenBudget: { allocated: 1000, used: 0, remaining: 1000 },
        iterations: [],
        discovered: { primaryKeys, foreignKeys },
        schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 0, overallConfidence: 0 },
        feedbackFromAnalysis: [],
        summary: {
          totalTablesAnalyzed: tables.length,
          tablesWithDiscoveredPKs: 0,
          relationshipsDiscovered: 0,
          averageConfidence: 0,
          highConfidenceCount: 0,
          mediumConfidenceCount: 0,
          lowConfidenceCount: 0,
          rejectedCount: 0,
        },
      },
    },
    schemas: [{ name: 'dbo', tables, descriptionIterations: [] }],
  };
}

function pkCandidate(columnNames: string[], confidence: number, status: PKCandidate['status'] = 'candidate', tableName = 'Orders'): PKCandidate {
  return {
    schemaName: 'dbo',
    tableName,
    columnNames,
    confidence,
    evidence: { uniqueness: 1, nullCount: 0, totalRows: 100, dataPattern: 'sequential', namingScore: 1, dataTypeScore: 1, warnings: [] },
    discoveredInIteration: 1,
    validatedByLLM: status === 'confirmed',
    status,
  };
}

function fkCandidate(sourceColumn: string, targetTable: string, targetColumn: string, status: FKCandidate['status'] = 'confirmed', confidence = 90): FKCandidate {
  return {
    schemaName: 'dbo',
    sourceTable: 'Orders',
    sourceColumn,
    targetSchema: 'dbo',
    targetTable,
    targetColumn,
    confidence,
    evidence: { namingMatch: 0.9, valueOverlap: 0.9, cardinalityRatio: 0.1, dataTypeMatch: true, nullPercentage: 0, sampleSize: 100, orphanCount: 0, warnings: [] },
    discoveredInIteration: 1,
    validatedByLLM: status === 'confirmed',
    status,
  };
}

describe('Phase 0 Wave 1 fixes', () => {
  describe('AdditionalSchemaInfoGenerator (Phase 0.2 & 0.12)', () => {
    const gen = new AdditionalSchemaInfoGenerator();

    it('emits only ONE winning PK candidate per table rather than unioning multiple candidates', () => {
      const table = makeTable({
        name: 'Orders',
        columns: [
          makeColumn({ name: 'OrderID', description: 'Unique order identifier' }),
          makeColumn({ name: 'OrderNum' }),
          makeColumn({ name: 'LineNum' }),
        ],
      });
      const state = makeState(table ? [table] : [], [
        pkCandidate(['OrderNum', 'LineNum'], 80, 'candidate'),
        pkCandidate(['OrderID'], 95, 'confirmed'),
      ]);

      const parsed = JSON.parse(gen.Generate(state));
      expect(parsed.dbo[0].PrimaryKey).toEqual([
        { FieldName: 'OrderID', Description: 'Unique order identifier' },
      ]);
    });

    it('never unions a discovered PK candidate onto an introspected PK', () => {
      const table = makeTable({
        name: 'Orders',
        columns: [
          makeColumn({ name: 'DeclaredID', isPrimaryKey: true, description: 'Catalog primary key' }),
          makeColumn({ name: 'AltCode' }),
        ],
      });
      const state = makeState([table], [pkCandidate(['AltCode'], 92, 'confirmed')]);

      const parsed = JSON.parse(gen.Generate(state));
      expect(parsed.dbo[0].PrimaryKey).toEqual([
        { FieldName: 'DeclaredID', Description: 'Catalog primary key' },
      ]);
    });

    it('suppresses rejected PK and FK candidates even when column flags or dependsOn remain set', () => {
      const table = makeTable({
        name: 'Orders',
        columns: [
          makeColumn({ name: 'RealPK', isPrimaryKey: true }),
          makeColumn({ name: 'StaleDiscoveredPK', isPrimaryKey: true }),
          makeColumn({
            name: 'WhsSiblingID',
            isForeignKey: true,
            foreignKeyReferences: {
              schema: 'dbo',
              table: 'WarehouseSibling',
              column: 'WhsSiblingID',
              referencedColumn: 'ID',
            },
          }),
          makeColumn({
            name: 'CustomerID',
            isForeignKey: true,
            foreignKeyReferences: {
              schema: 'dbo',
              table: 'Customers',
              column: 'CustomerID',
              referencedColumn: 'ID',
            },
          }),
        ],
        dependsOn: [
          { schema: 'dbo', table: 'WarehouseSibling', column: 'WhsSiblingID', referencedColumn: 'ID' },
          { schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'ID' },
        ],
      });

      const state = makeState(
        [table],
        [pkCandidate(['StaleDiscoveredPK'], 85, 'rejected')],
        [
          fkCandidate('WhsSiblingID', 'WarehouseSibling', 'ID', 'rejected', 88),
          fkCandidate('CustomerID', 'Customers', 'ID', 'confirmed', 96),
        ]
      );

      const parsed = JSON.parse(gen.Generate(state));
      expect(parsed.dbo[0].PrimaryKey.map((p: { FieldName: string }) => p.FieldName)).toEqual(['RealPK']);
      expect(parsed.dbo[0].ForeignKeys.map((f: { FieldName: string }) => f.FieldName)).toEqual(['CustomerID']);
    });

    it('uses column descriptions instead of overwriting them with AI-discovered placeholder text', () => {
      const table = makeTable({
        name: 'Orders',
        columns: [
          makeColumn({ name: 'OrderID', description: 'Surrogate primary key for customer orders' }),
          makeColumn({ name: 'CustomerID', description: 'Owning customer account reference' }),
        ],
      });
      const state = makeState(
        [table],
        [pkCandidate(['OrderID'], 99, 'confirmed')],
        [fkCandidate('CustomerID', 'Customers', 'ID', 'confirmed', 95)]
      );

      const parsed = JSON.parse(gen.Generate(state));
      expect(parsed.dbo[0].PrimaryKey[0].Description).toBe('Surrogate primary key for customer orders');
      expect(parsed.dbo[0].PrimaryKey[0].Description).not.toContain('AI-discovered primary key');
      expect(parsed.dbo[0].ForeignKeys[0].Description).toContain('Owning customer account reference');
    });
  });

  describe('SQLGenerator (Phase 0.10)', () => {
    it('escapes single quotes in schema, table, and column names in SQL Server extended properties', () => {
      const gen = new SQLGenerator();
      const state = makeState([
        makeTable({
          name: "Order's",
          description: 'Orders table',
          columns: [
            makeColumn({ name: "Buyer'sID", description: 'Buyer column' }),
          ],
        }),
      ]);
      state.schemas[0].name = "org's_schema";
      state.schemas[0].description = 'Org schema';

      const sql = gen.Generate(state, { provider: 'sqlserver' });
      expect(sql).toContain("SCHEMA_ID('org''s_schema')");
      expect(sql).toContain("@level0name = N'org''s_schema'");
      expect(sql).toContain("t.name = 'Order''s'");
      expect(sql).toContain("@level1name = N'Order''s'");
      expect(sql).toContain("c.name = 'Buyer''sID'");
      expect(sql).toContain("@level2name = N'Buyer''sID'");
    });
  });

  describe('SampleQueryGenerator (Phase 0.11)', () => {
    function makeQuery(sqlQuery: string): SampleQuery {
      return {
        id: 'q1',
        name: 'Test Query',
        description: 'desc',
        businessPurpose: 'purpose',
        queryType: 'operational',
        queryPattern: 'filtering',
        complexity: 'simple',
        primaryEntities: [],
        relatedEntities: [],
        sqlQuery,
        parameters: [],
        sampleResultColumns: [],
        filteringRules: [],
        aggregationRules: [],
        joinRules: [],
        confidence: 0.9,
        validated: false,
      };
    }

    async function captureValidationSQL(provider: string, sqlQuery: string): Promise<string> {
      let executedSql = '';
      const mockDriver = {
        GetProviderName: () => provider,
        executeQuery: vi.fn(async (sql: string) => {
          executedSql = sql;
          return { success: true, data: [{ id: 1 }] };
        }),
      } as Partial<BaseAutoDocDriver> as BaseAutoDocDriver;

      const gen = new SampleQueryGenerator(
        {} as SampleQueryGenerationConfig,
        {} as PromptEngine,
        mockDriver,
        'mock-model',
        {} as StateManager
      );
      await (gen as unknown as { executeValidation: (q: SampleQuery) => Promise<unknown> }).executeValidation(makeQuery(sqlQuery));
      return executedSql;
    }

    it('injects LIMIT 10 on PostgreSQL and MySQL instead of TOP 10', async () => {
      const pgSql = await captureValidationSQL('postgresql', 'SELECT id, name FROM public.users WHERE status = @status;');
      expect(pgSql).not.toMatch(/\bTOP 10\b/i);
      expect(pgSql).toBe("SELECT id, name FROM public.users WHERE status = 'Active' LIMIT 10;");

      const mysqlSql = await captureValidationSQL('mysql', 'SELECT id FROM users');
      expect(mysqlSql).not.toMatch(/\bTOP 10\b/i);
      expect(mysqlSql).toBe('SELECT id FROM users LIMIT 10');
    });

    it('injects TOP 10 after SELECT DISTINCT on SQL Server and preserves existing limits', async () => {
      const distinctSql = await captureValidationSQL('sqlserver', 'SELECT DISTINCT CustomerID FROM dbo.Orders');
      expect(distinctSql).toBe('SELECT DISTINCT TOP 10 CustomerID FROM dbo.Orders');

      const alreadyLimitedPg = await captureValidationSQL('postgresql', 'SELECT id FROM users LIMIT 5');
      expect(alreadyLimitedPg).toBe('SELECT id FROM users LIMIT 5');
    });
  });
});
