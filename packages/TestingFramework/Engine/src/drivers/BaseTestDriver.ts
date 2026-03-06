/**
 * @fileoverview Base class for all test driver implementations
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
    MJTestEntity,
    MJTestRunEntity
} from '@memberjunction/core-entities';
import {
    DriverExecutionContext,
    DriverExecutionResult,
    OracleResult,
    ScoringWeights,
    ValidationResult,
    ValidationError,
    ValidationWarning,
    TestLogMessage
} from '../types';

/**
 * Default timeout for test execution in milliseconds (5 minutes)
 */
export const DEFAULT_TEST_TIMEOUT_MS = 300000;

/**
 * Abstract base class for test driver implementations.
 *
 * Each TestType in the database has a corresponding DriverClass that extends this base.
 * The driver is responsible for:
 * - Parsing test-specific configuration from Configuration JSON
 * - Executing the test with appropriate logic
 * - Running oracles to evaluate results
 * - Calculating scores and determining pass/fail status
 * - Returning structured results
 *
 * BaseTestDriver handles common functionality:
 * - Configuration parsing
 * - Score calculation
 * - Status determination
 * - Logging
 * - Error handling
 *
 * Follows pattern from BaseScheduledJob and BaseAgent.
 *
 * @abstract
 * @example
 * ```typescript
 * @RegisterClass(BaseTestDriver, 'AgentEvalDriver')
 * export class AgentEvalDriver extends BaseTestDriver {
 *     async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
 *         const config = this.parseConfig<AgentEvalConfig>(context.test);
 *         // Execute test logic
 *         return result;
 *     }
 * }
 * ```
 */
export abstract class BaseTestDriver {
    protected _metadata: Metadata = new Metadata();

    /**
     * Execute the test.
     *
     * This is the main entry point for test execution. The driver should:
     * 1. Parse Configuration, InputDefinition, ExpectedOutcomes from test entity
     * 2. Perform test-specific execution (e.g., run agent, execute workflow)
     * 3. Run oracles to evaluate results
     * 4. Calculate score and determine status
     * 5. Return structured DriverExecutionResult
     *
     * The base engine will handle:
     * - Creating/updating TestRun entity
     * - Logging to database
     * - Error handling
     * - Timing and cost tracking
     *
     * @param context - Execution context including test, run, user, options
     * @returns Promise resolving to execution result
     */
    abstract Execute(context: DriverExecutionContext): Promise<DriverExecutionResult>;

    /**
     * Validate test configuration.
     *
     * Called when creating or updating a test to ensure the configuration is valid
     * for this test type. Override to add type-specific validation.
     *
     * @param test - The test being validated
     * @returns Validation result with errors and warnings
     */
    public async Validate(test: MJTestEntity): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // Basic validation that all drivers need
        if (!test.InputDefinition || test.InputDefinition.trim() === '') {
            errors.push({
                category: 'input',
                message: 'InputDefinition is required',
                field: 'InputDefinition',
                suggestion: 'Provide test input definition in JSON format'
            });
        } else {
            // Validate JSON
            try {
                JSON.parse(test.InputDefinition);
            } catch (error) {
                errors.push({
                    category: 'input',
                    message: `InputDefinition is not valid JSON: ${(error as Error).message}`,
                    field: 'InputDefinition',
                    suggestion: 'Fix JSON syntax errors'
                });
            }
        }

        if (!test.ExpectedOutcomes || test.ExpectedOutcomes.trim() === '') {
            warnings.push({
                category: 'best-practice',
                message: 'ExpectedOutcomes is recommended for validation',
                recommendation: 'Define expected outcomes to enable automated validation'
            });
        } else {
            // Validate JSON
            try {
                JSON.parse(test.ExpectedOutcomes);
            } catch (error) {
                errors.push({
                    category: 'expected-outcome',
                    message: `ExpectedOutcomes is not valid JSON: ${(error as Error).message}`,
                    field: 'ExpectedOutcomes',
                    suggestion: 'Fix JSON syntax errors'
                });
            }
        }

        if (!test.Configuration || test.Configuration.trim() === '') {
            warnings.push({
                category: 'best-practice',
                message: 'Configuration is recommended',
                recommendation: 'Define test configuration including oracles and weights'
            });
        } else {
            // Validate JSON
            try {
                JSON.parse(test.Configuration);
            } catch (error) {
                errors.push({
                    category: 'configuration',
                    message: `Configuration is not valid JSON: ${(error as Error).message}`,
                    field: 'Configuration',
                    suggestion: 'Fix JSON syntax errors'
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Calculate overall score from oracle results.
     *
     * If weights are provided, calculates weighted average.
     * Otherwise, calculates simple average.
     *
     * @param oracleResults - Results from oracle evaluations
     * @param weights - Optional scoring weights by oracle type
     * @returns Overall score from 0.0 to 1.0
     * @protected
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
     * Determine overall test status from oracle results.
     *
     * Test passes only if ALL oracles pass.
     *
     * @param oracleResults - Results from oracle evaluations
     * @returns 'Passed' if all oracles passed, 'Failed' otherwise
     * @protected
     */
    protected determineStatus(oracleResults: OracleResult[]): 'Passed' | 'Failed' {
        if (oracleResults.length === 0) {
            return 'Failed';
        }

        return oracleResults.every(r => r.passed) ? 'Passed' : 'Failed';
    }

    /**
     * Parse and validate Configuration JSON.
     *
     * Helper method for drivers to parse their configuration with type safety.
     * Throws if configuration is invalid.
     *
     * @template T - The configuration type
     * @param test - The test containing the configuration
     * @returns Parsed configuration
     * @throws Error if configuration is missing or invalid
     * @protected
     */
    protected parseConfig<T>(test: MJTestEntity): T {
        if (!test.Configuration) {
            throw new Error('Configuration is required for test execution');
        }

        try {
            return JSON.parse(test.Configuration) as T;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Invalid Configuration JSON: ${errorMessage}`);
        }
    }

    /**
     * Parse and validate InputDefinition JSON.
     *
     * @template T - The input definition type
     * @param test - The test containing the input definition
     * @returns Parsed input definition
     * @throws Error if input definition is missing or invalid
     * @protected
     */
    protected parseInputDefinition<T>(test: MJTestEntity): T {
        if (!test.InputDefinition) {
            throw new Error('InputDefinition is required for test execution');
        }

        try {
            return JSON.parse(test.InputDefinition) as T;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Invalid InputDefinition JSON: ${errorMessage}`);
        }
    }

    /**
     * Parse and validate ExpectedOutcomes JSON.
     *
     * @template T - The expected outcomes type
     * @param test - The test containing the expected outcomes
     * @returns Parsed expected outcomes
     * @throws Error if expected outcomes is missing or invalid
     * @protected
     */
    protected parseExpectedOutcomes<T>(test: MJTestEntity): T {
        if (!test.ExpectedOutcomes) {
            throw new Error('ExpectedOutcomes is required for test execution');
        }

        try {
            return JSON.parse(test.ExpectedOutcomes) as T;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Invalid ExpectedOutcomes JSON: ${errorMessage}`);
        }
    }

    /**
     * Log execution progress.
     *
     * @param message - Log message
     * @param verboseOnly - Whether to only log in verbose mode (default: false)
     * @protected
     */
    protected log(message: string, verboseOnly: boolean = false): void {
        LogStatusEx({
            message: `[${this.constructor.name}] ${message}`,
            verboseOnly,
            isVerboseEnabled: () => IsVerboseLoggingEnabled()
        });
    }

    /**
     * Log errors.
     *
     * @param message - Error message
     * @param error - Optional error object
     * @protected
     */
    protected logError(message: string, error?: Error): void {
        LogError(`[${this.constructor.name}] ${message}`, undefined, error);
    }

    /**
     * Whether this driver supports cancellation via AbortSignal.
     *
     * Drivers should override this to return true if they properly handle
     * cancellation tokens. When a driver doesn't support cancellation,
     * timeout will still mark the test as failed but the underlying
     * execution may continue in the background.
     *
     * @returns true if driver supports cancellation, false otherwise
     */
    public supportsCancellation(): boolean {
        return false;
    }

    /**
     * Get the effective timeout for a test.
     *
     * Priority (highest to lowest):
     * 1. Configuration JSON maxExecutionTime field (backward compatibility)
     * 2. Test.MaxExecutionTimeMS column
     * 3. DEFAULT_TEST_TIMEOUT_MS constant (5 minutes)
     *
     * @param test - The test entity
     * @param config - Parsed configuration object (optional)
     * @returns Timeout in milliseconds
     * @protected
     */
    protected getEffectiveTimeout(test: MJTestEntity, config?: { maxExecutionTime?: number }): number {
        // Priority 1: JSON config maxExecutionTime (backward compatibility)
        if (config?.maxExecutionTime != null && config.maxExecutionTime > 0) {
            return config.maxExecutionTime;
        }

        // Priority 2: Entity field MaxExecutionTimeMS
        if (test.MaxExecutionTimeMS != null && test.MaxExecutionTimeMS > 0) {
            return test.MaxExecutionTimeMS;
        }

        // Priority 3: Default timeout
        return DEFAULT_TEST_TIMEOUT_MS;
    }

    /**
     * Create a log message for the test execution log.
     *
     * @param level - Log level
     * @param message - Log message
     * @param metadata - Optional metadata
     * @returns TestLogMessage object
     * @protected
     */
    protected createLogMessage(
        level: 'info' | 'warn' | 'error' | 'debug',
        message: string,
        metadata?: Record<string, unknown>
    ): TestLogMessage {
        return {
            timestamp: new Date(),
            level,
            message,
            metadata
        };
    }

    /**
     * Log a message to both the console (if verbose) and accumulate for test run log.
     *
     * @param context - Driver execution context
     * @param level - Log level
     * @param message - Log message
     * @param metadata - Optional metadata
     * @protected
     */
    protected logToTestRun(
        context: DriverExecutionContext,
        level: 'info' | 'warn' | 'error' | 'debug',
        message: string,
        metadata?: Record<string, unknown>
    ): void {
        // Log to console based on level and verbosity
        const verboseOnly = level === 'debug';
        this.log(message, verboseOnly);

        // Send to log callback if provided
        if (context.options.logCallback) {
            context.options.logCallback(this.createLogMessage(level, message, metadata));
        }
    }
}
