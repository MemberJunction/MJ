import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisOrchestrator } from '../core/AnalysisOrchestrator.js';
import { DBAutoDocConfig } from '../types/config.js';

const mockDriver = {
  getExistingDescriptions: vi.fn().mockResolvedValue([]),
  getColumnStatistics: vi.fn().mockResolvedValue({
    totalRows: 100,
    distinctCount: 50,
    uniquenessRatio: 0.5,
    nullCount: 0,
    nullPercentage: 0,
    sampleValues: ['val1', 'val2']
  }),
  close: vi.fn().mockResolvedValue(undefined)
};

const mockAnalyzeTable = vi.fn().mockResolvedValue(undefined);

// Mock dependencies with classes
vi.mock('../database/Database.js', () => {
  class DatabaseConnection {
    connect = vi.fn().mockResolvedValue(undefined);
    test = vi.fn().mockResolvedValue({ success: true });
    getDriver = vi.fn().mockReturnValue(mockDriver);
    close = vi.fn().mockResolvedValue(undefined);
  }

  class Introspector {
    getSchemas = vi.fn().mockResolvedValue([
      {
        name: 'dbo',
        tables: [
          {
            name: 'Users',
            rowCount: 100,
            dependsOn: [],
            dependents: [],
            columns: [
              { name: 'Id', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] }
            ],
            descriptionIterations: []
          }
        ]
      }
    ]);
  }

  class DataSampler {
    analyzeTable = mockAnalyzeTable;
    AnalyzeTable = mockAnalyzeTable;
  }

  return {
    DatabaseConnection,
    Introspector,
    DataSampler
  };
});

vi.mock('../state/StateManager.js', () => {
  class StateManager {
    createInitialState = vi.fn().mockReturnValue({
      version: '1.0.0',
      database: 'TestDB',
      server: 'localhost',
      schemas: [],
      summary: {},
      phases: { descriptionGeneration: [] }
    });
    load = vi.fn().mockResolvedValue(null);
    save = vi.fn().mockResolvedValue(undefined);
    updateSummary = vi.fn();
    createAnalysisRun = vi.fn().mockReturnValue({
      id: 'run-1',
      iterationsPerformed: 0,
      totalTokensUsed: 0,
      estimatedCost: 0
    });
    updateTableDescription = vi.fn();
    updateColumnDescription = vi.fn();
  }

  return { StateManager };
});

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

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
      convergence: { maxIterations: 1, stabilityWindow: 2, confidenceThreshold: 0.85 },
      backpropagation: { enabled: false, maxDepth: 1 },
      sanityChecks: { dependencyLevel: false, schemaLevel: false, crossSchema: false }
    },
    output: { stateFile: './state.json', outputDir: './output', sqlFile: './out.sql', markdownFile: './out.md' },
    schemas: { exclude: ['sys'] },
    tables: { exclude: [] },
    ...overrides
  };
}

describe('SkipSampling in AnalysisOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips sampling when skipSampling: true is passed via options', async () => {
    const progressMessages: string[] = [];
    const config = createTestConfig();

    const orchestrator = new AnalysisOrchestrator({
      config,
      skipSampling: true,
      maxIterations: 0,
      onProgress: (msg) => progressMessages.push(msg)
    });

    const result = await orchestrator.Execute();
    expect(result.success).toBe(true);
    expect(progressMessages).toContain('Table data sampling skipped');
    expect(progressMessages).not.toContain('Analyzing table data');
    expect(mockAnalyzeTable).not.toHaveBeenCalled();
  });

  it('skips sampling when config.analysis.includeStatistics is false', async () => {
    const progressMessages: string[] = [];
    const config = createTestConfig();
    config.analysis.includeStatistics = false;

    const orchestrator = new AnalysisOrchestrator({
      config,
      maxIterations: 0,
      onProgress: (msg) => progressMessages.push(msg)
    });

    const result = await orchestrator.Execute();
    expect(result.success).toBe(true);
    expect(progressMessages).toContain('Table data sampling skipped');
    expect(progressMessages).not.toContain('Analyzing table data');
    expect(mockAnalyzeTable).not.toHaveBeenCalled();
  });

  it('skips sampling when config.analysis.skipSampling is true', async () => {
    const progressMessages: string[] = [];
    const config = createTestConfig();
    config.analysis.skipSampling = true;

    const orchestrator = new AnalysisOrchestrator({
      config,
      maxIterations: 0,
      onProgress: (msg) => progressMessages.push(msg)
    });

    const result = await orchestrator.Execute();
    expect(result.success).toBe(true);
    expect(progressMessages).toContain('Table data sampling skipped');
    expect(progressMessages).not.toContain('Analyzing table data');
    expect(mockAnalyzeTable).not.toHaveBeenCalled();
  });

  it('runs sampling when skipSampling is false and includeStatistics is true', async () => {
    const progressMessages: string[] = [];
    const config = createTestConfig();

    const orchestrator = new AnalysisOrchestrator({
      config,
      skipSampling: false,
      maxIterations: 0,
      onProgress: (msg) => progressMessages.push(msg)
    });

    const result = await orchestrator.Execute();
    expect(result.success).toBe(true);
    expect(progressMessages).toContain('Analyzing table data');
    expect(progressMessages).toContain('Sampling table data [1/1]: dbo.Users');
    expect(progressMessages).toContain('Data analysis complete');
    expect(mockAnalyzeTable).toHaveBeenCalled();
  });
});
