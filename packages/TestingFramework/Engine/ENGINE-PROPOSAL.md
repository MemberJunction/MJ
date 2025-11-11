# Testing Engine Implementation Proposal

## Overview

Based on study of AI Agents (`AgentRunner`, `BaseAgent`) and Scheduling (`SchedulingEngine`, `BaseScheduledJob`), I'm proposing a similar architecture for the Testing Engine that follows established MJ patterns.

## Key Patterns Observed

### 1. **Thin Runner Pattern** (from `AgentRunner`)
- Thin wrapper that loads metadata and delegates to ClassFactory
- Uses `MJGlobal.Instance.ClassFactory.CreateInstance<BaseClass>(BaseClass, driverClass)`
- Returns result directly from driver execution

### 2. **Base Class with Abstract Execute** (from `BaseAgent`, `BaseScheduledJob`)
- Abstract `Execute()` method that concrete implementations override
- Protected helper methods for common operations
- Metadata instance (`new Metadata()`) for entity creation
- Logging via `LogStatusEx` and `LogError`

### 3. **Engine Singleton Pattern** (from `SchedulingEngine`)
- Extends base engine class
- Singleton via `static get Instance()`
- `Config()` method to load metadata
- Orchestration methods that coordinate execution

### 4. **Result Classes** (from `ActionResult`, `ScheduledJobResult`)
- Structured result objects with `Success`, `ErrorMessage`, `Details`
- Convenience properties for common data
- Type-safe return values

### 5. **Context Objects** (from `ExecuteAgentParams`, `RunActionParams`)
- Pass user context (`UserInfo`) everywhere
- Configuration parameters bundled in params object
- Optional runtime context for flexibility

## Proposed Architecture

### File Structure

```
Engine/src/
├── index.ts                          # Public exports
├── types.ts                          # Type definitions (already created)
│
├── engine/
│   ├── TestEngine.ts                 # Main orchestration engine (singleton)
│   └── TestEngineBase.ts             # Base engine for metadata loading
│
├── drivers/
│   ├── BaseTestDriver.ts             # Abstract base class
│   ├── AgentEvalDriver.ts            # Concrete implementation for Agent Evals
│   └── index.ts                      # Driver exports
│
├── oracles/
│   ├── IOracle.ts                    # Oracle interface
│   ├── SchemaValidatorOracle.ts     # JSON schema validation
│   ├── TraceValidatorOracle.ts      # Check for errors in traces
│   ├── LLMJudgeOracle.ts            # LLM-based quality evaluation
│   ├── ExactMatchOracle.ts          # Deterministic output matching
│   ├── SQLValidatorOracle.ts        # Database state validation
│   └── index.ts                      # Oracle exports
│
└── utils/
    ├── scoring.ts                    # Score calculation utilities
    ├── cost-calculator.ts            # Cost tracking
    ├── result-formatter.ts           # Format results for display
    └── index.ts                      # Util exports
```

## Core Classes

### 1. TestEngine (Singleton Orchestrator)

```typescript
/**
 * Main orchestration engine for test execution
 *
 * Follows pattern from SchedulingEngine:
 * - Singleton instance
 * - Config() to load metadata
 * - Orchestration methods
 */
export class TestEngine extends TestEngineBase {
    private static _instance: TestEngine;

    /**
     * Singleton accessor
     */
    public static get Instance(): TestEngine {
        if (!TestEngine._instance) {
            TestEngine._instance = new TestEngine();
        }
        return TestEngine._instance;
    }

    private _metadata: Metadata = new Metadata();
    private _oracleRegistry: Map<string, IOracle> = new Map();

    /**
     * Initialize engine and load metadata
     * Similar to SchedulingEngine.Config()
     */
    public async Config(force: boolean, contextUser: UserInfo): Promise<void> {
        // Load test types, rubrics, etc.
        LogStatusEx({
            message: 'TestEngine: Initializing',
            verboseOnly: true,
            isVerboseEnabled: () => IsVerboseLoggingEnabled()
        });

        // Load TestType entities
        await this.loadTestTypes(contextUser);

        // Register default oracles
        this.registerDefaultOracles();
    }

    /**
     * Run a single test by ID
     * Similar to SchedulingEngine.executeJob()
     */
    public async runTest(
        testId: string,
        contextUser: UserInfo,
        options?: TestRunOptions
    ): Promise<TestRunResult> {
        LogStatusEx({
            message: `TestEngine: Running test ${testId}`,
            verboseOnly: false,
            isVerboseEnabled: () => IsVerboseLoggingEnabled()
        });

        // 1. Load test entity
        const test = await this._metadata.GetEntityObject<TestEntity>('Tests', contextUser);
        await test.Load(testId);

        // 2. Load test type to get DriverClass
        const testType = await this._metadata.GetEntityObject<TestTypeEntity>('Test Types', contextUser);
        await testType.Load(test.TypeID);

        // 3. Create test run entity
        const testRun = await this.createTestRun(test, contextUser, options);

        try {
            // 4. Instantiate driver via ClassFactory (AgentRunner pattern)
            const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTestDriver>(
                BaseTestDriver,
                testType.DriverClass
            );

            if (!driver) {
                throw new Error(`Failed to create driver for class: ${testType.DriverClass}`);
            }

            // 5. Execute driver
            const driverResult = await driver.Execute({
                test,
                testRun,
                contextUser,
                options: options || {},
                oracleRegistry: this._oracleRegistry
            });

            // 6. Update test run with results
            testRun.Status = driverResult.status;
            testRun.Score = driverResult.score;
            testRun.PassedChecks = driverResult.passedChecks;
            testRun.FailedChecks = driverResult.failedChecks;
            testRun.TotalChecks = driverResult.totalChecks;
            testRun.CostUSD = driverResult.cost;
            testRun.DurationSeconds = driverResult.duration;
            testRun.TargetType = driverResult.targetType;
            testRun.TargetLogID = driverResult.targetLogId;
            testRun.InputData = JSON.stringify(driverResult.inputData);
            testRun.ExpectedOutputData = JSON.stringify(driverResult.expectedOutputData);
            testRun.ActualOutputData = JSON.stringify(driverResult.actualOutputData);
            testRun.ResultDetails = JSON.stringify(driverResult.resultDetails);
            testRun.CompletedAt = new Date();

            await testRun.Save();

            return {
                testRun,
                status: driverResult.status,
                score: driverResult.score,
                oracleResults: driverResult.oracleResults,
                duration: driverResult.duration,
                cost: driverResult.cost,
                targetType: driverResult.targetType,
                targetLogId: driverResult.targetLogId
            };

        } catch (error) {
            // Handle errors like BaseAgent does
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            LogError(`TestEngine: Test execution failed: ${errorMessage}`, undefined, error);

            testRun.Status = 'Error';
            testRun.ErrorMessage = errorMessage;
            testRun.CompletedAt = new Date();
            await testRun.Save();

            throw error;
        }
    }

    /**
     * Run a test suite
     * Similar to executing multiple scheduled jobs
     */
    public async runSuite(
        suiteId: string,
        contextUser: UserInfo,
        options?: SuiteRunOptions
    ): Promise<SuiteRunResult> {
        // 1. Load suite entity
        const suite = await this._metadata.GetEntityObject<TestSuiteEntity>('Test Suites', contextUser);
        await suite.Load(suiteId);

        // 2. Create suite run entity
        const suiteRun = await this.createSuiteRun(suite, contextUser, options);

        // 3. Load tests in suite
        const tests = await this.loadSuiteTests(suiteId, contextUser);

        const results: TestRunResult[] = [];
        let passedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // 4. Execute tests (sequentially for now, parallel later)
        for (const test of tests) {
            try {
                const result = await this.runTest(test.TestID, contextUser, options);
                results.push(result);

                if (result.status === 'Passed') passedCount++;
                else if (result.status === 'Failed') failedCount++;
                else if (result.status === 'Skipped') skippedCount++;
                else if (result.status === 'Error') errorCount++;

                // Fail fast if requested
                if (options?.failFast && result.status !== 'Passed') {
                    break;
                }
            } catch (error) {
                errorCount++;
                if (options?.failFast) {
                    break;
                }
            }
        }

        // 5. Update suite run
        suiteRun.TotalTests = tests.length;
        suiteRun.PassedTests = passedCount;
        suiteRun.FailedTests = failedCount;
        suiteRun.SkippedTests = skippedCount;
        suiteRun.ErrorTests = errorCount;
        suiteRun.TotalCostUSD = results.reduce((sum, r) => sum + r.cost, 0);
        suiteRun.Status = errorCount > 0 ? 'Failed' : 'Completed';
        suiteRun.CompletedAt = new Date();
        await suiteRun.Save();

        return {
            suiteRun,
            testResults: results,
            status: suiteRun.Status,
            totalTests: tests.length,
            passedTests: passedCount,
            failedTests: failedCount,
            skippedTests: skippedCount,
            errorTests: errorCount,
            totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
            totalCost: suiteRun.TotalCostUSD || 0,
            passRate: passedCount / tests.length
        };
    }

    /**
     * Register an oracle implementation
     */
    public registerOracle(oracle: IOracle): void {
        this._oracleRegistry.set(oracle.type, oracle);
    }

    /**
     * Get oracle by type
     */
    public getOracle(type: string): IOracle | undefined {
        return this._oracleRegistry.get(type);
    }

    private async createTestRun(
        test: TestEntity,
        contextUser: UserInfo,
        options?: TestRunOptions
    ): Promise<TestRunEntity> {
        const testRun = await this._metadata.GetEntityObject<TestRunEntity>('Test Runs', contextUser);
        testRun.TestID = test.ID;
        testRun.RunByUserID = contextUser.ID;
        testRun.Status = 'Running';
        testRun.StartedAt = new Date();
        testRun.Sequence = 0; // Will be set by suite if part of suite
        await testRun.Save();
        return testRun;
    }

    private async createSuiteRun(
        suite: TestSuiteEntity,
        contextUser: UserInfo,
        options?: SuiteRunOptions
    ): Promise<TestSuiteRunEntity> {
        const suiteRun = await this._metadata.GetEntityObject<TestSuiteRunEntity>('Test Suite Runs', contextUser);
        suiteRun.SuiteID = suite.ID;
        suiteRun.RunByUserID = contextUser.ID;
        suiteRun.Status = 'Running';
        suiteRun.StartedAt = new Date();
        suiteRun.Environment = options?.environment || 'dev';
        suiteRun.GitCommit = options?.gitCommit || null;
        suiteRun.AgentVersion = options?.agentVersion || null;
        await suiteRun.Save();
        return suiteRun;
    }

    private async loadSuiteTests(suiteId: string, contextUser: UserInfo): Promise<TestSuiteTestEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<TestSuiteTestEntity>({
            EntityName: 'Test Suite Tests',
            ExtraFilter: `SuiteID='${suiteId}' AND Status='Active'`,
            OrderBy: 'Sequence ASC',
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load suite tests: ${result.ErrorMessage}`);
        }

        return result.Results || [];
    }

    private registerDefaultOracles(): void {
        this.registerOracle(new SchemaValidatorOracle());
        this.registerOracle(new TraceValidatorOracle());
        this.registerOracle(new LLMJudgeOracle());
        this.registerOracle(new ExactMatchOracle());
        this.registerOracle(new SQLValidatorOracle());
    }

    private async loadTestTypes(contextUser: UserInfo): Promise<void> {
        // Load all test types for reference
        const rv = new RunView();
        await rv.RunView({
            EntityName: 'Test Types',
            ResultType: 'entity_object'
        }, contextUser);
    }
}
```

### 2. BaseTestDriver (Abstract Driver)

```typescript
/**
 * Abstract base class for test drivers
 *
 * Follows pattern from BaseScheduledJob:
 * - Abstract Execute() method
 * - Protected helper methods
 * - Logging utilities
 */
export abstract class BaseTestDriver {
    protected _metadata: Metadata = new Metadata();

    /**
     * Execute the test
     * Must be implemented by concrete drivers
     */
    abstract Execute(context: DriverExecutionContext): Promise<DriverExecutionResult>;

    /**
     * Validate test configuration
     * Can be overridden by concrete drivers
     */
    public async Validate(test: TestEntity): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Basic validation
        if (!test.InputDefinition) {
            errors.push({
                category: 'input',
                message: 'InputDefinition is required',
                field: 'InputDefinition',
                suggestion: 'Provide test input definition in JSON format'
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Calculate overall score from oracle results
     * Uses weights if provided, otherwise averages
     */
    protected calculateScore(
        oracleResults: OracleResult[],
        weights?: ScoringWeights
    ): number {
        if (oracleResults.length === 0) {
            return 0;
        }

        if (!weights) {
            // Simple average
            const sum = oracleResults.reduce((acc, r) => acc + r.score, 0);
            return sum / oracleResults.length;
        }

        // Weighted average
        let weightedSum = 0;
        let totalWeight = 0;

        for (const result of oracleResults) {
            const weight = weights[result.oracleType] || 0;
            weightedSum += result.score * weight;
            totalWeight += weight;
        }

        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    /**
     * Determine overall status from oracle results
     */
    protected determineStatus(oracleResults: OracleResult[]): 'Passed' | 'Failed' {
        return oracleResults.every(r => r.passed) ? 'Passed' : 'Failed';
    }

    /**
     * Parse configuration JSON
     */
    protected parseConfig<T>(test: TestEntity): T {
        if (!test.Configuration) {
            throw new Error('Configuration is required');
        }

        try {
            return JSON.parse(test.Configuration) as T;
        } catch (error) {
            throw new Error(`Invalid Configuration JSON: ${error.message}`);
        }
    }

    /**
     * Parse input definition JSON
     */
    protected parseInputDefinition<T>(test: TestEntity): T {
        if (!test.InputDefinition) {
            throw new Error('InputDefinition is required');
        }

        try {
            return JSON.parse(test.InputDefinition) as T;
        } catch (error) {
            throw new Error(`Invalid InputDefinition JSON: ${error.message}`);
        }
    }

    /**
     * Parse expected outcomes JSON
     */
    protected parseExpectedOutcomes<T>(test: TestEntity): T {
        if (!test.ExpectedOutcomes) {
            throw new Error('ExpectedOutcomes is required');
        }

        try {
            return JSON.parse(test.ExpectedOutcomes) as T;
        } catch (error) {
            throw new Error(`Invalid ExpectedOutcomes JSON: ${error.message}`);
        }
    }

    /**
     * Log execution progress
     */
    protected log(message: string, verboseOnly: boolean = false): void {
        LogStatusEx({
            message: `[${this.constructor.name}] ${message}`,
            verboseOnly,
            isVerboseEnabled: () => IsVerboseLoggingEnabled()
        });
    }

    /**
     * Log errors
     */
    protected logError(message: string, error?: Error): void {
        LogError(`[${this.constructor.name}] ${message}`, undefined, error);
    }
}
```

### 3. AgentEvalDriver (Concrete Implementation)

```typescript
/**
 * Driver for Agent Evaluation tests
 *
 * Executes an agent and evaluates output via oracles
 */
export class AgentEvalDriver extends BaseTestDriver {
    async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        const startTime = Date.now();
        this.log(`Executing Agent Eval: ${context.test.Name}`);

        // 1. Parse configuration
        const config = this.parseConfig<AgentEvalConfig>(context.test);
        const inputs = this.parseInputDefinition<AgentEvalConfig['inputs']>(context.test);
        const expectedOutcomes = this.parseExpectedOutcomes<AgentEvalConfig['expectedOutcomes']>(context.test);

        // 2. Execute agent
        const agentRun = await this.executeAgent(inputs, config, context.contextUser);

        // 3. Run oracles
        const oracleResults = await this.runOracles(
            agentRun,
            config.oracles,
            expectedOutcomes,
            context
        );

        // 4. Calculate score
        const score = this.calculateScore(oracleResults, config.weights);
        const status = this.determineStatus(oracleResults);

        // 5. Calculate metrics
        const duration = (Date.now() - startTime) / 1000;
        const cost = this.calculateCost(agentRun, oracleResults);

        this.log(`Agent Eval completed: ${status}, Score: ${score.toFixed(4)}`);

        return {
            targetType: 'Agent Run',
            targetLogId: agentRun.ID,
            status,
            score,
            oracleResults,
            inputData: inputs,
            expectedOutputData: expectedOutcomes,
            actualOutputData: this.extractActualOutput(agentRun),
            cost,
            duration,
            passedChecks: oracleResults.filter(r => r.passed).length,
            failedChecks: oracleResults.filter(r => !r.passed).length,
            totalChecks: oracleResults.length,
            resultDetails: {
                agentRunId: agentRun.ID,
                totalTokens: agentRun.TotalTokensUsed,
                steps: agentRun.TotalSteps
            }
        };
    }

    private async executeAgent(
        inputs: any,
        config: AgentEvalConfig,
        contextUser: UserInfo
    ): Promise<AIAgentRunEntity> {
        // Load agent
        const md = new Metadata();
        const agent = await md.GetEntityObject<AIAgentEntity>('AI Agents', contextUser);

        if (config.agentId) {
            await agent.Load(config.agentId);
        } else {
            // Could infer from test context
            throw new Error('AgentID required in configuration');
        }

        // Execute agent via AgentRunner
        const runner = new AgentRunner();
        const result = await runner.RunAgent({
            agent,
            conversationMessages: this.buildConversationMessages(inputs),
            contextUser,
            agentConfigPreset: config.agentConfigPreset
        });

        // Load the full agent run entity
        const agentRun = await md.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs', contextUser);
        await agentRun.Load(result.RunID);

        // Link test run to agent run (bidirectional)
        // Note: context.testRun.ID will be set by engine before calling Execute
        agentRun.TestRunID = context.testRun.ID;
        await agentRun.Save();

        return agentRun;
    }

    private async runOracles(
        agentRun: AIAgentRunEntity,
        oracleConfigs: OracleConfig[],
        expectedOutcomes: any,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const results: OracleResult[] = [];

        for (const oracleConfig of oracleConfigs) {
            const oracle = context.oracleRegistry.get(oracleConfig.type);

            if (!oracle) {
                this.logError(`Oracle not found: ${oracleConfig.type}`);
                continue;
            }

            try {
                const result = await oracle.evaluate({
                    test: context.test,
                    expectedOutcomes,
                    actualOutputs: agentRun.ResultPayload,
                    target: agentRun,
                    contextUser: context.contextUser
                }, oracleConfig);

                results.push(result);
            } catch (error) {
                this.logError(`Oracle ${oracleConfig.type} failed`, error);
                results.push({
                    oracleType: oracleConfig.type,
                    passed: false,
                    score: 0,
                    message: `Oracle execution failed: ${error.message}`
                });
            }
        }

        return results;
    }

    private buildConversationMessages(inputs: any): any[] {
        // Convert test inputs to conversation format
        return [{
            Role: 'user',
            Content: inputs.prompt,
            ...inputs.context
        }];
    }

    private extractActualOutput(agentRun: AIAgentRunEntity): any {
        // Extract structured output from agent run
        return {
            payload: agentRun.ResultPayload,
            success: agentRun.Success,
            errorMessage: agentRun.ErrorMessage
        };
    }

    private calculateCost(agentRun: AIAgentRunEntity, oracleResults: OracleResult[]): number {
        let cost = agentRun.TotalCost || 0;

        // Add oracle costs (e.g., LLM judge)
        for (const result of oracleResults) {
            if (result.cost) {
                cost += result.cost;
            }
        }

        return cost;
    }
}
```

### 4. IOracle Interface

```typescript
/**
 * Oracle interface for test evaluation
 */
export interface IOracle {
    /**
     * Unique type identifier for this oracle
     */
    readonly type: string;

    /**
     * Evaluate the test output
     */
    evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult>;
}
```

### 5. Oracle Implementations (Example: TraceValidator)

```typescript
/**
 * Oracle that checks agent run trace for errors
 */
export class TraceValidatorOracle implements IOracle {
    readonly type = 'trace-no-errors';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        const agentRun = input.target as AIAgentRunEntity;

        // Load agent run steps
        const rv = new RunView();
        const stepsResult = await rv.RunView<AIAgentRunStepEntity>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${agentRun.ID}'`,
            ResultType: 'entity_object'
        }, input.contextUser);

        if (!stepsResult.Success) {
            throw new Error(`Failed to load agent run steps: ${stepsResult.ErrorMessage}`);
        }

        const steps = stepsResult.Results || [];
        const errorSteps = steps.filter(s =>
            s.Status === 'Error' || s.Status === 'Failed'
        );

        const passed = errorSteps.length === 0;

        return {
            oracleType: this.type,
            passed,
            score: passed ? 1.0 : 0.0,
            message: passed
                ? `All ${steps.length} steps completed without errors`
                : `${errorSteps.length} of ${steps.length} steps had errors`,
            details: passed ? undefined : {
                errorSteps: errorSteps.map(s => ({
                    stepId: s.ID,
                    sequence: s.Sequence,
                    status: s.Status,
                    error: s.Notes
                }))
            }
        };
    }
}
```

## Registration Pattern

Following `BaseScheduledJob` and `BaseAgent`, drivers are registered with ClassFactory:

```typescript
// In concrete driver file
import { RegisterClass } from '@memberjunction/global';
import { BaseTestDriver } from './BaseTestDriver';

@RegisterClass(BaseTestDriver, 'AgentEvalDriver')
export class AgentEvalDriver extends BaseTestDriver {
    // ...
}
```

## Key Design Decisions

### 1. **Singleton Engine**
- Follows `SchedulingEngine` pattern
- Single instance manages all test execution
- Maintains oracle registry

### 2. **ClassFactory for Drivers**
- Like `AgentRunner` and `BaseScheduledJob`
- Dynamic instantiation based on `TestType.DriverClass`
- Extensible for future test types

### 3. **Bidirectional Trace Links**
- `TestRun.TargetLogID` → soft FK to `AgentRun.ID`
- `AgentRun.TestRunID` → hard FK back to `TestRun.ID`
- Set during driver execution for proper linking

### 4. **Oracle Registry**
- Engine maintains map of oracle implementations
- Drivers access via context
- Easy to add custom oracles

### 5. **Structured Results**
- Like `ActionResult` and `ExecuteAgentResult`
- Consistent return types
- Easy to serialize/log

### 6. **Error Handling**
- Follows `AgentRunner` pattern
- Try/catch around driver execution
- Update test run status on error
- Re-throw for caller to handle

### 7. **Logging**
- Use `LogStatusEx` for progress
- Use `LogError` for errors
- Verbose logging controlled by `IsVerboseLoggingEnabled()`

## Usage Example

```typescript
// Initialize engine
const engine = TestEngine.Instance;
await engine.Config(false, contextUser);

// Run a single test
const result = await engine.runTest('test-id-123', contextUser, {
    environment: 'staging',
    gitCommit: 'abc123'
});

console.log(`Test ${result.status}: Score ${result.score.toFixed(4)}`);
console.log(`Cost: $${result.cost.toFixed(4)}, Duration: ${result.duration.toFixed(1)}s`);

// Run a suite
const suiteResult = await engine.runSuite('suite-id-456', contextUser, {
    parallel: false,
    failFast: true
});

console.log(`Suite: ${suiteResult.passedTests}/${suiteResult.totalTests} passed`);
```

## Next Steps After Approval

1. Implement `TestEngine` and `TestEngineBase`
2. Implement `BaseTestDriver`
3. Implement `AgentEvalDriver`
4. Implement oracle implementations
5. Implement utility functions (scoring, cost, formatting)
6. Add ClassFactory registrations
7. Write basic tests/examples

## Questions for Feedback

1. **Engine singleton vs multiple instances?** - I propose singleton like SchedulingEngine
2. **Oracle registry location?** - In engine or separate service?
3. **Async oracle execution?** - Run oracles sequentially or in parallel?
4. **Suite execution?** - Sequential first, parallel later?
5. **Result caching?** - Should expensive oracles (LLM judge) cache results?

This proposal follows established MJ patterns closely while adapting them for test execution needs.
