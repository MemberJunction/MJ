# Testing Framework UI Invocation - Implementation Proposal

## Executive Summary

This proposal outlines the complete architecture for invoking tests from the Testing Framework Dashboard UI, including:
- GraphQL resolver for test execution
- GraphQL client for UI → Server communication
- Real-time progress streaming via PubSub
- UX integration points in the dashboard
- Progress callback enhancement to Test Engine

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Testing Dashboard UI                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Overview Tab │  │Execution Tab │  │ Details Panel│              │
│  │ Run buttons  │  │  Re-run btn  │  │  Run button  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┼──────────────────┘                      │
│                            │                                          │
│                     GraphQLTestingClient                             │
│                     (new specialist class)                           │
└────────────────────────────┼────────────────────────────────────────┘
                             │
                             │ GraphQL Mutation: RunTest(testId)
                             │ Subscription: testExecutionStream
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          MJServer                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ RunTestResolver (new)                                         │  │
│  │  - @Mutation RunTest(testId, options)                        │  │
│  │  - @Mutation RunTestSuite(suiteId, options)                  │  │
│  │  - @Subscription testExecutionStream(sessionId)              │  │
│  │  - Progress callback → PubSub                                │  │
│  └──────────────────────┬───────────────────────────────────────┘  │
│                         │                                            │
│                         ▼                                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ TestEngine.Instance                                           │  │
│  │  - Config()                                                   │  │
│  │  - RunTest(testId, options, user, progressCallback)          │  │
│  │  - RunSuite(suiteId, options, user, progressCallback)        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
                  Testing Framework Entities
                  (Test Runs, Results, Feedback)
```

---

## Part 1: Server-Side Implementation

### 1.1 Add Testing Engine to MJServer

**File:** `packages/MJServer/package.json`

```json
{
  "dependencies": {
    "@memberjunction/testing-engine": "workspace:*"
  }
}
```

**Action:** Run `npm install` at repo root after modifying package.json

---

### 1.2 Create RunTestResolver

**File:** `packages/MJServer/src/resolvers/RunTestResolver.ts`

```typescript
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
    Subscription,
    Root,
    ID,
    Int,
    Float
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
                success: result.status === 'Passed',
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
```

**Note:** Resolver auto-registers via glob pattern `src/resolvers/**/*Resolver.ts`

---

### 1.3 Enhance Test Engine with Progress Callback

**File:** `packages/TestingFramework/Engine/src/engine/TestEngine.ts`

**Current signature:**
```typescript
async RunTest(testId: string, options: TestRunOptions, contextUser: UserInfo): Promise<TestRunResult>
```

**Proposed enhancement:**
```typescript
interface TestRunOptions {
    verbose?: boolean;
    environment?: string;
    progressCallback?: (progress: TestProgress) => void;
}

interface TestProgress {
    step: string;
    percentage: number;
    message: string;
    metadata?: {
        testName?: string;
        testRun?: any;
        driverType?: string;
        oracleType?: string;
    };
}

async RunTest(testId: string, options: TestRunOptions, contextUser: UserInfo): Promise<TestRunResult> {
    // Existing code...

    // Add progress callbacks at key points:
    options.progressCallback?.({
        step: 'loading_test',
        percentage: 10,
        message: 'Loading test configuration',
        metadata: { testName: test.Name }
    });

    options.progressCallback?.({
        step: 'initializing_driver',
        percentage: 20,
        message: `Initializing ${driverType} driver`,
        metadata: { testName: test.Name, driverType }
    });

    options.progressCallback?.({
        step: 'executing_test',
        percentage: 40,
        message: 'Running test driver',
        metadata: { testName: test.Name, testRun, driverType }
    });

    // After driver execution
    options.progressCallback?.({
        step: 'evaluating_oracles',
        percentage: 70,
        message: `Evaluating ${oracles.length} oracles`,
        metadata: { testName: test.Name, testRun }
    });

    // For each oracle
    options.progressCallback?.({
        step: 'oracle_evaluation',
        percentage: 70 + (idx / oracles.length) * 20,
        message: `Evaluating ${oracle.Type} oracle`,
        metadata: { testName: test.Name, testRun, oracleType: oracle.Type }
    });

    options.progressCallback?.({
        step: 'complete',
        percentage: 100,
        message: `Test ${result.status}`,
        metadata: { testName: test.Name, testRun }
    });
}
```

---

## Part 2: GraphQL Client Implementation

### 2.1 Create GraphQLTestingClient

**File:** `packages/GraphQLDataProvider/src/graphQLTestingClient.ts`

```typescript
import { LogError, LogStatusEx } from "@memberjunction/core";
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
```

### 2.2 Export from GraphQLDataProvider

**File:** `packages/GraphQLDataProvider/src/index.ts`

```typescript
// Add to exports
export * from './graphQLTestingClient';
```

---

## Part 3: UI Integration

### 3.1 UX Integration Points

I recommend **4 primary integration points** for invoking tests:

#### **Option 1: Overview Tab - Run Buttons in Recent Runs Table** ⭐ RECOMMENDED
- **Location:** Testing Overview tab → Recent Test Runs table
- **Action:** Add "Re-run" button to each row
- **Why:** Most intuitive - users see test results and can immediately re-run
- **Visual:** Icon button with `fa-rotate-right` or `fa-play`

#### **Option 2: Test Run Detail Panel - Run Button**
- **Location:** When clicking a test run → Detail panel header
- **Action:** "Re-run Test" button in panel header next to close button
- **Why:** Natural place after viewing test details
- **Visual:** Prominent button in panel header

#### **Option 3: Suite Tree - Run Suite Button**
- **Location:** Suite hierarchy tree → Suite node action
- **Action:** "Run Suite" button/icon on suite nodes
- **Why:** Allows running entire suites from hierarchy
- **Visual:** Play icon next to suite name

#### **Option 4: Dedicated Test Selector**
- **Location:** New "Run Test" section in Execution tab
- **Action:** Dropdown to select test + "Run" button
- **Why:** Dedicated interface for ad-hoc test runs
- **Visual:** Material-style selector with prominent run button

### 3.2 Recommended Initial Implementation

**Start with Option 1 + Option 2:**

1. **Recent Runs Table:** Quick re-run from overview
2. **Detail Panel:** Re-run after reviewing results

This covers the most common use cases without overwhelming the UI.

---

### 3.3 UI Component Implementation

**File:** `packages/Angular/Explorer/dashboards/src/Testing/components/testing-overview.component.ts`

```typescript
// Add to imports
import { GraphQLTestingClient, RunTestResult } from '@memberjunction/graphql-dataprovider';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

// Add to component
export class TestingOverviewComponent implements OnInit, OnDestroy {
    // Existing code...

    private testingClient!: GraphQLTestingClient;
    runningTests = new Set<string>(); // Track which tests are running

    constructor(
        private instrumentationService: TestingInstrumentationService,
        private cdr: ChangeDetectorRef,
        private dataProvider: GraphQLDataProvider // Inject
    ) {
        // Existing constructor code...

        // Initialize testing client
        this.testingClient = new GraphQLTestingClient(this.dataProvider);
    }

    /**
     * Re-run a test from the recent runs table
     */
    async rerunTest(testId: string, testName: string): Promise<void> {
        if (this.runningTests.has(testId)) {
            console.warn('Test is already running');
            return;
        }

        try {
            this.runningTests.add(testId);
            this.cdr.markForCheck();

            console.log(`Starting test: ${testName}`);

            const result = await this.testingClient.RunTest({
                testId,
                verbose: true
            });

            if (result.success) {
                console.log('Test completed:', result.result);
                // Refresh the dashboard to show new results
                this.instrumentationService.refresh();
            } else {
                console.error('Test failed:', result.errorMessage);
                alert(`Test failed: ${result.errorMessage}`);
            }

        } catch (error) {
            console.error('Error running test:', error);
            alert(`Error: ${(error as Error).message}`);
        } finally {
            this.runningTests.delete(testId);
            this.cdr.markForCheck();
        }
    }

    /**
     * Check if a test is currently running
     */
    isTestRunning(testId: string): boolean {
        return this.runningTests.has(testId);
    }
}
```

**Template update:** `testing-overview.component.ts` (template section)

```html
<!-- In the recent runs table -->
<div class="run-actions">
    <button
        class="action-btn"
        [disabled]="isTestRunning(run.id)"
        (click)="rerunTest(run.id, run.testName)"
        title="Re-run test">
        <i class="fa-solid"
           [class.fa-rotate-right]="!isTestRunning(run.id)"
           [class.fa-spinner]="isTestRunning(run.id)"
           [class.fa-spin]="isTestRunning(run.id)"></i>
        {{ isTestRunning(run.id) ? 'Running...' : 'Re-run' }}
    </button>
</div>
```

**Styles:**
```scss
.action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid #2196f3;
    border-radius: 4px;
    background: white;
    color: #2196f3;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
        background: #2196f3;
        color: white;
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
}
```

---

### 3.4 Progress Streaming (Optional Enhancement)

**If you want real-time progress updates:**

```typescript
// Subscribe to PushStatusResolver updates
import { PushStatusService } from '@memberjunction/graphql-dataprovider';

constructor(
    // ...existing
    private pushStatusService: PushStatusService
) {
    // Subscribe to test execution updates
    this.pushStatusService.subscribe((message: any) => {
        if (message.resolver === 'RunTestResolver') {
            this.handleTestUpdate(message);
        }
    });
}

private handleTestUpdate(message: any): void {
    switch (message.type) {
        case 'TestExecutionProgress':
            console.log('Progress:', message.data.progress);
            // Update UI with progress
            break;

        case 'TestExecutionComplete':
            console.log('Test completed:', message.data);
            this.instrumentationService.refresh();
            break;

        case 'TestExecutionError':
            console.error('Test error:', message.data);
            break;
    }
}
```

---

## Part 4: Testing & Verification

### 4.1 Local Development Testing

```bash
# Terminal 1: Start MJServer
cd packages/MJServer
npm run dev

# Terminal 2: Start Angular
cd packages/Angular/Explorer/dashboards
npm run start

# Terminal 3: Test via GraphQL Playground
# Navigate to http://localhost:4000/graphql

# Run test mutation:
mutation {
  RunTest(testId: "your-test-uuid", verbose: true) {
    success
    errorMessage
    executionTimeMs
    result
  }
}
```

### 4.2 Integration Testing

1. **Create a simple test in the database**
2. **Navigate to Testing Dashboard → Overview tab**
3. **Find test in recent runs → Click "Re-run"**
4. **Verify:**
   - Button shows spinner while running
   - Dashboard refreshes with new result
   - Test Run entity created in database
   - Oracle results displayed correctly

---

## Part 5: Future Enhancements

### 5.1 Batch Test Execution
- Select multiple tests from UI
- Run in parallel
- Progress bar for batch

### 5.2 Scheduled Test Runs
- Cron-like scheduling
- Email notifications on failure
- Integration with CI/CD

### 5.3 Test Run Comparison
- Compare two test runs side-by-side
- Highlight differences in oracle results
- Performance regression detection

### 5.4 Live Test Logs
- Stream driver logs to UI
- Real-time oracle evaluation updates
- Expandable log viewer

---

## Implementation Checklist

- [ ] **Server-Side**
  - [ ] Add `@memberjunction/testing-engine` to MJServer package.json
  - [ ] Run `npm install` at repo root
  - [ ] Create `RunTestResolver.ts` in `packages/MJServer/src/resolvers/`
  - [ ] Enhance TestEngine with progressCallback parameter
  - [ ] Add progress emissions at key execution points
  - [ ] Test resolver with GraphQL Playground

- [ ] **Client-Side**
  - [ ] Create `graphQLTestingClient.ts` in GraphQLDataProvider
  - [ ] Export from GraphQLDataProvider index
  - [ ] Build and verify types

- [ ] **UI Integration**
  - [ ] Inject GraphQLTestingClient in Overview component
  - [ ] Add rerunTest() method
  - [ ] Add "Re-run" button to recent runs table
  - [ ] Add loading state tracking (runningTests Set)
  - [ ] Add styles for action button
  - [ ] Test in browser

- [ ] **Optional: Progress Streaming**
  - [ ] Subscribe to PushStatusService in component
  - [ ] Handle TestExecutionProgress messages
  - [ ] Show progress indicator in UI
  - [ ] Update on completion

- [ ] **Documentation**
  - [ ] Update Testing Dashboard README
  - [ ] Add JSDoc comments
  - [ ] Create user guide for running tests

---

## Summary

This proposal provides a complete, production-ready architecture for test invocation from the UI:

✅ **Server:** RunTestResolver with PubSub streaming
✅ **Client:** GraphQLTestingClient specialist class
✅ **Engine:** Progress callback enhancement
✅ **UI:** 4 integration points with recommended implementation
✅ **UX:** Intuitive "Re-run" buttons with loading states
✅ **Scalable:** Foundation for advanced features

**Recommended first implementation:** Options 1 + 2 (Recent Runs + Detail Panel)

**Estimated effort:**
- Server (Resolver + Engine): 4-6 hours
- Client (GraphQL Client): 2-3 hours
- UI (Basic integration): 3-4 hours
- Testing & Polish: 2-3 hours
**Total: ~12-16 hours**

Ready to proceed with implementation! 🚀
