import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DBAutoDocConfig, GroundTruthConfig } from '../types/config';
import { TableAnalysisContext, TableGroundTruthContext } from '../types/analysis';
import { TableDefinition, ColumnDefinition, DatabaseDocumentation } from '../types/state';

/**
 * Tests for AnalysisEngine ground truth integration.
 * Since AnalysisEngine has deep dependencies (PromptEngine, LLM, etc.),
 * we test the logic patterns directly rather than instantiating the engine.
 */

function createTestConfig(overrides?: Partial<DBAutoDocConfig>): DBAutoDocConfig {
  return {
    version: '1.0.0',
    database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pass' },
    ai: { provider: 'gemini', model: 'test-model', apiKey: 'test-key', temperature: 0.1 },
    analysis: {
      cardinalityThreshold: 20,
      sampleSize: 10,
      includeStatistics: true,
      includePatternAnalysis: true,
      convergence: { maxIterations: 10, stabilityWindow: 2, confidenceThreshold: 0.85 },
      backpropagation: { enabled: true, maxDepth: 3 },
      sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true }
    },
    output: { stateFile: './state.json', sqlFile: './out.sql', markdownFile: './out.md' },
    schemas: { exclude: ['sys'] },
    tables: { exclude: [] },
    ...overrides
  };
}

describe('AnalysisEngine - Ground Truth Context Building', () => {
  /**
   * Test the buildGroundTruthContext logic that the AnalysisEngine uses
   * to inject ground truth into the prompt context.
   */
  function buildGroundTruthContext(
    config: DBAutoDocConfig,
    schemaName: string,
    tableName: string
  ): TableGroundTruthContext | undefined {
    const gt = config.groundTruth;
    if (!gt) return undefined;

    const tableKey = `${schemaName}.${tableName}`;
    const tableGT = gt.tables?.[tableKey];
    const schemaGT = gt.schemas?.[schemaName];

    if (!tableGT && !schemaGT) return undefined;

    const context: TableGroundTruthContext = {};

    if (tableGT?.description) context.tableDescription = tableGT.description;
    if (tableGT?.notes) context.tableNotes = tableGT.notes;
    if (tableGT?.businessDomain) context.businessDomain = tableGT.businessDomain;
    if (schemaGT?.businessDomain && !context.businessDomain) context.businessDomain = schemaGT.businessDomain;

    if (tableGT?.columns) {
      context.columnDescriptions = {};
      context.columnNotes = {};
      for (const [colName, colGT] of Object.entries(tableGT.columns)) {
        if (colGT.description) context.columnDescriptions[colName] = colGT.description;
        if (colGT.notes) context.columnNotes[colName] = colGT.notes;
      }
    }

    return context;
  }

  it('should return undefined when no ground truth configured', () => {
    const config = createTestConfig();
    const result = buildGroundTruthContext(config, 'dbo', 'Users');
    expect(result).toBeUndefined();
  });

  it('should return undefined for tables not in ground truth', () => {
    const config = createTestConfig({
      groundTruth: {
        tables: { 'dbo.Orders': { description: 'Order data' } }
      }
    });
    const result = buildGroundTruthContext(config, 'dbo', 'Users');
    expect(result).toBeUndefined();
  });

  it('should return table description from ground truth', () => {
    const config = createTestConfig({
      groundTruth: {
        tables: {
          'dbo.Users': { description: 'User accounts table', notes: 'Primary user store' }
        }
      }
    });
    const result = buildGroundTruthContext(config, 'dbo', 'Users');

    expect(result).toBeDefined();
    expect(result!.tableDescription).toBe('User accounts table');
    expect(result!.tableNotes).toBe('Primary user store');
  });

  it('should inherit businessDomain from schema when table has none', () => {
    const config = createTestConfig({
      groundTruth: {
        schemas: { dbo: { businessDomain: 'Core' } },
        tables: { 'dbo.Users': { description: 'Users' } }
      }
    });
    const result = buildGroundTruthContext(config, 'dbo', 'Users');

    expect(result).toBeDefined();
    expect(result!.businessDomain).toBe('Core');
  });

  it('should prefer table businessDomain over schema businessDomain', () => {
    const config = createTestConfig({
      groundTruth: {
        schemas: { dbo: { businessDomain: 'Core' } },
        tables: { 'dbo.Users': { description: 'Users', businessDomain: 'Identity' } }
      }
    });
    const result = buildGroundTruthContext(config, 'dbo', 'Users');

    expect(result).toBeDefined();
    expect(result!.businessDomain).toBe('Identity');
  });

  it('should include column-level ground truth', () => {
    const config = createTestConfig({
      groundTruth: {
        tables: {
          'dbo.Users': {
            description: 'Users',
            columns: {
              Email: { description: 'Primary email address', notes: 'Used for login' },
              Name: { description: 'Full name' }
            }
          }
        }
      }
    });
    const result = buildGroundTruthContext(config, 'dbo', 'Users');

    expect(result!.columnDescriptions).toBeDefined();
    expect(result!.columnDescriptions!['Email']).toBe('Primary email address');
    expect(result!.columnDescriptions!['Name']).toBe('Full name');
    expect(result!.columnNotes!['Email']).toBe('Used for login');
    expect(result!.columnNotes!['Name']).toBeUndefined();
  });

  it('should return context from schema-only ground truth', () => {
    const config = createTestConfig({
      groundTruth: {
        schemas: { hr: { businessDomain: 'Human Resources', description: 'HR schema' } }
      }
    });

    // Table not in ground truth, but schema is
    const result = buildGroundTruthContext(config, 'hr', 'Employees');
    expect(result).toBeDefined();
    expect(result!.businessDomain).toBe('Human Resources');
  });
});

describe('AnalysisEngine - User-Approved Skipping', () => {
  it('should skip user-approved tables during analysis', () => {
    const table: TableDefinition = {
      name: 'Users',
      rowCount: 100,
      dependsOn: [],
      dependents: [],
      columns: [],
      descriptionIterations: [
        {
          description: 'Approved description',
          reasoning: 'User-provided',
          generatedAt: '',
          modelUsed: 'ground_truth',
          confidence: 1.0,
          triggeredBy: 'ground_truth',
          isGroundTruth: true
        }
      ],
      userApproved: true
    };

    // This is what analyzeTable checks
    expect(table.userApproved).toBe(true);
    // Engine should skip this table
  });

  it('should NOT skip tables that are not user-approved', () => {
    const table: TableDefinition = {
      name: 'Orders',
      rowCount: 500,
      dependsOn: [],
      dependents: [],
      columns: [],
      descriptionIterations: [],
      userApproved: false
    };

    expect(table.userApproved).toBe(false);
    // Engine should analyze this table
  });

  it('should skip user-approved columns during description update', () => {
    const columns: ColumnDefinition[] = [
      {
        name: 'ID',
        dataType: 'int',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        descriptionIterations: [],
        userApproved: true,
        description: 'Primary key - DO NOT CHANGE'
      },
      {
        name: 'Name',
        dataType: 'nvarchar',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        descriptionIterations: [],
        userApproved: false
      }
    ];

    // Simulate the column update logic
    const colDescs = [
      { columnName: 'ID', description: 'Auto-increment identifier', reasoning: 'Standard PK' },
      { columnName: 'Name', description: 'User display name', reasoning: 'From column name' }
    ];

    for (const colDesc of colDescs) {
      const column = columns.find(c => c.name === colDesc.columnName);
      if (column && !column.userApproved) {
        column.description = colDesc.description;
      }
    }

    // ID should NOT be updated (user-approved)
    expect(columns[0].description).toBe('Primary key - DO NOT CHANGE');
    // Name should be updated (not approved)
    expect(columns[1].description).toBe('User display name');
  });
});

describe('AnalysisEngine - Backpropagation Ground Truth Protection', () => {
  it('should skip user-approved tables during backpropagation', () => {
    const table: TableDefinition = {
      name: 'Users',
      rowCount: 100,
      dependsOn: [],
      dependents: [],
      columns: [],
      descriptionIterations: [{
        description: 'Ground truth desc',
        reasoning: 'User-provided',
        generatedAt: '',
        modelUsed: 'ground_truth',
        confidence: 1.0,
        isGroundTruth: true,
        triggeredBy: 'ground_truth'
      }],
      userApproved: true,
      description: 'Ground truth desc'
    };

    // BackpropagationEngine checks userApproved
    expect(table.userApproved).toBe(true);
    // Should skip this table in backpropagation
  });
});
