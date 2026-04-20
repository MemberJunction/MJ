/**
 * Types for the dual evaluation system (Execution + Human + Automated)
 */

/**
 * User preferences for which evaluation metrics to display
 */
export interface EvaluationPreferences {
  /** Show execution status (Completed, Error, Timeout, etc.) */
  showExecution: boolean;
  /** Show human feedback ratings (1-10 scale) */
  showHuman: boolean;
  /** Show automated oracle scores (0-100%) */
  showAuto: boolean;
}

/**
 * Default evaluation preferences - execution and human enabled, auto disabled
 * (since oracles aren't in use yet)
 */
export const DEFAULT_EVALUATION_PREFERENCES: EvaluationPreferences = {
  showExecution: true,
  showHuman: true,
  showAuto: false
};

/**
 * User settings key for evaluation preferences
 */
export const EVALUATION_PREFS_SETTING_KEY = '__mj.Testing.EvaluationPreferences';

/**
 * Execution status values
 */
export type ExecutionStatus =
  | 'Completed'   // Successfully finished
  | 'Passed'      // Legacy - treat as Completed
  | 'Failed'      // Legacy - treat as Completed with issues
  | 'Error'       // Runtime error occurred
  | 'Timeout'     // Exceeded time limit
  | 'Running'     // Currently executing
  | 'Pending'     // Queued but not started
  | 'Skipped';    // Intentionally not run

/**
 * Normalize legacy status values to new semantic values
 */
export function normalizeExecutionStatus(status: string): ExecutionStatus {
  switch (status) {
    case 'Passed':
    case 'Failed':
    case 'Completed':
      return 'Completed';
    case 'Error':
      return 'Error';
    case 'Timeout':
      return 'Timeout';
    case 'Running':
      return 'Running';
    case 'Pending':
      return 'Pending';
    case 'Skipped':
      return 'Skipped';
    default:
      return 'Completed';
  }
}

/**
 * Get original status for display purposes (Passed/Failed distinction matters for legacy)
 */
export function getDisplayStatus(status: string): string {
  return status;
}

/**
 * Extended test run data with human feedback included
 */
export interface TestRunWithFeedback {
  // Identity
  id: string;
  testId: string;
  testName: string;

  // Execution metrics
  executionStatus: ExecutionStatus;
  originalStatus: string;  // Keep original for display
  duration: number;        // milliseconds
  cost: number;            // USD
  runDateTime: Date;

  // Automated evaluation (from oracles)
  autoScore: number | null;        // 0-1 scale, null if not evaluated
  passedChecks: number | null;
  failedChecks: number | null;
  totalChecks: number | null;

  // Human feedback
  humanRating: number | null;      // 1-10 scale, null if no feedback
  humanIsCorrect: boolean | null;  // null if no feedback
  humanComments: string | null;
  hasHumanFeedback: boolean;
  feedbackId: string | null;

  // Metadata
  tags: string[];
  targetType: string | null;
  targetLogID: string | null;
}

/**
 * Aggregated evaluation metrics for a set of test runs
 */
export interface EvaluationMetrics {
  // Overall counts
  totalRuns: number;

  // Execution-based metrics
  execCompletedCount: number;      // Runs that completed (Passed or Failed)
  execErrorCount: number;          // Runs with errors
  execTimeoutCount: number;        // Runs that timed out
  execSkippedCount: number;        // Runs that were skipped
  execSuccessRate: number;         // % completed without error/timeout

  // Human feedback metrics
  humanReviewedCount: number;      // Runs with any feedback
  humanPendingCount: number;       // Runs without feedback
  humanAvgRating: number;          // Average 1-10 rating (only reviewed)
  humanCorrectCount: number;       // Runs marked as correct
  humanIncorrectCount: number;     // Runs marked as incorrect
  humanCorrectRate: number;        // % of reviewed marked correct

  // Automated score metrics
  autoEvaluatedCount: number;      // Runs with auto scores
  autoAvgScore: number;            // Average 0-1 score (only evaluated)
  autoPassCount: number;           // Runs with score >= 0.8
  autoFailCount: number;           // Runs with score < 0.5
  autoPassRate: number;            // % of evaluated that pass threshold

  // Agreement metrics (when both human and auto exist)
  agreementCount: number;          // Both agree
  disagreementCount: number;       // Human and auto disagree
  agreementRate: number;           // % agreement
}

/**
 * Calculate aggregated evaluation metrics from test runs
 */
export function calculateEvaluationMetrics(runs: TestRunWithFeedback[]): EvaluationMetrics {
  const totalRuns = runs.length;

  if (totalRuns === 0) {
    return {
      totalRuns: 0,
      execCompletedCount: 0,
      execErrorCount: 0,
      execTimeoutCount: 0,
      execSkippedCount: 0,
      execSuccessRate: 0,
      humanReviewedCount: 0,
      humanPendingCount: 0,
      humanAvgRating: 0,
      humanCorrectCount: 0,
      humanIncorrectCount: 0,
      humanCorrectRate: 0,
      autoEvaluatedCount: 0,
      autoAvgScore: 0,
      autoPassCount: 0,
      autoFailCount: 0,
      autoPassRate: 0,
      agreementCount: 0,
      disagreementCount: 0,
      agreementRate: 0
    };
  }

  // Execution metrics
  const execCompleted = runs.filter(r => r.executionStatus === 'Completed');
  const execErrors = runs.filter(r => r.executionStatus === 'Error');
  const execTimeouts = runs.filter(r => r.executionStatus === 'Timeout');
  const execSkipped = runs.filter(r => r.executionStatus === 'Skipped');
  const execSuccessRate = totalRuns > 0 ? (execCompleted.length / totalRuns) * 100 : 0;

  // Human feedback metrics
  const reviewed = runs.filter(r => r.hasHumanFeedback);
  const pending = runs.filter(r => !r.hasHumanFeedback);
  const withRating = reviewed.filter(r => r.humanRating != null);
  const humanAvgRating = withRating.length > 0
    ? withRating.reduce((sum, r) => sum + (r.humanRating || 0), 0) / withRating.length
    : 0;
  const correct = reviewed.filter(r => r.humanIsCorrect === true);
  const incorrect = reviewed.filter(r => r.humanIsCorrect === false);
  const humanCorrectRate = reviewed.length > 0 ? (correct.length / reviewed.length) * 100 : 0;

  // Auto score metrics
  const evaluated = runs.filter(r => r.autoScore != null);
  const autoAvgScore = evaluated.length > 0
    ? evaluated.reduce((sum, r) => sum + (r.autoScore || 0), 0) / evaluated.length
    : 0;
  const autoPass = evaluated.filter(r => (r.autoScore || 0) >= 0.8);
  const autoFail = evaluated.filter(r => (r.autoScore || 0) < 0.5);
  const autoPassRate = evaluated.length > 0 ? (autoPass.length / evaluated.length) * 100 : 0;

  // Agreement metrics (runs with both human feedback and auto score)
  const bothEvaluated = runs.filter(r => r.hasHumanFeedback && r.autoScore != null && r.humanIsCorrect != null);
  let agreementCount = 0;
  let disagreementCount = 0;

  bothEvaluated.forEach(r => {
    const autoConsideredPass = (r.autoScore || 0) >= 0.5;
    const humanConsideredPass = r.humanIsCorrect === true;

    if (autoConsideredPass === humanConsideredPass) {
      agreementCount++;
    } else {
      disagreementCount++;
    }
  });

  const agreementRate = bothEvaluated.length > 0
    ? (agreementCount / bothEvaluated.length) * 100
    : 0;

  return {
    totalRuns,
    execCompletedCount: execCompleted.length,
    execErrorCount: execErrors.length,
    execTimeoutCount: execTimeouts.length,
    execSkippedCount: execSkipped.length,
    execSuccessRate,
    humanReviewedCount: reviewed.length,
    humanPendingCount: pending.length,
    humanAvgRating,
    humanCorrectCount: correct.length,
    humanIncorrectCount: incorrect.length,
    humanCorrectRate,
    autoEvaluatedCount: evaluated.length,
    autoAvgScore,
    autoPassCount: autoPass.length,
    autoFailCount: autoFail.length,
    autoPassRate,
    agreementCount,
    disagreementCount,
    agreementRate
  };
}

/**
 * Determine overall "quality" color based on available metrics and user preferences
 */
export function getQualityColor(
  run: TestRunWithFeedback,
  prefs: EvaluationPreferences
): 'success' | 'warning' | 'danger' | 'neutral' {
  // Priority: Human > Auto > Execution

  // Human rating (if enabled and available)
  if (prefs.showHuman && run.hasHumanFeedback && run.humanRating != null) {
    if (run.humanRating >= 8) return 'success';
    if (run.humanRating >= 5) return 'warning';
    return 'danger';
  }

  // Auto score (if enabled and available)
  if (prefs.showAuto && run.autoScore != null) {
    if (run.autoScore >= 0.8) return 'success';
    if (run.autoScore >= 0.5) return 'warning';
    return 'danger';
  }

  // Execution status (if enabled)
  if (prefs.showExecution) {
    if (run.executionStatus === 'Completed') return 'success';
    if (run.executionStatus === 'Running' || run.executionStatus === 'Pending') return 'neutral';
    if (run.executionStatus === 'Skipped') return 'neutral';
    return 'danger';  // Error, Timeout
  }

  return 'neutral';
}

/**
 * Get primary display value based on preferences
 */
export function getPrimaryDisplayValue(
  run: TestRunWithFeedback,
  prefs: EvaluationPreferences
): { type: 'human' | 'auto' | 'exec' | 'none'; value: string; } {
  // Priority: Human > Auto > Execution

  if (prefs.showHuman && run.hasHumanFeedback && run.humanRating != null) {
    return { type: 'human', value: `${run.humanRating}/10` };
  }

  if (prefs.showAuto && run.autoScore != null) {
    return { type: 'auto', value: `${Math.round(run.autoScore * 100)}%` };
  }

  if (prefs.showExecution) {
    return { type: 'exec', value: run.originalStatus };
  }

  return { type: 'none', value: '—' };
}

/**
 * Items needing review, sorted by priority
 */
export interface NeedsReviewItem {
  run: TestRunWithFeedback;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Get items that need review, prioritized
 */
export function getNeedsReviewItems(runs: TestRunWithFeedback[]): NeedsReviewItem[] {
  const items: NeedsReviewItem[] = [];

  runs.forEach(run => {
    if (!run.hasHumanFeedback) {
      // Check for potential issues
      let priority: 'high' | 'medium' | 'low' = 'low';
      let reason = 'No feedback yet';

      // High priority: Errors or timeouts
      if (run.executionStatus === 'Error' || run.executionStatus === 'Timeout') {
        priority = 'high';
        reason = run.executionStatus === 'Error' ? 'Error occurred' : 'Timed out';
      }
      // High priority: Low auto score but marked as passed
      else if (run.autoScore != null && run.autoScore < 0.5 && run.originalStatus === 'Passed') {
        priority = 'high';
        reason = `Low auto score (${Math.round(run.autoScore * 100)}%) but passed`;
      }
      // Medium priority: Has auto score to validate
      else if (run.autoScore != null) {
        priority = 'medium';
        reason = `Auto score: ${Math.round(run.autoScore * 100)}%`;
      }

      items.push({ run, priority, reason });
    }
  });

  // Sort by priority (high first)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return items;
}
