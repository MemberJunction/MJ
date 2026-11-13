import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { AnalysisOrchestrator } from '../core/AnalysisOrchestrator.js';
import type { DBAutoDocConfig } from '../types/config.js';

/**
 * The orchestrator runs the data quality phase after discovery, writes data-quality.md/.json
 * beside summary.md, and skips all of it for `skipDataQuality` or `analysis.dataQuality.enabled: false`.
 */

const mocks = vi.hoisted(() => {
  const executeBounded = vi.fn(async (sql: string) => {
    const row: Record<string, unknown> = {};
    const value = (alias: string) => (alias === 'rows_' || alias.endsWith('_nonnull') ? '250' : alias.endsWith('_blank') ? 12 : 0);
    for (const m of sql.matchAll(/ AS ([a-z0-9_]+)/g)) row[m[1]] = value(m[1]);
    return { Ok: true as const, Rows: [row] };
  });
  const driver = {
    getExistingDescriptions: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
    ExecuteBounded: executeBounded,
  };
  return { executeBounded, driver };
});

vi.mock('../database/Database.js', () => {
  class DatabaseConnection {
    connect = vi.fn().mockResolvedValue(undefined);
    test = vi.fn().mockResolvedValue({ success: true });
    getDriver = vi.fn().mockReturnValue(mocks.driver);
    close = vi.fn().mockResolvedValue(undefined);
  }
  class Introspector {
    getSchemas = vi.fn().mockResolvedValue([
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          {
            name: 'Users',
            rowCount: 100,
            dependsOn: [],
            dependents: [],
            descriptionIterations: [],
            columns: [
              { name: 'Id', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
              { name: 'Status', dataType: 'nvarchar', maxLength: 20, isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] },
            ],
          },
        ],
      },
    ]);
    LoadIndexes = vi.fn().mockResolvedValue([]);
  }
  class DataSampler {
    AnalyzeTable = vi.fn().mockResolvedValue(undefined);
    analyzeTable = vi.fn().mockResolvedValue(undefined);
  }
  return { DatabaseConnection, Introspector, DataSampler };
});

vi.mock('../state/StateManager.js', () => {
  class StateManager {
    createInitialState = vi.fn().mockReturnValue({
      version: '1.0.0',
      database: { name: 'TestDB', server: 'localhost', analyzedAt: '2026-01-01T00:00:00Z' },
      schemas: [],
      summary: {},
      phases: { descriptionGeneration: [] },
    });
    load = vi.fn().mockResolvedValue(null);
    save = vi.fn().mockResolvedValue(undefined);
    updateSummary = vi.fn();
    createAnalysisRun = vi.fn().mockReturnValue({ id: 'run-1', iterationsPerformed: 0, totalTokensUsed: 0, estimatedCost: 0 });
    updateTableDescription = vi.fn();
    updateColumnDescription = vi.fn();
  }
  return { StateManager };
});

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

function config(dataQuality?: DBAutoDocConfig['analysis']['dataQuality']): DBAutoDocConfig {
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
      sanityChecks: { dependencyLevel: false, schemaLevel: false, crossSchema: false },
      ...(dataQuality ? { dataQuality } : {}),
    },
    output: { stateFile: './state.json', outputDir: './output', sqlFile: './out.sql', markdownFile: './out.md' },
    schemas: { exclude: ['sys'] },
    tables: { exclude: [] },
  } as DBAutoDocConfig;
}

const writtenFiles = () => vi.mocked(fs.writeFile).mock.calls.map((c) => String(c[0]));

describe('data quality in the orchestrator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('probes, corrects the row count, and writes both report files by default', async () => {
    const result = await new AnalysisOrchestrator({ config: config(), maxIterations: 0 }).Execute();
    expect(result.success).toBe(true);
    expect(mocks.executeBounded).toHaveBeenCalled();
    expect(result.state.phases.dataQuality?.TableProbes['dbo.Users']?.Outcome).toBe('ok');
    expect(result.state.schemas[0].tables[0].rowCount).toBe(250);
    expect(result.state.dataQuality?.map((f) => f.Kind)).toContain('BlankString');
    expect(writtenFiles().some((p) => p.endsWith('data-quality.md'))).toBe(true);
    expect(writtenFiles().some((p) => p.endsWith('data-quality.json'))).toBe(true);
  });

  it('does nothing for skipDataQuality', async () => {
    const result = await new AnalysisOrchestrator({ config: config(), maxIterations: 0, skipDataQuality: true }).Execute();
    expect(result.success).toBe(true);
    expect(mocks.executeBounded).not.toHaveBeenCalled();
    expect(result.state.phases.dataQuality?.Status).toBe('skipped');
    expect(result.state.dataQuality).toBeUndefined();
    expect(writtenFiles().some((p) => p.includes('data-quality'))).toBe(false);
  });

  it('does nothing when the config turns it off', async () => {
    const result = await new AnalysisOrchestrator({ config: config({ enabled: false }), maxIterations: 0 }).Execute();
    expect(result.success).toBe(true);
    expect(mocks.executeBounded).not.toHaveBeenCalled();
    expect(writtenFiles().some((p) => p.includes('data-quality'))).toBe(false);
  });

  it('keeps the run going when a probe statement throws', async () => {
    mocks.executeBounded.mockRejectedValueOnce(new Error('socket hang up'));
    const result = await new AnalysisOrchestrator({ config: config(), maxIterations: 0 }).Execute();
    expect(result.success).toBe(true);
  });
});
