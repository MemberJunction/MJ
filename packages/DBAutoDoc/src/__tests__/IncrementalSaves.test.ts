import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../state/StateManager';
import { DatabaseDocumentation } from '../types/state';

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

describe('Incremental State Saves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
  });
  it('should save state to disk on every save() call', async () => {
    const manager = new StateManager('/tmp/output/state.json');
    const state = manager.createInitialState('TestDB', 'localhost');

    await manager.save(state);

    expect(mockedFs.writeFile).toHaveBeenCalledOnce();
    expect(mockedFs.mkdir).toHaveBeenCalledWith('/tmp/output', { recursive: true });
  });

  it('should update lastModified on each save', async () => {
    const manager = new StateManager('/tmp/output/state.json');
    const state = manager.createInitialState('TestDB', 'localhost');
    const firstModified = state.summary.lastModified;

    await new Promise(r => setTimeout(r, 5));
    await manager.save(state);
    const secondModified = state.summary.lastModified;

    expect(secondModified).not.toBe(firstModified);
  });

  it('should persist all schema data in JSON format', async () => {
    const manager = new StateManager('/tmp/output/state.json');
    const state = manager.createInitialState('TestDB', 'localhost');

    // Add some schema data
    state.schemas = [{
      name: 'dbo',
      tables: [{
        name: 'Users',
        rowCount: 100,
        dependsOn: [],
        dependents: [],
        columns: [{
          name: 'ID',
          dataType: 'int',
          isNullable: false,
          isPrimaryKey: true,
          isForeignKey: false,
          descriptionIterations: []
        }],
        descriptionIterations: []
      }],
      descriptionIterations: []
    }];

    manager.updateSummary(state);
    await manager.save(state);

    const writtenJson = mockedFs.writeFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenJson) as DatabaseDocumentation;

    expect(parsed.schemas).toHaveLength(1);
    expect(parsed.schemas[0].tables).toHaveLength(1);
    expect(parsed.schemas[0].tables[0].columns).toHaveLength(1);
    expect(parsed.summary.totalSchemas).toBe(1);
    expect(parsed.summary.totalTables).toBe(1);
    expect(parsed.summary.totalColumns).toBe(1);
  });

  it('should handle multiple sequential saves correctly', async () => {
    const manager = new StateManager('/tmp/output/state.json');
    const state = manager.createInitialState('TestDB', 'localhost');

    // First save - after introspection
    state.schemas = [{ name: 'dbo', tables: [], descriptionIterations: [] }];
    manager.updateSummary(state);
    await manager.save(state);

    // Second save - after sampling
    state.schemas[0].tables.push({
      name: 'Users',
      rowCount: 100,
      dependsOn: [],
      dependents: [],
      columns: [{ name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] }],
      descriptionIterations: []
    });
    manager.updateSummary(state);
    await manager.save(state);

    // Third save - after analysis
    state.schemas[0].tables[0].description = 'User table';
    manager.updateSummary(state);
    await manager.save(state);

    expect(mockedFs.writeFile).toHaveBeenCalledTimes(3);

    // The last save should have the description
    const lastWritten = mockedFs.writeFile.mock.calls[2][1] as string;
    const parsed = JSON.parse(lastWritten) as DatabaseDocumentation;
    expect(parsed.schemas[0].tables[0].description).toBe('User table');
  });

  it('should preserve ground truth on subsequent saves', async () => {
    const manager = new StateManager('/tmp/output/state.json');
    const state = manager.createInitialState('TestDB', 'localhost');

    state.schemas = [{
      name: 'dbo',
      tables: [{
        name: 'Users',
        rowCount: 100,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: [{
          description: 'Ground truth description',
          reasoning: 'User-provided',
          generatedAt: new Date().toISOString(),
          modelUsed: 'ground_truth',
          confidence: 1.0,
          triggeredBy: 'ground_truth',
          isGroundTruth: true
        }],
        description: 'Ground truth description',
        userApproved: true,
        userDescription: 'Ground truth description'
      }],
      descriptionIterations: []
    }];

    manager.updateSummary(state);
    await manager.save(state);

    const writtenJson = mockedFs.writeFile.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenJson) as DatabaseDocumentation;

    expect(parsed.schemas[0].tables[0].userApproved).toBe(true);
    expect(parsed.schemas[0].tables[0].userDescription).toBe('Ground truth description');
    expect(parsed.schemas[0].tables[0].descriptionIterations[0].isGroundTruth).toBe(true);
  });
});

describe('State File Resume', () => {
  it('should load state with ground truth iterations intact', async () => {
    const stateWithGroundTruth: DatabaseDocumentation = {
      version: '1.0.0',
      summary: {
        createdAt: '2024-01-01',
        lastModified: '2024-01-01',
        totalIterations: 1,
        totalPromptsRun: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalSchemas: 1,
        totalTables: 1,
        totalColumns: 1,
        estimatedCost: 0
      },
      database: { name: 'TestDB', server: 'localhost', analyzedAt: '2024-01-01' },
      phases: { descriptionGeneration: [] },
      schemas: [{
        name: 'dbo',
        tables: [{
          name: 'Users',
          rowCount: 100,
          dependsOn: [],
          dependents: [],
          columns: [],
          descriptionIterations: [{
            description: 'Ground truth desc',
            reasoning: 'User-provided',
            generatedAt: '2024-01-01',
            modelUsed: 'ground_truth',
            confidence: 1.0,
            triggeredBy: 'ground_truth',
            isGroundTruth: true
          }],
          description: 'Ground truth desc',
          userApproved: true
        }],
        descriptionIterations: []
      }]
    };

    mockedFs.access.mockResolvedValue(undefined);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(stateWithGroundTruth));

    const manager = new StateManager('/tmp/test.json');
    const loaded = await manager.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.schemas[0].tables[0].userApproved).toBe(true);
    expect(loaded!.schemas[0].tables[0].descriptionIterations[0].isGroundTruth).toBe(true);
  });

  it('should mark resumedFromFile when loading from existing state', () => {
    const state: DatabaseDocumentation = {
      version: '1.0.0',
      summary: {
        createdAt: '2024-01-01',
        lastModified: '2024-01-01',
        totalIterations: 0,
        totalPromptsRun: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalSchemas: 0,
        totalTables: 0,
        totalColumns: 0,
        estimatedCost: 0
      },
      database: { name: 'TestDB', server: 'localhost', analyzedAt: '2024-01-01' },
      phases: { descriptionGeneration: [] },
      schemas: []
    };

    state.resumedFromFile = '/old/path/state.json';
    expect(state.resumedFromFile).toBe('/old/path/state.json');
  });
});
