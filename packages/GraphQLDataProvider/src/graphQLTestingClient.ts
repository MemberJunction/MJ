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
     *
     * @param params The parameters for running the test
     * @returns A Promise that resolves to a RunTestResult object
     *
     * @example
     * ```typescript
     * const result = await testingClient.RunTest({
     *   testId: "test-uuid",
     *   verbose: true,
     *   environment: "staging"
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
        try {
            const mutation = gql`
                mutation RunTest(
                    $testId: String!,
                    $verbose: Boolean,
                    $environment: String
                ) {
                    RunTest(
                        testId: $testId,
                        verbose: $verbose,
                        environment: $environment
                    ) {
                        success
                        errorMessage
                        executionTimeMs
                        result
                    }
                }
            `;

            const variables = {
                testId: params.testId,
                verbose: params.verbose,
                environment: params.environment
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return this.processTestResult(result.RunTest);

        } catch (e) {
            return this.handleError(e, 'RunTest');
        }
    }

    /**
     * Run a test suite with the specified parameters.
     *
     * @param params The parameters for running the test suite
     * @returns A Promise that resolves to a RunTestSuiteResult object
     *
     * @example
     * ```typescript
     * const result = await testingClient.RunTestSuite({
     *   suiteId: "suite-uuid",
     *   parallel: true,
     *   verbose: false
     * });
     *
     * console.log(`Suite: ${result.result.totalTests} tests run`);
     * console.log(`Passed: ${result.result.passedTests}`);
     * ```
     */
    public async RunTestSuite(params: RunTestSuiteParams): Promise<RunTestSuiteResult> {
        try {
            const mutation = gql`
                mutation RunTestSuite(
                    $suiteId: String!,
                    $verbose: Boolean,
                    $environment: String,
                    $parallel: Boolean
                ) {
                    RunTestSuite(
                        suiteId: $suiteId,
                        verbose: $verbose,
                        environment: $environment,
                        parallel: $parallel
                    ) {
                        success
                        errorMessage
                        executionTimeMs
                        result
                    }
                }
            `;

            const variables = {
                suiteId: params.suiteId,
                verbose: params.verbose,
                environment: params.environment,
                parallel: params.parallel
            };

            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return this.processSuiteResult(result.RunTestSuite);

        } catch (e) {
            return this.handleError(e, 'RunTestSuite');
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
