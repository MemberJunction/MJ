import {
    Resolver,
    Mutation,
    Query,
    Arg,
    Ctx,
    ObjectType,
    Field,
    PubSub,
    PubSubEngine,
    ID,
    Int
} from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { TestEngine } from '@memberjunction/testing-engine';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { TestRunVariables, TestLogMessage, TestRunResult as EngineTestRunResult } from '@memberjunction/testing-engine-base';

// ===== GraphQL Types =====

@ObjectType()
export class TestRunResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    errorMessage?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;

    @Field()
    result: string; // JSON serialized TestRunResult
}

@ObjectType()
export class TestSuiteRunResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    errorMessage?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;

    @Field()
    result: string; // JSON serialized TestSuiteRunResult
}

@ObjectType()
export class TestExecutionProgress {
    @Field()
    currentStep: string;

    @Field(() => Int)
    percentage: number;

    @Field()
    message: string;

    @Field({ nullable: true })
    testName?: string;

    @Field({ nullable: true })
    driverType?: string;

    @Field({ nullable: true })
    oracleEvaluation?: string;
}

@ObjectType()
export class TestExecutionStreamMessage {
    @Field(() => ID)
    sessionId: string;

    @Field(() => ID)
    testRunId: string;

    @Field()
    type: 'progress' | 'oracle_eval' | 'complete' | 'error';

    @Field({ nullable: true })
    progress?: TestExecutionProgress;

    @Field()
    timestamp: Date;

    // Not a GraphQL field - used internally
    testRun?: Record<string, unknown>;
}

// ===== Resolver =====

@Resolver()
export class RunTestResolver extends ResolverBase {

    /**
     * Execute a single test.
     * Supports fire-and-forget mode to avoid Azure proxy timeouts on long-running tests.
     */
    @Mutation(() => TestRunResult)
    async RunTest(
        @Arg('testId') testId: string,
        @Arg('verbose', { nullable: true }) verbose: boolean = true,
        @Arg('environment', { nullable: true }) environment?: string,
        @Arg('tags', { nullable: true }) tags?: string,
        @Arg('variables', { nullable: true }) variables?: string,
        @Arg('fireAndForget', { nullable: true }) fireAndForget?: boolean,
        @PubSub() pubSub?: PubSubEngine,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<TestRunResult> {
        const user = this.GetUserFromPayload(userPayload);
        if (!user) {
            return { success: false, errorMessage: 'User context required', result: JSON.stringify({}) };
        }

        if (fireAndForget && pubSub) {
            // Fire-and-forget: start in background, return immediately
            this.executeTestInBackground(testId, verbose, environment, tags, variables, pubSub, userPayload, user);
            LogStatus(`🔥 Fire-and-forget: Test ${testId} execution started in background`);
            return {
                success: true,
                result: JSON.stringify({ accepted: true, fireAndForget: true })
            };
        }

        // Synchronous mode (default): wait for execution to complete
        return this.executeTest(testId, verbose, environment, tags, variables, pubSub, userPayload, user);
    }

    /**
     * Execute a test suite.
     * Supports fire-and-forget mode to avoid Azure proxy timeouts on long-running suites.
     */
    @Mutation(() => TestSuiteRunResult)
    async RunTestSuite(
        @Arg('suiteId') suiteId: string,
        @Arg('verbose', { nullable: true }) verbose: boolean = true,
        @Arg('environment', { nullable: true }) environment?: string,
        @Arg('parallel', { nullable: true }) parallel: boolean = false,
        @Arg('tags', { nullable: true }) tags?: string,
        @Arg('variables', { nullable: true }) variables?: string,
        @Arg('selectedTestIds', { nullable: true }) selectedTestIds?: string,
        @Arg('sequenceStart', () => Int, { nullable: true }) sequenceStart?: number,
        @Arg('sequenceEnd', () => Int, { nullable: true }) sequenceEnd?: number,
        @Arg('fireAndForget', { nullable: true }) fireAndForget?: boolean,
        @PubSub() pubSub?: PubSubEngine,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<TestSuiteRunResult> {
        const user = this.GetUserFromPayload(userPayload);
        if (!user) {
            return { success: false, errorMessage: 'User context required', result: JSON.stringify({}) };
        }

        if (fireAndForget && pubSub) {
            // Fire-and-forget: start in background, return immediately
            this.executeSuiteInBackground(
                suiteId, verbose, environment, parallel, tags, variables,
                selectedTestIds, sequenceStart, sequenceEnd, pubSub, userPayload, user
            );
            LogStatus(`🔥 Fire-and-forget: Suite ${suiteId} execution started in background`);
            return {
                success: true,
                result: JSON.stringify({ accepted: true, fireAndForget: true })
            };
        }

        // Synchronous mode (default): wait for execution to complete
        return this.executeSuite(
            suiteId, verbose, environment, parallel, tags, variables,
            selectedTestIds, sequenceStart, sequenceEnd, pubSub, userPayload, user
        );
    }

    /**
     * Query to check if a test is currently running
     */
    @Query(() => Boolean)
    async IsTestRunning(
        @Arg('testId') testId: string,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<boolean> {
        // TODO: Implement running test tracking
        // For now, return false
        return false;
    }

    // ===== Core Execution Methods =====

    /**
     * Execute a single test synchronously and return the result.
     */
    private async executeTest(
        testId: string,
        verbose: boolean,
        environment: string | undefined,
        tags: string | undefined,
        variables: string | undefined,
        pubSub: PubSubEngine | undefined,
        userPayload: UserPayload,
        user: UserInfo
    ): Promise<TestRunResult> {
        const startTime = Date.now();

        try {
            LogStatus(`[RunTestResolver] Starting test execution: ${testId}`);

            const engine = TestEngine.Instance;
            await engine.Config(verbose, user);

            const progressCallback = pubSub ? this.createProgressCallback(pubSub, userPayload, testId) : undefined;
            const logCallback = pubSub ? this.createLogCallback(pubSub, userPayload, testId) : undefined;
            const parsedVariables = this.parseVariablesJson(variables);

            const options = { verbose, environment, tags, variables: parsedVariables, progressCallback, logCallback };
            const result = await engine.RunTest(testId, options, user);

            const testRunResult = this.buildTestRunResult(result, startTime, pubSub, userPayload);

            // Publish fire-and-forget completion event (used by background mode, harmless in sync mode)
            if (pubSub) {
                this.publishFireAndForgetComplete(pubSub, userPayload, testId, testRunResult);
            }

            return testRunResult;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMsg = (error as Error).message;
            LogError(`[RunTestResolver] Test execution failed: ${errorMsg}`);

            if (pubSub) {
                this.publishError(pubSub, userPayload, testId, errorMsg);
            }

            return { success: false, errorMessage: errorMsg, result: JSON.stringify({}), executionTimeMs: executionTime };
        }
    }

    /**
     * Execute a test in background (fire-and-forget).
     * Errors are published via PubSub, not propagated.
     */
    private executeTestInBackground(
        testId: string,
        verbose: boolean,
        environment: string | undefined,
        tags: string | undefined,
        variables: string | undefined,
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        user: UserInfo
    ): void {
        this.executeTest(testId, verbose, environment, tags, variables, pubSub, userPayload, user)
            .catch((error: unknown) => {
                const errorMessage = (error instanceof Error) ? error.message : 'Unknown background test execution error';
                LogError(`🔥 Fire-and-forget test execution failed: ${errorMessage}`, undefined, error);
                this.publishFireAndForgetError(pubSub, userPayload, testId, errorMessage);
            });
    }

    /**
     * Execute a test suite synchronously and return the result.
     */
    private async executeSuite(
        suiteId: string,
        verbose: boolean,
        environment: string | undefined,
        parallel: boolean,
        tags: string | undefined,
        variables: string | undefined,
        selectedTestIds: string | undefined,
        sequenceStart: number | undefined,
        sequenceEnd: number | undefined,
        pubSub: PubSubEngine | undefined,
        userPayload: UserPayload,
        user: UserInfo
    ): Promise<TestSuiteRunResult> {
        const startTime = Date.now();

        try {
            LogStatus(`[RunTestResolver] Starting suite execution: ${suiteId}`);

            const engine = TestEngine.Instance;
            await engine.Config(verbose, user);

            const progressCallback = pubSub ? this.createProgressCallback(pubSub, userPayload, suiteId) : undefined;
            const logCallback = pubSub ? this.createLogCallback(pubSub, userPayload, suiteId) : undefined;
            const parsedSelectedTestIds = this.parseJsonArray(selectedTestIds, 'selectedTestIds');
            const parsedVariables = this.parseVariablesJson(variables);

            const options = {
                verbose, environment, parallel, tags,
                variables: parsedVariables, selectedTestIds: parsedSelectedTestIds,
                sequenceStart, sequenceEnd, progressCallback, logCallback
            };

            const result = await engine.RunSuite(suiteId, options, user);
            const executionTime = Date.now() - startTime;

            LogStatus(`[RunTestResolver] Suite completed: ${result.totalTests} tests in ${executionTime}ms`);

            const suiteRunResult: TestSuiteRunResult = {
                success: result.status === 'Completed',
                result: JSON.stringify(result),
                executionTimeMs: executionTime
            };

            // Publish fire-and-forget completion event
            if (pubSub) {
                this.publishFireAndForgetSuiteComplete(pubSub, userPayload, suiteId, suiteRunResult);
            }

            return suiteRunResult;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMsg = (error as Error).message;
            LogError(`[RunTestResolver] Suite execution failed: ${errorMsg}`);

            return { success: false, errorMessage: errorMsg, result: JSON.stringify({}), executionTimeMs: executionTime };
        }
    }

    /**
     * Execute a test suite in background (fire-and-forget).
     * Errors are published via PubSub, not propagated.
     */
    private executeSuiteInBackground(
        suiteId: string,
        verbose: boolean,
        environment: string | undefined,
        parallel: boolean,
        tags: string | undefined,
        variables: string | undefined,
        selectedTestIds: string | undefined,
        sequenceStart: number | undefined,
        sequenceEnd: number | undefined,
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        user: UserInfo
    ): void {
        this.executeSuite(
            suiteId, verbose, environment, parallel, tags, variables,
            selectedTestIds, sequenceStart, sequenceEnd, pubSub, userPayload, user
        ).catch((error: unknown) => {
            const errorMessage = (error instanceof Error) ? error.message : 'Unknown background suite execution error';
            LogError(`🔥 Fire-and-forget suite execution failed: ${errorMessage}`, undefined, error);
            this.publishFireAndForgetSuiteError(pubSub, userPayload, suiteId, errorMessage);
        });
    }

    // ===== Result Building =====

    /**
     * Build a TestRunResult from the engine result, handling both single and array results.
     */
    private buildTestRunResult(
        result: EngineTestRunResult | EngineTestRunResult[],
        startTime: number,
        pubSub: PubSubEngine | undefined,
        userPayload: UserPayload
    ): TestRunResult {
        const executionTime = Date.now() - startTime;

        if (Array.isArray(result)) {
            const allPassed = result.every((r) => r.status === 'Passed');

            if (pubSub) {
                for (const iterationResult of result) {
                    this.publishComplete(pubSub, userPayload, iterationResult);
                }
            }

            LogStatus(`[RunTestResolver] Test completed: ${result.length} iterations, ${allPassed ? 'all passed' : 'some failed'} in ${executionTime}ms`);
            return { success: allPassed, result: JSON.stringify(result), executionTimeMs: executionTime };
        }

        const passed = result.status === 'Passed';

        if (pubSub && result.testRunId) {
            this.publishComplete(pubSub, userPayload, result);
        }

        LogStatus(`[RunTestResolver] Test completed: ${result.status} in ${executionTime}ms`);
        return { success: passed, result: JSON.stringify(result), executionTimeMs: executionTime };
    }

    // ===== Input Parsing =====

    private parseVariablesJson(variables: string | undefined): TestRunVariables | undefined {
        if (!variables) return undefined;
        try {
            return JSON.parse(variables) as TestRunVariables;
        } catch (e) {
            LogError(`[RunTestResolver] Failed to parse variables: ${variables}`);
            return undefined;
        }
    }

    private parseJsonArray(json: string | undefined, fieldName: string): string[] | undefined {
        if (!json) return undefined;
        try {
            return JSON.parse(json) as string[];
        } catch (e) {
            LogError(`[RunTestResolver] Failed to parse ${fieldName}: ${json}`);
            return undefined;
        }
    }

    // ===== Progress Callbacks =====

    /**
     * Create progress callback for test execution
     */
    private createProgressCallback(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        testId: string
    ) {
        return (progress: {
            step: string;
            percentage: number;
            message: string;
            metadata?: Record<string, unknown>;
        }) => {
            LogStatus(`[RunTestResolver] Progress: ${progress.step} - ${progress.percentage}%`);

            const testRun = progress.metadata?.testRun as Record<string, unknown> | undefined;

            const progressMsg: TestExecutionStreamMessage = {
                sessionId: userPayload.sessionId || '',
                testRunId: (testRun as { ID?: string })?.ID || testId,
                type: 'progress',
                testRun: testRun && typeof (testRun as { GetAll?: () => Record<string, unknown> }).GetAll === 'function'
                    ? (testRun as { GetAll: () => Record<string, unknown> }).GetAll()
                    : undefined,
                progress: {
                    currentStep: progress.step,
                    percentage: progress.percentage,
                    message: progress.message,
                    testName: progress.metadata?.testName as string | undefined,
                    driverType: progress.metadata?.driverType as string | undefined,
                    oracleEvaluation: progress.metadata?.oracleType as string | undefined
                },
                timestamp: new Date()
            };

            this.publishProgress(pubSub, progressMsg, userPayload);
        };
    }

    /**
     * Create log callback that streams driver/engine log messages to the UI
     * as progress updates, so they appear in the execution log in real-time.
     */
    private createLogCallback(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        testId: string
    ) {
        return (message: TestLogMessage) => {
            const progressMsg: TestExecutionStreamMessage = {
                sessionId: userPayload.sessionId || '',
                testRunId: testId,
                type: 'progress',
                progress: {
                    currentStep: 'driver_log',
                    percentage: -1, // Signal that percentage should not be updated
                    message: message.message,
                },
                timestamp: message.timestamp
            };

            this.publishProgress(pubSub, progressMsg, userPayload);
        };
    }

    // ===== PubSub Publishing =====

    private publishProgress(pubSub: PubSubEngine, data: TestExecutionStreamMessage, userPayload: UserPayload) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RunTestResolver',
                type: 'TestExecutionProgress',
                status: 'ok',
                data,
            }),
            sessionId: userPayload.sessionId,
        });
    }

    private publishComplete(pubSub: PubSubEngine, userPayload: UserPayload, result: EngineTestRunResult) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RunTestResolver',
                type: 'TestExecutionComplete',
                status: 'ok',
                data: {
                    sessionId: userPayload.sessionId,
                    testRunId: result.testRunId,
                    type: 'complete',
                    result: JSON.stringify(result),
                    timestamp: new Date()
                },
            }),
            sessionId: userPayload.sessionId,
        });
    }

    private publishError(pubSub: PubSubEngine, userPayload: UserPayload, testId: string, errorMsg: string) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RunTestResolver',
                type: 'TestExecutionError',
                status: 'error',
                data: {
                    sessionId: userPayload.sessionId,
                    testRunId: testId,
                    type: 'error',
                    errorMessage: errorMsg,
                    timestamp: new Date()
                },
            }),
            sessionId: userPayload.sessionId,
        });
    }

    /**
     * Publish a fire-and-forget completion event for a single test.
     * Includes testId for client-side correlation and the full result.
     */
    private publishFireAndForgetComplete(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        testId: string,
        testRunResult: TestRunResult
    ) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RunTestResolver',
                type: 'FireAndForgetComplete',
                status: 'ok',
                data: {
                    sessionId: userPayload.sessionId,
                    testId,
                    type: 'complete',
                    success: testRunResult.success,
                    errorMessage: testRunResult.errorMessage,
                    executionTimeMs: testRunResult.executionTimeMs,
                    result: testRunResult.result,
                    timestamp: new Date()
                },
            }),
            sessionId: userPayload.sessionId,
        });
    }

    /**
     * Publish a fire-and-forget error event for a single test.
     */
    private publishFireAndForgetError(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        testId: string,
        errorMessage: string
    ) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RunTestResolver',
                type: 'FireAndForgetComplete',
                status: 'ok',
                data: {
                    sessionId: userPayload.sessionId,
                    testId,
                    type: 'complete',
                    success: false,
                    errorMessage,
                    result: JSON.stringify({ success: false, errorMessage }),
                    timestamp: new Date()
                },
            }),
            sessionId: userPayload.sessionId,
        });
    }

    /**
     * Publish a fire-and-forget completion event for a test suite.
     * Includes suiteId for client-side correlation and the full result.
     */
    private publishFireAndForgetSuiteComplete(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        suiteId: string,
        suiteRunResult: TestSuiteRunResult
    ) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RunTestResolver',
                type: 'FireAndForgetSuiteComplete',
                status: 'ok',
                data: {
                    sessionId: userPayload.sessionId,
                    suiteId,
                    type: 'complete',
                    success: suiteRunResult.success,
                    errorMessage: suiteRunResult.errorMessage,
                    executionTimeMs: suiteRunResult.executionTimeMs,
                    result: suiteRunResult.result,
                    timestamp: new Date()
                },
            }),
            sessionId: userPayload.sessionId,
        });
    }

    /**
     * Publish a fire-and-forget error event for a test suite.
     */
    private publishFireAndForgetSuiteError(
        pubSub: PubSubEngine,
        userPayload: UserPayload,
        suiteId: string,
        errorMessage: string
    ) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
                resolver: 'RunTestResolver',
                type: 'FireAndForgetSuiteComplete',
                status: 'ok',
                data: {
                    sessionId: userPayload.sessionId,
                    suiteId,
                    type: 'complete',
                    success: false,
                    errorMessage,
                    result: JSON.stringify({ success: false, errorMessage }),
                    timestamp: new Date()
                },
            }),
            sessionId: userPayload.sessionId,
        });
    }
}
