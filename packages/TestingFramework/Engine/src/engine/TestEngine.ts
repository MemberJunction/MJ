/**
 * @fileoverview Main testing engine orchestrator
 * @module @memberjunction/testing-engine
 */

import {
    UserInfo,
    Metadata,
    LogError,
    LogStatusEx,
    IsVerboseLoggingEnabled,
    RunView
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
    DriverExecutionResult,
    TestRunResult,
    TestSuiteRunResult
} from '../types';

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
     * @returns Test run result
     */
    public async RunTest(
        testId: string,
        options: TestRunOptions,
        contextUser: UserInfo
    ): Promise<TestRunResult> {
        const startTime = Date.now();
        this.log(`Starting test execution: ${testId}`, options.verbose);

        try {
            // Load test entity
            const test = await this.loadTest(testId, contextUser);
            if (!test) {
                throw new Error(`Test not found: ${testId}`);
            }

            // Get test type
            const testType = this.GetTestTypeByID(test.TypeID);
            if (!testType) {
                throw new Error(`Test type not found: ${test.TypeID}`);
            }

            // Get or create driver
            const driver = await this.getDriver(testType, contextUser);

            // Create TestRun entity
            const testRun = await this.createTestRun(test, contextUser);

            // Execute test via driver
            this.log(`Executing test via ${testType.DriverClass}`, options.verbose);
            const driverResult = await driver.Execute({
                test,
                testRun,
                contextUser,
                options,
                oracleRegistry: this._oracleRegistry
            });

            // Update TestRun entity with results
            await this.updateTestRun(testRun, driverResult, startTime);

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
                targetLogId: driverResult.targetLogId,
                durationMs: Date.now() - startTime,
                totalCost: driverResult.totalCost || 0,
                startedAt: testRun.StartedAt!,
                completedAt: testRun.CompletedAt!
            };

            this.log(`Test completed: ${result.status} (Score: ${result.score})`, options.verbose);
            return result;

        } catch (error) {
            this.logError(`Test execution failed: ${testId}`, error as Error);
            throw error;
        }
    }

    /**
     * Run a test suite.
     *
     * @param suiteId - ID of the test suite to run
     * @param options - Test execution options
     * @param contextUser - User context
     * @returns Test suite run result
     */
    public async RunSuite(
        suiteId: string,
        options: TestRunOptions,
        contextUser: UserInfo
    ): Promise<TestSuiteRunResult> {
        const startTime = Date.now();
        this.log(`Starting test suite execution: ${suiteId}`, options.verbose);

        try {
            // Load suite entity
            const suite = await this.loadSuite(suiteId, contextUser);
            if (!suite) {
                throw new Error(`Test suite not found: ${suiteId}`);
            }

            // Load suite tests
            const tests = await this.loadSuiteTests(suiteId, contextUser);
            if (tests.length === 0) {
                throw new Error(`No tests found in suite: ${suiteId}`);
            }

            // Create TestSuiteRun entity
            const suiteRun = await this.createSuiteRun(suite, contextUser);

            // Execute tests
            const testResults: TestRunResult[] = [];
            for (const test of tests) {
                try {
                    const result = await this.RunTest(test.ID, options, contextUser);
                    testResults.push(result);
                } catch (error) {
                    this.logError(`Test failed in suite: ${test.Name}`, error as Error);
                    // Continue with remaining tests
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
     * Load test entity.
     * @private
     */
    private async loadTest(testId: string, contextUser: UserInfo): Promise<TestEntity> {
        const md = new Metadata();
        const test = await md.GetEntityObject<TestEntity>('Tests', contextUser);
        await test.Load(testId);
        return test;
    }

    /**
     * Load suite entity.
     * @private
     */
    private async loadSuite(suiteId: string, contextUser: UserInfo): Promise<TestSuiteEntity> {
        const md = new Metadata();
        const suite = await md.GetEntityObject<TestSuiteEntity>('Test Suites', contextUser);
        await suite.Load(suiteId);
        return suite;
    }

    /**
     * Load tests for a suite using TestSuiteTest join table.
     * @private
     */
    private async loadSuiteTests(suiteId: string, contextUser: UserInfo): Promise<TestEntity[]> {
        // Load join table records
        const rv = new RunView();
        const joinResult = await rv.RunView({
            EntityName: 'Test Suite Tests',
            ExtraFilter: `SuiteID='${suiteId}'`,
            OrderBy: 'Order',
            ResultType: 'entity_object'
        }, contextUser);

        if (!joinResult.Success) {
            throw new Error(`Failed to load suite tests: ${joinResult.ErrorMessage}`);
        }

        // Load actual test entities
        const tests: TestEntity[] = [];
        for (const join of (joinResult.Results || [])) {
            const testId = join.Get('TestID');
            const test = await this.loadTest(testId, contextUser);
            tests.push(test);
        }

        return tests;
    }

    /**
     * Create TestRun entity.
     * @private
     */
    private async createTestRun(test: TestEntity, contextUser: UserInfo): Promise<TestRunEntity> {
        const md = new Metadata();
        const testRun = await md.GetEntityObject<TestRunEntity>('Test Runs', contextUser);
        testRun.NewRecord();
        testRun.TestID = test.ID;
        testRun.Status = 'Running';
        testRun.StartedAt = new Date();

        const saved = await testRun.Save();
        if (!saved) {
            throw new Error('Failed to create TestRun entity');
        }

        return testRun;
    }

    /**
     * Create TestSuiteRun entity.
     * @private
     */
    private async createSuiteRun(
        suite: TestSuiteEntity,
        contextUser: UserInfo
    ): Promise<TestSuiteRunEntity> {
        const md = new Metadata();
        const suiteRun = await md.GetEntityObject<TestSuiteRunEntity>(
            'Test Suite Runs',
            contextUser
        );
        suiteRun.NewRecord();
        suiteRun.SuiteID = suite.ID;
        suiteRun.Status = 'Running';
        suiteRun.StartedAt = new Date();

        const saved = await suiteRun.Save();
        if (!saved) {
            throw new Error('Failed to create TestSuiteRun entity');
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
        startTime: number
    ): Promise<void> {
        testRun.Status = result.status;
        testRun.Score = result.score;
        testRun.PassedChecks = result.passedChecks;
        testRun.FailedChecks = result.failedChecks;
        testRun.TotalChecks = result.totalChecks;
        testRun.TargetType = result.targetType;
        testRun.TargetLogID = result.targetLogId;
        testRun.InputData = result.inputData ? JSON.stringify(result.inputData) : null;
        testRun.ExpectedOutputData = result.expectedOutput ? JSON.stringify(result.expectedOutput) : null;
        testRun.ActualOutputData = result.actualOutput ? JSON.stringify(result.actualOutput) : null;
        testRun.ResultDetails = result.oracleResults ? JSON.stringify(result.oracleResults) : null;
        testRun.CostUSD = result.totalCost || 0;
        testRun.DurationSeconds = (Date.now() - startTime) / 1000;
        testRun.CompletedAt = new Date();

        const saved = await testRun.Save();
        if (!saved) {
            this.logError('Failed to update TestRun entity', new Error(testRun.LatestResult?.Message));
        }
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
