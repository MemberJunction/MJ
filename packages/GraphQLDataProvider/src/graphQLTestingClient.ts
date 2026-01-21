import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { SafeJSONParse } from "@memberjunction/global";

/**
 * Parameters for running a test
 */
export interface RunTestParams {
    testId: string;
    verbose?: boolean;
    environment?: string;
    tags?: string[];
    /**
     * Variable values to use for this test run.
     * Key is the variable name, value is the resolved value.
     */
    variables?: Record<string, unknown>;
    onProgress?: (progress: TestExecutionProgress) => void;
}

/**
 * Result from running a test
 */
export interface RunTestResult {
    success: boolean;
    errorMessage?: string;
    executionTimeMs?: number;
    result: any; // Parsed TestRunResult from engine
}

/**
 * Parameters for running a test suite
 */
export interface RunTestSuiteParams {
    suiteId: string;
    verbose?: boolean;
    environment?: string;
    parallel?: boolean;
    tags?: string[];
    /**
     * Variable values to apply to all tests in this suite.
     * Key is the variable name, value is the resolved value.
     */
    variables?: Record<string, unknown>;
    /**
     * Run only specific tests by their IDs.
     * If provided, only tests with matching IDs will be executed.
     */
    selectedTestIds?: string[];
    /**
     * Start execution from this sequence number (inclusive).
     * Tests with sequence numbers less than this value will be skipped.
     */
    sequenceStart?: number;
    /**
     * Stop execution at this sequence number (inclusive).
     * Tests with sequence numbers greater than this value will be skipped.
     */
    sequenceEnd?: number;
    onProgress?: (progress: TestExecutionProgress) => void;
}

/**
 * Result from running a test suite
 */
export interface RunTestSuiteResult {
    success: boolean;
    errorMessage?: string;
    executionTimeMs?: number;
    result: any; // Parsed TestSuiteRunResult from engine
}

/**
 * Test execution progress update
 */
export interface TestExecutionProgress {
    currentStep: string;
    percentage: number;
    message: string;
    testName?: string;
    driverType?: string;
    oracleEvaluation?: string;
}

/**
 * Client for executing tests through GraphQL.
 * This class provides an easy way to run tests and test suites from a client application.
 *
 * @example
 * ```typescript
 * // Create the client
 * const testingClient = new GraphQLTestingClient(graphQLProvider);
 *
 * // Run a test
 * const result = await testingClient.RunTest({
 *   testId: "test-uuid",
 *   verbose: true,
 *   environment: "dev"
 * });
 *
 * // Run a test suite
 * const suiteResult = await testingClient.RunTestSuite({
 *   suiteId: "suite-uuid",
 *   parallel: true
 * });
 * ```
 */
export class GraphQLTestingClient {
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLTestingClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Run a single test with the specified parameters.
     *
     * This method invokes a test on the server through GraphQL and returns the result.
     * If a progress callback is provided in params.onProgress, this method will subscribe
     * to real-time progress updates from the GraphQL server and forward them to the callback.
     *
     * @param params The parameters for running the test
     * @returns A Promise that resolves to a RunTestResult object
     *
     * @example
     * ```typescript
     * const result = await testingClient.RunTest({
     *   testId: "test-uuid",
     *   verbose: true,
     *   environment: "staging",
     *   onProgress: (progress) => {
     *     console.log(`${progress.currentStep}: ${progress.message} (${progress.percentage}%)`);
     *   }
     * });
     *
     * if (result.success) {
     *   console.log('Test passed!', result.result);
     * } else {
     *   console.error('Test failed:', result.errorMessage);
     * }
     * ```
     */
    public async RunTest(params: RunTestParams): Promise<RunTestResult> {
        let subscription: any;

        try {
            // Subscribe to progress updates if callback provided
            if (params.onProgress) {
                subscription = this._dataProvider.PushStatusUpdates(this._dataProvider.sessionId)
                    .subscribe((message: string) => {
                        try {
                            const parsed = JSON.parse(message);

                            // Filter for TestExecutionProgress messages from RunTestResolver
                            if (parsed.resolver === 'RunTestResolver' &&
                                parsed.type === 'TestExecutionProgress' &&
                                parsed.status === 'ok' &&
                                parsed.data?.progress) {

                                // Forward progress to callback
                                params.onProgress!(parsed.data.progress);
                            }
                        } catch (e) {
                            console.error('[GraphQLTestingClient] Failed to parse progress message:', e);
                        }
                    });
            }

            const mutation = gql`
                mutation RunTest(
                    $testId: String!,
                    $verbose: Boolean,
                    $environment: String,
                    $tags: String,
                    $variables: String
                ) {
                    RunTest(
                        testId: $testId,
                        verbose: $verbose,
                        environment: $environment,
                        tags: $tags,
                        variables: $variables
                    ) {
                        success
                        errorMessage
                        executionTimeMs
                        result
                    }
                }
            `;

            // Serialize tags array to JSON string for GraphQL
            const tagsJson = params.tags && params.tags.length > 0 ? JSON.stringify(params.tags) : undefined;
            // Serialize variables object to JSON string for GraphQL
            const variablesJson = params.variables ? JSON.stringify(params.variables) : undefined;

            const variables = {
                testId: params.testId,
                verbose: params.verbose,
                environment: params.environment,
                tags: tagsJson,
                variables: variablesJson
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return this.processTestResult(result.RunTest);

        } catch (e) {
            return this.handleError(e, 'RunTest');
        } finally {
            // Always clean up subscription
            if (subscription) {
                subscription.unsubscribe();
            }
        }
    }

    /**
     * Run a test suite with the specified parameters.
     *
     * If a progress callback is provided in params.onProgress, this method will subscribe
     * to real-time progress updates from the GraphQL server and forward them to the callback.
     *
     * @param params The parameters for running the test suite
     * @returns A Promise that resolves to a RunTestSuiteResult object
     *
     * @example
     * ```typescript
     * const result = await testingClient.RunTestSuite({
     *   suiteId: "suite-uuid",
     *   parallel: true,
     *   verbose: false,
     *   onProgress: (progress) => {
     *     console.log(`Progress: ${progress.message} (${progress.percentage}%)`);
     *   }
     * });
     *
     * console.log(`Suite: ${result.result.totalTests} tests run`);
     * console.log(`Passed: ${result.result.passedTests}`);
     * ```
     */
    public async RunTestSuite(params: RunTestSuiteParams): Promise<RunTestSuiteResult> {
        let subscription: any;

        try {
            // Subscribe to progress updates if callback provided
            if (params.onProgress) {
                subscription = this._dataProvider.PushStatusUpdates(this._dataProvider.sessionId)
                    .subscribe((message: string) => {
                        try {
                            const parsed = JSON.parse(message);

                            // Filter for TestExecutionProgress messages from RunTestResolver
                            if (parsed.resolver === 'RunTestResolver' &&
                                parsed.type === 'TestExecutionProgress' &&
                                parsed.status === 'ok' &&
                                parsed.data?.progress) {

                                // Forward progress to callback
                                params.onProgress!(parsed.data.progress);
                            }
                        } catch (e) {
                            console.error('[GraphQLTestingClient] Failed to parse progress message:', e);
                        }
                    });
            }

            const mutation = gql`
                mutation RunTestSuite(
                    $suiteId: String!,
                    $verbose: Boolean,
                    $environment: String,
                    $parallel: Boolean,
                    $tags: String,
                    $variables: String,
                    $selectedTestIds: String,
                    $sequenceStart: Int,
                    $sequenceEnd: Int
                ) {
                    RunTestSuite(
                        suiteId: $suiteId,
                        verbose: $verbose,
                        environment: $environment,
                        parallel: $parallel,
                        tags: $tags,
                        variables: $variables,
                        selectedTestIds: $selectedTestIds,
                        sequenceStart: $sequenceStart,
                        sequenceEnd: $sequenceEnd
                    ) {
                        success
                        errorMessage
                        executionTimeMs
                        result
                    }
                }
            `;

            // Serialize tags array to JSON string for GraphQL
            const tagsJson = params.tags && params.tags.length > 0 ? JSON.stringify(params.tags) : undefined;
            // Serialize variables object to JSON string for GraphQL
            const variablesJson = params.variables ? JSON.stringify(params.variables) : undefined;
            // Serialize selectedTestIds array to JSON string for GraphQL
            const selectedTestIdsJson = params.selectedTestIds && params.selectedTestIds.length > 0
                ? JSON.stringify(params.selectedTestIds)
                : undefined;

            const variables = {
                suiteId: params.suiteId,
                verbose: params.verbose,
                environment: params.environment,
                parallel: params.parallel,
                tags: tagsJson,
                variables: variablesJson,
                selectedTestIds: selectedTestIdsJson,
                sequenceStart: params.sequenceStart,
                sequenceEnd: params.sequenceEnd
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return this.processSuiteResult(result.RunTestSuite);

        } catch (e) {
            return this.handleError(e, 'RunTestSuite');
        } finally {
            // Always clean up subscription
            if (subscription) {
                subscription.unsubscribe();
            }
        }
    }

    /**
     * Check if a test is currently running
     *
     * @param testId The test ID to check
     * @returns True if the test is running, false otherwise
     */
    public async IsTestRunning(testId: string): Promise<boolean> {
        try {
            const query = gql`
                query IsTestRunning($testId: String!) {
                    IsTestRunning(testId: $testId)
                }
            `;

            const result = await this._dataProvider.ExecuteGQL(query, { testId });
            return result.IsTestRunning;

        } catch (e) {
            LogError(`Error checking test running status: ${(e as Error).message}`);
            return false;
        }
    }

    // ===== Helper Methods =====

    private processTestResult(result: any): RunTestResult {
        if (!result) {
            throw new Error("Invalid response from server");
        }

        let parsedResult: any;
        try {
            parsedResult = SafeJSONParse(result.result);
        } catch (e) {
            parsedResult = result.result;
        }

        return {
            success: result.success,
            errorMessage: result.errorMessage,
            executionTimeMs: result.executionTimeMs,
            result: parsedResult
        };
    }

    private processSuiteResult(result: any): RunTestSuiteResult {
        if (!result) {
            throw new Error("Invalid response from server");
        }

        let parsedResult: any;
        try {
            parsedResult = SafeJSONParse(result.result);
        } catch (e) {
            parsedResult = result.result;
        }

        return {
            success: result.success,
            errorMessage: result.errorMessage,
            executionTimeMs: result.executionTimeMs,
            result: parsedResult
        };
    }

    private handleError(error: any, operation: string): any {
        const errorMsg = (error as Error).message;
        LogError(`${operation} failed: ${errorMsg}`);

        return {
            success: false,
            errorMessage: errorMsg,
            result: null
        };
    }
}
