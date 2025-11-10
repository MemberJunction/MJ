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
import { LogError, LogStatus } from '@memberjunction/core';
import { TestEngine } from '@memberjunction/testing-engine';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

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
    testRun?: any;
}

// ===== Resolver =====

@Resolver()
export class RunTestResolver extends ResolverBase {

    /**
     * Execute a single test
     */
    @Mutation(() => TestRunResult)
    async RunTest(
        @Arg('testId') testId: string,
        @Arg('verbose', { nullable: true }) verbose: boolean = true,
        @Arg('environment', { nullable: true }) environment?: string,
        @PubSub() pubSub?: PubSubEngine,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<TestRunResult> {
        const startTime = Date.now();

        try {
            const user = this.GetUserFromPayload(userPayload);
            if (!user) {
                throw new Error('User context required');
            }

            LogStatus(`[RunTestResolver] Starting test execution: ${testId}`);

            // Get singleton instance
            const engine = TestEngine.Instance;

            // Configure engine (loads driver and oracle registries)
            await engine.Config(verbose, user);

            // Create progress callback if we have pubSub
            const progressCallback = pubSub ?
                this.createProgressCallback(pubSub, userPayload, testId) :
                undefined;

            // Run the test
            const options = {
                verbose,
                environment,
                progressCallback
            };

            const result = await engine.RunTest(testId, options, user);

            // Publish completion
            if (pubSub && result.testRunId) {
                this.publishComplete(pubSub, userPayload, result);
            }

            const executionTime = Date.now() - startTime;

            LogStatus(`[RunTestResolver] Test completed: ${result.status} in ${executionTime}ms`);

            return {
                success: result.status === 'Passed',
                result: JSON.stringify(result),
                executionTimeMs: executionTime
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMsg = (error as Error).message;

            LogError(`[RunTestResolver] Test execution failed: ${errorMsg}`);

            // Publish error
            if (pubSub) {
                this.publishError(pubSub, userPayload, testId, errorMsg);
            }

            return {
                success: false,
                errorMessage: errorMsg,
                result: JSON.stringify({}),
                executionTimeMs: executionTime
            };
        }
    }

    /**
     * Execute a test suite
     */
    @Mutation(() => TestSuiteRunResult)
    async RunTestSuite(
        @Arg('suiteId') suiteId: string,
        @Arg('verbose', { nullable: true }) verbose: boolean = true,
        @Arg('environment', { nullable: true }) environment?: string,
        @Arg('parallel', { nullable: true }) parallel: boolean = false,
        @PubSub() pubSub?: PubSubEngine,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<TestSuiteRunResult> {
        const startTime = Date.now();

        try {
            const user = this.GetUserFromPayload(userPayload);
            if (!user) {
                throw new Error('User context required');
            }

            LogStatus(`[RunTestResolver] Starting suite execution: ${suiteId}`);

            const engine = TestEngine.Instance;
            await engine.Config(verbose, user);

            // Create progress callback
            const progressCallback = pubSub ?
                this.createProgressCallback(pubSub, userPayload, suiteId) :
                undefined;

            const options = {
                verbose,
                environment,
                parallel,
                progressCallback
            };

            const result = await engine.RunSuite(suiteId, options, user);

            const executionTime = Date.now() - startTime;

            LogStatus(`[RunTestResolver] Suite completed: ${result.totalTests} tests in ${executionTime}ms`);

            return {
                success: result.status === 'Completed',
                result: JSON.stringify(result),
                executionTimeMs: executionTime
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMsg = (error as Error).message;

            LogError(`[RunTestResolver] Suite execution failed: ${errorMsg}`);

            return {
                success: false,
                errorMessage: errorMsg,
                result: JSON.stringify({}),
                executionTimeMs: executionTime
            };
        }
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
            metadata?: any;
        }) => {
            LogStatus(`[RunTestResolver] Progress: ${progress.step} - ${progress.percentage}%`);

            // Get test run from metadata
            const testRun = progress.metadata?.testRun;

            const progressMsg: TestExecutionStreamMessage = {
                sessionId: userPayload.sessionId || '',
                testRunId: testRun?.ID || testId,
                type: 'progress',
                testRun: testRun ? testRun.GetAll() : undefined,
                progress: {
                    currentStep: progress.step,
                    percentage: progress.percentage,
                    message: progress.message,
                    testName: progress.metadata?.testName,
                    driverType: progress.metadata?.driverType,
                    oracleEvaluation: progress.metadata?.oracleType
                },
                timestamp: new Date()
            };

            this.publishProgress(pubSub, progressMsg, userPayload);
        };
    }

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

    private publishComplete(pubSub: PubSubEngine, userPayload: UserPayload, result: any) {
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
}
