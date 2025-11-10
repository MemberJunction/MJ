import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, from, combineLatest } from 'rxjs';
import { map, switchMap, shareReplay, tap } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import {
  TestRunEntity,
  TestSuiteRunEntity,
  TestRunFeedbackEntity,
  TestSuiteEntity,
  TestEntity,
  TestTypeEntity
} from '@memberjunction/core-entities';

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
  testName: string;
  suiteName: string;
  testType: string;
  status: 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running';
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

    const [testRunsResult, testsResult, suiteRunsResult] = await rv.RunViews([
      {
        EntityName: 'Test Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Tests',
        ExtraFilter: `Status = 'Active'`,
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Test Suite Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        ResultType: 'entity_object'
      }
    ]);

    const testRuns = testRunsResult.Results as TestRunEntity[];
    const activeTests = testsResult.Results as TestEntity[];
    const suiteRuns = suiteRunsResult.Results as TestSuiteRunEntity[];

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
          const duration = new Date(r.CompletedAt!).getTime() - new Date(r.StartedAt!).getTime();
          return sum + duration;
        }, 0) / completedRuns.length
      : 0;

    // Count tests pending review (no feedback)
    const testsPendingReview = await this.countTestsPendingReview(testRuns);

    // Calculate trend (compare to previous period)
    const periodDuration = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - periodDuration);
    const previousEnd = new Date(start.getTime());

    const previousRunsResult = await rv.RunView<TestRunEntity>({
      EntityName: 'Test Runs',
      ExtraFilter: `StartedAt >= '${previousStart.toISOString()}' AND StartedAt < '${previousEnd.toISOString()}'`,
      ResultType: 'entity_object'
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

  private async countTestsPendingReview(testRuns: TestRunEntity[]): Promise<number> {
    if (testRuns.length === 0) return 0;

    const rv = new RunView();
    const testRunIDs = testRuns.map(r => r.ID).join("','");

    const feedbackResult = await rv.RunView<TestRunFeedbackEntity>({
      EntityName: 'Test Run Feedback',
      ExtraFilter: `TestRunID IN ('${testRunIDs}')`,
      ResultType: 'entity_object'
    });

    const feedbackTestRunIDs = new Set((feedbackResult.Results || []).map(f => f.TestRunID));

    return testRuns.filter(r => !feedbackTestRunIDs.has(r.ID)).length;
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
    const result = await rv.RunView<TestRunEntity>({
      EntityName: 'Test Runs',
      ExtraFilter: filter,
      OrderBy: 'StartedAt DESC',
      MaxRows: 1000,
      ResultType: 'entity_object'
    });

    const testRuns = result.Results || [];

    return testRuns.map(run => ({
      id: run.ID,
      testName: run.Test || 'Unknown Test',
      suiteName: '', // Will be populated from join
      testType: run.Test || 'Unknown',
      status: run.Status as 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running',
      score: run.Score || 0,
      duration: run.CompletedAt && run.StartedAt
        ? new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime()
        : (run.StartedAt ? Date.now() - new Date(run.StartedAt).getTime() : 0),
      cost: run.CostUSD || 0,
      runDateTime: run.StartedAt ? new Date(run.StartedAt) : new Date(),
      targetType: run.TargetType || '',
      targetLogID: run.TargetLogID || ''
    }));
  }

  private async loadSuiteHierarchy(): Promise<SuiteHierarchyNode[]> {
    const { start, end } = this._dateRange$.value;
    const rv = new RunView();

    // Load all suites and test runs
    const [suitesResult, testRunsResult] = await rv.RunViews([
      {
        EntityName: 'Test Suites',
        ExtraFilter: `Status = 'Active'`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Test Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        ResultType: 'entity_object'
      }
    ]);

    const suites = suitesResult.Results as TestSuiteEntity[];
    const testRuns = testRunsResult.Results as TestRunEntity[];

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
    const suiteTestRuns = new Map<string, TestRunEntity[]>();

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

    // Load all test runs for the period
    const result = await rv.RunView<TestRunEntity>({
      EntityName: 'Test Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      OrderBy: 'StartedAt',
      ResultType: 'entity_object'
    });

    const allRuns = result.Results || [];

    // Aggregate into buckets
    const trends: TestTrendData[] = buckets.map(bucketStart => {
      const bucketEnd = new Date(bucketStart.getTime() + this.getBucketSize(start, end));

      const bucketRuns = allRuns.filter(r => {
        if (!r.StartedAt) return false;
        const runTime = new Date(r.StartedAt);
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
            const duration = new Date(r.CompletedAt!).getTime() - new Date(r.StartedAt!).getTime();
            return sum + duration;
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

    const result = await rv.RunView<TestRunEntity>({
      EntityName: 'Test Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      ResultType: 'entity_object'
    });

    const testRuns = result.Results || [];

    // Group by test name
    const testMetrics = new Map<string, { runs: TestRunEntity[], failures: number }>();

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
          .map(r => new Date(r.CompletedAt!).getTime() - new Date(r.StartedAt!).getTime());

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

    const [testRunsResult, feedbackResult] = await rv.RunViews([
      {
        EntityName: 'Test Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Test Run Feedback',
        ExtraFilter: `CreatedAt >= '${start.toISOString()}'`,
        ResultType: 'entity_object'
      }
    ]);

    const testRuns = testRunsResult.Results as TestRunEntity[];
    const feedbacks = feedbackResult.Results as TestRunFeedbackEntity[];

    const feedbackMap = new Map<string, TestRunFeedbackEntity>();
    feedbacks.forEach(f => feedbackMap.set(f.TestRunID, f));

    const pending: FeedbackPending[] = [];

    testRuns.forEach(run => {
      const hasFeedback = feedbackMap.has(run.ID);

      if (!hasFeedback) {
        pending.push({
          testRunID: run.ID,
          testName: run.Test || 'Unknown',
          automatedScore: run.Score || 0,
          automatedStatus: run.Status,
          runDateTime: run.StartedAt ? new Date(run.StartedAt) : new Date(),
          reason: 'no-feedback'
        });
      } else {
        const feedback = feedbackMap.get(run.ID)!;
        // Check for discrepancies
        if (run.Status === 'Failed' && run.Score != null && run.Score >= 0.8) {
          pending.push({
            testRunID: run.ID,
            testName: run.Test || 'Unknown',
            automatedScore: run.Score,
            automatedStatus: run.Status,
            runDateTime: run.StartedAt ? new Date(run.StartedAt) : new Date(),
            reason: 'high-score-failed'
          });
        } else if (run.Status === 'Passed' && run.Score != null && run.Score < 0.5) {
          pending.push({
            testRunID: run.ID,
            testName: run.Test || 'Unknown',
            automatedScore: run.Score,
            automatedStatus: run.Status,
            runDateTime: run.StartedAt ? new Date(run.StartedAt) : new Date(),
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

    // Load all feedback for the period
    const feedbackResult = await rv.RunView<TestRunFeedbackEntity>({
      EntityName: 'Test Run Feedback',
      ExtraFilter: `CreatedAt >= '${start.toISOString()}' AND CreatedAt <= '${end.toISOString()}'`,
      ResultType: 'entity_object'
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
      const feedback = await this.metadata.GetEntityObject<TestRunFeedbackEntity>('Test Run Feedback');
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

    const result = await rv.RunView<TestSuiteRunEntity>({
      EntityName: 'Test Suite Runs',
      ExtraFilter: '',
      OrderBy: 'StartedAt DESC',
      MaxRows: 100,
      ResultType: 'entity_object'
    });

    const suiteRuns = result.Results || [];

    // Group by version combination
    const versionMap = new Map<string, TestSuiteRunEntity[]>();

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

      return {
        version: `${gitCommit.substring(0, 7)} / ${agentVersion}`,
        gitCommit,
        agentVersion,
        runDate: latest.StartedAt ? new Date(latest.StartedAt) : new Date(),
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
}
