import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVALUATION_PREFERENCES,
  EVALUATION_PREFS_SETTING_KEY,
  normalizeExecutionStatus,
  getDisplayStatus,
  calculateEvaluationMetrics,
  getQualityColor,
  getPrimaryDisplayValue,
  getNeedsReviewItems
} from '../lib/models/evaluation.types';
import type { TestRunWithFeedback, EvaluationPreferences } from '../lib/models/evaluation.types';

describe('DEFAULT_EVALUATION_PREFERENCES', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_EVALUATION_PREFERENCES.showExecution).toBe(true);
    expect(DEFAULT_EVALUATION_PREFERENCES.showHuman).toBe(true);
    expect(DEFAULT_EVALUATION_PREFERENCES.showAuto).toBe(false);
  });
});

describe('EVALUATION_PREFS_SETTING_KEY', () => {
  it('should be the correct key', () => {
    expect(EVALUATION_PREFS_SETTING_KEY).toBe('__mj.Testing.EvaluationPreferences');
  });
});

describe('normalizeExecutionStatus', () => {
  it('should normalize Passed to Completed', () => {
    expect(normalizeExecutionStatus('Passed')).toBe('Completed');
  });

  it('should normalize Failed to Completed', () => {
    expect(normalizeExecutionStatus('Failed')).toBe('Completed');
  });

  it('should keep Completed as Completed', () => {
    expect(normalizeExecutionStatus('Completed')).toBe('Completed');
  });

  it('should keep Error as Error', () => {
    expect(normalizeExecutionStatus('Error')).toBe('Error');
  });

  it('should keep Timeout as Timeout', () => {
    expect(normalizeExecutionStatus('Timeout')).toBe('Timeout');
  });

  it('should keep Running as Running', () => {
    expect(normalizeExecutionStatus('Running')).toBe('Running');
  });

  it('should keep Pending as Pending', () => {
    expect(normalizeExecutionStatus('Pending')).toBe('Pending');
  });

  it('should keep Skipped as Skipped', () => {
    expect(normalizeExecutionStatus('Skipped')).toBe('Skipped');
  });

  it('should default unknown statuses to Completed', () => {
    expect(normalizeExecutionStatus('Unknown')).toBe('Completed');
    expect(normalizeExecutionStatus('')).toBe('Completed');
  });
});

describe('getDisplayStatus', () => {
  it('should return the status as-is', () => {
    expect(getDisplayStatus('Passed')).toBe('Passed');
    expect(getDisplayStatus('Failed')).toBe('Failed');
    expect(getDisplayStatus('Completed')).toBe('Completed');
  });
});

function createMockRun(overrides: Partial<TestRunWithFeedback> = {}): TestRunWithFeedback {
  return {
    id: 'run-1',
    testId: 'test-1',
    testName: 'Test 1',
    executionStatus: 'Completed',
    originalStatus: 'Passed',
    duration: 1000,
    cost: 0.01,
    runDateTime: new Date(),
    autoScore: null,
    passedChecks: null,
    failedChecks: null,
    totalChecks: null,
    humanRating: null,
    humanIsCorrect: null,
    humanComments: null,
    hasHumanFeedback: false,
    feedbackId: null,
    tags: [],
    targetType: null,
    targetLogID: null,
    ...overrides
  };
}

describe('calculateEvaluationMetrics', () => {
  it('should return zero metrics for empty runs', () => {
    const metrics = calculateEvaluationMetrics([]);
    expect(metrics.totalRuns).toBe(0);
    expect(metrics.execCompletedCount).toBe(0);
    expect(metrics.humanReviewedCount).toBe(0);
    expect(metrics.autoEvaluatedCount).toBe(0);
  });

  it('should count execution statuses correctly', () => {
    const runs = [
      createMockRun({ executionStatus: 'Completed' }),
      createMockRun({ executionStatus: 'Completed' }),
      createMockRun({ executionStatus: 'Error' }),
      createMockRun({ executionStatus: 'Timeout' }),
      createMockRun({ executionStatus: 'Skipped' })
    ];
    const metrics = calculateEvaluationMetrics(runs);
    expect(metrics.totalRuns).toBe(5);
    expect(metrics.execCompletedCount).toBe(2);
    expect(metrics.execErrorCount).toBe(1);
    expect(metrics.execTimeoutCount).toBe(1);
    expect(metrics.execSkippedCount).toBe(1);
    expect(metrics.execSuccessRate).toBe(40);
  });

  it('should calculate human feedback metrics', () => {
    const runs = [
      createMockRun({ hasHumanFeedback: true, humanRating: 8, humanIsCorrect: true }),
      createMockRun({ hasHumanFeedback: true, humanRating: 6, humanIsCorrect: false }),
      createMockRun({ hasHumanFeedback: false })
    ];
    const metrics = calculateEvaluationMetrics(runs);
    expect(metrics.humanReviewedCount).toBe(2);
    expect(metrics.humanPendingCount).toBe(1);
    expect(metrics.humanAvgRating).toBe(7);
    expect(metrics.humanCorrectCount).toBe(1);
    expect(metrics.humanIncorrectCount).toBe(1);
    expect(metrics.humanCorrectRate).toBe(50);
  });

  it('should calculate auto score metrics', () => {
    const runs = [
      createMockRun({ autoScore: 0.9 }),
      createMockRun({ autoScore: 0.3 }),
      createMockRun({ autoScore: null })
    ];
    const metrics = calculateEvaluationMetrics(runs);
    expect(metrics.autoEvaluatedCount).toBe(2);
    expect(metrics.autoAvgScore).toBeCloseTo(0.6);
    expect(metrics.autoPassCount).toBe(1);
    expect(metrics.autoFailCount).toBe(1);
    expect(metrics.autoPassRate).toBe(50);
  });

  it('should calculate agreement metrics', () => {
    const runs = [
      createMockRun({ hasHumanFeedback: true, humanIsCorrect: true, autoScore: 0.9 }),
      createMockRun({ hasHumanFeedback: true, humanIsCorrect: false, autoScore: 0.8 }),
    ];
    const metrics = calculateEvaluationMetrics(runs);
    expect(metrics.agreementCount).toBe(1);
    expect(metrics.disagreementCount).toBe(1);
    expect(metrics.agreementRate).toBe(50);
  });
});

describe('getQualityColor', () => {
  const defaultPrefs: EvaluationPreferences = {
    showExecution: true,
    showHuman: true,
    showAuto: true
  };

  it('should prioritize human rating', () => {
    const run = createMockRun({ hasHumanFeedback: true, humanRating: 9 });
    expect(getQualityColor(run, defaultPrefs)).toBe('success');
  });

  it('should return warning for medium human rating', () => {
    const run = createMockRun({ hasHumanFeedback: true, humanRating: 6 });
    expect(getQualityColor(run, defaultPrefs)).toBe('warning');
  });

  it('should return danger for low human rating', () => {
    const run = createMockRun({ hasHumanFeedback: true, humanRating: 3 });
    expect(getQualityColor(run, defaultPrefs)).toBe('danger');
  });

  it('should fall back to auto score when no human feedback', () => {
    const run = createMockRun({ autoScore: 0.9 });
    expect(getQualityColor(run, defaultPrefs)).toBe('success');
  });

  it('should fall back to execution status when no scores', () => {
    const run = createMockRun({ executionStatus: 'Completed' });
    expect(getQualityColor(run, defaultPrefs)).toBe('success');
  });

  it('should return danger for error status', () => {
    const run = createMockRun({ executionStatus: 'Error' });
    expect(getQualityColor(run, defaultPrefs)).toBe('danger');
  });

  it('should return neutral when all prefs disabled', () => {
    const prefs: EvaluationPreferences = { showExecution: false, showHuman: false, showAuto: false };
    const run = createMockRun({ executionStatus: 'Error' });
    expect(getQualityColor(run, prefs)).toBe('neutral');
  });
});

describe('getPrimaryDisplayValue', () => {
  const defaultPrefs: EvaluationPreferences = {
    showExecution: true,
    showHuman: true,
    showAuto: true
  };

  it('should show human rating when available', () => {
    const run = createMockRun({ hasHumanFeedback: true, humanRating: 8 });
    const result = getPrimaryDisplayValue(run, defaultPrefs);
    expect(result.type).toBe('human');
    expect(result.value).toBe('8/10');
  });

  it('should show auto score when no human feedback', () => {
    const run = createMockRun({ autoScore: 0.75 });
    const result = getPrimaryDisplayValue(run, defaultPrefs);
    expect(result.type).toBe('auto');
    expect(result.value).toBe('75%');
  });

  it('should show execution status as fallback', () => {
    const run = createMockRun({ originalStatus: 'Passed' });
    const result = getPrimaryDisplayValue(run, defaultPrefs);
    expect(result.type).toBe('exec');
    expect(result.value).toBe('Passed');
  });

  it('should show none when all disabled', () => {
    const prefs: EvaluationPreferences = { showExecution: false, showHuman: false, showAuto: false };
    const run = createMockRun();
    const result = getPrimaryDisplayValue(run, prefs);
    expect(result.type).toBe('none');
  });
});

describe('getNeedsReviewItems', () => {
  it('should return empty for all reviewed runs', () => {
    const runs = [createMockRun({ hasHumanFeedback: true })];
    expect(getNeedsReviewItems(runs)).toHaveLength(0);
  });

  it('should prioritize error runs as high', () => {
    const runs = [createMockRun({ executionStatus: 'Error' })];
    const items = getNeedsReviewItems(runs);
    expect(items[0].priority).toBe('high');
    expect(items[0].reason).toBe('Error occurred');
  });

  it('should prioritize timeout runs as high', () => {
    const runs = [createMockRun({ executionStatus: 'Timeout' })];
    const items = getNeedsReviewItems(runs);
    expect(items[0].priority).toBe('high');
  });

  it('should prioritize low auto score but passed as high', () => {
    const runs = [createMockRun({ autoScore: 0.3, originalStatus: 'Passed' })];
    const items = getNeedsReviewItems(runs);
    expect(items[0].priority).toBe('high');
  });

  it('should sort by priority: high first', () => {
    const runs = [
      createMockRun({ id: '1', executionStatus: 'Completed', autoScore: null }),
      createMockRun({ id: '2', executionStatus: 'Error' }),
      createMockRun({ id: '3', autoScore: 0.7 })
    ];
    const items = getNeedsReviewItems(runs);
    expect(items[0].priority).toBe('high');
    expect(items[1].priority).toBe('medium');
    expect(items[2].priority).toBe('low');
  });
});
