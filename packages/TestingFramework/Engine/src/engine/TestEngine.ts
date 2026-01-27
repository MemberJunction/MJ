/**
 * @fileoverview Main testing engine orchestrator
 * @module @memberjunction/testing-engine
 */

import {
    UserInfo,
    Metadata,
    LogError,
    LogStatusEx,
    IsVerboseLoggingEnabled
} from '@memberjunction/core';
import {
    TestEntity,
    TestRunEntity,
    TestSuiteEntity,
    TestSuiteRunEntity,
    TestTypeEntity
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { TestEngineBase } from '@memberjunction/testing-engine-base';
import { BaseTestDriver } from '../drivers/BaseTestDriver';
import { IOracle } from '../oracles/IOracle';
import { SchemaValidatorOracle } from '../oracles/SchemaValidatorOracle';
import { TraceValidatorOracle } from '../oracles/TraceValidatorOracle';
import { LLMJudgeOracle } from '../oracles/LLMJudgeOracle';
import { ExactMatchOracle } from '../oracles/ExactMatchOracle';
import { SQLValidatorOracle } from '../oracles/SQLValidatorOracle';
import {
    TestRunOptions,
    SuiteRunOptions,
    DriverExecutionResult,
    TestRunResult,
    TestSuiteRunResult,
    TestLogMessage,
    ResolvedTestVariables
} from '../types';
import {
    gatherExecutionContext,
    getMachineName,
    getMachineIdentifier
} from '../utils/execution-context';
import { VariableResolver, VariableResolutionError } from '../utils/variable-resolver';

/**
 * Main testing engine that orchestrates test execution.
 *
 * Extends TestEngineBase (UI-safe metadata cache) with execution capabilities.
 * Follows singleton pattern like SchedulingEngine.
 *
 * Responsibilities:
 * - Load and instantiate test drivers via ClassFactory
 * - Manage oracle registry
 * - Execute individual tests and test suites
 * - Create and update TestRun entities
 * - Track execution timing and costs
 * - Handle errors and logging
 *
 * @example
 * ```typescript
 * const engine = TestEngine.Instance;
 * await engine.Config(false, contextUser);
 *
 * const result = await engine.RunTest('test-id', { verbose: true }, contextUser);
 * console.log(`Test ${result.status}: Score ${result.score}`);
 * ```
 */
export class TestEngine extends TestEngineBase {
    private _driverCache = new Map<string, BaseTestDriver>();
    private _oracleRegistry = new Map<string, IOracle>();
    private _variableResolver = new VariableResolver();

    /**
     * Get singleton instance
     */
    public static get Instance(): TestEngine {
        return super.getInstance<TestEngine>();
    }

    /**
     * Private constructor for singleton
     */
    private constructor() {
        super();
    }

    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        try {
            await super.AdditionalLoading(contextUser);

            // Register built-in oracles
            await this.registerBuiltInOracles();

            this.log('TestEngine configured successfully');
        } catch (error) {
            this.logError('Failed to configure TestEngine', error as Error);
        }
    }

    /**
     * Run a single test.
     *
     * @param testId - ID of the test to run
     * @param options - Test execution options
     * @param contextUser - User context
     * @param suiteRunId - Optional suite run ID if part of a suite
     * @returns Test run result (or array of results if RepeatCount > 1)
     */
    public async RunTest(
        testId: string,
        options: TestRunOptions,
        contextUser: UserInfo,
        suiteRunId?: string | null,
        suiteTestSequence?: number | null
    ): Promise<TestRunResult | TestRunResult[]> {
        const startTime = Date.now();
        this.log(`Starting test execution: ${testId}`, options.verbose);

        try {
            // Progress: Loading test
            options.progressCallback?.({
                step: 'loading_test',
                percentage: 10,
                message: 'Loading test configuration',
                metadata: { testId }
            });

            // Load test entity from cache
            const test = await this.loadTest(testId);
            if (!test) {
                throw new Error(`Test not found: ${testId}`);
            }

            // Get tags from options
            const tags = options.tags;

            // Check RepeatCount and branch to repeated execution if needed
            if (test.RepeatCount && test.RepeatCount > 1) {
                return await this.runRepeatedTest(test, test.RepeatCount, options, contextUser, suiteRunId, suiteTestSequence, startTime, tags);
            }

            // Single execution - delegate to helper method
            return await this.runSingleTestIteration(test, suiteRunId, suiteTestSequence, options, contextUser, startTime, tags);

        } catch (error) {
            this.logError(`Test execution failed: ${testId}`, error as Error);
            throw error;
        }
    }

    /**
     * Run a test suite.
     *
     * @param suiteId - ID of the test suite to run
     * @param options - Suite execution options (extends TestRunOptions with suite-specific options)
     * @param contextUser - User context
     * @returns Test suite run result
     */
    public async RunSuite(
        suiteId: string,
        options: SuiteRunOptions,
        contextUser: UserInfo
    ): Promise<TestSuiteRunResult> {
        const startTime = Date.now();
        this.log(`Starting test suite execution: ${suiteId}`, options.verbose);

        try {
            // Load suite entity from cache
            const suite = await this.loadSuite(suiteId);
            if (!suite) {
                throw new Error(`Test suite not found: ${suiteId}`);
            }

            // Load suite tests from cache
            let tests = await this.loadSuiteTests(suiteId);
            if (tests.length === 0) {
                throw new Error(`No tests found in suite: ${suiteId}`);
            }

            // Apply test selection filters
            tests = this.filterTestsForExecution(suiteId, tests, options);
            if (tests.length === 0) {
                throw new Error(`No tests match the selection criteria for suite: ${suiteId}`);
            }

            this.log(`Running ${tests.length} tests (after filtering)`, options.verbose);

            // Create TestSuiteRun entity
            const suiteRun = await this.createSuiteRun(suite, contextUser, options);

            // Store resolved variables on suite run if provided
            if (options.variables && Object.keys(options.variables).length > 0) {
                suiteRun.ResolvedVariables = JSON.stringify({
                    values: options.variables,
                    sources: Object.keys(options.variables).reduce((acc, key) => {
                        acc[key] = 'run';
                        return acc;
                    }, {} as Record<string, string>)
                });
                await suiteRun.Save();
            }

            // Get suite variables for passing to tests
            const suiteVariablesJson = suite.Variables;

            // Execute tests
            const testResults: TestRunResult[] = [];
            let testSequence = 1; // Track suite execution order (1-based)
            for (const test of tests) {
                try {
                    const result = await this.runTestWithSuiteVariables(test.ID, options, contextUser, suiteRun.ID, testSequence, suiteVariablesJson);

                    // Handle both single result and array of results (if RepeatCount > 1)
                    if (Array.isArray(result)) {
                        testResults.push(...result);
                    } else {
                        testResults.push(result);
                    }
                } catch (error) {
                    this.logError(`Test failed in suite: ${test.Name}`, error as Error);
                    // Continue with remaining tests
                } finally {
                    // Always increment sequence, even if test throws exception
                    // This ensures each test gets a unique sequence number in conversation names
                    testSequence++;
                }
            }

            // Update TestSuiteRun entity with results
            await this.updateSuiteRun(suiteRun, testResults, startTime);

            // Calculate suite-level metrics
            const passedTests = testResults.filter(r => r.status === 'Passed').length;
            const failedTests = testResults.filter(r => r.status === 'Failed').length;
            const totalScore = testResults.reduce((sum, r) => sum + r.score, 0);
            const avgScore = testResults.length > 0 ? totalScore / testResults.length : 0;

            const result: TestSuiteRunResult = {
                suiteRunId: suiteRun.ID,
                suiteId: suite.ID,
                suiteName: suite.Name,
                status: suiteRun.Status as 'Completed' | 'Failed' | 'Cancelled' | 'Pending' | 'Running',
                passedTests,
                failedTests,
                totalTests: testResults.length,
                averageScore: avgScore,
                testResults,
                durationMs: Date.now() - startTime,
                totalCost: testResults.reduce((sum, r) => sum + r.totalCost, 0),
                startedAt: suiteRun.StartedAt!,
                completedAt: suiteRun.CompletedAt!
            };

            this.log(
                `Suite completed: ${result.status} (${passedTests}/${testResults.length} passed)`,
                options.verbose
            );
            return result;

        } catch (error) {
            this.logError(`Suite execution failed: ${suiteId}`, error as Error);
            throw error;
        }
    }

    /**
     * Run a test with suite variables context (used by RunSuite).
     * @private
     */
    private async runTestWithSuiteVariables(
        testId: string,
        options: TestRunOptions,
        contextUser: UserInfo,
        suiteRunId: string,
        suiteTestSequence: number,
        suiteVariablesJson: string | null
    ): Promise<TestRunResult | TestRunResult[]> {
        const startTime = Date.now();

        // Load test entity from cache
        const test = await this.loadTest(testId);
        if (!test) {
            throw new Error(`Test not found: ${testId}`);
        }

        // Get tags from options
        const tags = options.tags;

        // Check RepeatCount and branch to repeated execution if needed
        if (test.RepeatCount && test.RepeatCount > 1) {
            return await this.runRepeatedTest(test, test.RepeatCount, options, contextUser, suiteRunId, suiteTestSequence, startTime, tags, suiteVariablesJson);
        }

        // Single execution
        return await this.runSingleTestIteration(test, suiteRunId, suiteTestSequence, options, contextUser, startTime, tags, suiteVariablesJson);
    }

    /**
     * Register a custom oracle.
     *
     * @param oracle - Oracle implementation
     */
    public RegisterOracle(oracle: IOracle): void {
        this._oracleRegistry.set(oracle.type, oracle);
        this.log(`Registered oracle: ${oracle.type}`);
    }

    /**
     * Get registered oracle by type.
     *
     * @param type - Oracle type
     * @returns Oracle instance or undefined
     */
    public GetOracle(type: string): IOracle | undefined {
        return this._oracleRegistry.get(type);
    }

    /**
     * Get all registered oracle types.
     *
     * @returns Array of oracle type names
     */
    public GetOracleTypes(): string[] {
        return Array.from(this._oracleRegistry.keys());
    }

    /**
     * Get the variable resolver instance.
     * Useful for CLI to parse and validate variables.
     */
    public get VariableResolver(): VariableResolver {
        return this._variableResolver;
    }

    /**
     * Register built-in oracles.
     * @private
     */
    private async registerBuiltInOracles(): Promise<void> {
        this.RegisterOracle(new SchemaValidatorOracle());
        this.RegisterOracle(new TraceValidatorOracle());
        this.RegisterOracle(new LLMJudgeOracle());
        this.RegisterOracle(new ExactMatchOracle());
        this.RegisterOracle(new SQLValidatorOracle());
    }

    /**
     * Get or create test driver instance.
     * @private
     */
    private async getDriver(testType: TestTypeEntity, contextUser: UserInfo): Promise<BaseTestDriver> {
        // Check cache
        const cached = this._driverCache.get(testType.ID);
        if (cached) {
            return cached;
        }

        // Create new instance via ClassFactory
        const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTestDriver>(
            BaseTestDriver,
            testType.DriverClass
        );

        if (!driver) {
            throw new Error(`Failed to create driver: ${testType.DriverClass}`);
        }

        // Cache and return
        this._driverCache.set(testType.ID, driver);
        return driver;
    }

    /**
     * Get test entity from cache.
     * @private
     */
    private async loadTest(testId: string): Promise<TestEntity> {
        // Use cached test instead of loading from DB
        const test = this.GetTestByID(testId);
        if (!test) {
            throw new Error(`Test not found in cache: ${testId}`);
        }
        return test;
    }

    /**
     * Get suite entity from cache.
     * @private
     */
    private async loadSuite(suiteId: string): Promise<TestSuiteEntity> {
        // Use cached suite instead of loading from DB
        const suite = this.GetTestSuiteByID(suiteId);
        if (!suite) {
            throw new Error(`Test suite not found in cache: ${suiteId}`);
        }
        return suite;
    }

    /**
     * Get tests for a suite from cache (sorted by sequence).
     * @private
     */
    private async loadSuiteTests(suiteId: string): Promise<TestEntity[]> {
        // Use cached test suite tests and tests instead of querying DB
        return this.GetTestsForSuite(suiteId);
    }

    /**
     * Filter tests based on suite run options.
     * Supports filtering by:
     * - selectedTestIds: Run only specific tests by ID
     * - sequenceStart/sequenceEnd: Run tests within a sequence range
     * - sequence: Run tests at specific sequence positions
     * @private
     */
    private filterTestsForExecution(
        suiteId: string,
        tests: TestEntity[],
        options: SuiteRunOptions
    ): TestEntity[] {
        // Get suite test mappings to access sequence numbers
        const suiteTests = this.TestSuiteTests.filter(st => st.SuiteID === suiteId);

        // Create a map of testId -> sequence for efficient lookup
        const testSequenceMap = new Map<string, number>();
        for (const st of suiteTests) {
            testSequenceMap.set(st.TestID, st.Sequence);
        }

        let filteredTests = [...tests];

        // Filter by selectedTestIds if provided
        if (options.selectedTestIds && options.selectedTestIds.length > 0) {
            const selectedIds = new Set(options.selectedTestIds);
            filteredTests = filteredTests.filter(t => selectedIds.has(t.ID));
            this.log(`Filtered to ${filteredTests.length} tests by selectedTestIds`, options.verbose);
        }

        // Filter by sequence range if provided
        if (options.sequenceStart != null || options.sequenceEnd != null) {
            const start = options.sequenceStart ?? 1;
            const end = options.sequenceEnd ?? Number.MAX_SAFE_INTEGER;

            filteredTests = filteredTests.filter(test => {
                const seq = testSequenceMap.get(test.ID);
                if (seq == null) return false;
                return seq >= start && seq <= end;
            });
            this.log(`Filtered to ${filteredTests.length} tests by sequence range [${start}-${end}]`, options.verbose);
        }

        // Filter by specific sequence numbers if provided
        if (options.sequence && options.sequence.length > 0) {
            const sequenceSet = new Set(options.sequence);
            filteredTests = filteredTests.filter(test => {
                const seq = testSequenceMap.get(test.ID);
                if (seq == null) return false;
                return sequenceSet.has(seq);
            });
            this.log(`Filtered to ${filteredTests.length} tests by sequence numbers [${options.sequence.join(', ')}]`, options.verbose);
        }

        return filteredTests;
    }

    /**
     * Create TestRun entity.
     * @private
     */
    private async createTestRun(
        test: TestEntity,
        contextUser: UserInfo,
        suiteRunId?: string | null,
        sequence?: number | null,
        tags?: string | null
    ): Promise<TestRunEntity> {
        const md = new Metadata();
        const testRun = await md.GetEntityObject<TestRunEntity>('MJ: Test Runs', contextUser);
        testRun.NewRecord();
        testRun.TestID = test.ID;
        testRun.RunByUserID = contextUser.ID;
        testRun.Status = 'Running';
        testRun.StartedAt = new Date();

        // Set suite run ID if part of a suite
        if (suiteRunId) {
            testRun.TestSuiteRunID = suiteRunId;
        }

        // Set sequence if provided (for suite test order or repeat iterations)
        // sequence will be:
        // - Suite test position (1, 2, 3...) for tests in a suite
        // - Iteration number (1, 2, 3...) for repeated tests
        // - null for standalone, non-repeated tests
        if (sequence != null) {
            testRun.Sequence = sequence;
        }

        // Set tags if provided
        if (tags) {
            testRun.Tags = tags;
        }

        // Set execution context fields for cross-server aggregation
        testRun.MachineName = getMachineName();
        testRun.MachineID = getMachineIdentifier() || null;
        testRun.RunByUserName = contextUser.Name;
        testRun.RunByUserEmail = contextUser.Email;
        testRun.RunContextDetails = JSON.stringify(gatherExecutionContext());

        const saved = await testRun.Save();
        if (!saved) {
            const errorMsg = testRun.LatestResult?.Message || 'Unknown error';
            throw new Error(`Failed to create TestRun entity: ${errorMsg}`);
        }

        return testRun;
    }

    /**
     * Create TestSuiteRun entity.
     * @private
     */
    private async createSuiteRun(
        suite: TestSuiteEntity,
        contextUser: UserInfo,
        options?: SuiteRunOptions
    ): Promise<TestSuiteRunEntity> {
        const md = new Metadata();
        const suiteRun = await md.GetEntityObject<TestSuiteRunEntity>(
            'MJ: Test Suite Runs',
            contextUser
        );
        suiteRun.NewRecord();
        suiteRun.SuiteID = suite.ID;
        suiteRun.RunByUserID = contextUser.ID;
        suiteRun.Status = 'Running';
        suiteRun.StartedAt = new Date();

        // Set tags if provided
        if (options?.tags) {
            suiteRun.Tags = options.tags;
        }

        // Set execution context fields for cross-server aggregation
        suiteRun.MachineName = getMachineName();
        suiteRun.MachineID = getMachineIdentifier() || null;
        suiteRun.RunByUserName = contextUser.Name;
        suiteRun.RunByUserEmail = contextUser.Email;
        suiteRun.RunContextDetails = JSON.stringify(gatherExecutionContext());

        const saved = await suiteRun.Save();
        if (!saved) {
            const errorMsg = suiteRun.LatestResult?.Message || 'Unknown error';
            throw new Error(`Failed to create TestSuiteRun entity: ${errorMsg}`);
        }

        return suiteRun;
    }

    /**
     * Update TestRun entity with results.
     * @private
     */
    private async updateTestRun(
        testRun: TestRunEntity,
        result: DriverExecutionResult,
        startTime: number,
        logMessages?: TestLogMessage[]
    ): Promise<void> {
        testRun.Status = result.status;
        testRun.Score = result.score;
        testRun.PassedChecks = result.passedChecks;
        testRun.FailedChecks = result.failedChecks;
        testRun.TotalChecks = result.totalChecks;
        testRun.TargetType = result.targetType;
        testRun.TargetLogID = result.targetLogId;
        // Set the proper Entity FK for target linkage
        if (result.targetLogEntityId) {
            testRun.TargetLogEntityID = result.targetLogEntityId;
        }
        testRun.InputData = result.inputData ? JSON.stringify(result.inputData) : null;
        testRun.ExpectedOutputData = result.expectedOutput ? JSON.stringify(result.expectedOutput) : null;
        testRun.ActualOutputData = result.actualOutput ? JSON.stringify(result.actualOutput) : null;
        testRun.ResultDetails = result.oracleResults ? JSON.stringify(result.oracleResults) : null;
        testRun.CostUSD = result.totalCost || 0;
        testRun.DurationSeconds = (Date.now() - startTime) / 1000;
        testRun.CompletedAt = new Date();

        // Save accumulated log messages
        if (logMessages && logMessages.length > 0) {
            testRun.Log = this.formatLogMessages(logMessages);
        }

        // Ensure ErrorMessage is populated for timeout and error statuses
        if ((result.status === 'Timeout' || result.status === 'Error') && result.errorMessage) {
            testRun.ErrorMessage = result.errorMessage;
        }

        const saved = await testRun.Save();
        if (!saved) {
            this.logError('Failed to update TestRun entity', new Error(testRun.LatestResult?.Message));
        }
    }

    /**
     * Format log messages into a single string for storage.
     * @private
     */
    private formatLogMessages(messages: TestLogMessage[]): string {
        return messages
            .map(m => `[${m.timestamp.toISOString()}] [${m.level.toUpperCase()}] ${m.message}`)
            .join('\n');
    }

    /**
     * Update TestSuiteRun entity with results.
     * @private
     */
    private async updateSuiteRun(
        suiteRun: TestSuiteRunEntity,
        testResults: TestRunResult[],
        startTime: number
    ): Promise<void> {
        const passedTests = testResults.filter(r => r.status === 'Passed').length;
        const totalTests = testResults.length;

        suiteRun.Status = passedTests === totalTests ? 'Completed' : 'Failed';
        suiteRun.PassedTests = passedTests;
        suiteRun.FailedTests = totalTests - passedTests;
        suiteRun.TotalTests = totalTests;
        suiteRun.TotalCostUSD = testResults.reduce((sum, r) => sum + r.totalCost, 0);
        suiteRun.TotalDurationSeconds = (Date.now() - startTime) / 1000;
        suiteRun.CompletedAt = new Date();

        const saved = await suiteRun.Save();
        if (!saved) {
            this.logError('Failed to update TestSuiteRun entity', new Error(suiteRun.LatestResult?.Message));
        }
    }

    /**
     * Run a test multiple times for statistical analysis.
     * @private
     */
    private async runRepeatedTest(
        test: TestEntity,
        repeatCount: number,
        options: TestRunOptions,
        contextUser: UserInfo,
        suiteRunId: string | null | undefined,
        suiteTestSequence: number | null | undefined,
        startTime: number,
        tags?: string,
        suiteVariablesJson?: string | null
    ): Promise<TestRunResult[]> {
        const results: TestRunResult[] = [];

        this.log(`Running test ${repeatCount} times for statistical analysis`, options.verbose);

        for (let iteration = 1; iteration <= repeatCount; iteration++) {
            this.log(`Running iteration ${iteration} of ${repeatCount}`, options.verbose);

            const result = await this.runSingleTestIteration(
                test,
                suiteRunId,
                iteration,
                options,
                contextUser,
                Date.now(), // Each iteration gets its own start time
                tags,
                suiteVariablesJson
            );

            results.push(result);

            // Small delay between iterations to avoid rate limiting
            if (iteration < repeatCount) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        this.log(`Completed ${repeatCount} iterations`, options.verbose);
        return results;
    }

    /**
     * Run a single test iteration (extracted from RunTest for reuse).
     * @private
     */
    private async runSingleTestIteration(
        test: TestEntity,
        suiteRunId: string | null | undefined,
        sequence: number | null,
        options: TestRunOptions,
        contextUser: UserInfo,
        startTime: number,
        tags?: string,
        suiteVariablesJson?: string | null
    ): Promise<TestRunResult> {
        // Get test type
        const testType = this.GetTestTypeByID(test.TypeID);
        if (!testType) {
            throw new Error(`Test type not found: ${test.TypeID}`);
        }

        // Resolve variables through the hierarchy
        let resolvedVariables: ResolvedTestVariables | undefined;
        try {
            resolvedVariables = this._variableResolver.resolveVariables(
                testType.VariablesSchema,  // TestType.VariablesSchema JSON
                test.Variables,             // Test.Variables JSON
                suiteVariablesJson || null, // TestSuite.Variables JSON (if running in suite)
                options                      // Runtime options with variables
            );

            // Log resolved variables if any
            if (resolvedVariables && Object.keys(resolvedVariables.values).length > 0) {
                this.log(
                    `Resolved variables: ${JSON.stringify(resolvedVariables.values)}`,
                    options.verbose
                );
            }
        } catch (error) {
            if (error instanceof VariableResolutionError) {
                throw new Error(`Variable resolution failed: ${error.message}`);
            }
            throw error;
        }

        // Progress: Initializing driver
        options.progressCallback?.({
            step: 'initializing_driver',
            percentage: 20,
            message: `Initializing ${testType.DriverClass} driver`,
            metadata: {
                testName: test.Name,
                driverType: testType.DriverClass
            }
        });

        // Get or create driver
        const driver = await this.getDriver(testType, contextUser);

        // Check if driver supports cancellation and log warning if not
        const supportsCancellation = driver.supportsCancellation();
        if (!supportsCancellation) {
            this.log(
                `Warning: Test type '${testType.Name}' (driver: ${testType.DriverClass}) does not support cancellation. ` +
                `Timeout will mark test as failed but execution may continue in background.`,
                options.verbose
            );
        }

        // Create TestRun entity
        const testRun = await this.createTestRun(test, contextUser, suiteRunId, sequence, tags);

        // Set up log accumulation
        const logMessages: TestLogMessage[] = [];
        const originalLogCallback = options.logCallback;

        // Create enhanced options with log accumulation
        const enhancedOptions: TestRunOptions = {
            ...options,
            logCallback: (message: TestLogMessage) => {
                // Accumulate log messages
                logMessages.push(message);
                // Also call original callback if provided
                originalLogCallback?.(message);
            }
        };

        // Progress: Executing test
        options.progressCallback?.({
            step: 'executing_test',
            percentage: 40,
            message: 'Running test driver',
            metadata: {
                testName: test.Name,
                testRun,
                driverType: testType.DriverClass
            }
        });

        // Execute test via driver
        this.log(`Executing test via ${testType.DriverClass}`, options.verbose);
        const driverResult = await driver.Execute({
            test,
            testRun,
            contextUser,
            options: enhancedOptions,
            oracleRegistry: this._oracleRegistry,
            resolvedVariables
        });

        // If timeout occurred and driver doesn't support cancellation, add warning to error message
        if (driverResult.status === 'Timeout' && !supportsCancellation) {
            const warningMessage = `Test type '${testType.Name}' does not support cancellation - execution may continue in background.`;
            driverResult.errorMessage = driverResult.errorMessage
                ? `${driverResult.errorMessage}\n${warningMessage}`
                : warningMessage;

            // Also add to log
            logMessages.push({
                timestamp: new Date(),
                level: 'warn',
                message: warningMessage
            });
        }

        // Progress: Evaluating oracles
        const oracleCount = driverResult.oracleResults?.length || 0;
        options.progressCallback?.({
            step: 'evaluating_oracles',
            percentage: 70,
            message: `Evaluated ${oracleCount} oracle${oracleCount !== 1 ? 's' : ''}`,
            metadata: {
                testName: test.Name,
                testRun
            }
        });

        // Store resolved variables on TestRun for reproducibility
        if (resolvedVariables && Object.keys(resolvedVariables.values).length > 0) {
            testRun.ResolvedVariables = JSON.stringify(resolvedVariables);
        }

        // Update TestRun entity with results and logs
        await this.updateTestRun(testRun, driverResult, startTime, logMessages);

        // Convert to TestRunResult
        const result: TestRunResult = {
            testRunId: testRun.ID,
            testId: test.ID,
            testName: test.Name,
            status: driverResult.status,
            score: driverResult.score,
            passedChecks: driverResult.passedChecks,
            failedChecks: driverResult.failedChecks,
            totalChecks: driverResult.totalChecks,
            oracleResults: driverResult.oracleResults,
            targetType: driverResult.targetType,
            targetLogEntityId: driverResult.targetLogEntityId,
            targetLogId: driverResult.targetLogId,
            durationMs: Date.now() - startTime,
            totalCost: driverResult.totalCost || 0,
            startedAt: testRun.StartedAt!,
            completedAt: testRun.CompletedAt!,
            errorMessage: driverResult.errorMessage,
            resolvedVariables
        };

        // Add sequence if this is a repeated test iteration
        if (sequence && sequence > 1) {
            result.sequence = sequence;
        }

        // Progress: Complete
        options.progressCallback?.({
            step: 'complete',
            percentage: 100,
            message: `Test ${result.status}`,
            metadata: {
                testName: test.Name,
                testRun
            }
        });

        this.log(`Test completed: ${result.status} (Score: ${result.score})`, options.verbose);
        return result;
    }

    /**
     * Log execution progress.
     * @private
     */
    private log(message: string, verboseOnly: boolean = false): void {
        LogStatusEx({
            message: `[TestEngine] ${message}`,
            verboseOnly,
            isVerboseEnabled: () => IsVerboseLoggingEnabled()
        });
    }

    /**
     * Log errors.
     * @private
     */
    private logError(message: string, error?: Error): void {
        LogError(`[TestEngine] ${message}`, undefined, error);
    }
}
