import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, combineLatest } from 'rxjs';
import { map, switchMap, shareReplay, tap } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { MJTestRunFeedbackEntity } from '@memberjunction/core-entities';
import { TestEngineBase } from '@memberjunction/testing-engine-base';

export interface TestingDashboardKPIs {
  totalTestsActive: number;
  passRateThisMonth: number;
  totalCostThisMonth: number;
  averageDuration: number;
  testsPendingReview: number;
  totalTestRuns: number;
  failedTests: number;
  skippedTests: number;
  passRateTrend: number; // Percentage change from previous period
}

export interface TestRunSummary {
  id: string;
  testId: string;
  testName: string;
  suiteName: string;
  testType: string;
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Timeout';
  score: number; // 0-1.0000
  duration: number; // milliseconds
  cost: number; // USD
  runDateTime: Date;
  targetType: string;
  targetLogID: string;
}

export interface SuiteHierarchyNode {
  id: string;
  name: string;
  parentID: string | null;
  level: number;
  children: SuiteHierarchyNode[];
  testCount: number;
  passRate: number;
  totalCost: number;
  averageScore: number;
  expanded?: boolean;
}

export interface VersionMetrics {
  version: string; // GitCommit + AgentVersion combination
  gitCommit: string;
  agentVersion: string;
  runDate: Date;
  totalTests: number;
  passRate: number;
  averageScore: number;
  totalCost: number;
  averageDuration: number;
  newFailures: number;
  newPasses: number;
}

export interface TestTrendData {
  timestamp: Date;
  totalRuns: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  averageScore: number;
  totalCost: number;
  averageDuration: number;
}

export interface FeedbackPending {
  testRunID: string;
  testName: string;
  automatedScore: number;
  automatedStatus: string;
  runDateTime: Date;
  reason: 'no-feedback' | 'high-score-failed' | 'low-score-passed';
}

export interface TestAnalytics {
  topFailingTests: Array<{ testName: string; failureCount: number; failureRate: number }>;
  mostExpensiveTests: Array<{ testName: string; totalCost: number; avgCost: number }>;
  slowestTests: Array<{ testName: string; avgDuration: number; maxDuration: number }>;
  costByType: Array<{ testType: string; totalCost: number; testCount: number }>;
  costBySuite: Array<{ suiteName: string; totalCost: number; testCount: number }>;
  passingRateByType: Array<{ testType: string; passRate: number; totalTests: number }>;
}

export interface FeedbackStats {
  totalFeedback: number;
  reviewedCount: number;
  avgRating: number;
  agreementRate: number;
  disagreementRate: number;
  accuracyRate: number;
}

/**
 * Extended test run summary with human feedback data included
 */
export interface TestRunWithFeedbackSummary extends TestRunSummary {
  // Human feedback
  humanRating: number | null;
  humanIsCorrect: boolean | null;
  humanComments: string | null;
  hasHumanFeedback: boolean;
  feedbackId: string | null;
  // Checks (from automated evaluation)
  passedChecks: number | null;
  failedChecks: number | null;
  totalChecks: number | null;
}

/**
 * Aggregated evaluation metrics
 */
export interface EvaluationSummaryMetrics {
  totalRuns: number;
  // Execution
  execCompletedCount: number;
  execErrorCount: number;
  execSuccessRate: number;
  // Human
  humanReviewedCount: number;
  humanPendingCount: number;
  humanAvgRating: number;
  humanCorrectRate: number;
  // Auto
  autoEvaluatedCount: number;
  autoAvgScore: number;
  autoPassRate: number;
  // Agreement
  agreementRate: number;
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

@Injectable({
  providedIn: 'root'
})
export class TestingInstrumentationService {
  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    end: new Date()
  });

  private readonly _suiteFilter$ = new BehaviorSubject<string | null>(null);
  private readonly _testTypeFilter$ = new BehaviorSubject<string | null>(null);
  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);
  private readonly metadata = new Metadata();

  // Expose observables
  readonly isLoading$ = this._isLoading$.asObservable();
  readonly dateRange$ = this._dateRange$.asObservable();

  constructor() {}

  // Main data streams
  readonly kpis$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadKPIs())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  readonly testRuns$ = combineLatest([
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

  readonly suiteHierarchy$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadSuiteHierarchy())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  readonly trends$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadTrends())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  readonly analytics$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadAnalytics())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  readonly pendingFeedback$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadPendingFeedback())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  readonly feedbackStats$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadFeedbackStats())),
    tap(() => this.checkLoadingComplete()),
    shareReplay(1)
  );

  /**
   * Test runs with feedback data joined - for evaluation display
   */
  readonly testRunsWithFeedback$ = combineLatest([
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

  /**
   * Aggregated evaluation metrics from test runs with feedback
   */
  readonly evaluationMetrics$ = this.testRunsWithFeedback$.pipe(
    map(runs => this.calculateEvaluationMetrics(runs)),
    shareReplay(1)
  );

  private checkLoadingComplete(): void {
    setTimeout(() => {
      this._isLoading$.next(false);
    }, 100);
  }

  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  setSuiteFilter(suiteId: string | null): void {
    this._suiteFilter$.next(suiteId);
  }

  setTestTypeFilter(typeId: string | null): void {
    this._testTypeFilter$.next(typeId);
  }

  refresh(): void {
    this._refreshTrigger$.next(this._refreshTrigger$.value + 1);
  }

  private async loadKPIs(): Promise<TestingDashboardKPIs> {
    const { start, end } = this._dateRange$.value;
    const rv = new RunView();

    // Get Tests from TestEngineBase cache instead of querying DB
    const engine = TestEngineBase.Instance;
    const activeTests = engine.Tests.filter(t => t.Status === 'Active');

    // Only load runs via RunView (not cached in engine) - use simple result type with only needed fields
    const [testRunsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        Fields: ['ID', 'Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt'],
        ResultType: 'simple',
        CacheLocal: true
      }
    ]);

    const testRuns = testRunsResult.Results as TestRunSimple[];

    // Calculate KPIs
    const totalTestsActive = activeTests.length;
    const totalTestRuns = testRuns.length;

    const passedRuns = testRuns.filter(r => r.Status === 'Passed');
    const failedRuns = testRuns.filter(r => r.Status === 'Failed');
    const skippedRuns = testRuns.filter(r => r.Status === 'Skipped');

    const passRateThisMonth = totalTestRuns > 0 ? (passedRuns.length / totalTestRuns) * 100 : 0;

    const totalCostThisMonth = testRuns.reduce((sum, r) => sum + (r.CostUSD || 0), 0);

    const completedRuns = testRuns.filter(r => r.CompletedAt != null && r.StartedAt != null);
    const averageDuration = completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => {
          const startTime = r.StartedAt instanceof Date ? r.StartedAt.getTime() : new Date(r.StartedAt).getTime();
          const endTime = r.CompletedAt instanceof Date ? r.CompletedAt.getTime() : new Date(r.CompletedAt!).getTime();
          return sum + (endTime - startTime);
        }, 0) / completedRuns.length
      : 0;

    // Count tests pending review (no feedback)
    const testRunIDs = testRuns.map(r => r.ID);
    const testsPendingReview = await this.countTestsPendingReview(testRunIDs);

    // Calculate trend (compare to previous period)
    const periodDuration = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - periodDuration);
    const previousEnd = new Date(start.getTime());

    const previousRunsResult = await rv.RunView<TestRunSimple>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: `StartedAt >= '${previousStart.toISOString()}' AND StartedAt < '${previousEnd.toISOString()}'`,
      Fields: ['ID', 'Status'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const previousRuns = previousRunsResult.Results || [];
    const previousPassRate = previousRuns.length > 0
      ? (previousRuns.filter(r => r.Status === 'Passed').length / previousRuns.length) * 100
      : 0;

    const passRateTrend = previousPassRate > 0 ? passRateThisMonth - previousPassRate : 0;

    return {
      totalTestsActive,
      passRateThisMonth,
      totalCostThisMonth,
      averageDuration,
      testsPendingReview,
      totalTestRuns,
      failedTests: failedRuns.length,
      skippedTests: skippedRuns.length,
      passRateTrend
    };
  }

  private async countTestsPendingReview(testRunIDs: string[]): Promise<number> {
    if (testRunIDs.length === 0) return 0;

    const rv = new RunView();
    const idList = testRunIDs.join("','");

    const feedbackResult = await rv.RunView<{TestRunID: string}>({
      EntityName: 'MJ: Test Run Feedbacks',
      ExtraFilter: `TestRunID IN ('${idList}')`,
      Fields: ['TestRunID'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const feedbackTestRunIDs = new Set((feedbackResult.Results || []).map(f => f.TestRunID));

    return testRunIDs.filter(id => !feedbackTestRunIDs.has(id)).length;
  }

  private async loadTestRuns(): Promise<TestRunSummary[]> {
    const { start, end } = this._dateRange$.value;
    const suiteFilter = this._suiteFilter$.value;
    const typeFilter = this._testTypeFilter$.value;

    let filter = `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`;

    if (suiteFilter) {
      // Need to join through TestSuiteTest
      filter += ` AND TestID IN (SELECT TestID FROM [__mj].[vwTestSuiteTests] WHERE TestSuiteID = '${suiteFilter}')`;
    }

    if (typeFilter) {
      filter += ` AND TestID IN (SELECT ID FROM [__mj].[vwTests] WHERE TypeID = '${typeFilter}')`;
    }

    const rv = new RunView();
    const result = await rv.RunView<TestRunSimple>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: filter,
      OrderBy: 'StartedAt DESC',
      MaxRows: 1000,
      Fields: ['ID', 'TestID', 'Test', 'Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt', 'TargetType', 'TargetLogID'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const testRuns = result.Results || [];

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
    const { start, end } = this._dateRange$.value;
    const rv = new RunView();

    // Get Test Suites from TestEngineBase cache instead of querying DB
    const engine = TestEngineBase.Instance;
    const suites = engine.TestSuites.filter(s => s.Status === 'Active');

    // Only load test runs via RunView (not cached in engine) - use simple result type
    const testRunsResult = await rv.RunView<{ID: string; TestID: string; Status: string; Score: number; CostUSD: number}>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      Fields: ['ID', 'TestID', 'Status', 'Score', 'CostUSD'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const testRuns = testRunsResult.Results || [];

    // Build hierarchy
    const nodes: SuiteHierarchyNode[] = suites.map(suite => ({
      id: suite.ID,
      name: suite.Name,
      parentID: suite.ParentID || null,
      level: 0,
      children: [],
      testCount: 0,
      passRate: 0,
      totalCost: 0,
      averageScore: 0,
      expanded: false
    }));

    // Calculate metrics for each suite (simplified - would need TestSuiteTest join for accuracy)
    type SimpleTestRun = {ID: string; TestID: string; Status: string; Score: number; CostUSD: number};
    const suiteTestRuns = new Map<string, SimpleTestRun[]>();

    testRuns.forEach(run => {
      // This is simplified - would need to query TestSuiteTest to get actual suite membership
      const suiteID = run.TestID; // Placeholder
      if (!suiteTestRuns.has(suiteID)) {
        suiteTestRuns.set(suiteID, []);
      }
      suiteTestRuns.get(suiteID)!.push(run);
    });

    nodes.forEach(node => {
      const runs = suiteTestRuns.get(node.id) || [];
      node.testCount = runs.length;
      node.passRate = runs.length > 0
        ? (runs.filter(r => r.Status === 'Passed').length / runs.length) * 100
        : 0;
      node.totalCost = runs.reduce((sum, r) => sum + (r.CostUSD || 0), 0);
      node.averageScore = runs.length > 0
        ? runs.reduce((sum, r) => sum + (r.Score || 0), 0) / runs.length
        : 0;
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
    const { start, end } = this._dateRange$.value;

    // Create time buckets
    const buckets = this.createTimeBuckets(start, end);
    const rv = new RunView();

    // Load all test runs for the period - use simple result type with only needed fields
    type TrendRun = {Status: string; Score: number; CostUSD: number; StartedAt: string | Date; CompletedAt: string | Date | null};
    const result = await rv.RunView<TrendRun>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      OrderBy: 'StartedAt',
      Fields: ['Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const allRuns = result.Results || [];

    // Aggregate into buckets
    const trends: TestTrendData[] = buckets.map(bucketStart => {
      const bucketEnd = new Date(bucketStart.getTime() + this.getBucketSize(start, end));

      const bucketRuns = allRuns.filter(r => {
        if (!r.StartedAt) return false;
        const runTime = r.StartedAt instanceof Date ? r.StartedAt : new Date(r.StartedAt);
        return runTime >= bucketStart && runTime < bucketEnd;
      });

      const passed = bucketRuns.filter(r => r.Status === 'Passed').length;
      const failed = bucketRuns.filter(r => r.Status === 'Failed').length;
      const skipped = bucketRuns.filter(r => r.Status === 'Skipped').length;
      const errors = bucketRuns.filter(r => r.Status === 'Error').length;

      const averageScore = bucketRuns.length > 0
        ? bucketRuns.reduce((sum, r) => sum + (r.Score || 0), 0) / bucketRuns.length
        : 0;

      const totalCost = bucketRuns.reduce((sum, r) => sum + (r.CostUSD || 0), 0);

      const completedRuns = bucketRuns.filter(r => r.CompletedAt != null && r.StartedAt != null);
      const averageDuration = completedRuns.length > 0
        ? completedRuns.reduce((sum, r) => {
            const startTime = r.StartedAt instanceof Date ? r.StartedAt.getTime() : new Date(r.StartedAt).getTime();
            const endTime = r.CompletedAt instanceof Date ? r.CompletedAt.getTime() : new Date(r.CompletedAt!).getTime();
            return sum + (endTime - startTime);
          }, 0) / completedRuns.length
        : 0;

      return {
        timestamp: bucketStart,
        totalRuns: bucketRuns.length,
        passed,
        failed,
        skipped,
        errors,
        averageScore,
        totalCost,
        averageDuration
      };
    });

    return trends;
  }

  private async loadAnalytics(): Promise<TestAnalytics> {
    const { start, end } = this._dateRange$.value;
    const rv = new RunView();

    // Use simple result type with only needed fields
    type AnalyticsRun = {Test: string; Status: string; Score: number; CostUSD: number; StartedAt: string | Date; CompletedAt: string | Date | null};
    const result = await rv.RunView<AnalyticsRun>({
      EntityName: 'MJ: Test Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      Fields: ['Test', 'Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const testRuns = result.Results || [];

    // Group by test name
    const testMetrics = new Map<string, { runs: AnalyticsRun[], failures: number }>();

    testRuns.forEach(run => {
      const testName = run.Test || 'Unknown';
      if (!testMetrics.has(testName)) {
        testMetrics.set(testName, { runs: [], failures: 0 });
      }
      const metrics = testMetrics.get(testName)!;
      metrics.runs.push(run);
      if (run.Status === 'Failed' || run.Status === 'Error') {
        metrics.failures++;
      }
    });

    // Top failing tests
    const topFailingTests = Array.from(testMetrics.entries())
      .map(([testName, metrics]) => ({
        testName,
        failureCount: metrics.failures,
        failureRate: metrics.runs.length > 0 ? (metrics.failures / metrics.runs.length) * 100 : 0
      }))
      .sort((a, b) => b.failureCount - a.failureCount)
      .slice(0, 10);

    // Most expensive tests
    const mostExpensiveTests = Array.from(testMetrics.entries())
      .map(([testName, metrics]) => {
        const totalCost = metrics.runs.reduce((sum, r) => sum + (r.CostUSD || 0), 0);
        const avgCost = metrics.runs.length > 0 ? totalCost / metrics.runs.length : 0;
        return { testName, totalCost, avgCost };
      })
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);

    // Slowest tests
    const slowestTests = Array.from(testMetrics.entries())
      .map(([testName, metrics]) => {
        const durations = metrics.runs
          .filter(r => r.CompletedAt != null && r.StartedAt != null)
          .map(r => {
            const startTime = r.StartedAt instanceof Date ? r.StartedAt.getTime() : new Date(r.StartedAt).getTime();
            const endTime = r.CompletedAt instanceof Date ? r.CompletedAt.getTime() : new Date(r.CompletedAt!).getTime();
            return endTime - startTime;
          });

        const avgDuration = durations.length > 0
          ? durations.reduce((sum, d) => sum + d, 0) / durations.length
          : 0;
        const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

        return { testName, avgDuration, maxDuration };
      })
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    // Cost by type (simplified - would need actual type data)
    const typeMetrics = new Map<string, { cost: number, count: number }>();
    testRuns.forEach(run => {
      const type = run.Test || 'Unknown';
      if (!typeMetrics.has(type)) {
        typeMetrics.set(type, { cost: 0, count: 0 });
      }
      const metrics = typeMetrics.get(type)!;
      metrics.cost += run.CostUSD || 0;
      metrics.count++;
    });

    const costByType = Array.from(typeMetrics.entries())
      .map(([testType, metrics]) => ({
        testType,
        totalCost: metrics.cost,
        testCount: metrics.count
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    // Passing rate by type
    const typePassingMetrics = new Map<string, { total: number, passed: number }>();
    testRuns.forEach(run => {
      const type = run.Test || 'Unknown';
      if (!typePassingMetrics.has(type)) {
        typePassingMetrics.set(type, { total: 0, passed: 0 });
      }
      const metrics = typePassingMetrics.get(type)!;
      metrics.total++;
      if (run.Status === 'Passed') {
        metrics.passed++;
      }
    });

    const passingRateByType = Array.from(typePassingMetrics.entries())
      .map(([testType, metrics]) => ({
        testType,
        passRate: metrics.total > 0 ? (metrics.passed / metrics.total) * 100 : 0,
        totalTests: metrics.total
      }))
      .sort((a, b) => a.passRate - b.passRate);

    return {
      topFailingTests,
      mostExpensiveTests,
      slowestTests,
      costByType,
      costBySuite: [], // Would need suite data
      passingRateByType
    };
  }

  private async loadPendingFeedback(): Promise<FeedbackPending[]> {
    const { start, end } = this._dateRange$.value;
    const rv = new RunView();

    // Use simple result types with only needed fields
    type FeedbackTestRun = {ID: string; Test: string; Score: number; Status: string; StartedAt: string | Date};
    type FeedbackItem = {TestRunID: string};

    const [testRunsResult, feedbackResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        Fields: ['ID', 'Test', 'Score', 'Status', 'StartedAt'],
        ResultType: 'simple',
        CacheLocal: true
      },
      {
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `CreatedAt >= '${start.toISOString()}'`,
        Fields: ['TestRunID'],
        ResultType: 'simple',
        CacheLocal: true
      }
    ]);

    const testRuns = testRunsResult.Results as FeedbackTestRun[];
    const feedbacks = feedbackResult.Results as FeedbackItem[];

    const feedbackTestRunIDs = new Set(feedbacks.map(f => f.TestRunID));

    const pending: FeedbackPending[] = [];

    testRuns.forEach(run => {
      const hasFeedback = feedbackTestRunIDs.has(run.ID);
      const runDateTime = run.StartedAt instanceof Date ? run.StartedAt : new Date(run.StartedAt);

      if (!hasFeedback) {
        pending.push({
          testRunID: run.ID,
          testName: run.Test || 'Unknown',
          automatedScore: run.Score || 0,
          automatedStatus: run.Status,
          runDateTime,
          reason: 'no-feedback'
        });
      } else {
        // Check for discrepancies
        if (run.Status === 'Failed' && run.Score != null && run.Score >= 0.8) {
          pending.push({
            testRunID: run.ID,
            testName: run.Test || 'Unknown',
            automatedScore: run.Score,
            automatedStatus: run.Status,
            runDateTime,
            reason: 'high-score-failed'
          });
        } else if (run.Status === 'Passed' && run.Score != null && run.Score < 0.5) {
          pending.push({
            testRunID: run.ID,
            testName: run.Test || 'Unknown',
            automatedScore: run.Score,
            automatedStatus: run.Status,
            runDateTime,
            reason: 'low-score-passed'
          });
        }
      }
    });

    return pending.sort((a, b) => b.runDateTime.getTime() - a.runDateTime.getTime());
  }

  private async loadFeedbackStats(): Promise<FeedbackStats> {
    const { start, end } = this._dateRange$.value;
    const rv = new RunView();

    // Load all feedback for the period - use simple result type with only needed fields
    type FeedbackStatItem = {Rating: number; IsCorrect: boolean};
    const feedbackResult = await rv.RunView<FeedbackStatItem>({
      EntityName: 'MJ: Test Run Feedbacks',
      ExtraFilter: `CreatedAt >= '${start.toISOString()}' AND CreatedAt <= '${end.toISOString()}'`,
      Fields: ['Rating', 'IsCorrect'],
      ResultType: 'simple',
      CacheLocal: true
    });

    const feedbacks = feedbackResult.Results || [];
    const totalFeedback = feedbacks.length;

    if (totalFeedback === 0) {
      return {
        totalFeedback: 0,
        reviewedCount: 0,
        avgRating: 0,
        agreementRate: 0,
        disagreementRate: 0,
        accuracyRate: 0
      };
    }

    // Calculate average rating
    const avgRating = feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / totalFeedback;

    // Calculate agreement/disagreement rates based on IsCorrect field
    const correctCount = feedbacks.filter(f => f.IsCorrect === true).length;
    const incorrectCount = feedbacks.filter(f => f.IsCorrect === false).length;

    const agreementRate = (correctCount / totalFeedback) * 100;
    const disagreementRate = (incorrectCount / totalFeedback) * 100;

    // Accuracy rate is the same as agreement rate (% of times human agreed with automated result)
    const accuracyRate = agreementRate;

    return {
      totalFeedback,
      reviewedCount: totalFeedback, // All feedbacks in this query are reviewed
      avgRating,
      agreementRate,
      disagreementRate,
      accuracyRate
    };
  }

  async submitFeedback(testRunID: string, rating: number, isCorrect: boolean, comments: string): Promise<boolean> {
    try {
      const feedback = await this.metadata.GetEntityObject<MJTestRunFeedbackEntity>('MJ: Test Run Feedbacks');
      feedback.TestRunID = testRunID;
      feedback.Rating = rating;
      feedback.IsCorrect = isCorrect;
      feedback.Comments = comments;

      const result = await feedback.Save();
      if (result) {
        this.refresh(); // Refresh data after submission
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error submitting feedback:', error);
      return false;
    }
  }

  async getVersionMetrics(): Promise<VersionMetrics[]> {
    const rv = new RunView();

    // Use simple result type with only needed fields
    type VersionRun = {TotalTests: number; PassedTests: number; TotalCostUSD: number; StartedAt: string | Date; GitCommit: string; AgentVersion: string};
    const result = await rv.RunView<VersionRun>({
      EntityName: 'MJ: Test Suite Runs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      MaxRows: 100,
      Fields: ['TotalTests', 'PassedTests', 'TotalCostUSD', 'StartedAt', 'GitCommit', 'AgentVersion'],
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
      const totalCost = runs.reduce((sum, r) => sum + (r.TotalCostUSD || 0), 0);

      const runDate = latest.StartedAt instanceof Date ? latest.StartedAt : new Date(latest.StartedAt);

      return {
        version: `${gitCommit.substring(0, 7)} / ${agentVersion}`,
        gitCommit,
        agentVersion,
        runDate,
        totalTests,
        passRate: totalTests > 0 ? (totalPassed / totalTests) * 100 : 0,
        averageScore: 0, // Would need to calculate from test runs
        totalCost,
        averageDuration: 0, // Would need to calculate from test runs
        newFailures: 0, // Would need comparison
        newPasses: 0 // Would need comparison
      };
    });

    return metrics.sort((a, b) => b.runDate.getTime() - a.runDate.getTime());
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
    const { start, end } = this._dateRange$.value;
    const suiteFilter = this._suiteFilter$.value;
    const typeFilter = this._testTypeFilter$.value;

    let filter = `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`;

    if (suiteFilter) {
      filter += ` AND TestID IN (SELECT TestID FROM [__mj].[vwTestSuiteTests] WHERE TestSuiteID = '${suiteFilter}')`;
    }

    if (typeFilter) {
      filter += ` AND TestID IN (SELECT ID FROM [__mj].[vwTests] WHERE TypeID = '${typeFilter}')`;
    }

    const rv = new RunView();

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
    };

    const [testRunsResult, feedbackResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Test Runs',
        ExtraFilter: filter,
        OrderBy: 'StartedAt DESC',
        MaxRows: 1000,
        Fields: ['ID', 'TestID', 'Test', 'Status', 'Score', 'CostUSD', 'StartedAt', 'CompletedAt', 'TargetType', 'TargetLogID', 'PassedChecks', 'FailedChecks', 'TotalChecks'],
        ResultType: 'simple',
        CacheLocal: true
      },
      {
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `CreatedAt >= '${start.toISOString()}'`,
        Fields: ['ID', 'TestRunID', 'Rating', 'IsCorrect', 'Comments'],
        ResultType: 'simple',
        CacheLocal: true
      }
    ]);

    const testRuns = (testRunsResult.Results || []) as MJTestRunExtended[];
    const feedbacks = (feedbackResult.Results || []) as TestRunFeedbackSimple[];

    // Create feedback lookup map
    const feedbackMap = new Map<string, TestRunFeedbackSimple>();
    feedbacks.forEach(f => {
      feedbackMap.set(f.TestRunID, f);
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
        feedbackId: feedback?.ID ?? null
      };
    });
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
    const execSuccessRate = totalRuns > 0 ? (execCompleted.length / totalRuns) * 100 : 0;

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
