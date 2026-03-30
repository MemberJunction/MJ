import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { GraphQLTestingClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Metadata } from '@memberjunction/core';

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

export interface ActiveRun {
  TestId: string;
  TestName: string;
  Status: 'running' | 'completed' | 'failed';
  Progress: number;
  CurrentStep: string;
  Message: string;
  StartedAt: Date;
  Result?: TestExecutionResult;
}

@Injectable({
  providedIn: 'root'
})
export class TestingExecutionService {
  private testingClient: GraphQLTestingClient;

  private _activeRuns$ = new BehaviorSubject<ActiveRun[]>([]);
  readonly ActiveRuns$: Observable<ActiveRun[]> = this._activeRuns$.asObservable();

  constructor() {
    const dataProvider = Metadata.Provider as GraphQLDataProvider;
    this.testingClient = new GraphQLTestingClient(dataProvider);
  }

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
      StartedAt: new Date()
    });
    this._activeRuns$.next(runs);
  }

  private updateRun(testId: string, percentage: number, step: string, message: string): void {
    const runs = this._activeRuns$.value.map(r =>
      r.TestId === testId ? { ...r, Progress: percentage >= 0 ? percentage : r.Progress, CurrentStep: step, Message: message } : r
    );
    this._activeRuns$.next(runs);
  }

  private completeRun(testId: string, status: 'completed' | 'failed', result?: TestExecutionResult): void {
    const runs = this._activeRuns$.value.map(r =>
      r.TestId === testId ? { ...r, Status: status as ActiveRun['Status'], Progress: 100, CurrentStep: 'complete', Result: result } : r
    );
    this._activeRuns$.next(runs);
  }
}
