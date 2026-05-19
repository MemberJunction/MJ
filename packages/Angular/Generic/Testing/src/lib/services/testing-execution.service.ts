import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { GraphQLTestingClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { IMetadataProvider, Metadata } from '@memberjunction/core';

export interface TestExecutionOptions {
  testId?: string;
  suiteId?: string;
  verbose?: boolean;
  parallel?: boolean;
  /**
   * Variable values to use for this test run
   */
  variables?: Record<string, unknown>;
}

export interface TestExecutionProgress {
  currentStep: string;
  percentage: number;
  message: string;
}

export interface TestExecutionResult {
  success: boolean;
  result?: {
    status: string;
    score: number;
    totalCost?: number;
  };
  executionTimeMs: number;
  errorMessage?: string;
}

export interface RunLogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface ActiveRun {
  TestId: string;
  TestName: string;
  Status: 'running' | 'completed' | 'failed';
  Progress: number;
  CurrentStep: string;
  Message: string;
  StartedAt: Date;
  Result?: TestExecutionResult;
  LogEntries: RunLogEntry[];
}

/**
 * Multi-provider note: callers under a non-default provider should set
 * `service.Provider = component.ProviderToUse` before invoking any methods.
 */
@Injectable({
  providedIn: 'root'
})
export class TestingExecutionService {
  private _testingClient: GraphQLTestingClient | null = null;
  private _provider: IMetadataProvider | null = null;

  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
    this._testingClient = null; // invalidate cached client
  }

  private get testingClient(): GraphQLTestingClient {
    if (!this._testingClient) {
      this._testingClient = new GraphQLTestingClient(this.Provider as unknown as GraphQLDataProvider);
    }
    return this._testingClient;
  }

  private _activeRuns$ = new BehaviorSubject<ActiveRun[]>([]);
  readonly ActiveRuns$: Observable<ActiveRun[]> = this._activeRuns$.asObservable();

  constructor() {}

  ExecuteTest(
    testId: string,
    options: { verbose?: boolean; variables?: Record<string, unknown>; testName?: string } = {}
  ): Observable<{ result: TestExecutionResult; progress: TestExecutionProgress }> {
    const progress$ = new Subject<{ result: TestExecutionResult; progress: TestExecutionProgress }>();

    this.trackRun(testId, options.testName ?? 'Test');

    this.testingClient.RunTest({
      testId,
      verbose: options.verbose ?? true,
      variables: options.variables,
      onProgress: (progressUpdate) => {
        this.updateRun(testId, progressUpdate.percentage, progressUpdate.currentStep, progressUpdate.message);
        progress$.next({
          result: null as unknown as TestExecutionResult,
          progress: {
            currentStep: progressUpdate.currentStep,
            percentage: progressUpdate.percentage,
            message: progressUpdate.message
          }
        });
      }
    }).then((result) => {
      const execResult = result as TestExecutionResult;
      this.completeRun(testId, 'completed', execResult);
      progress$.next({
        result: execResult,
        progress: {
          currentStep: 'complete',
          percentage: 100,
          message: 'Test execution complete'
        }
      });
      progress$.complete();
    }).catch((error) => {
      this.completeRun(testId, 'failed');
      progress$.error(error);
    });

    return progress$.asObservable();
  }

  ExecuteSuite(
    suiteId: string,
    options: { verbose?: boolean; parallel?: boolean; variables?: Record<string, unknown>; suiteName?: string } = {}
  ): Observable<{ result: TestExecutionResult; progress: TestExecutionProgress }> {
    const progress$ = new Subject<{ result: TestExecutionResult; progress: TestExecutionProgress }>();

    this.trackRun(suiteId, options.suiteName ?? 'Suite');

    this.testingClient.RunTestSuite({
      suiteId,
      verbose: options.verbose ?? true,
      parallel: options.parallel ?? false,
      variables: options.variables,
      onProgress: (progressUpdate) => {
        this.updateRun(suiteId, progressUpdate.percentage, progressUpdate.currentStep, progressUpdate.message);
        progress$.next({
          result: null as unknown as TestExecutionResult,
          progress: {
            currentStep: progressUpdate.currentStep,
            percentage: progressUpdate.percentage,
            message: progressUpdate.message
          }
        });
      }
    }).then((result) => {
      const execResult = result as TestExecutionResult;
      this.completeRun(suiteId, 'completed', execResult);
      progress$.next({
        result: execResult,
        progress: {
          currentStep: 'complete',
          percentage: 100,
          message: 'Suite execution complete'
        }
      });
      progress$.complete();
    }).catch((error) => {
      this.completeRun(suiteId, 'failed');
      progress$.error(error);
    });

    return progress$.asObservable();
  }

  DismissRun(testId: string): void {
    const runs = this._activeRuns$.value.filter(r => r.TestId !== testId);
    this._activeRuns$.next(runs);
  }

  async RerunTest(testRunId: string): Promise<TestExecutionResult> {
    // TODO: Implement re-run logic by fetching original test config and re-executing
    throw new Error('Re-run functionality not yet implemented');
  }

  private trackRun(testId: string, testName: string): void {
    const runs = this._activeRuns$.value.filter(r => r.TestId !== testId);
    runs.push({
      TestId: testId,
      TestName: testName,
      Status: 'running',
      Progress: 0,
      CurrentStep: 'starting',
      Message: 'Starting execution...',
      StartedAt: new Date(),
      LogEntries: [{ timestamp: new Date(), message: 'Starting execution...', type: 'info' }]
    });
    this._activeRuns$.next(runs);
  }

  private updateRun(testId: string, percentage: number, step: string, message: string): void {
    const runs = this._activeRuns$.value.map(r => {
      if (r.TestId !== testId) return r;
      const logEntries = [...r.LogEntries, { timestamp: new Date(), message, type: 'info' as const }];
      return { ...r, Progress: percentage >= 0 ? percentage : r.Progress, CurrentStep: step, Message: message, LogEntries: logEntries.slice(-100) };
    });
    this._activeRuns$.next(runs);
  }

  private completeRun(testId: string, status: 'completed' | 'failed', result?: TestExecutionResult): void {
    const runs = this._activeRuns$.value.map(r => {
      if (r.TestId !== testId) return r;
      const msg = status === 'completed' ? 'Execution complete' : 'Execution failed';
      const type = status === 'completed' ? 'success' as const : 'error' as const;
      const logEntries = [...r.LogEntries, { timestamp: new Date(), message: msg, type }];
      return { ...r, Status: status as ActiveRun['Status'], Progress: 100, CurrentStep: 'complete', Result: result, LogEntries: logEntries.slice(-100) };
    });
    this._activeRuns$.next(runs);
  }

  // ── Public tracking API (used by test-run-dialog to register its executions) ──

  /** Get the current active run for a given test ID, or null if none */
  GetActiveRun(testId: string): ActiveRun | null {
    return this._activeRuns$.value.find(r => r.TestId === testId) ?? null;
  }

  /** Register a new active run (called by dialog when starting execution) */
  RegisterRun(testId: string, testName: string): void {
    this.trackRun(testId, testName);
  }

  /** Update progress for an externally-managed run */
  UpdateRunProgress(testId: string, percentage: number, step: string, message: string): void {
    this.updateRun(testId, percentage, step, message);
  }

  /** Add a log entry to an active run */
  AddRunLog(testId: string, message: string, type: 'info' | 'success' | 'error'): void {
    const runs = this._activeRuns$.value.map(r => {
      if (r.TestId !== testId) return r;
      const logEntries = [...r.LogEntries, { timestamp: new Date(), message, type }];
      return { ...r, LogEntries: logEntries.slice(-100) };
    });
    this._activeRuns$.next(runs);
  }

  /** Mark an externally-managed run as complete */
  CompleteRun(testId: string, status: 'completed' | 'failed', result?: TestExecutionResult): void {
    this.completeRun(testId, status, result);
  }
}
