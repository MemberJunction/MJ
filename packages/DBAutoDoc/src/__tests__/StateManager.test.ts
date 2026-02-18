import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StateManager } from '../state/StateManager';
import { DatabaseDocumentation, TableDefinition, ColumnDefinition, SchemaDefinition } from '../types/state';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn()
}));

import * as fs from 'fs/promises';

const mockedFs = vi.mocked(fs);

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager('/tmp/test-state.json');
    vi.clearAllMocks();
  });

  describe('createInitialState', () => {
    it('should create a valid initial state structure', () => {
      const state = manager.createInitialState('TestDB', 'localhost');

      expect(state.version).toBe('1.0.0');
      expect(state.database.name).toBe('TestDB');
      expect(state.database.server).toBe('localhost');
      expect(state.summary.totalIterations).toBe(0);
      expect(state.phases.descriptionGeneration).toEqual([]);
      expect(state.schemas).toEqual([]);
    });

    it('should set timestamp fields', () => {
      const state = manager.createInitialState('TestDB', 'localhost');

      expect(state.summary.createdAt).toBeDefined();
      expect(state.summary.lastModified).toBeDefined();
      expect(state.database.analyzedAt).toBeDefined();
    });

    it('should initialize all counter fields to zero', () => {
      const state = manager.createInitialState('TestDB', 'localhost');

      expect(state.summary.totalPromptsRun).toBe(0);
      expect(state.summary.totalInputTokens).toBe(0);
      expect(state.summary.totalOutputTokens).toBe(0);
      expect(state.summary.totalTokens).toBe(0);
      expect(state.summary.estimatedCost).toBe(0);
      expect(state.summary.totalSchemas).toBe(0);
      expect(state.summary.totalTables).toBe(0);
      expect(state.summary.totalColumns).toBe(0);
    });
  });

  describe('createAnalysisRun', () => {
    it('should create a new run and add to state', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      const run = manager.createAnalysisRun(state, 'gemini-3-flash', 'google', 0.1);

      expect(run.runId).toBeDefined();
      expect(run.runId).toMatch(/^run_/);
      expect(run.status).toBe('in_progress');
      expect(run.modelUsed).toBe('gemini-3-flash');
      expect(run.vendor).toBe('google');
      expect(run.temperature).toBe(0.1);
      expect(state.phases.descriptionGeneration).toHaveLength(1);
    });

    it('should accept optional topP and topK parameters', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      const run = manager.createAnalysisRun(state, 'model', 'vendor', 0.1, 0.9, 40);

      expect(run.topP).toBe(0.9);
      expect(run.topK).toBe(40);
    });

    it('should initialize all counters to zero', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      const run = manager.createAnalysisRun(state, 'model', 'vendor', 0.1);

      expect(run.levelsProcessed).toBe(0);
      expect(run.iterationsPerformed).toBe(0);
      expect(run.backpropagationCount).toBe(0);
      expect(run.sanityCheckCount).toBe(0);
      expect(run.totalTokensUsed).toBe(0);
      expect(run.estimatedCost).toBe(0);
      expect(run.warnings).toEqual([]);
      expect(run.errors).toEqual([]);
    });
  });

  describe('updateTableDescription', () => {
    it('should add iteration and update description', () => {
      const table: TableDefinition = {
        name: 'Users',
        rowCount: 100,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: [],
        description: undefined
      };

      manager.updateTableDescription(table, 'Stores user accounts', 'Main user table', 0.9, 'gemini', 'initial');

      expect(table.description).toBe('Stores user accounts');
      expect(table.descriptionIterations).toHaveLength(1);
      expect(table.descriptionIterations[0].confidence).toBe(0.9);
      expect(table.descriptionIterations[0].triggeredBy).toBe('initial');
    });

    it('should track changedFrom for subsequent iterations', () => {
      const table: TableDefinition = {
        name: 'Users',
        rowCount: 100,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: [],
        description: 'Old description'
      };

      manager.updateTableDescription(table, 'New description', 'Updated', 0.95, 'gemini', 'backpropagation');

      expect(table.descriptionIterations[0].changedFrom).toBe('Old description');
    });
  });

  describe('updateColumnDescription', () => {
    it('should add iteration and update column description', () => {
      const column: ColumnDefinition = {
        name: 'ID',
        dataType: 'int',
        isNullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        descriptionIterations: []
      };

      manager.updateColumnDescription(column, 'Primary key identifier', 'Auto-increment', 'gemini');

      expect(column.description).toBe('Primary key identifier');
      expect(column.descriptionIterations).toHaveLength(1);
    });
  });

  describe('updateSchemaDescription', () => {
    it('should add iteration and update schema description', () => {
      const schema: SchemaDefinition = {
        name: 'dbo',
        tables: [],
        descriptionIterations: []
      };

      manager.updateSchemaDescription(schema, 'Default schema', 'Contains main tables', 'gemini');

      expect(schema.description).toBe('Default schema');
      expect(schema.descriptionIterations).toHaveLength(1);
      expect(schema.descriptionIterations[0].triggeredBy).toBe('schema_sanity_check');
    });
  });

  describe('findTable', () => {
    it('should find an existing table', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.schemas = [
        {
          name: 'dbo',
          tables: [{ name: 'Users', rowCount: 100, dependsOn: [], dependents: [], columns: [], descriptionIterations: [] }],
          descriptionIterations: []
        }
      ];

      const table = manager.findTable(state, 'dbo', 'Users');
      expect(table).not.toBeNull();
      expect(table!.name).toBe('Users');
    });

    it('should return null for non-existent schema', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.schemas = [];

      expect(manager.findTable(state, 'dbo', 'Users')).toBeNull();
    });

    it('should return null for non-existent table', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.schemas = [{ name: 'dbo', tables: [], descriptionIterations: [] }];

      expect(manager.findTable(state, 'dbo', 'NonExistent')).toBeNull();
    });
  });

  describe('getUnapprovedTables', () => {
    it('should return tables that are not approved', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.schemas = [
        {
          name: 'dbo',
          tables: [
            { name: 'A', rowCount: 0, dependsOn: [], dependents: [], columns: [], descriptionIterations: [], userApproved: true },
            { name: 'B', rowCount: 0, dependsOn: [], dependents: [], columns: [], descriptionIterations: [], userApproved: false },
            { name: 'C', rowCount: 0, dependsOn: [], dependents: [], columns: [], descriptionIterations: [] }
          ],
          descriptionIterations: []
        }
      ];

      const unapproved = manager.getUnapprovedTables(state);
      expect(unapproved).toHaveLength(2); // B and C (undefined is not approved)
    });
  });

  describe('getLowConfidenceTables', () => {
    it('should return tables below the confidence threshold', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.schemas = [
        {
          name: 'dbo',
          tables: [
            {
              name: 'LowConf', rowCount: 0, dependsOn: [], dependents: [], columns: [],
              descriptionIterations: [{ description: 'Low', reasoning: '', generatedAt: '', modelUsed: '', confidence: 0.5 }]
            },
            {
              name: 'HighConf', rowCount: 0, dependsOn: [], dependents: [], columns: [],
              descriptionIterations: [{ description: 'High', reasoning: '', generatedAt: '', modelUsed: '', confidence: 0.95 }]
            }
          ],
          descriptionIterations: []
        }
      ];

      const lowConf = manager.getLowConfidenceTables(state, 0.7);
      expect(lowConf).toHaveLength(1);
      expect(lowConf[0].table).toBe('LowConf');
      expect(lowConf[0].confidence).toBe(0.5);
    });
  });

  describe('getUnprocessedTables', () => {
    it('should return tables with no descriptionIterations', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.schemas = [
        {
          name: 'dbo',
          tables: [
            {
              name: 'Processed', rowCount: 0, dependsOn: [], dependents: [], columns: [],
              descriptionIterations: [{ description: 'Done', reasoning: '', generatedAt: '', modelUsed: '' }]
            },
            { name: 'Unprocessed', rowCount: 0, dependsOn: [], dependents: [], columns: [], descriptionIterations: [] }
          ],
          descriptionIterations: []
        }
      ];

      const unprocessed = manager.getUnprocessedTables(state);
      expect(unprocessed).toHaveLength(1);
      expect(unprocessed[0].table).toBe('Unprocessed');
      expect(unprocessed[0].schema).toBe('dbo');
    });
  });

  describe('updateSummary', () => {
    it('should calculate correct schema/table/column counts', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.schemas = [
        {
          name: 'dbo',
          tables: [
            { name: 'A', rowCount: 0, dependsOn: [], dependents: [], columns: [{ name: 'C1', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] }], descriptionIterations: [] },
            { name: 'B', rowCount: 0, dependsOn: [], dependents: [], columns: [{ name: 'C2', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] }, { name: 'C3', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] }], descriptionIterations: [] }
          ],
          descriptionIterations: []
        }
      ];

      manager.updateSummary(state);

      expect(state.summary.totalSchemas).toBe(1);
      expect(state.summary.totalTables).toBe(2);
      expect(state.summary.totalColumns).toBe(3);
    });

    it('should aggregate token usage from all runs', () => {
      const state = manager.createInitialState('TestDB', 'localhost');
      state.phases.descriptionGeneration = [
        {
          runId: 'r1', startedAt: '', status: 'completed', levelsProcessed: 0,
          iterationsPerformed: 0, backpropagationCount: 0, sanityCheckCount: 0,
          converged: false, modelUsed: '', vendor: '', temperature: 0,
          totalTokensUsed: 1000, estimatedCost: 0.05,
          warnings: [], errors: [], processingLog: [
            { timestamp: '', level: 0, schema: '', table: '', action: 'analyze', result: 'success', tokensUsed: 500 },
            { timestamp: '', level: 0, schema: '', table: '', action: 'analyze', result: 'success', tokensUsed: 500 }
          ], sanityChecks: []
        },
        {
          runId: 'r2', startedAt: '', status: 'completed', levelsProcessed: 0,
          iterationsPerformed: 0, backpropagationCount: 0, sanityCheckCount: 0,
          converged: false, modelUsed: '', vendor: '', temperature: 0,
          totalTokensUsed: 500, estimatedCost: 0.02,
          warnings: [], errors: [], processingLog: [
            { timestamp: '', level: 0, schema: '', table: '', action: 'analyze', result: 'success', tokensUsed: 500 }
          ], sanityChecks: []
        }
      ];

      manager.updateSummary(state);

      expect(state.summary.totalTokens).toBe(1500);
      expect(state.summary.estimatedCost).toBeCloseTo(0.07);
      expect(state.summary.totalPromptsRun).toBe(3); // 2 + 1 entries with tokensUsed > 0
    });
  });

  describe('load', () => {
    it('should return null when file does not exist', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await manager.load();
      expect(result).toBeNull();
    });

    it('should parse and return state when file exists', async () => {
      const mockState = manager.createInitialState('TestDB', 'localhost');
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockState));

      const result = await manager.load();
      expect(result).not.toBeNull();
      expect(result!.database.name).toBe('TestDB');
    });

    it('should migrate old format without phases', async () => {
      const oldFormatState = {
        version: '1.0.0',
        database: { name: 'OldDB', server: 'localhost', analyzedAt: '2024-01-01' },
        schemas: [],
        analysisRuns: [{ runId: 'r1', startedAt: '', status: 'completed', levelsProcessed: 0, iterationsPerformed: 0, backpropagationCount: 0, sanityCheckCount: 0, converged: false, modelUsed: '', vendor: '', temperature: 0, totalTokensUsed: 0, estimatedCost: 0, warnings: [], errors: [], processingLog: [], sanityChecks: [] }]
      };
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.readFile.mockResolvedValue(JSON.stringify(oldFormatState));

      const result = await manager.load();
      expect(result).not.toBeNull();
      expect(result!.phases.descriptionGeneration).toHaveLength(1);
    });
  });

  describe('save', () => {
    it('should write state to file', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const state = manager.createInitialState('TestDB', 'localhost');
      await manager.save(state);

      expect(mockedFs.writeFile).toHaveBeenCalledOnce();
      const writtenContent = JSON.parse(mockedFs.writeFile.mock.calls[0][1] as string);
      expect(writtenContent.database.name).toBe('TestDB');
    });

    it('should update lastModified timestamp', async () => {
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      const state = manager.createInitialState('TestDB', 'localhost');
      const originalTime = state.summary.lastModified;

      // Small delay to ensure different timestamp
      await new Promise(r => setTimeout(r, 5));
      await manager.save(state);

      expect(state.summary.lastModified).not.toBe(originalTime);
    });
  });

  describe('delete', () => {
    it('should delete the state file when it exists', async () => {
      mockedFs.access.mockResolvedValue(undefined);
      mockedFs.unlink.mockResolvedValue(undefined);

      await manager.delete();

      expect(mockedFs.unlink).toHaveBeenCalledWith('/tmp/test-state.json');
    });

    it('should not throw when file does not exist', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      await expect(manager.delete()).resolves.not.toThrow();
      expect(mockedFs.unlink).not.toHaveBeenCalled();
    });
  });
});
