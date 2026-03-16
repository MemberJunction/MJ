import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigLoader } from '../utils/config-loader';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}));

import * as fs from 'fs/promises';
const mockedFs = vi.mocked(fs);

describe('ConfigLoader - applyDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should apply schema defaults when schemas section is missing', async () => {
    const configWithoutSchemas = {
      version: '1.0.0',
      database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pass' },
      ai: { provider: 'gemini', model: 'test', apiKey: 'key' },
      analysis: {
        cardinalityThreshold: 20,
        sampleSize: 10,
        includeStatistics: true,
        includePatternAnalysis: true,
        convergence: { maxIterations: 5, stabilityWindow: 2, confidenceThreshold: 0.85 },
        backpropagation: { enabled: true, maxDepth: 3 },
        sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true }
      },
      output: { stateFile: './s.json', sqlFile: './o.sql', markdownFile: './o.md' }
    };

    mockedFs.readFile.mockResolvedValue(JSON.stringify(configWithoutSchemas));

    const config = await ConfigLoader.load('/tmp/config.json');
    expect(config.schemas).toBeDefined();
    expect(config.schemas.exclude).toContain('sys');
    expect(config.schemas.exclude).toContain('INFORMATION_SCHEMA');
  });

  it('should apply tables defaults when tables section is missing', async () => {
    const configWithoutTables = {
      version: '1.0.0',
      database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pass' },
      ai: { provider: 'gemini', model: 'test', apiKey: 'key' },
      analysis: {
        cardinalityThreshold: 20,
        sampleSize: 10,
        includeStatistics: true,
        includePatternAnalysis: true,
        convergence: { maxIterations: 5, stabilityWindow: 2, confidenceThreshold: 0.85 },
        backpropagation: { enabled: true, maxDepth: 3 },
        sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true }
      },
      output: { stateFile: './s.json', sqlFile: './o.sql', markdownFile: './o.md' },
      schemas: { exclude: ['sys'] }
    };

    mockedFs.readFile.mockResolvedValue(JSON.stringify(configWithoutTables));

    const config = await ConfigLoader.load('/tmp/config.json');
    expect(config.tables).toBeDefined();
    expect(config.tables.exclude).toContain('sysdiagrams');
  });

  it('should apply convergence defaults when convergence is missing', async () => {
    const configWithoutConvergence = {
      version: '1.0.0',
      database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pass' },
      ai: { provider: 'gemini', model: 'test', apiKey: 'key' },
      analysis: {
        cardinalityThreshold: 20,
        sampleSize: 10,
        includeStatistics: true,
        includePatternAnalysis: true,
        backpropagation: { enabled: true, maxDepth: 3 },
        sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true }
      },
      output: { stateFile: './s.json', sqlFile: './o.sql', markdownFile: './o.md' },
      schemas: { exclude: ['sys'] },
      tables: { exclude: [] }
    };

    mockedFs.readFile.mockResolvedValue(JSON.stringify(configWithoutConvergence));

    const config = await ConfigLoader.load('/tmp/config.json');
    expect(config.analysis.convergence).toBeDefined();
    expect(config.analysis.convergence.maxIterations).toBe(10);
    expect(config.analysis.convergence.stabilityWindow).toBe(2);
    expect(config.analysis.convergence.confidenceThreshold).toBe(0.85);
  });

  it('should not override existing schemas config', async () => {
    const configWithSchemas = {
      version: '1.0.0',
      database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pass' },
      ai: { provider: 'gemini', model: 'test', apiKey: 'key' },
      analysis: {
        cardinalityThreshold: 20,
        sampleSize: 10,
        includeStatistics: true,
        includePatternAnalysis: true,
        convergence: { maxIterations: 5, stabilityWindow: 2, confidenceThreshold: 0.85 },
        backpropagation: { enabled: true, maxDepth: 3 },
        sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true }
      },
      output: { stateFile: './s.json', sqlFile: './o.sql', markdownFile: './o.md' },
      schemas: { include: ['my_schema'] },
      tables: { exclude: [] }
    };

    mockedFs.readFile.mockResolvedValue(JSON.stringify(configWithSchemas));

    const config = await ConfigLoader.load('/tmp/config.json');
    // Should preserve user's custom schemas config
    expect(config.schemas.include).toContain('my_schema');
  });

  it('should preserve groundTruth from config', async () => {
    const configWithGroundTruth = {
      version: '1.0.0',
      database: { server: 'localhost', database: 'TestDB', user: 'sa', password: 'pass' },
      ai: { provider: 'gemini', model: 'test', apiKey: 'key' },
      analysis: {
        cardinalityThreshold: 20,
        sampleSize: 10,
        includeStatistics: true,
        includePatternAnalysis: true,
        convergence: { maxIterations: 5, stabilityWindow: 2, confidenceThreshold: 0.85 },
        backpropagation: { enabled: true, maxDepth: 3 },
        sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true }
      },
      output: { stateFile: './s.json', sqlFile: './o.sql', markdownFile: './o.md' },
      schemas: { exclude: ['sys'] },
      tables: { exclude: [] },
      groundTruth: {
        databaseDescription: 'My database',
        tables: {
          'dbo.Users': { description: 'User accounts' }
        }
      },
      seedContext: {
        overallPurpose: 'E-commerce platform'
      }
    };

    mockedFs.readFile.mockResolvedValue(JSON.stringify(configWithGroundTruth));

    const config = await ConfigLoader.load('/tmp/config.json');
    expect(config.groundTruth).toBeDefined();
    expect(config.groundTruth!.databaseDescription).toBe('My database');
    expect(config.groundTruth!.tables!['dbo.Users'].description).toBe('User accounts');
    expect(config.seedContext!.overallPurpose).toBe('E-commerce platform');
  });
});
