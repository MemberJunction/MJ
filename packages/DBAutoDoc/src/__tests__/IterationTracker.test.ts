import { describe, it, expect, beforeEach } from 'vitest';
import { IterationTracker } from '../state/IterationTracker';
import { DatabaseDocumentation, AnalysisRun } from '../types/state';

function createMockRun(): AnalysisRun {
  return {
    runId: 'run_001',
    startedAt: '2024-01-01T00:00:00Z',
    status: 'in_progress',
    levelsProcessed: 0,
    iterationsPerformed: 0,
    backpropagationCount: 0,
    sanityCheckCount: 0,
    converged: false,
    modelUsed: 'gemini-3-flash-preview',
    vendor: 'google',
    temperature: 0.1,
    totalTokensUsed: 0,
    estimatedCost: 0,
    warnings: [],
    errors: [],
    processingLog: [],
    sanityChecks: []
  };
}

function createMockState(run?: AnalysisRun): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2024-01-01T00:00:00Z',
      lastModified: '2024-01-01T00:00:00Z',
      totalIterations: 0,
      totalPromptsRun: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      totalSchemas: 0,
      totalTables: 0,
      totalColumns: 0
    },
    database: { name: 'TestDB', server: 'localhost', analyzedAt: '2024-01-01T00:00:00Z' },
    phases: {
      descriptionGeneration: run ? [run] : []
    },
    schemas: []
  };
}

describe('IterationTracker', () => {
  let tracker: IterationTracker;

  beforeEach(() => {
    tracker = new IterationTracker();
  });

  describe('getCurrentRun', () => {
    it('should return null when no runs exist', () => {
      const state = createMockState();
      expect(tracker.getCurrentRun(state)).toBeNull();
    });

    it('should return the latest run', () => {
      const run = createMockRun();
      const state = createMockState(run);
      expect(tracker.getCurrentRun(state)).toBe(run);
    });

    it('should return the last run when multiple exist', () => {
      const run1 = createMockRun();
      run1.runId = 'run_001';
      const run2 = createMockRun();
      run2.runId = 'run_002';
      const state = createMockState();
      state.phases.descriptionGeneration = [run1, run2];

      expect(tracker.getCurrentRun(state)).toBe(run2);
    });
  });

  describe('addLogEntry', () => {
    it('should add a processing log entry with timestamp', () => {
      const run = createMockRun();
      tracker.addLogEntry(run, {
        level: 0,
        schema: 'dbo',
        table: 'Users',
        action: 'analyze',
        result: 'success'
      });

      expect(run.processingLog).toHaveLength(1);
      expect(run.processingLog[0].schema).toBe('dbo');
      expect(run.processingLog[0].table).toBe('Users');
      expect(run.processingLog[0].timestamp).toBeDefined();
    });

    it('should append multiple log entries', () => {
      const run = createMockRun();
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'A', action: 'analyze', result: 'success' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'B', action: 'analyze', result: 'changed' });

      expect(run.processingLog).toHaveLength(2);
    });
  });

  describe('addLogEntryWithPrompt', () => {
    it('should add a log entry with prompt input/output', () => {
      const run = createMockRun();
      tracker.addLogEntryWithPrompt(
        run,
        { level: 0, schema: 'dbo', table: 'Users', action: 'analyze', result: 'success' },
        'Analyze this table',
        'This table stores users'
      );

      expect(run.processingLog[0].promptInput).toBe('Analyze this table');
      expect(run.processingLog[0].promptOutput).toBe('This table stores users');
    });

    it('should handle undefined prompt input/output', () => {
      const run = createMockRun();
      tracker.addLogEntryWithPrompt(
        run,
        { level: 0, schema: 'dbo', table: 'Users', action: 'analyze', result: 'success' },
        undefined,
        undefined
      );

      expect(run.processingLog[0].promptInput).toBeUndefined();
      expect(run.processingLog[0].promptOutput).toBeUndefined();
    });
  });

  describe('completeRun', () => {
    it('should mark run as converged', () => {
      const run = createMockRun();
      tracker.completeRun(run, true, 'Stability achieved');

      expect(run.status).toBe('converged');
      expect(run.converged).toBe(true);
      expect(run.convergenceReason).toBe('Stability achieved');
      expect(run.completedAt).toBeDefined();
    });

    it('should mark run as completed (not converged)', () => {
      const run = createMockRun();
      tracker.completeRun(run, false);

      expect(run.status).toBe('completed');
      expect(run.converged).toBe(false);
    });
  });

  describe('failRun', () => {
    it('should mark run as failed with error message', () => {
      const run = createMockRun();
      tracker.failRun(run, 'Something went wrong');

      expect(run.status).toBe('failed');
      expect(run.errors).toContain('Something went wrong');
      expect(run.completedAt).toBeDefined();
    });
  });

  describe('getRecentChanges', () => {
    it('should return only entries with result "changed"', () => {
      const run = createMockRun();
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'A', action: 'analyze', result: 'unchanged' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'B', action: 'analyze', result: 'changed' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'C', action: 'analyze', result: 'error' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'D', action: 'analyze', result: 'changed' });

      const changes = tracker.getRecentChanges(run);

      expect(changes).toHaveLength(2);
      expect(changes[0].table).toBe('B');
      expect(changes[1].table).toBe('D');
    });

    it('should limit results to specified count', () => {
      const run = createMockRun();
      for (let i = 0; i < 20; i++) {
        tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: `T${i}`, action: 'analyze', result: 'changed' });
      }

      const changes = tracker.getRecentChanges(run, 5);
      expect(changes).toHaveLength(5);
    });

    it('should return empty array when no changes exist', () => {
      const run = createMockRun();
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'A', action: 'analyze', result: 'unchanged' });

      const changes = tracker.getRecentChanges(run);
      expect(changes).toHaveLength(0);
    });
  });

  describe('hasRecentChanges', () => {
    it('should return false when no runs exist', () => {
      const state = createMockState();
      expect(tracker.hasRecentChanges(state, 3)).toBe(false);
    });

    it('should return true when recent changes exist', () => {
      const run = createMockRun();
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'A', action: 'analyze', result: 'changed' });

      const state = createMockState(run);
      expect(tracker.hasRecentChanges(state, 3)).toBe(true);
    });

    it('should return false when only unchanged entries exist', () => {
      const run = createMockRun();
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'A', action: 'analyze', result: 'unchanged' });

      const state = createMockState(run);
      expect(tracker.hasRecentChanges(state, 3)).toBe(false);
    });
  });

  describe('getIterationStats', () => {
    it('should count all result types correctly', () => {
      const run = createMockRun();
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'A', action: 'analyze', result: 'changed' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'B', action: 'analyze', result: 'unchanged' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'C', action: 'analyze', result: 'error' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'D', action: 'analyze', result: 'success' });
      tracker.addLogEntry(run, { level: 0, schema: 'dbo', table: 'E', action: 'analyze', result: 'changed' });

      const stats = tracker.getIterationStats(run);

      expect(stats.totalProcessed).toBe(5);
      expect(stats.changed).toBe(2);
      expect(stats.unchanged).toBe(1);
      expect(stats.errors).toBe(1);
    });

    it('should return zero counts for empty log', () => {
      const run = createMockRun();
      const stats = tracker.getIterationStats(run);

      expect(stats.totalProcessed).toBe(0);
      expect(stats.changed).toBe(0);
      expect(stats.unchanged).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('addTokenUsage', () => {
    it('should accumulate token usage', () => {
      const run = createMockRun();
      tracker.addTokenUsage(run, 500, 0.01);
      tracker.addTokenUsage(run, 300, 0.005);

      expect(run.totalTokensUsed).toBe(800);
      expect(run.estimatedCost).toBeCloseTo(0.015);
    });

    it('should work without cost parameter', () => {
      const run = createMockRun();
      tracker.addTokenUsage(run, 500);

      expect(run.totalTokensUsed).toBe(500);
      expect(run.estimatedCost).toBe(0);
    });
  });

  describe('incrementIteration', () => {
    it('should increment both run and state iteration counts', () => {
      const run = createMockRun();
      const state = createMockState(run);

      tracker.incrementIteration(state, run);

      expect(run.iterationsPerformed).toBe(1);
      expect(state.summary.totalIterations).toBe(1);
    });
  });

  describe('incrementBackpropagation', () => {
    it('should increment backpropagation count', () => {
      const run = createMockRun();
      tracker.incrementBackpropagation(run);
      tracker.incrementBackpropagation(run);

      expect(run.backpropagationCount).toBe(2);
    });
  });

  describe('addWarning and addError', () => {
    it('should add warnings to run', () => {
      const run = createMockRun();
      tracker.addWarning(run, 'Low confidence');

      expect(run.warnings).toContain('Low confidence');
    });

    it('should add errors to run', () => {
      const run = createMockRun();
      tracker.addError(run, 'Connection lost');

      expect(run.errors).toContain('Connection lost');
    });
  });
});
