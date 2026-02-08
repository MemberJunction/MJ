import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GuardrailsManager, PhaseType, GuardrailCheckResult } from '../core/GuardrailsManager';
import { AnalysisRun } from '../types/state';
import { GuardrailsConfig } from '../types/config';

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

describe('GuardrailsManager', () => {
  describe('constructor and defaults', () => {
    it('should create with default empty config', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();
      const result = gm.checkGuardrails(run);

      expect(result.canContinue).toBe(true);
    });

    it('should accept config parameter', () => {
      const config: GuardrailsConfig = { maxTokensPerRun: 10000 };
      const gm = new GuardrailsManager(config);
      const run = createMockRun();
      const result = gm.checkGuardrails(run);

      expect(result.canContinue).toBe(true);
    });
  });

  describe('checkGuardrails - disabled', () => {
    it('should allow continuation when guardrails are disabled', () => {
      const gm = new GuardrailsManager({ enabled: false });
      const run = createMockRun({ totalTokensUsed: 999999 });

      const result = gm.checkGuardrails(run);
      expect(result.canContinue).toBe(true);
    });
  });

  describe('checkGuardrails - token limits', () => {
    it('should stop when maxTokensPerRun is exceeded', () => {
      const gm = new GuardrailsManager({ maxTokensPerRun: 1000 });
      const run = createMockRun({ totalTokensUsed: 1500 });

      const result = gm.checkGuardrails(run);

      expect(result.canContinue).toBe(false);
      expect(result.reason).toContain('Token limit exceeded');
      expect(result.exceedances).toBeDefined();
      expect(result.exceedances![0].type).toBe('tokens_per_run');
    });

    it('should allow when tokens are under limit', () => {
      const gm = new GuardrailsManager({ maxTokensPerRun: 10000 });
      const run = createMockRun({ totalTokensUsed: 500 });

      const result = gm.checkGuardrails(run);
      expect(result.canContinue).toBe(true);
    });

    it('should warn when approaching token limit', () => {
      const gm = new GuardrailsManager({
        maxTokensPerRun: 1000,
        warnThresholds: { tokenPercentage: 80 }
      });
      const run = createMockRun({ totalTokensUsed: 850 });

      const result = gm.checkGuardrails(run);

      expect(result.canContinue).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.type === 'tokens_per_run')).toBe(true);
    });
  });

  describe('checkGuardrails - cost limits', () => {
    it('should stop when maxCostDollars is exceeded', () => {
      const gm = new GuardrailsManager({ maxCostDollars: 1.0 });
      const run = createMockRun({ estimatedCost: 1.5 });

      const result = gm.checkGuardrails(run);

      expect(result.canContinue).toBe(false);
      expect(result.reason).toContain('Cost limit exceeded');
    });

    it('should warn when approaching cost limit', () => {
      const gm = new GuardrailsManager({
        maxCostDollars: 1.0,
        warnThresholds: { costPercentage: 80 }
      });
      const run = createMockRun({ estimatedCost: 0.85 });

      const result = gm.checkGuardrails(run);

      expect(result.canContinue).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.type === 'cost')).toBe(true);
    });
  });

  describe('checkGuardrails - duration limits', () => {
    it('should stop when maxDurationSeconds is exceeded', () => {
      const now = Date.now();
      // Mock Date.now to simulate elapsed time: constructor gets 'now', checkGuardrails gets 'now + 5s'
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)       // constructor startTime
        .mockReturnValueOnce(now + 5000); // checkGuardrails elapsed check

      const gm = new GuardrailsManager({ maxDurationSeconds: 1 });
      const run = createMockRun();
      const result = gm.checkGuardrails(run);

      expect(result.canContinue).toBe(false);
      expect(result.reason).toContain('Duration limit exceeded');

      vi.restoreAllMocks();
    });
  });

  describe('phase tracking', () => {
    it('should start and end a phase', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();

      gm.startPhase('analysis');
      gm.endPhase(run, 'analysis');

      expect(run.phaseMetrics).toBeDefined();
      expect(run.phaseMetrics!.analysis).toBeDefined();
      expect(run.phaseMetrics!.analysis!.startedAt).toBeDefined();
      expect(run.phaseMetrics!.analysis!.completedAt).toBeDefined();
    });

    it('should track discovery phase', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();

      gm.startPhase('discovery');
      gm.endPhase(run, 'discovery');

      expect(run.phaseMetrics!.discovery).toBeDefined();
    });

    it('should track sanityChecks phase', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();

      gm.startPhase('sanityChecks');
      gm.endPhase(run, 'sanityChecks');

      expect(run.phaseMetrics!.sanityChecks).toBeDefined();
    });
  });

  describe('iteration tracking', () => {
    it('should start and end an iteration', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();

      gm.startIteration(1);
      gm.endIteration(run, 1);

      expect(run.iterationMetrics).toBeDefined();
      expect(run.iterationMetrics).toHaveLength(1);
      expect(run.iterationMetrics![0].iterationNumber).toBe(1);
      expect(run.iterationMetrics![0].duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('recordEnforcement', () => {
    it('should record exceedances in run', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();

      const result: GuardrailCheckResult = {
        canContinue: false,
        reason: 'Token limit exceeded',
        exceedances: [
          { type: 'tokens_per_run', limit: 1000, actual: 1500, unit: 'tokens' }
        ]
      };

      gm.recordEnforcement(run, result);

      expect(run.guardrailsEnforced).toBeDefined();
      expect(run.guardrailsEnforced!.stoppedDueToGuardrails).toBe(true);
      expect(run.guardrailsEnforced!.exceedances).toHaveLength(1);
    });

    it('should record warnings in run', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();

      const result: GuardrailCheckResult = {
        canContinue: true,
        warnings: [
          { type: 'tokens_per_run', percentage: 85, message: 'Approaching limit' }
        ]
      };

      gm.recordEnforcement(run, result);

      expect(run.guardrailsEnforced).toBeDefined();
      expect(run.guardrailsEnforced!.warnings).toHaveLength(1);
    });

    it('should not record when no warnings or exceedances', () => {
      const gm = new GuardrailsManager();
      const run = createMockRun();

      const result: GuardrailCheckResult = {
        canContinue: true
      };

      gm.recordEnforcement(run, result);

      expect(run.guardrailsEnforced).toBeUndefined();
    });
  });

  describe('getElapsedSeconds', () => {
    it('should return elapsed time', () => {
      const gm = new GuardrailsManager();
      const elapsed = gm.getElapsedSeconds();

      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(5);
    });
  });

  describe('getPhaseTokenBudgetRemaining', () => {
    it('should return undefined when no phase limits configured', () => {
      const gm = new GuardrailsManager();
      expect(gm.getPhaseTokenBudgetRemaining('analysis')).toBeUndefined();
    });

    it('should return limit when phase limits are configured', () => {
      const gm = new GuardrailsManager({
        maxTokensPerPhase: { analysis: 5000 }
      });

      expect(gm.getPhaseTokenBudgetRemaining('analysis')).toBe(5000);
    });

    it('should return undefined for unconfigured phase', () => {
      const gm = new GuardrailsManager({
        maxTokensPerPhase: { analysis: 5000 }
      });

      expect(gm.getPhaseTokenBudgetRemaining('discovery')).toBeUndefined();
    });
  });
});
