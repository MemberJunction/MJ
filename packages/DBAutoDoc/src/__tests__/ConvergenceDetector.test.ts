import { describe, it, expect, beforeEach } from 'vitest';
import { ConvergenceDetector } from '../core/ConvergenceDetector';
import { ConvergenceConfig } from '../types/config';
import { DatabaseDocumentation, AnalysisRun } from '../types/state';
import { StateManager } from '../state/StateManager';
import { IterationTracker } from '../state/IterationTracker';

function createConfig(overrides: Partial<ConvergenceConfig> = {}): ConvergenceConfig {
  return {
    maxIterations: 10,
    stabilityWindow: 2,
    confidenceThreshold: 0.85,
    ...overrides
  };
}

function createMockRun(overrides: Partial<AnalysisRun> = {}): AnalysisRun {
  return {
    runId: 'run_001',
    startedAt: '2024-01-01T00:00:00Z',
    status: 'in_progress',
    levelsProcessed: 0,
    iterationsPerformed: 0,
    backpropagationCount: 0,
    sanityCheckCount: 0,
    converged: false,
    modelUsed: 'test',
    vendor: 'test',
    temperature: 0.1,
    totalTokensUsed: 0,
    estimatedCost: 0,
    warnings: [],
    errors: [],
    processingLog: [],
    sanityChecks: [],
    ...overrides
  };
}

function createMockState(): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '', lastModified: '', totalIterations: 0,
      totalPromptsRun: 0, totalInputTokens: 0, totalOutputTokens: 0,
      totalTokens: 0, estimatedCost: 0, totalSchemas: 0,
      totalTables: 0, totalColumns: 0
    },
    database: { name: 'TestDB', server: 'localhost', analyzedAt: '' },
    phases: { descriptionGeneration: [] },
    schemas: [
      {
        name: 'dbo',
        tables: [
          {
            name: 'Users',
            rowCount: 100,
            dependsOn: [],
            dependents: [],
            columns: [],
            descriptionIterations: [
              { description: 'Users', reasoning: '', generatedAt: '', modelUsed: '', confidence: 0.95 }
            ]
          },
          {
            name: 'Orders',
            rowCount: 500,
            dependsOn: [],
            dependents: [],
            columns: [],
            descriptionIterations: [
              { description: 'Orders', reasoning: '', generatedAt: '', modelUsed: '', confidence: 0.90 }
            ]
          }
        ],
        descriptionIterations: []
      }
    ]
  };
}

describe('ConvergenceDetector', () => {
  let detector: ConvergenceDetector;
  let stateManager: StateManager;
  let iterationTracker: IterationTracker;

  beforeEach(() => {
    stateManager = new StateManager('/tmp/test-state.json');
    iterationTracker = new IterationTracker();
  });

  describe('hasConverged', () => {
    it('should converge when max iterations reached', () => {
      detector = new ConvergenceDetector(createConfig({ maxIterations: 5 }), stateManager, iterationTracker);
      const state = createMockState();
      const run = createMockRun({ iterationsPerformed: 5 });

      const result = detector.hasConverged(state, run);

      expect(result.converged).toBe(true);
      expect(result.reason).toContain('maximum iteration limit');
    });

    it('should not converge when below max iterations and changes still occurring', () => {
      detector = new ConvergenceDetector(createConfig({ maxIterations: 10 }), stateManager, iterationTracker);
      const state = createMockState();
      const run = createMockRun({
        iterationsPerformed: 3,
        processingLog: [
          { timestamp: '', level: 0, schema: 'dbo', table: 'Users', action: 'analyze', result: 'changed' }
        ]
      });

      const result = detector.hasConverged(state, run);

      expect(result.converged).toBe(false);
    });

    it('should converge when stability + confidence both met after 2+ iterations', () => {
      detector = new ConvergenceDetector(createConfig({ stabilityWindow: 2, confidenceThreshold: 0.8 }), stateManager, iterationTracker);
      const state = createMockState();
      const run = createMockRun({
        iterationsPerformed: 3,
        processingLog: [
          // Only unchanged entries (no changes in recent window)
          { timestamp: '', level: 0, schema: 'dbo', table: 'Users', action: 'analyze', result: 'unchanged' },
          { timestamp: '', level: 0, schema: 'dbo', table: 'Orders', action: 'analyze', result: 'unchanged' }
        ]
      });

      const result = detector.hasConverged(state, run);

      expect(result.converged).toBe(true);
    });

    it('should not converge on first iteration', () => {
      detector = new ConvergenceDetector(createConfig(), stateManager, iterationTracker);
      const state = createMockState();
      const run = createMockRun({ iterationsPerformed: 1 });

      const result = detector.hasConverged(state, run);

      expect(result.converged).toBe(false);
      expect(result.suggestions).toBeDefined();
    });

    it('should provide suggestions when not converged', () => {
      detector = new ConvergenceDetector(createConfig({ confidenceThreshold: 0.99 }), stateManager, iterationTracker);
      const state = createMockState();
      // All tables below 0.99 confidence
      const run = createMockRun({ iterationsPerformed: 3 });

      const result = detector.hasConverged(state, run);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe('calculateAverageConfidence', () => {
    it('should calculate average across all tables', () => {
      detector = new ConvergenceDetector(createConfig(), stateManager, iterationTracker);
      const state = createMockState();
      // Tables have confidence 0.95 and 0.90

      const avg = detector.calculateAverageConfidence(state);

      expect(avg).toBeCloseTo(0.925);
    });

    it('should return 0 for state with no tables', () => {
      detector = new ConvergenceDetector(createConfig(), stateManager, iterationTracker);
      const state = createMockState();
      state.schemas = [];

      const avg = detector.calculateAverageConfidence(state);

      expect(avg).toBe(0);
    });

    it('should skip tables without confidence', () => {
      detector = new ConvergenceDetector(createConfig(), stateManager, iterationTracker);
      const state = createMockState();
      state.schemas[0].tables.push({
        name: 'NoConf',
        rowCount: 0,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: [{ description: 'X', reasoning: '', generatedAt: '', modelUsed: '' }]
      });

      const avg = detector.calculateAverageConfidence(state);

      // Only 2 tables have confidence values (0.95 and 0.90)
      expect(avg).toBeCloseTo(0.925);
    });

    it('should skip tables with no iterations', () => {
      detector = new ConvergenceDetector(createConfig(), stateManager, iterationTracker);
      const state = createMockState();
      state.schemas[0].tables.push({
        name: 'Empty',
        rowCount: 0,
        dependsOn: [],
        dependents: [],
        columns: [],
        descriptionIterations: []
      });

      const avg = detector.calculateAverageConfidence(state);
      expect(avg).toBeCloseTo(0.925);
    });
  });
});
