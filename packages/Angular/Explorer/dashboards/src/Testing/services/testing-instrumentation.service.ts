import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, combineLatest } from 'rxjs';
import { map, switchMap, shareReplay, tap } from 'rxjs/operators';
import { RunView, RunQuery, Metadata, IMetadataProvider, IRunQueryProvider, LogError, type AggregateExpression, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { MJTestRunFeedbackEntity } from '@memberjunction/core-entities';
import { TestEngineBase } from '@memberjunction/testing-engine-base';
import type { TestingTimeRange } from '../testing-agent-context';
import { IsRunQueryProvider } from '../../AI/services/ai-instrumentation.service';
import { TestRunTotals } from './test-run-totals';
import { TestingListBoundInfo, type TestingListBounds } from './testing-list-bound';
import { TestingPassRate } from './testing-pass-rate';

export interface TestingDashboardKPIs {
  TotalTestsActive: number;
  PassRateThisMonth: number;
  TotalCostThisMonth: number;
  AverageDuration: number;
  TestsPendingReview: number;
  TotalTestRuns: number;
  FailedTests: number;
  SkippedTests: number;
  PassRateTrend: number; // Percentage change from previous period
}

export interface TestRunSummary {
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  testId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  testName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  suiteName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  testType: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Timeout';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  score: number; // 0-1.0000 — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  duration: number; // milliseconds — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  cost: number; // USD — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  runDateTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  targetType: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  targetLogID: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  // Execution context (machine / CI / run-by) — present for runs persisted with this metadata.
  machineName?: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  machineID?: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  runByUserName?: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  runByUserEmail?: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  runContextDetails?: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface SuiteHierarchyNode {
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  parentID: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  level: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  children: SuiteHierarchyNode[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  testCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Runs of the suite's member tests in the period. 0 means there is no pass rate to show (passRate is then 0). */
  RunCount: number;
  /** Skipped runs among RunCount; passRate covers only the executed ones (RunCount − SkippedCount). */
  SkippedCount: number;
  passRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalCost: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  averageScore: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  expanded?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface VersionMetrics {
  version: string; // GitCommit + AgentVersion combination — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  gitCommit: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  agentVersion: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  runDate: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalTests: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Skipped tests across the version's suite runs; not part of the pass rate's denominator. */
  SkippedTests: number;
  passRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  averageScore: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalCost: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  averageDuration: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  newFailures: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  newPasses: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface TestTrendData {
  timestamp: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalRuns: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  passed: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  failed: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  skipped: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  errors: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  averageScore: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalCost: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  averageDuration: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface FeedbackPending {
  testRunID: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  testName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  automatedScore: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  automatedStatus: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  runDateTime: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  reason: 'no-feedback' | 'high-score-failed' | 'low-score-passed';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface TestAnalytics {
  topFailingTests: Array<{ testName: string; failureCount: number; failureRate: number }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  mostExpensiveTests: Array<{ testName: string; totalCost: number; avgCost: number }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  slowestTests: Array<{ testName: string; avgDuration: number; maxDuration: number }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  costByType: Array<{ testType: string; totalCost: number; testCount: number }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  costBySuite: Array<{ suiteName: string; totalCost: number; testCount: number }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  passingRateByType: Array<{ testType: string; passRate: number; totalTests: number; Skipped: number }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Why the analytics could not load (the rankings are then empty); absent when they loaded. */
  LoadError?: string;
}

export interface FeedbackStats {
  TotalFeedback: number;
  ReviewedCount: number;
  AvgRating: number;
  AgreementRate: number;
  DisagreementRate: number;
  AccuracyRate: number;
}

/**
 * Extended test run summary with human feedback data included
 */
export interface TestRunWithFeedbackSummary extends TestRunSummary {
  // Human feedback
  humanRating: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  humanIsCorrect: boolean | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  humanComments: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  hasHumanFeedback: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  feedbackId: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  // Checks (from automated evaluation)
  passedChecks: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  failedChecks: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalChecks: number | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Aggregated evaluation metrics
 */
export interface EvaluationSummaryMetrics {
  totalRuns: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  // Execution
  execCompletedCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  execErrorCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  execSuccessRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  // Human
  humanReviewedCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  humanPendingCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  humanAvgRating: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  humanCorrectRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  // Auto
  autoEvaluatedCount: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  autoAvgScore: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  autoPassRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  // Agreement
  agreementRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

// Simple result types for optimized queries (only fields needed for display)
interface TestRunSimple {
  ID: string;
  TestID: string;
  Test: string;
  Status: string;
  Score: number;
  CostUSD: number;
  StartedAt: Date;
  CompletedAt: Date | null;
  TargetType: string;
  TargetLogID: string;
}

interface TestSuiteRunSimple {
  ID: string;
  TestSuiteID: string;
  TotalTests: number;
  PassedTests: number;
  TotalCostUSD: number;
  StartedAt: Date;
  GitCommit: string;
  AgentVersion: string;
}

interface TestRunFeedbackSimple {
  ID: string;
  TestRunID: string;
  Rating: number;
  IsCorrect: boolean;
  Comments: string;
  CreatedAt: Date;
}

/**
 * A filter intent published by the AI agent (via the Testing dashboard's client
 * tools) for the Runs surface to apply. Both fields are optional — only the
 * provided ones are applied. This decouples the agent-actionable Runs filters
 * from any specific component instance: the agent sets an intent on this shared
 * root service, and the (possibly not-yet-mounted) Runs component consumes it.
 */
export interface RunsFilterIntent {
  status?: 'all' | 'running' | 'passed' | 'failed' | 'error';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  searchText?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * A run-selection intent published by the AI agent (via the Testing dashboard's
 * `SelectTestRun` client tool) for the Runs surface to act on. The Runs component
 * owns the actual `SelectedRun` UI state (per the data-down/events-up Angular
 * convention), so the agent publishes the target run ID here and the (possibly
 * not-yet-mounted) Runs component consumes it when it mounts / when it changes.
 *
 * `open` distinguishes "open the detail panel for this run" (select) from
 * "open the run's record in the entity workspace" — both are read-only,
 * navigational affordances (no test execution side effects).
 */
export interface RunSelectionIntent {
  /** Target test-run ID to select (and optionally open). */
  runId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** When true, also open the run's record in the entity workspace. */
  open?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Monotonic nonce so re-selecting the SAME run id still replays the intent. */
  nonce: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** The run aggregates one Overview read needs, by alias. */
interface RunAggregateValues {
  [alias: string]: number;
}

@Injectable({
  providedIn: 'root'
})
export class TestingInstrumentationService {
  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>(
    TestingInstrumentationService.WindowForRange('month', new Date()) // Last 30 days
  );

  /**
   * The named range the window follows, or null for an explicit start/end. A named range is ROLLING: every
   * load re-resolves it against the current time (see {@link currentWindow}). The service is a root singleton,
   * so a window frozen at construction would leave every run started after the app loaded out of the Overview
   * — Refresh included — until someone picked a range.
   */
  private _rollingRange: TestingTimeRange | null = 'month';

  /**
   * Agent-driven filter intents for the Runs surface. Published by the Testing
   * dashboard's client tools; consumed by the Runs component. Starts as null
   * (no pending intent).
   */
  private readonly _runsFilterIntent$ = new BehaviorSubject<RunsFilterIntent | null>(null);

  /** Observable of agent-driven Runs filter intents. */
  readonly RunsFilterIntent$ = this._runsFilterIntent$.asObservable();

  /** @deprecated Use {@link RunsFilterIntent$}. */
  get runsFilterIntent$() {
    return this.RunsFilterIntent$;
  }

  /** Publish an agent-driven filter intent for the Runs surface to apply. */
  SetRunsFilterIntent(intent: RunsFilterIntent): void {
    this._runsFilterIntent$.next(intent);
  }

  /** @deprecated Use {@link SetRunsFilterIntent}. */
  setRunsFilterIntent(intent: RunsFilterIntent): void {
    return this.SetRunsFilterIntent(intent);
  }

  /**
   * Agent-driven run-SELECTION intents for the Runs surface. Published by the
   * Testing dashboard's `SelectTestRun` / open-run client tools; consumed by the
   * Runs component (which owns the actual {@link TestRunWithFeedbackSummary}
   * `SelectedRun` UI state). Starts as null (no pending intent). A monotonic
   * nonce on each intent lets the Runs component replay the SAME run id again
   * (re-select / re-open) even though the BehaviorSubject would otherwise
   * de-duplicate identical references.
   */
  private readonly _runSelectionIntent$ = new BehaviorSubject<RunSelectionIntent | null>(null);

  /** Observable of agent-driven run-selection intents. */
  readonly RunSelectionIntent$ = this._runSelectionIntent$.asObservable();

  /** @deprecated Use {@link RunSelectionIntent$}. */
  get runSelectionIntent$() {
    return this.RunSelectionIntent$;
  }

  /** Monotonic source for {@link RunSelectionIntent.nonce}. */
  private _runSelectionNonce = 0;

  /**
   * Publish an agent-driven run-selection intent for the Runs surface to act on.
   * Assigns the next monotonic nonce so re-selecting the same run id still
   * replays. Returns the published intent (with its assigned nonce).
   */
  SetRunSelectionIntent(runId: string, open: boolean = false): RunSelectionIntent {
    const intent: RunSelectionIntent = { runId, open, nonce: ++this._runSelectionNonce };
    this._runSelectionIntent$.next(intent);
    return intent;
  }

  /** @deprecated Use {@link SetRunSelectionIntent}. */
  setRunSelectionIntent(runId: string, open: boolean = false): RunSelectionIntent {
    return this.SetRunSelectionIntent(runId, open);
  }

  private readonly _suiteFilter$ = new BehaviorSubject<string | null>(null);
  private readonly _testTypeFilter$ = new BehaviorSubject<string | null>(null);
  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);
  private readonly _listBounds$ = new BehaviorSubject<TestingListBounds>(TestingListBoundInfo.EmptyBounds());

  /**
   * How much of each capped list its latest load returned against the exact match count, so a surface can say
   * "Showing the newest 1,000 of N" instead of letting a list disagree silently with an exact KPI.
   */
  readonly ListBounds$ = this._listBounds$.asObservable();

  /** Records one list's bound from its load. */
  private setListBound(list: keyof TestingListBounds, shown: number, totalRowCount: number | null | undefined): void {
    this._listBounds$.next({ ...this._listBounds$.value, [list]: TestingListBoundInfo.FromCounts(shown, totalRowCount) });
  }
  private _provider: IMetadataProvider | null = null;

  /** Set the metadata provider this service should use. Components should call this after injection. */
  public set Provider(value: IMetadataProvider | null) {
      this._provider = value;
  }

  public get Provider(): IMetadataProvider {
      return this._provider ?? Metadata.Provider;
  }

  private get metadata(): IMetadataProvider {
    return this.Provider;
  }

  // Expose observables
  readonly IsLoading$ = this._isLoading$.asObservable();

  /** @deprecated Use {@link IsLoading$}. */
  get isLoading$() {
    return this.IsLoading$;
  }
  readonly DateRange$ = this._dateRange$.asObservable();

  /** @deprecated Use {@link DateRange$}. */
  get dateRange$() {
    return this.DateRange$;
  }

  constructor() {}

  // Main data streams
  readonly Kpis$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadKPIs())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link Kpis$}. */
  get kpis$() {
    return this.Kpis$;
  }

  readonly TestRuns$ = combineLatest([
    this._refreshTrigger$,
    this._dateRange$,
    this._suiteFilter$,
    this._testTypeFilter$
  ]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadTestRuns())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link TestRuns$}. */
  get testRuns$() {
    return this.TestRuns$;
  }

  readonly SuiteHierarchy$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadSuiteHierarchy())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link SuiteHierarchy$}. */
  get suiteHierarchy$() {
    return this.SuiteHierarchy$;
  }

  readonly Trends$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadTrends())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link Trends$}. */
  get trends$() {
    return this.Trends$;
  }

  readonly Analytics$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadAnalytics())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link Analytics$}. */
  get analytics$() {
    return this.Analytics$;
  }

  readonly PendingFeedback$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadPendingFeedback())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link PendingFeedback$}. */
  get pendingFeedback$() {
    return this.PendingFeedback$;
  }

  readonly FeedbackStats$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadFeedbackStats())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link FeedbackStats$}. */
  get feedbackStats$() {
    return this.FeedbackStats$;
  }

  /**
   * Test runs with feedback data joined - for evaluation display
   */
  readonly TestRunsWithFeedback$ = combineLatest([
    this._refreshTrigger$,
    this._dateRange$,
    this._suiteFilter$,
    this._testTypeFilter$
  ]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadTestRunsWithFeedback())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /** @deprecated Use {@link TestRunsWithFeedback$}. */
  get testRunsWithFeedback$() {
    return this.TestRunsWithFeedback$;
  }

  /**
   * Aggregated evaluation metrics from test runs with feedback
   */
  readonly EvaluationMetrics$ = this.TestRunsWithFeedback$.pipe(
    map(runs => this.calculateEvaluationMetrics(runs)),
    shareReplay(1)
  );

  /** @deprecated Use {@link EvaluationMetrics$}. */
  get evaluationMetrics$() {
    return this.EvaluationMetrics$;
  }

  private checkLoadingComplete(): void {
    setTimeout(() => {
      this._isLoading$.next(false);
    }, 100);
  }

  SetDateRange(start: Date, end: Date): void {
    this._rollingRange = null;
    this._dateRange$.next({ start, end });
  }

  /** @deprecated Use {@link SetDateRange}. */
  setDateRange(start: Date, end: Date): void {
    return this.SetDateRange(start, end);
  }

  /**
   * Set the active date range from a named time range. Centralizes the
   * range-to-dates computation so both the Runs surface UI and the agent's
   * `FilterTestsByTimeRange` tool resolve identical windows.
   */
  SetDateRangeByName(range: TestingTimeRange): void {
    this._rollingRange = range;
    this._dateRange$.next(TestingInstrumentationService.WindowForRange(range, new Date()));
  }

  /** The window a named range covers, ending at `now`. */
  public static WindowForRange(range: TestingTimeRange, now: Date): { start: Date; end: Date } {
    let start: Date;
    switch (range) {
      case 'today':
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '90days':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }
    return { start, end: new Date(now) };
  }

  /** The window a load reads: a named range re-resolved against the current time, or the explicit range. */
  private currentWindow(): { start: Date; end: Date } {
    return this._rollingRange ? TestingInstrumentationService.WindowForRange(this._rollingRange, new Date()) : this._dateRange$.value;
  }

  /** @deprecated Use {@link SetDateRangeByName}. */
  setDateRangeByName(range: TestingTimeRange): void {
    return this.SetDateRangeByName(range);
  }

  SetSuiteFilter(suiteId: string | null): void {
    this._suiteFilter$.next(suiteId);
  }

  /** @deprecated Use {@link SetSuiteFilter}. */
  setSuiteFilter(suiteId: string | null): void {
    return this.SetSuiteFilter(suiteId);
  }

  SetTestTypeFilter(typeId: string | null): void {
    this._testTypeFilter$.next(typeId);
  }

  /** @deprecated Use {@link SetTestTypeFilter}. */
  setTestTypeFilter(typeId: string | null): void {
    return this.SetTestTypeFilter(typeId);
  }

  /**
   * Reloads every stream. Under a rolling named range the window is re-resolved to end now and emitted on
   * {@link DateRange$} (every stream reloads on a window change, so the trigger is not bumped as well —
   * that would load twice). A filter change between refreshes reloads with {@link currentWindow}, which also
   * resolves the rolling range against the current time, while {@link DateRange$} keeps the last emitted
   * window until the next Refresh or range change.
   */
  Refresh(): void {
    if (this._rollingRange) {
      this._dateRange$.next(TestingInstrumentationService.WindowForRange(this._rollingRange, new Date()));
    } else {
      this._refreshTrigger$.next(this._refreshTrigger$.value + 1);
    }
  }

  /** @deprecated Use {@link Refresh}. */
  refresh(): void {
    return this.Refresh();
  }

  /**
   * The aggregates the Overview reads over the runs in a window. Aggregates cover EVERY row the filter
   * matches; a plain row read is capped at the entity's UserViewMaxRows (1000 for Test Runs) and ordered by
   * primary key, so totals computed from rows were an arbitrary sample once a window held more runs than that.
   */
  private static readonly RUN_AGGREGATES: AggregateExpression[] = [
    { expression: 'COUNT(*)', alias: 'Runs' },
    { expression: "SUM(CASE WHEN Status = 'Passed' THEN 1 ELSE 0 END)", alias: 'Passed' },
    { expression: "SUM(CASE WHEN Status = 'Failed' THEN 1 ELSE 0 END)", alias: 'Failed' },
    { expression: "SUM(CASE WHEN Status = 'Skipped' THEN 1 ELSE 0 END)", alias: 'Skipped' },
    { expression: "SUM(CASE WHEN Status = 'Error' THEN 1 ELSE 0 END)", alias: 'Errors' },
    { expression: 'SUM(CostUSD)', alias: 'Cost' },
    // A run without a score counts as 0, as the row-based averages did.
    { expression: 'AVG(COALESCE(Score, 0))', alias: 'AverageScore' },
    // NULL for a run that has not completed, which AVG skips — the average covers completed runs only.
    // Seconds × 1000: DATEDIFF returns int, and in milliseconds it overflows (failing the whole aggregate
    // query) past ~24.8 days; DATEDIFF_BIG is not on the aggregate allowlist.
    { expression: 'AVG(DATEDIFF(second, StartedAt, CompletedAt) * 1000.0)', alias: 'AverageDurationMs' },
  ];

  /**
   * Aggregates over `MJ: Test Run Feedbacks` for the review stats. A feedback without a rating counts as 0, as
   * the row-based average did; IsCorrect is a bit.
   */
  private static readonly FEEDBACK_AGGREGATES: AggregateExpression[] = [
    { expression: 'COUNT(*)', alias: 'Feedback' },
    { expression: 'AVG(CAST(COALESCE(Rating, 0) AS FLOAT))', alias: 'AverageRating' },
    { expression: 'SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END)', alias: 'Correct' },
    { expression: 'SUM(CASE WHEN IsCorrect = 0 THEN 1 ELSE 0 END)', alias: 'Incorrect' },
  ];

  /**
   * The most rows a row-listing read of the window returns (the Runs, review-queue and evaluation lists). The
   * lists show the newest runs first, so the bound keeps the newest; totals never come from these reads.
   */
  private static readonly LIST_MAX_ROWS = 1000;

  /**
   * The most feedback rows the evaluation list reads per listed run. Feedback is read only for the listed runs
   * (at most {@link LIST_MAX_ROWS}), so the read is bounded by LIST_MAX_ROWS × this; a run with more feedback
   * than that is logged (TotalRowCount above the rows returned).
   */
  private static readonly FEEDBACK_PER_RUN_BOUND = 5;

  /** The Test Runs filter for runs started inside a window. */
  private static windowFilter(start: Date, end: Date): string {
    return `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`;
  }

  /**
   * A Test Runs read that returns only {@link RUN_AGGREGATES} over the filter (one row is the least a view
   * read returns; it is ignored).
   */
  private static aggregateRunsParams(extraFilter: string): RunViewParams {
    // No CacheLocal on window reads: a rolling window puts a new timestamp in every filter, so a cached entry
    // could never be hit again and would only fill the local cache.
    return {
      EntityName: 'MJ: Test Runs',
      ExtraFilter: extraFilter,
      Fields: ['ID'],
      MaxRows: 1,
      Aggregates: TestingInstrumentationService.RUN_AGGREGATES,
      ResultType: 'simple'
    };
  }

  /**
   * Reads a result's aggregates into numbers by alias (NULL, e.g. a SUM over no rows, reads as 0). A failed
   * read or a refused aggregate is logged with its message and reads as 0, so one bad figure does not blank
   * the whole Overview.
   */
  /** A count_only result's count; a failed read is logged with its message and reads as 0, like {@link aggregateValues}. */
  private static countValue(result: RunViewResult, label: string): number {
    if (!result.Success) {
      LogError(`Testing Overview: ${label} failed: ${result.ErrorMessage}`);
      return 0;
    }
    return result.TotalRowCount || 0;
  }

  private static aggregateValues(result: RunViewResult): RunAggregateValues {
    const values: RunAggregateValues = {};
    if (!result.Success) {
      LogError(`Testing Overview: run aggregates failed: ${result.ErrorMessage}`);
    }
    for (const agg of result.AggregateResults || []) {
      if (agg.error) {
        LogError(`Testing Overview: aggregate ${agg.alias} failed: ${agg.error}`);
      }
      values[agg.alias] = Number(agg.value) || 0;
    }
    return values;
  }

  private async loadKPIs(): Promise<TestingDashboardKPIs> {
    const { start, end } = this.currentWindow();
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Get Tests from TestEngineBase cache instead of querying DB
    const engine = TestEngineBase.Instance;
    const activeTests = engine.Tests.filter(t => t.Status === 'Active');

    // The previous period of equal length, for the pass-rate trend.
    const periodDuration = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - periodDuration);
    const windowFilter = TestingInstrumentationService.windowFilter(start, end);

    const [currentResult, previousResult, pendingResult] = await rv.RunViews([
      TestingInstrumentationService.aggregateRunsParams(windowFilter),
      TestingInstrumentationService.aggregateRunsParams(`StartedAt >= '${previousStart.toISOString()}' AND StartedAt < '${start.toISOString()}'`),
      this.pendingReviewCountParams(windowFilter)
    ]);
    const current = TestingInstrumentationService.aggregateValues(currentResult);
    const previous = TestingInstrumentationService.aggregateValues(previousResult);

    const totalTestRuns = current['Runs'] || 0;
    // Skipped runs were not executed: neither passes nor failures (ruling QF2-Y2).
    const passRateThisMonth = TestingPassRate.OfExecuted(current['Passed'] || 0, totalTestRuns, current['Skipped'] || 0);
    const previousPassRate = TestingPassRate.OfExecuted(previous['Passed'] || 0, previous['Runs'] || 0, previous['Skipped'] || 0);
    const passRateTrend = previousPassRate > 0 ? passRateThisMonth - previousPassRate : 0;

    return {
      TotalTestsActive: activeTests.length,
      PassRateThisMonth: passRateThisMonth,
      TotalCostThisMonth: current['Cost'] || 0,
      AverageDuration: current['AverageDurationMs'] || 0,
      TestsPendingReview: TestingInstrumentationService.countValue(pendingResult, 'pending review count'),
      TotalTestRuns: totalTestRuns,
      FailedTests: current['Failed'] || 0,
      SkippedTests: current['Skipped'] || 0,
      PassRateTrend: passRateTrend
    };
  }

  /**
   * Counts the window's runs that have no feedback yet. A count, not a row read: the window can hold more
   * runs than a row read returns, and their IDs would otherwise have to travel back as an IN list.
   */
  private pendingReviewCountParams(windowFilter: string): RunViewParams {
    return {
      EntityName: 'MJ: Test Runs',
      ExtraFilter: `${windowFilter} AND ${this.feedbackPredicate(false)}`,
      ResultType: 'count_only'
    };
  }

  /** `[schema].[base view]` of an entity, from metadata — for the subqueries in the run filters. */
  private baseViewOf(entityName: string): string {
    const entity = this.Provider.EntityByName(entityName);
    if (!entity) {
      throw new Error(`Entity '${entityName}' not found in metadata`);
    }
    return `[${entity.SchemaName}].[${entity.BaseView}]`;
  }

  /** Test Runs predicate: the run has (or has no) feedback. */
  private feedbackPredicate(hasFeedback: boolean): string {
    return `ID ${hasFeedback ? 'IN' : 'NOT IN'} (SELECT TestRunID FROM ${this.baseViewOf('MJ: Test Run Feedbacks')} WHERE TestRunID IS NOT NULL)`;
  }

  /** The Test Runs filter for the window plus the suite and test-type filters the Runs surfaces apply. */
  private filteredRunsFilter(start: Date, end: Date): string {
    let filter = TestingInstrumentationService.windowFilter(start, end);
    const suiteFilter = this._suiteFilter$.value;
    if (suiteFilter) {
      filter += ` AND TestID IN (SELECT TestID FROM ${this.baseViewOf('MJ: Test Suite Tests')} WHERE SuiteID = '${suiteFilter}')`;
    }
    const typeFilter = this._testTypeFilter$.value;
    if (typeFilter) {
      filter += ` AND TestID IN (SELECT ID FROM ${this.baseViewOf('MJ: Tests')} WHERE TypeID = '${typeFilter}')`;
    }
    return filter;
  }

  private async loadTestRuns(): Promise<TestRunSummary[]> {
    const { start, end } = this.currentWindow();
    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView<TestRunSimple>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: this.filteredRunsFilter(start, end),
      OrderBy: 'StartedAt DESC',
      MaxRows: TestingInstrumentationService.LIST_MAX_ROWS,
      Fields: ['ID', 'TestID', 'Test', 'Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt', 'TargetType', 'TargetLogID'],
      ResultType: 'simple'
    });

    const testRuns = result.Results || [];
    this.setListBound('Runs', testRuns.length, result.TotalRowCount);

    return testRuns.map(run => {
      const startedAt = run.StartedAt instanceof Date ? run.StartedAt : new Date(run.StartedAt);
      const completedAt = run.CompletedAt
        ? (run.CompletedAt instanceof Date ? run.CompletedAt : new Date(run.CompletedAt))
        : null;

      return {
        id: run.ID,
        testId: run.TestID || '',
        testName: run.Test || 'Unknown Test',
        suiteName: '', // Will be populated from join
        testType: run.Test || 'Unknown',
        status: run.Status as 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running',
        score: run.Score || 0,
        duration: completedAt && startedAt
          ? completedAt.getTime() - startedAt.getTime()
          : (startedAt ? Date.now() - startedAt.getTime() : 0),
        cost: run.CostUSD || 0,
        runDateTime: startedAt,
        targetType: run.TargetType || '',
        targetLogID: run.TargetLogID || ''
      };
    });
  }

  private async loadSuiteHierarchy(): Promise<SuiteHierarchyNode[]> {
    const { start, end } = this.currentWindow();
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Suites and their member tests come from the TestEngineBase cache (MJ: Test Suite Tests).
    const engine = TestEngineBase.Instance;
    const suites = engine.TestSuites.filter(s => s.Status === 'Active');
    const memberIDs = new Map<string, string[]>(suites.map(suite => [suite.ID, engine.GetTestsForSuite(suite.ID).map(t => t.ID)]));

    // One aggregate read per suite that has members, all in one round trip: runs of the suite's tests in the window.
    const windowFilter = TestingInstrumentationService.windowFilter(start, end);
    const suitesWithMembers = suites.filter(suite => (memberIDs.get(suite.ID) || []).length > 0);
    const results = suitesWithMembers.length > 0
      ? await rv.RunViews(suitesWithMembers.map(suite => {
          const inList = (memberIDs.get(suite.ID) || []).map(id => `'${id}'`).join(',');
          return TestingInstrumentationService.aggregateRunsParams(`${windowFilter} AND TestID IN (${inList})`);
        }))
      : [];
    const metricsBySuite = new Map<string, RunAggregateValues>(
      suitesWithMembers.map((suite, i) => [suite.ID, TestingInstrumentationService.aggregateValues(results[i])])
    );

    const nodes: SuiteHierarchyNode[] = suites.map(suite => {
      const metrics = metricsBySuite.get(suite.ID) || {};
      const runs = metrics['Runs'] || 0;
      return {
        id: suite.ID,
        name: suite.Name,
        parentID: suite.ParentID || null,
        level: 0,
        children: [],
        testCount: (memberIDs.get(suite.ID) || []).length,
        RunCount: runs,
        SkippedCount: metrics['Skipped'] || 0,
        passRate: TestingPassRate.OfExecuted(metrics['Passed'] || 0, runs, metrics['Skipped'] || 0),
        totalCost: metrics['Cost'] || 0,
        averageScore: metrics['AverageScore'] || 0,
        expanded: false
      };
    });

    // Build tree structure
    const rootNodes: SuiteHierarchyNode[] = [];
    const nodeMap = new Map<string, SuiteHierarchyNode>();

    nodes.forEach(node => nodeMap.set(node.id, node));

    nodes.forEach(node => {
      if (node.parentID) {
        const parent = nodeMap.get(node.parentID);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
        } else {
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  }

  private async loadTrends(): Promise<TestTrendData[]> {
    const { start, end } = this.currentWindow();
    const bucketSize = this.getBucketSize(start, end);
    const buckets = this.createTimeBuckets(start, end);
    if (buckets.length === 0) return [];

    // One aggregate read per bucket, all in one round trip. Bounded by the bucket count, which getBucketSize
    // keeps small (hourly up to a day, 4-hourly up to a week, daily up to 30 days, weekly beyond — ≤ 42 for
    // the named ranges, 53 for a year).
    const rv = RunView.FromMetadataProvider(this.Provider);
    const results = await rv.RunViews(buckets.map(bucketStart => {
      const bucketEnd = new Date(bucketStart.getTime() + bucketSize);
      return TestingInstrumentationService.aggregateRunsParams(
        `StartedAt >= '${bucketStart.toISOString()}' AND StartedAt < '${bucketEnd.toISOString()}' AND StartedAt <= '${end.toISOString()}'`
      );
    }));

    return buckets.map((bucketStart, i) => {
      const values = TestingInstrumentationService.aggregateValues(results[i]);
      return {
        timestamp: bucketStart,
        totalRuns: values['Runs'] || 0,
        passed: values['Passed'] || 0,
        failed: values['Failed'] || 0,
        skipped: values['Skipped'] || 0,
        errors: values['Errors'] || 0,
        averageScore: values['AverageScore'] || 0,
        totalCost: values['Cost'] || 0,
        averageDuration: values['AverageDurationMs'] || 0
      };
    });
  }

  /** The provider as a query runner; MJ's providers implement both interfaces (see {@link IsRunQueryProvider}). */
  private get runQueryProvider(): IRunQueryProvider {
    const provider = this.Provider;
    if (!IsRunQueryProvider(provider)) {
      throw new Error('TestingInstrumentationService: the configured MetadataProvider cannot run queries');
    }
    return provider;
  }

  /**
   * Per-test totals come from the `TestRunTotalsByTest` query, which groups on the server: one row per test that
   * ran in the window, so the read is bounded by the number of tests, not runs. The rankings (top 10) and the
   * by-type roll-ups are computed from those rows.
   */
  private async loadAnalytics(): Promise<TestAnalytics> {
    const { start, end } = this.currentWindow();
    const result = await new RunQuery(this.runQueryProvider).RunQuery({
      QueryName: 'TestRunTotalsByTest',
      CategoryPath: '/MJ/',
      Parameters: { start: start.toISOString(), end: end.toISOString() }
    });
    if (!result.Success) {
      LogError(`Testing analytics: TestRunTotalsByTest failed: ${result.ErrorMessage}`);
      return { ...TestRunTotals.ToAnalytics([]), LoadError: result.ErrorMessage || 'The TestRunTotalsByTest query failed.' };
    }
    return TestRunTotals.ToAnalytics(TestRunTotals.FromQueryRows(result.Results));
  }

  /**
   * The review queue: the window's newest runs with no feedback, plus the newest reviewed runs whose automated
   * result disagrees with their score. Both are bounded run reads ({@link LIST_MAX_ROWS} each, newest first);
   * the feedback test runs on the server (an IN / NOT IN subquery), so no feedback rows are read.
   */
  private async loadPendingFeedback(): Promise<FeedbackPending[]> {
    const { start, end } = this.currentWindow();
    const rv = RunView.FromMetadataProvider(this.Provider);
    const windowFilter = TestingInstrumentationService.windowFilter(start, end);

    type FeedbackTestRun = {ID: string; Test: string; Score: number; Status: string; StartedAt: string | Date};
    const listParams = (extraFilter: string): RunViewParams => ({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: extraFilter,
      Fields: ['ID', 'Test', 'Score', 'Status', 'StartedAt'],
      OrderBy: 'StartedAt DESC',
      MaxRows: TestingInstrumentationService.LIST_MAX_ROWS,
      ResultType: 'simple'
    });
    const discrepancy = "((Status = 'Failed' AND Score >= 0.8) OR (Status = 'Passed' AND Score < 0.5))";

    const [unreviewedResult, discrepantResult] = await rv.RunViews([
      listParams(`${windowFilter} AND ${this.feedbackPredicate(false)}`),
      listParams(`${windowFilter} AND ${this.feedbackPredicate(true)} AND ${discrepancy}`)
    ]);

    const toPending = (run: FeedbackTestRun, reason: FeedbackPending['reason']): FeedbackPending => ({
      testRunID: run.ID,
      testName: run.Test || 'Unknown',
      automatedScore: run.Score || 0,
      automatedStatus: run.Status,
      runDateTime: run.StartedAt instanceof Date ? run.StartedAt : new Date(run.StartedAt),
      reason
    });

    const unreviewed = (unreviewedResult.Results || []) as FeedbackTestRun[];
    const discrepant = (discrepantResult.Results || []) as FeedbackTestRun[];
    this.setListBound('PendingUnreviewed', unreviewed.length, unreviewedResult.TotalRowCount);
    this.setListBound('PendingDiscrepant', discrepant.length, discrepantResult.TotalRowCount);
    const pending: FeedbackPending[] = [
      ...unreviewed.map(run => toPending(run, 'no-feedback')),
      ...discrepant.map(run => toPending(run, run.Status === 'Failed' ? 'high-score-failed' : 'low-score-passed'))
    ];
    return pending.sort((a, b) => b.runDateTime.getTime() - a.runDateTime.getTime());
  }

  /** Review stats from aggregates over the window's feedback — every feedback row, not a capped sample. */
  private async loadFeedbackStats(): Promise<FeedbackStats> {
    const { start, end } = this.currentWindow();
    const rv = RunView.FromMetadataProvider(this.Provider);
    const result = await rv.RunView({
      EntityName: 'MJ: Test Run Feedbacks',
      ExtraFilter: `CreatedAt >= '${start.toISOString()}' AND CreatedAt <= '${end.toISOString()}'`,
      Fields: ['ID'],
      MaxRows: 1,
      Aggregates: TestingInstrumentationService.FEEDBACK_AGGREGATES,
      ResultType: 'simple'
    });
    const values = TestingInstrumentationService.aggregateValues(result);
    const totalFeedback = values['Feedback'] || 0;

    if (totalFeedback === 0) {
      return {
        TotalFeedback: 0,
        ReviewedCount: 0,
        AvgRating: 0,
        AgreementRate: 0,
        DisagreementRate: 0,
        AccuracyRate: 0
      };
    }

    const agreementRate = ((values['Correct'] || 0) / totalFeedback) * 100;
    return {
      TotalFeedback: totalFeedback,
      ReviewedCount: totalFeedback, // All feedbacks in this query are reviewed
      AvgRating: values['AverageRating'] || 0,
      AgreementRate: agreementRate,
      DisagreementRate: ((values['Incorrect'] || 0) / totalFeedback) * 100,
      // Accuracy rate is the same as agreement rate (% of times human agreed with automated result)
      AccuracyRate: agreementRate
    };
  }

  async SubmitFeedback(testRunID: string, rating: number, isCorrect: boolean, comments: string): Promise<boolean> {
    try {
      const feedback = await this.metadata.GetEntityObject<MJTestRunFeedbackEntity>('MJ: Test Run Feedbacks');
      feedback.TestRunID = testRunID;
      feedback.Rating = rating;
      feedback.IsCorrect = isCorrect;
      feedback.Comments = comments;

      const result = await feedback.Save();
      if (result) {
        this.Refresh(); // Refresh data after submission
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error submitting feedback:', error);
      return false;
    }
  }

  /** @deprecated Use {@link SubmitFeedback}. */
  async submitFeedback(testRunID: string, rating: number, isCorrect: boolean, comments: string): Promise<boolean> {
    return this.SubmitFeedback(testRunID, rating, isCorrect, comments);
  }

  async GetVersionMetrics(): Promise<VersionMetrics[]> {
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Use simple result type with only needed fields
    type VersionRun = {TotalTests: number; PassedTests: number; SkippedTests: number; TotalCostUSD: number; StartedAt: string | Date; GitCommit: string; AgentVersion: string};
    const result = await rv.RunView<VersionRun>({
      EntityName: 'MJ: Test Suite Runs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      MaxRows: 100,
      Fields: ['TotalTests', 'PassedTests', 'SkippedTests', 'TotalCostUSD', 'StartedAt', 'GitCommit', 'AgentVersion'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const suiteRuns = result.Results || [];

    // Group by version combination
    const versionMap = new Map<string, VersionRun[]>();

    suiteRuns.forEach(run => {
      const key = `${run.GitCommit || 'unknown'}_${run.AgentVersion || 'unknown'}`;
      if (!versionMap.has(key)) {
        versionMap.set(key, []);
      }
      versionMap.get(key)!.push(run);
    });

    const metrics: VersionMetrics[] = Array.from(versionMap.entries()).map(([key, runs]) => {
      const [gitCommit, agentVersion] = key.split('_');
      const latest = runs[0];

      const totalTests = runs.reduce((sum, r) => sum + (r.TotalTests || 0), 0);
      const totalPassed = runs.reduce((sum, r) => sum + (r.PassedTests || 0), 0);
      const totalSkipped = runs.reduce((sum, r) => sum + (r.SkippedTests || 0), 0);
      const totalCost = runs.reduce((sum, r) => sum + (r.TotalCostUSD || 0), 0);

      const runDate = latest.StartedAt instanceof Date ? latest.StartedAt : new Date(latest.StartedAt);

      return {
        version: `${gitCommit.substring(0, 7)} / ${agentVersion}`,
        gitCommit,
        agentVersion,
        runDate,
        totalTests,
        SkippedTests: totalSkipped,
        passRate: TestingPassRate.OfExecuted(totalPassed, totalTests, totalSkipped),
        averageScore: 0, // Would need to calculate from test runs
        totalCost,
        averageDuration: 0, // Would need to calculate from test runs
        newFailures: 0, // Would need comparison
        newPasses: 0 // Would need comparison
      };
    });

    return metrics.sort((a, b) => b.runDate.getTime() - a.runDate.getTime());
  }

  /** @deprecated Use {@link GetVersionMetrics}. */
  async getVersionMetrics(): Promise<VersionMetrics[]> {
    return this.GetVersionMetrics();
  }

  private createTimeBuckets(start: Date, end: Date): Date[] {
    const buckets: Date[] = [];
    const bucketSize = this.getBucketSize(start, end);
    const current = new Date(start);

    while (current < end) {
      buckets.push(new Date(current));
      current.setTime(current.getTime() + bucketSize);
    }

    return buckets;
  }

  private getBucketSize(start: Date, end: Date): number {
    const duration = end.getTime() - start.getTime();
    const days = duration / (1000 * 60 * 60 * 24);

    if (days <= 1) {
      return 60 * 60 * 1000; // 1 hour
    } else if (days <= 7) {
      return 4 * 60 * 60 * 1000; // 4 hours
    } else if (days <= 30) {
      return 24 * 60 * 60 * 1000; // 1 day
    } else {
      return 7 * 24 * 60 * 60 * 1000; // 1 week
    }
  }

  /**
   * Load test runs with feedback data joined for evaluation display
   */
  private async loadTestRunsWithFeedback(): Promise<TestRunWithFeedbackSummary[]> {
    const { start, end } = this.currentWindow();
    const rv = RunView.FromMetadataProvider(this.Provider);

    // Load test runs with additional fields for evaluation
    type MJTestRunExtended = {
      ID: string;
      TestID: string;
      Test: string;
      Status: string;
      Score: number;
      CostUSD: number;
      StartedAt: Date;
      CompletedAt: Date | null;
      TargetType: string;
      TargetLogID: string;
      PassedChecks: number | null;
      FailedChecks: number | null;
      TotalChecks: number | null;
      MachineName: string | null;
      MachineID: string | null;
      RunByUserName: string | null;
      RunByUserEmail: string | null;
      RunContextDetails: string | null;
    };

    const testRunsResult = await rv.RunView<MJTestRunExtended>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: this.filteredRunsFilter(start, end),
      OrderBy: 'StartedAt DESC',
      MaxRows: TestingInstrumentationService.LIST_MAX_ROWS,
      Fields: ['ID', 'TestID', 'Test', 'Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt', 'TargetType', 'TargetLogID', 'PassedChecks', 'FailedChecks', 'TotalChecks', 'MachineName', 'MachineID', 'RunByUserName', 'RunByUserEmail', 'RunContextDetails'],
      ResultType: 'simple'
    });
    const testRuns = testRunsResult.Results || [];
    this.setListBound('RunsWithFeedback', testRuns.length, testRunsResult.TotalRowCount);
    const feedbacks = await this.loadFeedbackForRuns(testRuns.map(r => r.ID));

    // Feedback is read newest first; the map keeps each run's first (newest) row.
    const feedbackMap = new Map<string, TestRunFeedbackSimple>();
    feedbacks.forEach(f => {
      if (!feedbackMap.has(f.TestRunID)) {
        feedbackMap.set(f.TestRunID, f);
      }
    });

    // Map test runs with feedback
    return testRuns.map(run => {
      const startedAt = run.StartedAt instanceof Date ? run.StartedAt : new Date(run.StartedAt);
      const completedAt = run.CompletedAt
        ? (run.CompletedAt instanceof Date ? run.CompletedAt : new Date(run.CompletedAt))
        : null;

      const feedback = feedbackMap.get(run.ID);

      return {
        id: run.ID,
        testId: run.TestID || '',
        testName: run.Test || 'Unknown Test',
        suiteName: '',
        testType: run.Test || 'Unknown',
        status: run.Status as 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Timeout',
        score: run.Score || 0,
        duration: completedAt && startedAt
          ? completedAt.getTime() - startedAt.getTime()
          : (startedAt ? Date.now() - startedAt.getTime() : 0),
        cost: run.CostUSD || 0,
        runDateTime: startedAt,
        targetType: run.TargetType || '',
        targetLogID: run.TargetLogID || '',
        // Checks
        passedChecks: run.PassedChecks,
        failedChecks: run.FailedChecks,
        totalChecks: run.TotalChecks,
        // Human feedback
        humanRating: feedback?.Rating ?? null,
        humanIsCorrect: feedback?.IsCorrect ?? null,
        humanComments: feedback?.Comments ?? null,
        hasHumanFeedback: !!feedback,
        feedbackId: feedback?.ID ?? null,
        // Execution context
        machineName: run.MachineName,
        machineID: run.MachineID,
        runByUserName: run.RunByUserName,
        runByUserEmail: run.RunByUserEmail,
        runContextDetails: run.RunContextDetails
      };
    });
  }

  /**
   * The feedback rows of the listed runs, newest first. Bounded: only the given runs (at most
   * {@link LIST_MAX_ROWS}) and at most {@link FEEDBACK_PER_RUN_BOUND} rows per run on average; when the runs hold
   * more feedback than that, the oldest rows are not read and the overflow is logged.
   */
  private async loadFeedbackForRuns(runIDs: string[]): Promise<TestRunFeedbackSimple[]> {
    if (runIDs.length === 0) return [];
    const maxRows = runIDs.length * TestingInstrumentationService.FEEDBACK_PER_RUN_BOUND;
    const result = await RunView.FromMetadataProvider(this.Provider).RunView<TestRunFeedbackSimple>({
      EntityName: 'MJ: Test Run Feedbacks',
      ExtraFilter: `TestRunID IN (${runIDs.map(id => `'${id}'`).join(',')})`,
      Fields: ['ID', 'TestRunID', 'Rating', 'IsCorrect', 'Comments'],
      OrderBy: 'CreatedAt DESC',
      MaxRows: maxRows,
      ResultType: 'simple'
    });
    if (!result.Success) {
      LogError(`Testing evaluation: feedback read failed: ${result.ErrorMessage}`);
      return [];
    }
    if ((result.TotalRowCount || 0) > result.Results.length) {
      LogError(`Testing evaluation: ${result.TotalRowCount} feedback rows for ${runIDs.length} runs exceed the ${maxRows}-row bound; the oldest were not read.`);
    }
    return result.Results;
  }

  /**
   * Calculate aggregated evaluation metrics from test runs with feedback
   */
  private calculateEvaluationMetrics(runs: TestRunWithFeedbackSummary[]): EvaluationSummaryMetrics {
    const totalRuns = runs.length;

    if (totalRuns === 0) {
      return {
        totalRuns: 0,
        execCompletedCount: 0,
        execErrorCount: 0,
        execSuccessRate: 0,
        humanReviewedCount: 0,
        humanPendingCount: 0,
        humanAvgRating: 0,
        humanCorrectRate: 0,
        autoEvaluatedCount: 0,
        autoAvgScore: 0,
        autoPassRate: 0,
        agreementRate: 0
      };
    }

    // Execution metrics
    const execCompleted = runs.filter(r =>
      r.status === 'Passed' || r.status === 'Failed'
    );
    const execErrors = runs.filter(r =>
      r.status === 'Error' || r.status === 'Timeout'
    );
    // Skipped runs were not executed, so they are out of the success rate's denominator (QF2-Y2).
    const skippedRuns = runs.filter(r => r.status === 'Skipped').length;
    const execSuccessRate = TestingPassRate.ShareOfExecuted(execCompleted.length, totalRuns, skippedRuns);

    // Human feedback metrics
    const reviewed = runs.filter(r => r.hasHumanFeedback);
    const pending = runs.filter(r => !r.hasHumanFeedback);
    const withRating = reviewed.filter(r => r.humanRating != null);
    const humanAvgRating = withRating.length > 0
      ? withRating.reduce((sum, r) => sum + (r.humanRating || 0), 0) / withRating.length
      : 0;
    const correct = reviewed.filter(r => r.humanIsCorrect === true);
    const humanCorrectRate = reviewed.length > 0 ? (correct.length / reviewed.length) * 100 : 0;

    // Auto score metrics
    const evaluated = runs.filter(r => r.score > 0);
    const autoAvgScore = evaluated.length > 0
      ? evaluated.reduce((sum, r) => sum + r.score, 0) / evaluated.length
      : 0;
    const autoPass = evaluated.filter(r => r.score >= 0.8);
    const autoPassRate = evaluated.length > 0 ? (autoPass.length / evaluated.length) * 100 : 0;

    // Agreement metrics
    const bothEvaluated = runs.filter(r =>
      r.hasHumanFeedback && r.score > 0 && r.humanIsCorrect != null
    );
    let agreementCount = 0;

    bothEvaluated.forEach(r => {
      const autoConsideredPass = r.score >= 0.5;
      const humanConsideredPass = r.humanIsCorrect === true;

      if (autoConsideredPass === humanConsideredPass) {
        agreementCount++;
      }
    });

    const agreementRate = bothEvaluated.length > 0
      ? (agreementCount / bothEvaluated.length) * 100
      : 0;

    return {
      totalRuns,
      execCompletedCount: execCompleted.length,
      execErrorCount: execErrors.length,
      execSuccessRate,
      humanReviewedCount: reviewed.length,
      humanPendingCount: pending.length,
      humanAvgRating,
      humanCorrectRate,
      autoEvaluatedCount: evaluated.length,
      autoAvgScore,
      autoPassRate,
      agreementRate
    };
  }
}
