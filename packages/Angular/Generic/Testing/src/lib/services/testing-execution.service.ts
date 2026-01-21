import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
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

@Injectable({
  providedIn: 'root'
})
export class TestingExecutionService {
  private testingClient: GraphQLTestingClient;

  constructor() {
    const dataProvider = Metadata.Provider as GraphQLDataProvider;
    this.testingClient = new GraphQLTestingClient(dataProvider);
  }

  ExecuteTest(
    testId: string,
    options: { verbose?: boolean; variables?: Record<string, unknown> } = {}
  ): Observable<{ result: TestExecutionResult; progress: TestExecutionProgress }> {
    const progress$ = new Subject<{ result: TestExecutionResult; progress: TestExecutionProgress }>();

    this.testingClient.RunTest({
      testId,
      verbose: options.verbose ?? true,
      variables: options.variables,
      onProgress: (progressUpdate) => {
        progress$.next({
          result: null as any,
          progress: {
            currentStep: progressUpdate.currentStep,
            percentage: progressUpdate.percentage,
            message: progressUpdate.message
          }
        });
      }
    }).then((result) => {
      progress$.next({
        result: result as TestExecutionResult,
        progress: {
          currentStep: 'complete',
          percentage: 100,
          message: 'Test execution complete'
        }
      });
      progress$.complete();
    }).catch((error) => {
      progress$.error(error);
    });

    return progress$.asObservable();
  }

  ExecuteSuite(
    suiteId: string,
    options: { verbose?: boolean; parallel?: boolean; variables?: Record<string, unknown> } = {}
  ): Observable<{ result: TestExecutionResult; progress: TestExecutionProgress }> {
    const progress$ = new Subject<{ result: TestExecutionResult; progress: TestExecutionProgress }>();

    this.testingClient.RunTestSuite({
      suiteId,
      verbose: options.verbose ?? true,
      parallel: options.parallel ?? false,
      variables: options.variables,
      onProgress: (progressUpdate) => {
        progress$.next({
          result: null as any,
          progress: {
            currentStep: progressUpdate.currentStep,
            percentage: progressUpdate.percentage,
            message: progressUpdate.message
          }
        });
      }
    }).then((result) => {
      progress$.next({
        result: result as TestExecutionResult,
        progress: {
          currentStep: 'complete',
          percentage: 100,
          message: 'Suite execution complete'
        }
      });
      progress$.complete();
    }).catch((error) => {
      progress$.error(error);
    });

    return progress$.asObservable();
  }

  async RerunTest(testRunId: string): Promise<TestExecutionResult> {
    // TODO: Implement re-run logic by fetching original test config and re-executing
    throw new Error('Re-run functionality not yet implemented');
  }
}
