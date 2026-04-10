import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { SafeJSONParse } from "@memberjunction/global";
import { FireAndForgetHelper } from "./fireAndForgetHelper";

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
    result: Record<string, unknown> | null;
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
    result: Record<string, unknown> | null;
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
 * Uses the fire-and-forget pattern to avoid Azure proxy timeouts (~230s)
 * on long-running test executions. Results are delivered via WebSocket PubSub.
 *
 * @example
 * ```typescript
 * const testingClient = new GraphQLTestingClient(graphQLProvider);
 *
 * const result = await testingClient.RunTest({
 *   testId: "test-uuid",
 *   verbose: true,
 *   environment: "dev",
 *   onProgress: (progress) => console.log(progress.message)
 * });
 *
 * const suiteResult = await testingClient.RunTestSuite({
 *   suiteId: "suite-uuid",
 *   parallel: true
 * });
 * ```
 */
export class GraphQLTestingClient {
    private _dataProvider: GraphQLDataProvider;

    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Run a single test using fire-and-forget to avoid Azure proxy timeouts.
     * The mutation returns immediately, and the result is delivered via WebSocket.
     */
    public async RunTest(params: RunTestParams): Promise<RunTestResult> {
        try {
            const mutation = this.buildRunTestMutation();
            const variables = this.buildRunTestVariables(params);

            return await FireAndForgetHelper.Execute<RunTestResult>({
                dataProvider: this._dataProvider,
                mutation,
                variables,
                mutationFieldName: 'RunTest',
                operationLabel: 'RunTest',
                validateAck: (ack) => ack?.success === true,
                isCompletionEvent: (parsed) => this.isTestCompletionEvent(parsed, params.testId),
                extractResult: (parsed) => this.extractTestResult(parsed),
                onMessage: params.onProgress
                    ? (parsed) => this.forwardTestProgress(parsed, params.onProgress!)
                    : undefined,
                createErrorResult: (msg) => ({
                    success: false,
                    errorMessage: msg,
                    result: null
                }),
            });
        } catch (e) {
            return this.handleError(e, 'RunTest');
        }
    }

    /**
     * Run a test suite using fire-and-forget to avoid Azure proxy timeouts.
     * The mutation returns immediately, and the result is delivered via WebSocket.
     */
    public async RunTestSuite(params: RunTestSuiteParams): Promise<RunTestSuiteResult> {
        try {
            const mutation = this.buildRunTestSuiteMutation();
            const variables = this.buildRunTestSuiteVariables(params);

            return await FireAndForgetHelper.Execute<RunTestSuiteResult>({
                dataProvider: this._dataProvider,
                mutation,
                variables,
                mutationFieldName: 'RunTestSuite',
                operationLabel: 'RunTestSuite',
                validateAck: (ack) => ack?.success === true,
                isCompletionEvent: (parsed) => this.isSuiteCompletionEvent(parsed, params.suiteId),
                extractResult: (parsed) => this.extractSuiteResult(parsed),
                onMessage: params.onProgress
                    ? (parsed) => this.forwardTestProgress(parsed, params.onProgress!)
                    : undefined,
                createErrorResult: (msg) => ({
                    success: false,
                    errorMessage: msg,
                    result: null
                }),
            });
        } catch (e) {
            return this.handleError(e, 'RunTestSuite');
        }
    }

    /**
     * Check if a test is currently running
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

    // ===== Mutation Builders =====

    private buildRunTestMutation(): string {
        return gql`
            mutation RunTest(
                $testId: String!,
                $verbose: Boolean,
                $environment: String,
                $tags: String,
                $variables: String,
                $fireAndForget: Boolean
            ) {
                RunTest(
                    testId: $testId,
                    verbose: $verbose,
                    environment: $environment,
                    tags: $tags,
                    variables: $variables,
                    fireAndForget: $fireAndForget
                ) {
                    success
                    errorMessage
                    executionTimeMs
                    result
                }
            }
        `;
    }

    private buildRunTestSuiteMutation(): string {
        return gql`
            mutation RunTestSuite(
                $suiteId: String!,
                $verbose: Boolean,
                $environment: String,
                $parallel: Boolean,
                $tags: String,
                $variables: String,
                $selectedTestIds: String,
                $sequenceStart: Int,
                $sequenceEnd: Int,
                $fireAndForget: Boolean
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
                    sequenceEnd: $sequenceEnd,
                    fireAndForget: $fireAndForget
                ) {
                    success
                    errorMessage
                    executionTimeMs
                    result
                }
            }
        `;
    }

    // ===== Variable Builders =====

    private buildRunTestVariables(params: RunTestParams): Record<string, unknown> {
        const tagsJson = params.tags && params.tags.length > 0 ? JSON.stringify(params.tags) : undefined;
        const variablesJson = params.variables ? JSON.stringify(params.variables) : undefined;

        return {
            testId: params.testId,
            verbose: params.verbose,
            environment: params.environment,
            tags: tagsJson,
            variables: variablesJson,
            fireAndForget: true
        };
    }

    private buildRunTestSuiteVariables(params: RunTestSuiteParams): Record<string, unknown> {
        const tagsJson = params.tags && params.tags.length > 0 ? JSON.stringify(params.tags) : undefined;
        const variablesJson = params.variables ? JSON.stringify(params.variables) : undefined;
        const selectedTestIdsJson = params.selectedTestIds && params.selectedTestIds.length > 0
            ? JSON.stringify(params.selectedTestIds)
            : undefined;

        return {
            suiteId: params.suiteId,
            verbose: params.verbose,
            environment: params.environment,
            parallel: params.parallel,
            tags: tagsJson,
            variables: variablesJson,
            selectedTestIds: selectedTestIdsJson,
            sequenceStart: params.sequenceStart,
            sequenceEnd: params.sequenceEnd,
            fireAndForget: true
        };
    }

    // ===== Event Matching =====

    /**
     * Check if a PubSub message is the fire-and-forget completion event for this test.
     */
    private isTestCompletionEvent(parsed: Record<string, unknown>, testId: string): boolean {
        const data = parsed.data as Record<string, unknown> | undefined;
        return parsed.resolver === 'RunTestResolver' &&
            parsed.type === 'FireAndForgetComplete' &&
            data?.type === 'complete' &&
            data?.testId === testId;
    }

    /**
     * Check if a PubSub message is the fire-and-forget completion event for this suite.
     */
    private isSuiteCompletionEvent(parsed: Record<string, unknown>, suiteId: string): boolean {
        const data = parsed.data as Record<string, unknown> | undefined;
        return parsed.resolver === 'RunTestResolver' &&
            parsed.type === 'FireAndForgetSuiteComplete' &&
            data?.type === 'complete' &&
            data?.suiteId === suiteId;
    }

    // ===== Result Extraction =====

    private extractTestResult(parsed: Record<string, unknown>): RunTestResult {
        const data = parsed.data as Record<string, unknown>;
        return {
            success: data.success as boolean,
            errorMessage: data.errorMessage as string | undefined,
            executionTimeMs: data.executionTimeMs as number | undefined,
            result: data.result ? SafeJSONParse(data.result as string) : null
        };
    }

    private extractSuiteResult(parsed: Record<string, unknown>): RunTestSuiteResult {
        const data = parsed.data as Record<string, unknown>;
        return {
            success: data.success as boolean,
            errorMessage: data.errorMessage as string | undefined,
            executionTimeMs: data.executionTimeMs as number | undefined,
            result: data.result ? SafeJSONParse(data.result as string) : null
        };
    }

    // ===== Progress Forwarding =====

    /**
     * Forward test execution progress from PubSub messages to the onProgress callback.
     */
    private forwardTestProgress(
        parsed: Record<string, unknown>,
        onProgress: (progress: TestExecutionProgress) => void
    ): void {
        if (parsed.resolver === 'RunTestResolver' &&
            parsed.type === 'TestExecutionProgress' &&
            parsed.status === 'ok') {
            const data = parsed.data as Record<string, unknown> | undefined;
            const progress = data?.progress as TestExecutionProgress | undefined;
            if (progress) {
                onProgress(progress);
            }
        }
    }

    // ===== Error Handling =====

    private handleError(error: unknown, operation: string): RunTestResult | RunTestSuiteResult {
        const errorMsg = (error as Error).message;
        LogError(`${operation} failed: ${errorMsg}`);

        // Provide helpful messages for common timeout/network errors
        const isFetchError = errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError');
        const userMessage = isFetchError
            ? 'Lost connection to the server. The test may still be running. Please refresh to check the latest status.'
            : errorMsg;

        return {
            success: false,
            errorMessage: userMessage,
            result: null
        };
    }
}
