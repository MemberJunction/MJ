/**
 * Test driver for Computer Use tests.
 *
 * Integrates the Computer Use engine with the MJ Testing Framework.
 * Executes browser-based tests by driving MJComputerUseEngine with
 * test configuration, then evaluates results using oracles.
 *
 * Registered as 'ComputerUseTestDriver' in the ClassFactory — the
 * TestEngine resolves it via the TestType.DriverClass field.
 *
 * Oracle types supported:
 * - "goal-completion": Checks FinalJudgeVerdict.Done + confidence threshold
 * - "url-match": Regex match on final browser URL
 * - "step-count": Validates step count within expected bounds
 * - Plus any globally registered oracles (llm-judge, schema-validate, etc.)
 *
 * @example
 * ```typescript
 * // Configuration JSON in Test entity:
 * {
 *   "headless": true,
 *   "maxSteps": 20,
 *   "maxExecutionTime": 120000,
 *   "oracles": [
 *     { "type": "goal-completion", "weight": 0.6 },
 *     { "type": "url-match", "weight": 0.4, "config": { "pattern": "^https://example\\.com/success" } }
 *   ]
 * }
 *
 * // InputDefinition JSON:
 * {
 *   "goal": "Navigate to the login page and sign in",
 *   "startUrl": "https://example.com"
 * }
 *
 * // ExpectedOutcomes JSON:
 * {
 *   "goalCompleted": true,
 *   "finalUrlPattern": "^https://example\\.com/dashboard",
 *   "minConfidence": 0.7
 * }
 * ```
 */

import { RegisterClass } from '@memberjunction/global';
import { TestEntity } from '@memberjunction/core-entities';
import {
    BaseTestDriver,
    type IOracle,
    DriverExecutionContext,
    DriverExecutionResult,
    OracleInput,
    OracleResult,
    ValidationResult,
    ValidationError,
    ValidationWarning,
    TestRunOutputItem,
} from '@memberjunction/testing-engine';

import {
    BrowserConfig,
    ModelConfig,
    ComputerUseAuthConfig,
    DomainAuthBinding,
    BasicAuthMethod,
    BearerTokenAuthMethod,
    APIKeyHeaderAuthMethod,
    OAuthClientCredentialsAuthMethod,
    CookieInjectionAuthMethod,
    CookieEntry,
    LocalStorageInjectionAuthMethod,
} from '@memberjunction/computer-use';
import type { AuthMethod, ComputerUseResult } from '@memberjunction/computer-use';

import { MJComputerUseEngine } from '../engine/MJComputerUseEngine.js';
import { MJRunComputerUseParams, PromptEntityRef, ActionRef } from '../types/mj-params.js';
import { parseJudgeFrequency } from '../utils/judge-frequency-parser.js';

import type {
    ComputerUseTestConfig,
    ComputerUseTestInput,
    ComputerUseExpectedOutcomes,
    ComputerUseOracleConfig,
} from './types.js';

import { GoalCompletionOracle } from './oracles/GoalCompletionOracle.js';
import { UrlMatchOracle } from './oracles/UrlMatchOracle.js';
import { StepCountOracle } from './oracles/StepCountOracle.js';

/**
 * Test driver for Computer Use browser automation tests.
 *
 * Orchestrates:
 * 1. Parsing test configuration → MJRunComputerUseParams
 * 2. Executing MJComputerUseEngine.Run() with timeout
 * 3. Running oracles (built-in + global registry)
 * 4. Calculating score and status
 * 5. Returning DriverExecutionResult
 */
@RegisterClass(BaseTestDriver, 'ComputerUseTestDriver')
export class ComputerUseTestDriver extends BaseTestDriver {
    /**
     * Built-in oracles for Computer Use tests.
     * These are registered locally and take precedence over global oracles
     * of the same type.
     */
    private static readonly builtInOracles: Map<string, IOracle> = new Map<string, IOracle>([
        ['goal-completion', new GoalCompletionOracle()],
        ['url-match', new UrlMatchOracle()],
        ['step-count', new StepCountOracle()],
    ]);

    /**
     * Returns true — this driver supports cancellation via engine.Stop().
     */
    public override supportsCancellation(): boolean {
        return true;
    }

    /**
     * Execute a Computer Use test.
     *
     * Steps:
     * 1. Parse Configuration, InputDefinition, ExpectedOutcomes
     * 2. Build MJRunComputerUseParams from parsed data
     * 3. Execute MJComputerUseEngine.Run() with timeout
     * 4. Build actual output from ComputerUseResult
     * 5. Run oracles (built-in + from context registry)
     * 6. Calculate score, determine status
     * 7. Return DriverExecutionResult
     */
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        this.logToTestRun(context, 'info', 'Starting Computer Use test');

        try {
            // 1. Parse test definition
            const config = this.parseConfig<ComputerUseTestConfig>(context.test);
            const input = this.parseInputDefinition<ComputerUseTestInput>(context.test);
            const expected = this.parseExpectedOutcomes<ComputerUseExpectedOutcomes>(context.test);

            // 2. Build engine params
            const runParams = this.buildRunParams(config, input, context);

            this.logToTestRun(context, 'info', `Executing Computer Use: goal="${input.goal}", startUrl="${input.startUrl ?? 'none'}"`);

            // 3. Execute with timeout
            const effectiveTimeout = this.getEffectiveTimeout(context.test, config);
            const { result, timedOut } = await this.executeWithTimeout(runParams, effectiveTimeout, context);

            // 4. Build actual output with execution configuration
            const actualOutput = this.buildActualOutput(result);

            // Add test configuration metadata for debugging
            (actualOutput as Record<string, unknown>).executionConfig = {
                headless: config.headless ?? true,
                maxSteps: config.maxSteps ?? 30,
                timeout: effectiveTimeout,
                screenshotHistoryDepth: config.screenshotHistoryDepth,
                viewportWidth: config.viewportWidth,
                viewportHeight: config.viewportHeight,
                controllerPrompt: config.controllerPromptName,
                judgePrompt: config.judgePromptName,
                judgeFrequency: config.judgeFrequency,
                oraclesConfigured: config.oracles?.length ?? 0,
                actionsEnabled: config.actions?.length ?? 0,
                startUrl: input.startUrl,
                allowedDomains: input.allowedDomains,
                blockedDomains: input.blockedDomains,
            };

            // Handle timeout
            if (timedOut) {
                this.logToTestRun(context, 'error', `Test timed out after ${effectiveTimeout}ms`);
                return this.buildTimeoutResult(result, input, expected, actualOutput, effectiveTimeout, context);
            }

            // Handle cancellation (engine was stopped via Stop())
            if (result.Status === 'Cancelled') {
                this.logToTestRun(context, 'warn', 'Test execution was cancelled');
                return this.buildCancelledResult(result, input, expected, actualOutput, context);
            }

            // 5. Run oracles
            this.logToTestRun(context, 'info', 'Running oracles for evaluation');
            const oracleResults = await this.runOracles(config, input, expected, actualOutput, context);

            // 6. Calculate score and status
            const score = this.calculateScore(oracleResults, config.scoringWeights);
            const status = oracleResults.length === 0 && result.Success
                ? 'Passed'
                : this.determineStatus(oracleResults);

            const passedChecks = oracleResults.filter(r => r.passed).length;
            const totalChecks = oracleResults.length;

            // 7. Build structured outputs (screenshots from each step)
            const outputs = this.buildOutputs(result);

            // 8. Build result
            const driverResult: DriverExecutionResult = {
                targetType: 'Computer Use',
                targetLogId: context.testRun.ID,
                status,
                score,
                oracleResults,
                passedChecks,
                failedChecks: totalChecks - passedChecks,
                totalChecks,
                inputData: input,
                expectedOutput: expected,
                actualOutput,
                durationMs: result.TotalDurationMs,
                outputs,
            };

            this.logToTestRun(context, 'info', `Computer Use test completed: ${status} (Score: ${score.toFixed(2)})`);
            return driverResult;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logToTestRun(context, 'error', `Computer Use test failed: ${errorMessage}`);

            // Return failure result instead of re-throwing to ensure status is updated
            return this.buildErrorResult(error, context);
        }
    }

    /**
     * Validate Computer Use test configuration.
     *
     * Checks:
     * - Base JSON validation
     * - InputDefinition has a goal
     * - Oracle types are valid
     * - URL patterns are valid regexes
     * - Scoring weights sum to ~1.0
     */
    public override async Validate(test: TestEntity): Promise<ValidationResult> {
        const baseResult = await super.Validate(test);
        if (!baseResult.valid) {
            return baseResult;
        }

        const errors = [...baseResult.errors];
        const warnings = [...baseResult.warnings];

        try {
            // Validate input definition
            const input = this.parseInputDefinition<ComputerUseTestInput>(test);

            if (!input.goal || input.goal.trim() === '') {
                errors.push({
                    category: 'input',
                    message: 'goal is required in InputDefinition',
                    field: 'InputDefinition.goal',
                    suggestion: 'Provide a natural-language goal for the Computer Use agent'
                });
            }

            // Validate configuration
            if (test.Configuration) {
                const config = this.parseConfig<ComputerUseTestConfig>(test);
                this.validateConfig(config, errors, warnings);
            }

            // Validate expected outcomes
            if (test.ExpectedOutcomes) {
                const expected = this.parseExpectedOutcomes<ComputerUseExpectedOutcomes>(test);
                this.validateExpectedOutcomes(expected, errors, warnings);
            }

        } catch (error) {
            errors.push({
                category: 'configuration',
                message: `Validation failed: ${(error as Error).message}`,
                field: 'Configuration',
                suggestion: 'Fix JSON structure'
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    // ═══════════════════════════════════════════════════════════
    // ENGINE EXECUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Build MJRunComputerUseParams from test configuration and input.
     */
    private buildRunParams(
        config: ComputerUseTestConfig,
        input: ComputerUseTestInput,
        context: DriverExecutionContext
    ): MJRunComputerUseParams {
        const params = new MJRunComputerUseParams();

        // From InputDefinition
        params.Goal = input.goal;
        params.StartUrl = input.startUrl;
        params.AllowedDomains = input.allowedDomains;
        params.BlockedDomains = input.blockedDomains;

        // From Configuration
        params.Headless = config.headless ?? true;
        params.MaxSteps = config.maxSteps ?? 30;
        if (config.screenshotHistoryDepth != null) {
            params.ScreenshotHistoryDepth = config.screenshotHistoryDepth;
        }

        // Browser config
        if (config.viewportWidth || config.viewportHeight) {
            const browserConfig = new BrowserConfig();
            browserConfig.ViewportWidth = config.viewportWidth ?? 1280;
            browserConfig.ViewportHeight = config.viewportHeight ?? 720;
            params.BrowserConfig = browserConfig;
        }

        // MJ prompt refs
        params.ControllerPromptRef = this.buildPromptRef(config.controllerPromptName);
        params.JudgePromptRef = this.buildPromptRef(config.judgePromptName);

        // Direct model overrides (bypass auto-select)
        if (config.controllerModel) {
            params.ControllerModel = new ModelConfig(
                config.controllerModel.vendor,
                config.controllerModel.model,
                config.controllerModel.driverClass
            );
        }
        if (config.judgeModel) {
            params.JudgeModel = new ModelConfig(
                config.judgeModel.vendor,
                config.judgeModel.model,
                config.judgeModel.driverClass
            );
        }

        // Judge frequency
        if (config.judgeFrequency) {
            params.JudgeFrequency = parseJudgeFrequency(config.judgeFrequency);
        }

        // Auth bindings from InputDefinition
        if (input.auth?.bindings && input.auth.bindings.length > 0) {
            params.Auth = this.buildAuthConfig(input.auth.bindings);
        }

        // MJ Actions as tools
        if (config.actions && config.actions.length > 0) {
            params.Actions = config.actions.map(a => {
                const ref = new ActionRef();
                ref.ActionName = a.actionName;
                ref.ActionId = a.actionId;
                return ref;
            });
        }

        // MJ context
        params.ContextUser = context.contextUser;
        params.AgentRunId = config.agentRunId;

        // Wire engine logs to test run logs so they appear in the testing UI
        params.LogCallback = (level: 'info' | 'warn' | 'error', message: string) => {
            this.logToTestRun(context, level, message);
        };

        return params;
    }

    /**
     * Execute the engine with a timeout.
     * Uses engine.Stop() for graceful cancellation.
     */
    private async executeWithTimeout(
        params: MJRunComputerUseParams,
        timeoutMs: number,
        context: DriverExecutionContext
    ): Promise<{ result: ComputerUseResult; timedOut: boolean }> {
        const engine = new MJComputerUseEngine();
        let timedOut = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        if (timeoutMs > 0) {
            timeoutId = setTimeout(() => {
                timedOut = true;
                this.logToTestRun(context, 'warn', `Stopping engine due to timeout (${timeoutMs}ms)`);
                engine.Stop();
            }, timeoutMs);
        }

        try {
            const result = await engine.Run(params);
            return { result, timedOut };
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // RESULT EXTRACTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Build the actual output record from ComputerUseResult.
     * This is what gets passed to oracles and stored in the test run.
     */
    private buildActualOutput(result: ComputerUseResult): Record<string, unknown> {
        const output: Record<string, unknown> = {
            success: result.Success,
            status: result.Status,
            totalSteps: result.TotalSteps,
            totalDurationMs: result.TotalDurationMs,
            finalUrl: result.FinalUrl,
            finalScreenshot: result.FinalScreenshot,
            stepCount: result.Steps.length,
        };

        // Include judge verdict if available
        if (result.FinalJudgeVerdict) {
            output.finalJudgeVerdict = {
                Done: result.FinalJudgeVerdict.Done,
                Confidence: result.FinalJudgeVerdict.Confidence,
                Reason: result.FinalJudgeVerdict.Reason,
                Feedback: result.FinalJudgeVerdict.Feedback,
            };
        }

        // Include detailed error information if available
        if (result.Error) {
            output.error = {
                message: result.Error.Message,
                category: result.Error.Category,
                stepNumber: result.Error.StepNumber,
                stackTrace: result.Error.OriginalError?.stack,
            };
        }

        // Include step history summary for debugging
        if (result.Steps.length > 0) {
            output.stepHistory = result.Steps.map(step => ({
                stepNumber: step.StepNumber,
                url: step.Url,
                reasoning: step.ControllerReasoning,
                actionsCount: step.ActionsRequested.length,
                toolCallsCount: step.ToolCalls.length,
                durationMs: step.DurationMs,
                hadError: !!step.Error,
                judgeVerdict: step.JudgeVerdict ? {
                    Done: step.JudgeVerdict.Done,
                    Confidence: step.JudgeVerdict.Confidence,
                } : undefined,
            }));
        }

        return output;
    }

    /**
     * Build structured output items from ComputerUseResult steps.
     * Each step screenshot becomes a sequenced TestRunOutputItem for storyboarding.
     */
    private buildOutputs(result: ComputerUseResult): TestRunOutputItem[] {
        const outputs: TestRunOutputItem[] = [];
        let sequence = 1;

        // Step screenshots
        for (const step of result.Steps) {
            if (step.Screenshot) {
                outputs.push({
                    outputTypeName: 'Screenshot',
                    sequence,
                    stepNumber: step.StepNumber,
                    name: `Step ${step.StepNumber} Screenshot`,
                    description: step.Url ? `Page: ${step.Url}` : undefined,
                    mimeType: 'image/png',
                    inlineData: step.Screenshot,
                    metadata: step.ControllerReasoning
                        ? { reasoning: step.ControllerReasoning }
                        : undefined,
                });
                sequence++;
            }
        }

        // Final screenshot (distinct from the last step screenshot)
        if (result.FinalScreenshot) {
            outputs.push({
                outputTypeName: 'Screenshot',
                sequence,
                name: 'Final Screenshot',
                description: result.FinalUrl ? `Final page: ${result.FinalUrl}` : undefined,
                mimeType: 'image/png',
                inlineData: result.FinalScreenshot,
            });
        }

        return outputs;
    }

    /**
     * Build a timeout result with partial data.
     */
    private buildTimeoutResult(
        result: ComputerUseResult,
        input: ComputerUseTestInput,
        expected: ComputerUseExpectedOutcomes,
        actualOutput: Record<string, unknown>,
        timeoutMs: number,
        context: DriverExecutionContext
    ): DriverExecutionResult {
        return {
            targetType: 'Computer Use',
            targetLogId: context.testRun.ID,
            status: 'Timeout',
            score: 0,
            oracleResults: [],
            passedChecks: 0,
            failedChecks: 0,
            totalChecks: 0,
            inputData: input,
            expectedOutput: expected,
            actualOutput,
            durationMs: result.TotalDurationMs,
            errorMessage: `Test execution timed out after ${timeoutMs}ms`,
            outputs: this.buildOutputs(result),
        };
    }

    /**
     * Build a cancellation result when the engine is stopped via Stop().
     */
    private buildCancelledResult(
        result: ComputerUseResult,
        input: ComputerUseTestInput,
        expected: ComputerUseExpectedOutcomes,
        actualOutput: Record<string, unknown>,
        context: DriverExecutionContext
    ): DriverExecutionResult {
        return {
            targetType: 'Computer Use',
            targetLogId: context.testRun.ID,
            status: 'Timeout', // Map Cancelled to Timeout since it's an early termination
            score: 0,
            oracleResults: [],
            passedChecks: 0,
            failedChecks: 0,
            totalChecks: 0,
            inputData: input,
            expectedOutput: expected,
            actualOutput,
            durationMs: result.TotalDurationMs,
            errorMessage: `Test execution was cancelled after ${result.TotalSteps} step(s)`,
            outputs: this.buildOutputs(result),
        };
    }

    /**
     * Build an error result when execution fails with an exception.
     * Attempts to preserve as much context as possible for debugging.
     */
    private buildErrorResult(
        error: unknown,
        context: DriverExecutionContext
    ): DriverExecutionResult {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stackTrace = error instanceof Error ? error.stack : undefined;

        // Try to parse input/expected even if execution failed
        let inputData: unknown = {};
        let expectedOutput: unknown = {};

        try {
            inputData = this.parseInputDefinition<ComputerUseTestInput>(context.test);
        } catch (parseError) {
            // Input couldn't be parsed - include the raw JSON and error
            inputData = {
                _parseError: parseError instanceof Error ? parseError.message : String(parseError),
                _rawInput: context.test.InputDefinition,
            };
        }

        try {
            expectedOutput = this.parseExpectedOutcomes<ComputerUseExpectedOutcomes>(context.test);
        } catch (parseError) {
            // Expected outcomes couldn't be parsed - include the raw JSON and error
            expectedOutput = {
                _parseError: parseError instanceof Error ? parseError.message : String(parseError),
                _rawExpected: context.test.ExpectedOutcomes,
            };
        }

        // Build diagnostic actualOutput with execution context
        const actualOutput = {
            executionFailed: true,
            failureStage: this.determineFailureStage(errorMessage),
            error: {
                message: errorMessage,
                type: error instanceof Error ? error.constructor.name : typeof error,
                stackTrace,
            },
            testContext: {
                testId: context.test.ID,
                testName: context.test.Name,
                testRunId: context.testRun.ID,
            },
        };

        return {
            targetType: 'Computer Use',
            targetLogId: context.testRun.ID,
            status: 'Failed',
            score: 0,
            oracleResults: [],
            passedChecks: 0,
            failedChecks: 0,
            totalChecks: 0,
            inputData,
            expectedOutput,
            actualOutput,
            durationMs: 0,
            errorMessage: `Test execution failed: ${errorMessage}`,
        };
    }

    /**
     * Determine what stage of execution failed based on error message.
     */
    private determineFailureStage(errorMessage: string): string {
        if (errorMessage.includes('Configuration') || errorMessage.includes('InputDefinition') || errorMessage.includes('ExpectedOutcomes')) {
            return 'parsing';
        }
        if (errorMessage.includes('browser') || errorMessage.includes('Browser')) {
            return 'browser_initialization';
        }
        if (errorMessage.includes('prompt') || errorMessage.includes('model')) {
            return 'llm_execution';
        }
        if (errorMessage.includes('auth') || errorMessage.includes('credential')) {
            return 'authentication';
        }
        return 'unknown';
    }

    // ═══════════════════════════════════════════════════════════
    // ORACLE EVALUATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Run all configured oracles against the test results.
     *
     * Oracle resolution priority:
     * 1. Built-in Computer Use oracles (goal-completion, url-match, step-count)
     * 2. Global oracle registry from execution context (llm-judge, schema-validate, etc.)
     */
    private async runOracles(
        config: ComputerUseTestConfig,
        input: ComputerUseTestInput,
        expected: ComputerUseExpectedOutcomes,
        actualOutput: Record<string, unknown>,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const oracleConfigs = config.oracles ?? [];
        if (oracleConfigs.length === 0) {
            this.logToTestRun(context, 'info', 'No oracles configured — skipping evaluation');
            return [];
        }

        const results: OracleResult[] = [];

        for (const oracleConfig of oracleConfigs) {
            const result = await this.runSingleOracle(oracleConfig, expected, actualOutput, context);
            results.push(result);
        }

        return results;
    }

    /**
     * Run a single oracle evaluation.
     */
    private async runSingleOracle(
        oracleConfig: ComputerUseOracleConfig,
        expected: ComputerUseExpectedOutcomes,
        actualOutput: Record<string, unknown>,
        context: DriverExecutionContext
    ): Promise<OracleResult> {
        // Resolve oracle: built-in first, then global registry
        const oracle = ComputerUseTestDriver.builtInOracles.get(oracleConfig.type)
            ?? context.oracleRegistry.get(oracleConfig.type);

        if (!oracle) {
            this.logError(`Oracle not found: ${oracleConfig.type}`);
            return {
                oracleType: oracleConfig.type,
                passed: false,
                score: 0,
                message: `Oracle type "${oracleConfig.type}" not found in built-in or global registry`
            };
        }

        try {
            const oracleInput: OracleInput = {
                test: context.test,
                expectedOutput: expected,
                actualOutput,
                contextUser: context.contextUser
            };

            const result = await oracle.evaluate(oracleInput, oracleConfig.config ?? {});

            this.logToTestRun(
                context,
                result.passed ? 'info' : 'warn',
                `Oracle ${oracleConfig.type}: ${result.passed ? 'PASSED' : 'FAILED'} (Score: ${result.score.toFixed(2)})`
            );

            return result;

        } catch (error) {
            this.logError(`Oracle ${oracleConfig.type} failed`, error as Error);
            return {
                oracleType: oracleConfig.type,
                passed: false,
                score: 0,
                message: `Oracle execution failed: ${(error as Error).message}`
            };
        }
    }

    // ═══════════════════════════════════════════════════════════
    // VALIDATION HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Validate configuration-specific fields.
     */
    private validateConfig(
        config: ComputerUseTestConfig,
        errors: ValidationError[],
        warnings: ValidationWarning[]
    ): void {
        // Validate oracle configurations
        if (config.oracles && config.oracles.length > 0) {
            for (const oracle of config.oracles) {
                if (!oracle.type || oracle.type.trim() === '') {
                    errors.push({
                        category: 'configuration',
                        message: 'Oracle type is required',
                        field: 'Configuration.oracles[].type',
                        suggestion: 'Specify oracle type (e.g., "goal-completion", "url-match")'
                    });
                }
            }
        } else {
            warnings.push({
                category: 'best-practice',
                message: 'No oracles configured — test will pass if engine succeeds',
                recommendation: 'Add oracles for automated evaluation (e.g., goal-completion, url-match)'
            });
        }

        // Validate scoring weights
        if (config.scoringWeights) {
            const totalWeight = Object.values(config.scoringWeights).reduce(
                (sum, w) => sum + w, 0
            );
            if (Math.abs(totalWeight - 1.0) > 0.01) {
                warnings.push({
                    category: 'best-practice',
                    message: `Scoring weights should sum to 1.0 (current: ${totalWeight.toFixed(2)})`,
                    recommendation: 'Adjust weights to sum to 1.0 for accurate scoring'
                });
            }
        }

        // Validate maxSteps
        if (config.maxSteps != null && config.maxSteps <= 0) {
            errors.push({
                category: 'configuration',
                message: 'maxSteps must be a positive number',
                field: 'Configuration.maxSteps',
                suggestion: 'Set maxSteps to a positive integer (e.g., 30)'
            });
        }
    }

    /**
     * Validate expected outcomes.
     */
    private validateExpectedOutcomes(
        expected: ComputerUseExpectedOutcomes,
        errors: ValidationError[],
        warnings: ValidationWarning[]
    ): void {
        // Validate URL pattern regex
        if (expected.finalUrlPattern) {
            try {
                new RegExp(expected.finalUrlPattern);
            } catch {
                errors.push({
                    category: 'expected-outcome',
                    message: `Invalid regex in finalUrlPattern: ${expected.finalUrlPattern}`,
                    field: 'ExpectedOutcomes.finalUrlPattern',
                    suggestion: 'Provide a valid JavaScript regular expression'
                });
            }
        }

        // Validate confidence range
        if (expected.minConfidence != null) {
            if (expected.minConfidence < 0 || expected.minConfidence > 1) {
                errors.push({
                    category: 'expected-outcome',
                    message: 'minConfidence must be between 0.0 and 1.0',
                    field: 'ExpectedOutcomes.minConfidence',
                    suggestion: 'Set minConfidence to a value between 0.0 and 1.0'
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PARAM HELPERS
    // ═══════════════════════════════════════════════════════════

    /**
     * Build a PromptEntityRef from a prompt name string.
     */
    private buildPromptRef(promptName: string | undefined): PromptEntityRef | undefined {
        if (!promptName) return undefined;
        const ref = new PromptEntityRef();
        ref.PromptName = promptName;
        return ref;
    }

    /**
     * Build ComputerUseAuthConfig from raw JSON auth bindings.
     *
     * Maps the untyped `method: Record<string, unknown>` from the test JSON
     * into properly typed AuthMethod instances based on the `Type` field.
     * Supports: Basic, Bearer, APIKey, OAuthClientCredentials, Cookie, LocalStorage.
     */
    private buildAuthConfig(
        bindings: Array<{ domains: string[]; method: Record<string, unknown> }>
    ): ComputerUseAuthConfig {
        const authConfig = new ComputerUseAuthConfig();

        for (const binding of bindings) {
            const method = this.mapRawMethod(binding.method);
            if (method) {
                authConfig.Bindings.push(new DomainAuthBinding(binding.domains, method));
            }
        }

        return authConfig;
    }

    /**
     * Map a raw JSON method object to a typed AuthMethod.
     * Dispatches on the `Type` field to construct the correct class instance.
     * Supports all JSON-serializable auth types (excludes CustomCallback
     * which requires a JS function and cannot be expressed in JSON).
     */
    private mapRawMethod(raw: Record<string, unknown>): AuthMethod | undefined {
        const type = raw['Type'] as string | undefined;

        switch (type) {
            case 'Basic':
                return this.mapBasicAuth(raw);
            case 'Bearer':
                return this.mapBearerAuth(raw);
            case 'APIKey':
                return this.mapApiKeyAuth(raw);
            case 'OAuthClientCredentials':
                return this.mapOAuthAuth(raw);
            case 'Cookie':
                return this.mapCookieAuth(raw);
            case 'LocalStorage':
                return this.mapLocalStorageAuth(raw);
            default:
                return undefined;
        }
    }

    private mapBasicAuth(raw: Record<string, unknown>): BasicAuthMethod {
        const method = new BasicAuthMethod();
        method.Username = (raw['Username'] as string) ?? '';
        method.Password = (raw['Password'] as string) ?? '';
        method.Strategy = (raw['Strategy'] as 'HttpHeader' | 'FormLogin') ?? 'FormLogin';
        return method;
    }

    private mapBearerAuth(raw: Record<string, unknown>): BearerTokenAuthMethod {
        const method = new BearerTokenAuthMethod();
        method.Token = (raw['Token'] as string) ?? '';
        method.HeaderName = (raw['HeaderName'] as string) ?? 'Authorization';
        method.Prefix = (raw['Prefix'] as string) ?? 'Bearer';
        return method;
    }

    private mapApiKeyAuth(raw: Record<string, unknown>): APIKeyHeaderAuthMethod {
        const method = new APIKeyHeaderAuthMethod();
        method.Key = (raw['Key'] as string) ?? '';
        method.HeaderName = (raw['HeaderName'] as string) ?? 'Authorization';
        method.Prefix = (raw['Prefix'] as string | undefined);
        return method;
    }

    private mapOAuthAuth(raw: Record<string, unknown>): OAuthClientCredentialsAuthMethod {
        const method = new OAuthClientCredentialsAuthMethod();
        method.ClientId = (raw['ClientId'] as string) ?? '';
        method.ClientSecret = (raw['ClientSecret'] as string) ?? '';
        method.TokenUrl = (raw['TokenUrl'] as string) ?? '';
        method.Scope = (raw['Scope'] as string | undefined);
        return method;
    }

    private mapCookieAuth(raw: Record<string, unknown>): CookieInjectionAuthMethod {
        const method = new CookieInjectionAuthMethod();
        const rawCookies = raw['Cookies'] as Array<Record<string, unknown>> | undefined;
        if (rawCookies) {
            method.Cookies = rawCookies.map(c => {
                const entry = new CookieEntry();
                entry.Name = (c['Name'] as string) ?? '';
                entry.Value = (c['Value'] as string) ?? '';
                entry.Domain = (c['Domain'] as string) ?? '';
                entry.Path = (c['Path'] as string) ?? '/';
                entry.Secure = (c['Secure'] as boolean) ?? false;
                entry.HttpOnly = (c['HttpOnly'] as boolean) ?? false;
                entry.SameSite = (c['SameSite'] as 'Strict' | 'Lax' | 'None' | undefined);
                entry.Expires = (c['Expires'] as number | undefined);
                return entry;
            });
        }
        return method;
    }

    private mapLocalStorageAuth(raw: Record<string, unknown>): LocalStorageInjectionAuthMethod {
        const method = new LocalStorageInjectionAuthMethod();
        const entries = raw['Entries'] as Record<string, string> | undefined;
        if (entries) {
            method.Entries = entries;
        }
        return method;
    }

}
