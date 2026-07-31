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
import { MJTestEntity } from '@memberjunction/core-entities';
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
    ReplayTelemetry,
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
    AppProfile,
    SettleConfig,
    AuthDetourConfig,
    hashesSimilar,
    decideReplayTier,
    recordTrace,
    isRecordableRun,
    distillGoalPostconditions,
    RunCheckpoint,
    GoalPostcondition,
    TraceTarget,
} from '@memberjunction/computer-use';
import type { AuthMethod, ComputerUseResult, BrowserDiagnosticEvent, ReplayTier, ReplayInfo } from '@memberjunction/computer-use';
import { BaseBrowserAdapter } from '@memberjunction/computer-use';

import { MJComputerUseEngine } from '../engine/MJComputerUseEngine.js';
import { MJRunComputerUseParams, PromptEntityRef, ActionRef } from '../types/mj-params.js';
import { parseJudgeFrequency } from '../utils/judge-frequency-parser.js';
import { buildVariableValuesFromContext, substituteVariables, composeApplicationContext, findUnresolvedPlaceholders } from '../utils/variable-substitution.js';

import type {
    ComputerUseTestConfig,
    ComputerUseTestInput,
    ComputerUseExpectedOutcomes,
    ComputerUseOracleConfig,
    CheckpointDef,
} from './types.js';
import {
    shouldLogToConsole,
    resolveConsoleLogLevel,
    formatConsoleLine,
    type ConsoleLogLevel,
} from './log-importance.js';
import { readSuiteComputerUseConfig, mergeComputerUseConfig } from './suite-config.js';
import { loadTrace, persistCandidateTrace, traceFileName } from './trace-store.js';

import { GoalCompletionOracle } from './oracles/GoalCompletionOracle.js';
import { UrlMatchOracle } from './oracles/UrlMatchOracle.js';
import { StepCountOracle } from './oracles/StepCountOracle.js';
import { NoConsoleErrorsOracle } from './oracles/NoConsoleErrorsOracle.js';
import { DomAssertOracle } from './oracles/DomAssertOracle.js';
import { isOracleAdvisory, partitionGatingOracles } from './oracle-scoring.js';
import { classifyFailure, isSevereBrowserFault, FailureSignals } from './classify-failure.js';
import { ArtifactRetentionPolicy, shouldCaptureArtifact, shouldRetainArtifact } from './artifact-retention.js';
import { computeDivergence } from './divergence.js';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
    /**
     * The driver's hard Stop() failsafe fires at this multiple of the agent-time
     * budget. The engine self-expires gracefully at 1× (CU-B4); this outer catch
     * only trips if the engine is genuinely hung.
     */
    private static readonly TIMEOUT_FAILSAFE_MULTIPLIER = 2;

    private static readonly builtInOracles: Map<string, IOracle> = new Map<string, IOracle>([
        ['goal-completion', new GoalCompletionOracle()],
        ['url-match', new UrlMatchOracle()],
        ['step-count', new StepCountOracle()],
        // Deterministic oracles (CU-D2): pass/fail without the LLM judge.
        ['no-console-errors', new NoConsoleErrorsOracle()],
        ['dom-assert', new DomAssertOracle()],
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
            let config = this.parseConfig<ComputerUseTestConfig>(context.test);
            let input = this.parseInputDefinition<ComputerUseTestInput>(context.test);
            let expected = this.parseExpectedOutcomes<ComputerUseExpectedOutcomes>(context.test);

            // 1a. Fold in suite-level Computer Use policy (RI-E3 / Decision D7):
            // baked defaults ← suite `computerUse` block ← per-test Configuration.
            // The regression suite sets its profile (grounding on, temperature 0,
            // trace policy) once on the suite instead of on 380 files; per-test
            // config always wins. No-op when the suite defines no block.
            const suiteCU = readSuiteComputerUseConfig(context.suiteContext);
            if (suiteCU) {
                config = mergeComputerUseConfig(suiteCU, config);
            }

            // 1b. Apply {{var}} substitution so test JSONs are reusable across targets
            // (e.g., startUrl: "{{baseUrl}}" → "http://localhost:4200" for local,
            //  "http://byo-app:3000" for a remote-target profile pointing at the BYO app).
            // Values come from the variable resolver (schema-validated) PLUS env vars
            // prefixed with MJ_TEST_VAR_ as an ad-hoc fallback when no schema is defined.
            const variableValues = buildVariableValuesFromContext(context);
            if (Object.keys(variableValues).length > 0) {
                config = substituteVariables(config, variableValues);
                input = substituteVariables(input, variableValues);
                expected = substituteVariables(expected, variableValues);
            }

            // CU-F7: fail fast on unresolved {{vars}} in the fields that would
            // otherwise fail silently mid-run — a literal "{{baseUrl}}" left in
            // startUrl becomes a navigation error 30s in, with no hint that a
            // suite variable was simply never provided. Surface it here, up
            // front, naming the missing keys.
            const missingVars = [
                ...findUnresolvedPlaceholders(input.startUrl).map(k => `startUrl:{{${k}}}`),
                ...findUnresolvedPlaceholders(input.goal).map(k => `goal:{{${k}}}`),
            ];
            if (missingVars.length > 0) {
                throw new Error(
                    `Unresolved test variable(s) after substitution: ${missingVars.join(', ')}. ` +
                    `Define them in the suite/test variables (or MJ_TEST_VAR_* env) before running.`
                );
            }

            // 1c. Resolve application context (suite-level + per-test). Suite context
            // comes from TestSuite.Configuration.applicationContext; the test can
            // append per-test notes via InputDefinition.applicationContext. Variable
            // substitution applies to both so authors can reference {{baseUrl}} etc.
            const applicationContext = this.resolveApplicationContext(context, input, variableValues);

            // 2. Build engine params
            const runParams = this.buildRunParams(config, input, context);

            // RI-C1: the resolved {{variables}} feed the replay tier's %placeholder%
            // substitution into recorded Text/Url steps (harmless on the LLM tier,
            // which ignores VariableValues). Fresh values each run, tokens in the trace.
            const runVariableValues = this.coerceVariableValues(variableValues);
            if (Object.keys(runVariableValues).length > 0) {
                runParams.VariableValues = runVariableValues;
            }
            if (applicationContext) {
                runParams.ApplicationContext = applicationContext;
            }
            // Rubric judging (CU-D1): thread the test's authored validation
            // criteria into the in-run judge so Done is derived per-criterion.
            if (expected.judgeValidationCriteria && expected.judgeValidationCriteria.length > 0) {
                runParams.ValidationCriteria = expected.judgeValidationCriteria;
            }
            // Checkpoint tour (CU-D8): map the test's declared sections to engine
            // checkpoints so the run is verified section-by-section, not on a single
            // final-frame judge.
            if (expected.checkpoints && expected.checkpoints.length > 0) {
                runParams.Checkpoints = expected.checkpoints.map(cp => this.toRunCheckpoint(cp));
            }
            // Per-test UI hints (CU-E5): inject after the goal in the controller prompt.
            if (input.hints && input.hints.length > 0) {
                runParams.Hints = input.hints;
            }

            // Failure-artifact tracing (CU-F4): when the policy calls for capture,
            // point the engine at a temp trace file for this run. The engine writes
            // it on completion; retain-or-discard is decided post-run by outcome.
            // Default 'off' → no TracePath → no trace, no overhead.
            const tracePolicy: ArtifactRetentionPolicy = config.trace ?? 'off';
            if (shouldCaptureArtifact(tracePolicy)) {
                runParams.TracePath = path.join(os.tmpdir(), `mj-cu-trace-${context.testRun.ID}.zip`);
            }

            // Goal text runs to several hundred chars on tour tests; truncate the
            // console echo so the line stays scannable (the full goal is in the
            // test record + report).
            const goalEcho = input.goal.length > 120 ? `${input.goal.slice(0, 120)}…` : input.goal;
            this.logToTestRun(context, 'info', `Executing Computer Use: goal="${goalEcho}", startUrl="${input.startUrl ?? 'none'}"`);

            // 3. Execute with timeout. The engine owns the agent-time budget
            // (CU-B4): it self-expires *gracefully* at effectiveTimeout with a
            // forced final judge, so the run is scored on evidence. The driver's
            // own Stop() timer (in executeWithTimeout) is widened to a generous
            // outer failsafe that only fires if the engine is genuinely hung.
            const effectiveTimeout = this.getEffectiveTimeout(context.test, config);
            runParams.MaxExecutionTimeMs = effectiveTimeout;
            const { result, timedOut, browserDiagnostics, tier, replayInfo, fellBackToLlm } =
                await this.executeWithTimeout(runParams, effectiveTimeout, context, config);

            // 4. Build actual output with execution configuration
            const actualOutput = this.buildActualOutput(result);

            // RI-C1/RI-D4: tier telemetry. `tier` is the tier that produced this
            // result (a diverged replay that fell back reports 'llm'); `replay`
            // is present whenever a replay was ATTEMPTED, so the drift signal
            // (Diverged > 0) survives even a green LLM-fallback result.
            (actualOutput as Record<string, unknown>).tier = tier;
            const replayTelemetry: ReplayTelemetry | undefined = replayInfo
                ? {
                    tier: replayInfo.Tier,
                    steps: replayInfo.Steps.length,
                    healed: replayInfo.Healed,
                    diverged: replayInfo.Diverged,
                    allStepsSucceeded: replayInfo.AllStepsSucceeded,
                    fellBackToLlm,
                }
                : undefined;
            if (replayTelemetry) {
                (actualOutput as Record<string, unknown>).replay = replayTelemetry;
            }

            // Attach browser diagnostics (console errors, network failures, crashes)
            if (browserDiagnostics.length > 0) {
                (actualOutput as Record<string, unknown>).browserDiagnostics = browserDiagnostics;
            }

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
                return await this.buildTimeoutResult(result, input, expected, actualOutput, effectiveTimeout, config, context);
            }

            // Handle cancellation (engine was stopped via Stop())
            if (result.Status === 'Cancelled') {
                this.logToTestRun(context, 'warn', 'Test execution was cancelled');
                return await this.buildCancelledResult(result, input, expected, actualOutput, context, tracePolicy);
            }

            // 5. Run oracles
            this.logToTestRun(context, 'info', 'Running oracles for evaluation');
            const oracleResults = await this.runOracles(config, input, expected, actualOutput, context);

            // 6. Calculate score and status. Advisory oracles (e.g. step-count)
            // are scored for diagnostics but do NOT gate Passed/Failed (CU-D3),
            // so status is determined only by gating oracles. With no gating
            // oracle, fall back to engine success (the prior zero-oracle rule).
            const { gating, score } = this.scoreOracleResults(oracleResults, config.scoringWeights);
            const status = gating.length === 0
                ? (result.Success ? 'Passed' : 'Failed')
                : this.determineStatus(gating);

            const passedChecks = oracleResults.filter(r => r.passed).length;
            const totalChecks = oracleResults.length;

            // 6b. Classify the failure (CU-F5) from engine signals + oracle results,
            //     so deterministic failures can be told apart and the retry policy
            //     can key on the class. Stamped on the result and actualOutput.
            const failureClass = this.computeFailureClass(result, gating, !!runParams.AppProfile?.ReadinessBeacon);
            if (failureClass) {
                (actualOutput as Record<string, unknown>).failureClass = failureClass;
                this.logToTestRun(context, 'info', `Failure class: ${failureClass}`);
            }

            // 6c. Divergence telemetry (CU-D7): keep the controller self-report,
            //     the judge verdict, and the deterministic oracle outcome as three
            //     SEPARATE signals + their pairwise agreement, so a suite run can
            //     estimate judge error and alarm on trend shifts.
            const divergence = computeDivergence({
                selfReportDone: result.Steps.some(s => s.RequestedJudgement && s.ActionsRequested.length === 0),
                judgeDone: result.FinalJudgeVerdict?.Done === true,
                oraclesPassed: gating.length > 0 ? gating.every(r => r.passed) : result.Success,
            });
            (actualOutput as Record<string, unknown>).divergence = divergence;
            if (!divergence.unanimous) {
                this.logToTestRun(context, 'info', `Divergence: self=${divergence.selfReportDone} judge=${divergence.judgeDone} oracles=${divergence.oraclesPassed} (self~judge=${divergence.selfVsJudgeAgree}, judge~oracle=${divergence.judgeVsOracleAgree})`);
            }

            // 7. Build structured outputs (screenshots from each step) + retain the
            //    forensic trace per policy (CU-F4) — kept on failure, discarded on pass.
            const outputs = this.buildOutputs(result);
            await this.appendTraceArtifact(outputs, result, tracePolicy, status === 'Passed', context);

            // 7b. RI-B1: record a replay-trace CANDIDATE from a green, recordable LLM
            //     leg (never from a pure replay — that would launder healed selectors
            //     without fresh derivation). Written to the per-run out dir; a human
            //     lands it in the committed store via `mj test regression promote-traces`.
            await this.maybeRecordTrace({ result, status, gating, tier, fellBackToLlm, runParams, input, variableValues, context });

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
                failureClass,
                failureMemo: result.FailureMemo,
                tier,
                replay: replayTelemetry,
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
    public override async Validate(test: MJTestEntity): Promise<ValidationResult> {
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
    // APPLICATION CONTEXT RESOLUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Resolve the application context the controller LLM will see in its
     * system prompt — suite-level (from `context.suiteContext.applicationContext`)
     * concatenated with the optional per-test override (`input.applicationContext`).
     * Implementation lives in `composeApplicationContext` for testability.
     */
    private resolveApplicationContext(
        context: DriverExecutionContext,
        input: ComputerUseTestInput & { applicationContext?: string },
        variableValues: Record<string, unknown>
    ): string | undefined {
        const suiteLevel = typeof context.suiteContext?.applicationContext === 'string'
            ? context.suiteContext.applicationContext
            : undefined;
        return composeApplicationContext(suiteLevel, input.applicationContext, variableValues);
    }

    /** Map a test's JSON checkpoint (lowercase) to an engine {@link RunCheckpoint}. */
    private toRunCheckpoint(def: CheckpointDef): RunCheckpoint {
        const cp = new RunCheckpoint();
        cp.Name = def.name;
        cp.Instruction = def.instruction;
        if (def.assertions && def.assertions.length > 0) {
            cp.Assertions = def.assertions.map(a => {
                const post = new GoalPostcondition();
                post.Kind = a.kind;
                post.UrlPattern = a.urlPattern;
                post.Description = a.description;
                if (a.target) {
                    const target = new TraceTarget();
                    target.Role = a.target.role;
                    target.Name = a.target.name;
                    target.Selector = a.target.selector;
                    post.Target = target;
                }
                return post;
            });
        }
        if (def.visualCriteria && def.visualCriteria.length > 0) {
            cp.VisualCriteria = def.visualCriteria;
        }
        return cp;
    }

    // ─── Console logging (DR-G8) ───────────────────────────

    /**
     * Filtered, test-tagged console logging (DR-G8) — overrides the base so BOTH
     * this driver's lifecycle messages and the engine's per-step stream take one
     * consistent path.
     *
     * The engine emits ~60 distinct messages per step; across 155 tests that buried
     * the run's actual story (tier, checkpoints, verdicts, failures) in a 4.5MB /
     * 63k-line log. `CU_LOG_LEVEL` (quiet | normal | verbose, default normal)
     * governs the CONSOLE only — the test-run record always receives every message
     * at its true level, so the testing UI, report, and diagnostics are unchanged.
     * Console lines carry the test tag (`[T045]`) because parallel workers
     * interleave their output and an untagged line is unattributable.
     */
    protected override logToTestRun(
        context: DriverExecutionContext,
        level: 'info' | 'warn' | 'error' | 'debug',
        message: string,
        metadata?: Record<string, unknown>
    ): void {
        // `this.log(msg, verboseOnly)` is the console path; invert the decision into
        // verboseOnly so a filtered line still surfaces under MJ verbose mode.
        const show = shouldLogToConsole(level, message, this.consoleLogLevel);
        this.log(formatConsoleLine(context.test?.Name, message), !show);

        // Record path — always, at the message's real level (never downgraded).
        if (context.options.logCallback) {
            context.options.logCallback(this.createLogMessage(level, message, metadata));
        }
    }

    /** Console verbosity for this process, resolved once from `CU_LOG_LEVEL`. */
    private get consoleLogLevel(): ConsoleLogLevel {
        this.resolvedConsoleLogLevel ??= resolveConsoleLogLevel(process.env.CU_LOG_LEVEL);
        return this.resolvedConsoleLogLevel;
    }
    private resolvedConsoleLogLevel?: ConsoleLogLevel;

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
        // Element-grounded perception (CU-A4): opt-in per test/suite; default off
        // (coordinate mode) until baked in across the suite.
        params.ElementGrounding = config.elementGrounding ?? false;
        // Per-test controller generation overrides (CU-E6): determinism knobs.
        if (config.generation) {
            params.ControllerGeneration = config.generation;
        }

        // Adaptive settle profile (CU-A1/A2): MJ-Explorer defaults, config-overridable.
        params.AppProfile = this.buildAppProfile(config);

        // Browser config
        if (
            config.viewportWidth ||
            config.viewportHeight ||
            config.browserArgs ||
            config.connect
        ) {
            const browserConfig = new BrowserConfig();
            browserConfig.ViewportWidth = config.viewportWidth ?? 1280;
            browserConfig.ViewportHeight = config.viewportHeight ?? 720;
            if (config.browserArgs) {
                browserConfig.Args = config.browserArgs;
            }
            if (config.connect) {
                browserConfig.Connect = config.connect;
                browserConfig.ConnectType = config.connectType;
                browserConfig.ReuseExistingContext = config.reuseExistingContext;
            }
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

        // Wire engine logs to test run logs so they appear in the testing UI.
        // Console output is filtered (DR-G8) — the record still gets everything.
        params.LogCallback = (level: 'info' | 'warn' | 'error', message: string) => {
            this.logToTestRun(context, level, message);
        };

        // RI-D2: non-blind retry. On a retry, feed the most recent failed attempt's
        // memo to the controller so attempt 2+ isn't a blind re-roll — the engine
        // renders it into the controller prompt (PreviousAttemptSummary). Empty/first
        // attempt → undefined → identical to today's behavior.
        const lastPrior = context.priorAttempts?.[context.priorAttempts.length - 1];
        if (lastPrior?.failureMemo) {
            params.PreviousAttemptSummary = lastPrior.failureMemo;
        }

        return params;
    }

    /**
     * MJ Explorer defaults for the app-neutral settle loop (CU-A1/A2), overridable
     * per test via `config.appProfile`. This is where MJ-specific signals live —
     * the Layer-1 engine never names them.
     *
     * - Readiness beacon: `[data-mj-ready="true"]`, which MJExplorer's shell sets
     *   on `<html>` when the active route's NotifyLoadComplete fires (CU-A2).
     * - Busy markers: MJ's loading component (`mj-loading` / `.mj-loading`),
     *   merged with the engine's app-neutral `[aria-busy]` / `[role=progressbar]`.
     */
    private buildAppProfile(config: ComputerUseTestConfig): AppProfile {
        const profile = new AppProfile();
        const cfg = config.appProfile;

        profile.ReadinessBeacon = cfg?.readinessBeacon ?? '[data-mj-ready="true"]';
        profile.BusyMarkers = cfg?.busyMarkers ?? ['mj-loading', '.mj-loading'];

        if (cfg?.settle) {
            const settle = new SettleConfig();
            if (cfg.settle.maxWaitMs != null) settle.MaxWaitMs = cfg.settle.maxWaitMs;
            if (cfg.settle.pollMs != null) settle.PollMs = cfg.settle.pollMs;
            if (cfg.settle.networkIdleCapMs != null) settle.NetworkIdleCapMs = cfg.settle.networkIdleCapMs;
            if (cfg.settle.minWaitMs != null) settle.MinWaitMs = cfg.settle.minWaitMs;
            profile.Settle = settle;
        }

        // Auth-detour watchdog (CU-B7). MJ Explorer authenticates via Auth0 or
        // Microsoft Entra (MSAL); when a mid-run session invalidation bounces the
        // page to one of those, the watchdog recovers it without charging the
        // agent and, past MaxDetours, ends the run as an infrastructure
        // AuthDetour. Defaulted on for the MJ suite (this is the ~13/44 failure
        // class the plan targets); `identityProviderPatterns: []` disables it.
        const auth = new AuthDetourConfig();
        auth.IdentityProviderPatterns =
            cfg?.auth?.identityProviderPatterns ?? ['auth0.com', 'login.microsoftonline.com'];
        if (cfg?.auth?.maxDetours != null) auth.MaxDetours = cfg.auth.maxDetours;
        profile.Auth = auth;

        return profile;
    }

    /**
     * Execute the engine with a timeout.
     * Uses engine.Stop() for graceful cancellation.
     *
     * When running in parallel (workerIndex is set), uses HeadlessBrowserEngine
     * singleton to get a recycled browser context keyed by session strategy.
     */
    private async executeWithTimeout(
        params: MJRunComputerUseParams,
        timeoutMs: number,
        context: DriverExecutionContext,
        config: ComputerUseTestConfig
    ): Promise<{ result: ComputerUseResult; timedOut: boolean; browserDiagnostics: BrowserDiagnosticEvent[]; tier: ReplayTier; replayInfo?: ReplayInfo; fellBackToLlm: boolean }> {
        const engine = new MJComputerUseEngine();

        // Resolve browser session strategy. For the default "new" strategy,
        // `resolveBrowserAdapter` returns an isolated adapter from
        // HeadlessBrowserEngine; we MUST call ReleaseIsolated below so the
        // captured storageState gets cached for the next test in this worker.
        const adapter = await this.resolveBrowserAdapter(config, context);
        if (adapter) {
            engine.SetBrowserAdapter(adapter);
        }

        // CU-G3: mark the context ephemeral for the isolated/fresh strategies
        // ("new" → GetIsolated, released after the run; "new-clean" → engine
        // owns and fully closes its own context). Both are destroyed rather
        // than recycled, so teardown can skip the between-test state scrub
        // (a wasted app boot). The legacy "shared:*"/literal-key modes recycle
        // the context and still need the scrub, so they stay non-ephemeral.
        const strategy = config.browserSession ?? 'new';
        params.EphemeralContext = strategy === 'new' || strategy === 'new-clean';

        // Pre-flight: probe MJAPI health before starting the test
        const preflightHealth = await this.probeMjapiHealth();
        if (!preflightHealth.ok) {
            this.logToTestRun(context, 'warn', `MJAPI pre-flight unhealthy: ${preflightHealth.error}`);
        }

        let timedOut = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        // The engine self-expires gracefully at timeoutMs (its MaxExecutionTimeMs
        // agent budget) with a forced final judge. This driver-side hard Stop() is
        // now only an OUTER FAILSAFE for a genuinely hung engine, so it fires at
        // 2× the agent budget (CU-B4). If it ever fires, the engine didn't expire
        // on its own — a real hang, correctly surfaced as a hard timeout.
        const failsafeMs = timeoutMs > 0 ? timeoutMs * ComputerUseTestDriver.TIMEOUT_FAILSAFE_MULTIPLIER : 0;
        const armFailsafe = (): void => {
            if (failsafeMs <= 0) {
                return;
            }
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                timedOut = true;
                this.logToTestRun(context, 'warn', `Stopping engine due to failsafe timeout (${failsafeMs}ms; engine did not self-expire at ${timeoutMs}ms)`);
                engine.Stop();
            }, failsafeMs);
        };
        armFailsafe();

        try {
            // RI-C1: replay-first tier dispatch (load trace → decide tier → Replay
            // or Run, with in-attempt LLM fallback on divergence). The failsafe is
            // re-armed when a stale trace forces the LLM restart, so the clean leg
            // gets the whole failsafe window instead of whatever replay left over —
            // otherwise a slow replay could hard-Stop the fresh run mid-flight and
            // surface it as an unscored infra timeout rather than a graceful expiry.
            const dispatch = await this.dispatchRun(engine, params, config, context, armFailsafe);
            const result = dispatch.result;

            // Collect browser diagnostics (console errors, network failures, crashes).
            // The engine now drains them per step (CU-A7), so the authoritative
            // source is each step's Diagnostics — the adapter's buffer is empty
            // by now. Aggregate across steps (properly typed, no `unknown` cast).
            const browserDiagnostics: BrowserDiagnosticEvent[] = result.Steps.flatMap(s => s.Diagnostics ?? []);
            if (browserDiagnostics.length > 0) {
                this.logToTestRun(context, 'warn', `Browser captured ${browserDiagnostics.length} diagnostic event(s) across ${result.Steps.length} step(s)`);
            }

            return {
                result,
                timedOut,
                browserDiagnostics,
                tier: dispatch.tier,
                replayInfo: dispatch.replayInfo,
                fellBackToLlm: dispatch.fellBackToLlm,
            };
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            // Release isolated adapter — captures storageState back into the
            // per-worker cache so the next test replays auth, then closes the
            // context. No-op if the adapter wasn't produced by GetIsolated
            // (e.g., shared:* legacy modes or "new-clean").
            if (adapter) {
                await this.releaseIsolatedIfApplicable(adapter, context);
            }
        }
    }

    /**
     * RI-C1 tier dispatch. Loads this test's committed trace, decides the tier
     * (`config.forceTier` override, else `decideReplayTier` over build/goal), and:
     *  - replay/replay-with-heal (trace present) → `engine.Replay`; on divergence
     *    (Status ≠ Completed) fall back to `engine.Run` WITHIN this attempt, feeding
     *    the replay's memo forward — the returned `replayInfo` still carries the
     *    divergence so the drift signal survives a green fallback;
     *  - llm (no trace / goal reword / heal-rate demote) → `engine.Run`.
     * Returns the tier that PRODUCED the result (a fallback reports 'llm') so the
     * caller can correctly gate recording and stamp telemetry.
     */
    private async dispatchRun(
        engine: MJComputerUseEngine,
        params: MJRunComputerUseParams,
        config: ComputerUseTestConfig,
        context: DriverExecutionContext,
        onLlmRestart?: () => void
    ): Promise<{ result: ComputerUseResult; tier: ReplayTier; replayInfo?: ReplayInfo; fellBackToLlm: boolean }> {
        const trace = await loadTrace(traceFileName(context.test));
        const appBuildHash = process.env.APP_BUILD_HASH ?? '';
        const decision = config.forceTier
            ? { tier: config.forceTier, reason: 'forced by config.forceTier' }
            : decideReplayTier({ trace, currentGoal: params.Goal, currentBuildHash: appBuildHash });

        if (decision.tier !== 'llm' && trace) {
            this.logToTestRun(context, 'info', `Tier: ${decision.tier} — ${decision.reason}`);
            const replayResult = await engine.Replay(trace, params);
            if (replayResult.Status === 'Completed') {
                return { result: replayResult, tier: decision.tier, replayInfo: replayResult.Replay, fellBackToLlm: false };
            }
            // A failed replay means the committed trace no longer describes this
            // build — a MECHANICAL staleness fact, not an agent attempt. So the LLM
            // leg restarts CLEAN: we deliberately do NOT feed `replayResult.
            // FailureMemo` into `PreviousAttemptSummary`. That memo narrates the
            // dead trajectory ("all steps hit but the tour is incomplete: 1/4
            // checkpoints reached"), and priming a fresh run with another run's
            // partial progress made the agent behave as if work were already done
            // that its own context had never performed. The LLM leg gets its own
            // RunContext, its own step budget, and its own agent-time budget.
            // The stale trace is left untouched on disk (the committed store is
            // mounted :ro) — it is superseded by the candidate that
            // `maybeRecordTrace` records from this leg when it comes back green.
            this.logToTestRun(context, 'warn',
                `Replay failed (${replayResult.Replay?.Diverged ?? 0} diverged step(s)) — committed trace is stale for this build; ` +
                `restarting clean on the LLM tier and re-recording the trace`);
            onLlmRestart?.();
            const llmResult = await engine.Run(params);
            return { result: llmResult, tier: 'llm', replayInfo: replayResult.Replay, fellBackToLlm: true };
        }

        if (decision.tier !== 'llm') {
            this.logToTestRun(context, 'info', `Tier: llm — '${decision.tier}' requested but no trace exists for this test`);
        }
        const result = await engine.Run(params);
        return { result, tier: 'llm', fellBackToLlm: false };
    }

    /**
     * RI-B1: record a replay-trace candidate when a green LLM leg is recordable.
     * Gate (ALL required): the executing leg was LLM (a pure replay is never
     * re-recorded — it would launder healed selectors), status Passed, every
     * gating oracle green (the Layer-2 fact the recorder can't see), and the
     * engine's own `isRecordableRun` (clean Completed run, only replayable
     * actions). Writes an atomic candidate to the per-run out dir; never throws.
     */
    private async maybeRecordTrace(args: {
        result: ComputerUseResult;
        status: string;
        gating: OracleResult[];
        tier: ReplayTier;
        fellBackToLlm: boolean;
        runParams: MJRunComputerUseParams;
        input: ComputerUseTestInput;
        variableValues: Record<string, unknown>;
        context: DriverExecutionContext;
    }): Promise<void> {
        const { result, status, gating, tier, fellBackToLlm, runParams, input, variableValues, context } = args;

        const ranLlmLeg = tier === 'llm' || fellBackToLlm;
        if (!ranLlmLeg || status !== 'Passed') {
            return;
        }
        if (gating.length > 0 && !gating.every(r => r.passed)) {
            return;
        }
        const recordable = isRecordableRun(result);
        if (!recordable.recordable) {
            this.logToTestRun(context, 'info', `Not recording trace: ${recordable.reason}`);
            return;
        }

        try {
            const volatileParams = runParams.AppProfile?.Loop?.VolatileParams ?? [];
            const varMap = this.coerceVariableValues(variableValues);
            const finalStep = result.Steps.length > 0 ? result.Steps[result.Steps.length - 1] : undefined;
            const goalPostconditions = distillGoalPostconditions({
                finalStep,
                finalUrl: result.FinalUrl,
                volatileParams,
            });
            const trace = recordTrace({
                result,
                testId: context.test.ID,
                goal: input.goal,
                appBuildHash: process.env.APP_BUILD_HASH ?? '',
                recordedAt: new Date().toISOString(),
                variables: Object.keys(varMap),
                variableValues: varMap,
                volatileParams,
                viewport: {
                    width: runParams.BrowserConfig?.ViewportWidth ?? 1280,
                    height: runParams.BrowserConfig?.ViewportHeight ?? 720,
                },
                goalPostconditions,
            });
            const written = await persistCandidateTrace(trace, traceFileName(context.test));
            this.logToTestRun(context, 'info',
                `Recorded replay-trace candidate (${trace.Steps.length} step(s), ${goalPostconditions.length} postcondition(s)) → ${written}`);
        } catch (e) {
            this.logToTestRun(context, 'warn', `Trace recording failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Coerce the driver's resolved variable map to the string map replay/record consume. */
    private coerceVariableValues(values: Record<string, unknown>): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) {
            if (v != null) {
                out[k] = typeof v === 'string' ? v : String(v);
            }
        }
        return out;
    }

    /**
     * Best-effort cleanup for an isolated adapter — invokes
     * `HeadlessBrowserEngine.ReleaseIsolated`, swallowing errors so a release
     * failure doesn't mask the test's actual result.
     */
    private async releaseIsolatedIfApplicable(
        adapter: BaseBrowserAdapter,
        context: DriverExecutionContext
    ): Promise<void> {
        try {
            const { HeadlessBrowserEngine } = await import('@memberjunction/computer-use');
            const engine = HeadlessBrowserEngine.Instance;
            // ReleaseIsolated is a no-op for adapters that weren't produced
            // by GetIsolated, so it's safe to always call.
            await engine.ReleaseIsolated(adapter as unknown as Parameters<typeof engine.ReleaseIsolated>[0]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logToTestRun(context, 'warn', `Failed to release isolated browser adapter: ${msg}`);
        }
    }

    /**
     * Quick MJAPI health probe. Returns { ok, error? } — never throws.
     */
    private async probeMjapiHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const resp = await fetch('http://mjapi:4000/healthcheck', { signal: controller.signal });
            clearTimeout(timeout);
            return { ok: resp.ok, status: resp.status };
        } catch (err) {
            const message = err instanceof Error
                ? (err.name === 'AbortError' ? 'timeout (5s)' : err.message)
                : String(err);
            return { ok: false, error: message };
        }
    }

    /**
     * Resolve the browser adapter based on the test config's `browserSession`
     * strategy and the execution context's `workerIndex`.
     *
     * Default behavior (recommended): each test gets a **fresh `BrowserContext`**.
     * Auth state (cookies + localStorage) is captured at the end of each test
     * and replayed into the next test's fresh context — so AuthHandler doesn't
     * re-run per test, but no other state leaks forward. This is what most
     * regression suites should use.
     *
     * Strategies:
     * - `"new"` (default when `workerIndex` is set) — fresh context per test,
     *   with auth replay across tests in the same worker via
     *   `HeadlessBrowserEngine.GetIsolated`. Driver MUST pair this with
     *   `ReleaseIsolated` after `engine.Run` so the captured state propagates.
     * - `"new-clean"` — truly fresh context, no auth replay. Engine creates
     *   its own adapter (returns `null` here). Useful for tests that explicitly
     *   want to exercise the login flow.
     * - `"shared:suite"` (legacy) — recycled context keyed by suite-run +
     *   worker. Tests in the same worker share one context. Cross-test
     *   mutations leak forward; only auth-token localStorage is preserved
     *   by `ResetStatePreservingAuth`. Opt-in for tests that depend on
     *   cross-test continuity.
     * - `"shared:global"` (legacy) — recycled context keyed by worker only.
     * - Any other string — used as a literal recycled-context key.
     * - Undefined + no `workerIndex` — also defaults to `"new"` (truly fresh).
     *
     * **Phase 1C change**: the default flipped from `"shared:suite"` to `"new"`
     * to give each test isolation. The previous default relied on a heuristic
     * `ResetStatePreservingAuth` cleanup between tests; the new default uses
     * Playwright `storageState` capture+replay so auth is preserved cleanly
     * while everything else (IndexedDB, sessionStorage, in-memory SPA state,
     * mid-test cookies) is fresh.
     */
    private async resolveBrowserAdapter(
        config: ComputerUseTestConfig,
        context: DriverExecutionContext
    ): Promise<BaseBrowserAdapter | null> {
        const strategy = config.browserSession ?? 'new';

        // "new-clean" — return null so engine builds its own truly-fresh adapter
        // (no engine-pool involvement, no state replay).
        if (strategy === 'new-clean') return null;

        const { HeadlessBrowserEngine, BrowserConfig: BConfig } = await import('@memberjunction/computer-use');
        const browserEngine = HeadlessBrowserEngine.Instance;

        // If the test config requests attach mode, initialize the engine in
        // connect mode BEFORE the implicit Initialize(true) triggered by
        // GetIsolated/GetRecycled. Initialize is idempotent — first worker wins.
        if (config.connect) {
            await browserEngine.Initialize(
                config.headless ?? true,
                config.connect,
                config.connectType
            );
        }

        // Build a BrowserConfig from test config
        const browserConfig = new BConfig();
        browserConfig.Headless = config.headless ?? true;
        browserConfig.ViewportWidth = config.viewportWidth ?? 1280;
        browserConfig.ViewportHeight = config.viewportHeight ?? 720;

        // "new" (default) — isolated context with per-worker auth replay
        if (strategy === 'new') {
            // Single-login mode: when MJ_TEST_AUTH_STATE_FILE points at a captured
            // storageState (one up-front login for the whole suite), seed EVERY
            // worker's context from it instead of forcing a per-worker login.
            // Missing/unreadable file degrades gracefully to per-worker login.
            const authStateFile = process.env.MJ_TEST_AUTH_STATE_FILE;
            if (authStateFile && !browserEngine.HasSharedStorageState) {
                const ok = await browserEngine.EnsureSharedStorageStateFromFile(authStateFile);
                if (!ComputerUseTestDriver._sharedAuthLogged) {
                    ComputerUseTestDriver._sharedAuthLogged = true;
                    this.logToTestRun(context, ok ? 'info' : 'warn', ok
                        ? `[auth] single-login mode active — seeding all browser contexts from ${authStateFile}`
                        : `[auth] MJ_TEST_AUTH_STATE_FILE not loadable (${authStateFile}); using per-worker login`);
                }
            }
            const workerKey = `worker-${context.workerIndex ?? 'sequential'}`;
            return browserEngine.GetIsolated(workerKey, browserConfig);
        }

        // Legacy shared-context modes
        let key: string;
        if (strategy === 'shared:suite') {
            key = `suite:${context.testRun.TestSuiteRunID ?? 'standalone'}:worker-${context.workerIndex ?? 0}`;
        } else if (strategy === 'shared:global') {
            key = `global:worker-${context.workerIndex ?? 0}`;
        } else {
            key = strategy; // Literal key
        }

        // One-time warning when shared:* modes are used so authors notice
        // they've opted out of the per-test isolation default.
        ComputerUseTestDriver.warnSharedSessionOnce();

        return browserEngine.GetRecycled(key, browserConfig);
    }

    /** One-time log guard for single-login (shared auth-state) mode. */
    private static _sharedAuthLogged = false;

    private static _sharedSessionWarned = false;
    private static warnSharedSessionOnce(): void {
        if (ComputerUseTestDriver._sharedSessionWarned) return;
        ComputerUseTestDriver._sharedSessionWarned = true;
        // eslint-disable-next-line no-console
        console.warn(
            '[ComputerUseTestDriver] browserSession = "shared:*" — test isolation is degraded. ' +
            'Tests in the same worker share a BrowserContext; only auth-token localStorage is ' +
            'preserved between them via ResetStatePreservingAuth. Prefer "new" (default) unless ' +
            'tests explicitly depend on cross-test continuity.'
        );
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
            // Auth-detour watchdog telemetry (CU-B7) — always present so a flaky
            // session shows up even on runs that recovered and still passed.
            authDetourCount: result.AuthDetourCount,
        };

        // Engine-named failure reason (CU-B1/B7), when set — surfaced for the
        // classifier and for at-a-glance triage of the raw output.
        if (result.FailureReason) {
            output.failureReason = result.FailureReason;
        }

        // Non-blind retry memo (RI-D2 / CU-B6), when the engine produced one. Also
        // surfaced on DriverExecutionResult.failureMemo so the retry loop can feed
        // it to the next attempt as PreviousAttemptSummary.
        if (result.FailureMemo) {
            output.failureMemo = result.FailureMemo;
        }

        // Final-step interactive elements (CU-A4 recording) exposed as a recorded
        // postcondition for the dom-assert oracle (CU-D2). Present only when
        // element grounding was on; role/name/selector per element.
        const lastElements = result.Steps.length > 0
            ? result.Steps[result.Steps.length - 1].InteractiveElements
            : undefined;
        if (lastElements && lastElements.length > 0) {
            output.interactiveElements = lastElements.map(e => ({ role: e.Role, name: e.Name, selector: e.Selector }));
        }

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
                // Store full action data for visual overlay rendering in the HTML report.
                // Each action includes type + coordinates/bounding boxes where applicable.
                const actionRecords = step.ActionsRequested.map(a => {
                    const rec: Record<string, unknown> = { type: a.Type };
                    switch (a.Type) {
                        // NOTE: record every field that changes what the action DOES.
                        // `Selector` and the Scroll point were previously omitted, which
                        // made traces actively misleading — a selector-targeted click
                        // serialized as a bare coordinate click at (0,0), so the trace
                        // contradicted the model's own reasoning and looked like the
                        // engine had dropped the selector.
                        case 'Click':
                            rec.x = a.X; rec.y = a.Y;
                            rec.button = a.Button; rec.clickCount = a.ClickCount;
                            if (a.Selector) rec.selector = a.Selector;
                            if (a.BoundingBox) rec.bbox = { xMin: a.BoundingBox.XMin, yMin: a.BoundingBox.YMin, xMax: a.BoundingBox.XMax, yMax: a.BoundingBox.YMax };
                            break;
                        case 'Type':
                            rec.text = a.Text;
                            if (a.Selector) rec.selector = a.Selector;
                            break;
                        case 'Scroll':
                            rec.deltaX = a.DeltaX; rec.deltaY = a.DeltaY;
                            if (a.Selector) rec.selector = a.Selector;
                            // CU-A8 scroll-at point: 0 is a legal coordinate, so test presence.
                            if (a.X !== undefined && a.Y !== undefined) { rec.x = a.X; rec.y = a.Y; }
                            break;
                        case 'Wait':
                            rec.durationMs = a.DurationMs;
                            if (a.Selector) rec.selector = a.Selector;
                            break;
                        case 'Navigate':
                            rec.url = a.Url;
                            break;
                        case 'Keypress':
                            rec.key = a.Key;
                            // Modifiers are the whole meaning of a chord: a bare "/" and
                            // Ctrl+"/" are different actions that serialized identically,
                            // so a trace could not answer "was the shortcut actually sent?"
                            // — the exact question when a keyboard-summoned surface
                            // doesn't appear (T153 / command palette). Only Keypress
                            // carries Modifiers; KeyDown/KeyUp hold a modifier in `Key`.
                            if (a.Modifiers?.length) rec.modifiers = a.Modifiers;
                            break;
                        case 'KeyDown': case 'KeyUp':
                            rec.key = a.Key;
                            break;
                    }
                    return rec;
                });
                outputs.push({
                    outputTypeName: 'Screenshot',
                    sequence,
                    stepNumber: step.StepNumber,
                    name: `Step ${step.StepNumber} Screenshot`,
                    description: step.Url ? `Page: ${step.Url}` : undefined,
                    mimeType: 'image/png',
                    inlineData: step.Screenshot,
                    metadata: {
                        reasoning: step.ControllerReasoning || undefined,
                        actions: actionRecords.length > 0 ? actionRecords : undefined,
                        url: step.Url || undefined,
                        // Coordinates in actions are in 1000x1000 normalized space
                        // (the LLM controller's coordinate system). The HTML overlay
                        // uses viewBox="0 0 1000 1000" to map directly.
                        coordinateSpace: 1000,
                    },
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
     * Retain (or discard) the run's forensic trace per the CU-F4 policy. The
     * engine already wrote the trace to `result.TracePath` (when tracing was
     * requested); here we decide whether to keep it: on retention we inline the
     * zip as a `File` TestRunOutput (openable at trace.playwright.dev) and then
     * delete the temp file; on discard we just delete it. No-op when tracing was
     * off (no `TracePath`). Best-effort — a read/unlink failure is logged, never
     * fatal to the test result.
     */
    private async appendTraceArtifact(
        outputs: TestRunOutputItem[],
        result: ComputerUseResult,
        policy: ArtifactRetentionPolicy,
        passed: boolean,
        context: DriverExecutionContext
    ): Promise<void> {
        const tracePath = result.TracePath;
        if (!tracePath) {
            return; // tracing was off, or no trace file was written
        }
        try {
            if (shouldRetainArtifact(policy, passed)) {
                const buffer = await fs.readFile(tracePath);
                outputs.push({
                    outputTypeName: 'File',
                    sequence: outputs.length,
                    name: 'Playwright Trace',
                    description: 'Forensic browser trace (DOM snapshots + network + console). Open at trace.playwright.dev.',
                    mimeType: 'application/zip',
                    inlineData: buffer.toString('base64'),
                    fileSizeBytes: buffer.byteLength,
                    metadata: {
                        finalUrl: result.FinalUrl,
                        status: result.Status,
                        failureReason: result.FailureReason,
                    },
                });
                this.logToTestRun(context, 'info', `Retained failure trace (${Math.round(buffer.byteLength / 1024)}KB) as a TestRunOutput (CU-F4)`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logToTestRun(context, 'warn', `Failed to retain trace artifact: ${msg}`);
        } finally {
            // Always remove the temp trace — retained copies are inlined above.
            await fs.unlink(tracePath).catch(() => { /* best-effort */ });
        }
    }

    /**
     * Build a timeout result with partial data.
     */
    private async buildTimeoutResult(
        result: ComputerUseResult,
        input: ComputerUseTestInput,
        expected: ComputerUseExpectedOutcomes,
        actualOutput: Record<string, unknown>,
        timeoutMs: number,
        config: ComputerUseTestConfig,
        context: DriverExecutionContext
    ): Promise<DriverExecutionResult> {
        // CU-D4: a timeout is not a scoring blackout. The partial actualOutput
        // (finalUrl / finalScreenshot / stepHistory) still exists, so run the
        // oracles against it and attach the diagnostic score — a run that
        // completed the goal at step 30 and got stopped mid-judge should not
        // score identically to one that never logged in. Status stays 'Timeout'.
        let oracleResults: OracleResult[] = [];
        try {
            oracleResults = await this.runOracles(config, input, expected, actualOutput, context);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logToTestRun(context, 'warn', `Oracle evaluation on timeout partial failed: ${msg}`);
        }

        const { gating, score } = this.scoreOracleResults(oracleResults, config.scoringWeights);
        const passedChecks = oracleResults.filter(r => r.passed).length;

        // The engine hung past its own budget and the driver force-stopped it.
        // Classify as a time overrun (timeout-stuck/progressing) unless an
        // app-error/crash better explains it (CU-F5). result.Status here is the
        // forced-Stop 'Cancelled', so override to TimeBudgetExceeded for intent.
        const failureClass = this.computeFailureClass(result, gating, !!config.appProfile?.readinessBeacon, 'TimeBudgetExceeded');
        if (failureClass) {
            (actualOutput as Record<string, unknown>).failureClass = failureClass;
        }

        // A timeout is a failure for retention purposes — keep the trace (CU-F4).
        const outputs = this.buildOutputs(result);
        await this.appendTraceArtifact(outputs, result, config.trace ?? 'off', false, context);

        return {
            targetType: 'Computer Use',
            targetLogId: context.testRun.ID,
            status: 'Timeout',
            score,
            oracleResults,
            passedChecks,
            failedChecks: oracleResults.length - passedChecks,
            totalChecks: oracleResults.length,
            inputData: input,
            expectedOutput: expected,
            actualOutput,
            durationMs: result.TotalDurationMs,
            errorMessage: `Test execution timed out after ${timeoutMs}ms`,
            outputs,
            failureClass,
            failureMemo: result.FailureMemo,
        };
    }

    /**
     * Build a cancellation result when the engine is stopped via Stop().
     */
    private async buildCancelledResult(
        result: ComputerUseResult,
        input: ComputerUseTestInput,
        expected: ComputerUseExpectedOutcomes,
        actualOutput: Record<string, unknown>,
        context: DriverExecutionContext,
        tracePolicy: ArtifactRetentionPolicy
    ): Promise<DriverExecutionResult> {
        // Classify (CU-F5): normally 'cancelled', unless an app-error/crash was
        // the real cause before the cancel. (beaconConfigured is don't-care here —
        // a 'Cancelled' status resolves before the beacon branch.)
        const failureClass = this.computeFailureClass(result, [], false);
        if (failureClass) {
            (actualOutput as Record<string, unknown>).failureClass = failureClass;
        }
        // A cancellation is a non-pass — keep the trace (CU-F4).
        const outputs = this.buildOutputs(result);
        await this.appendTraceArtifact(outputs, result, tracePolicy, false, context);
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
            outputs,
            failureClass,
            failureMemo: result.FailureMemo,
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
        const advisory = isOracleAdvisory(oracleConfig.type, oracleConfig.advisory);

        // Resolve oracle: built-in first, then global registry
        const oracle = ComputerUseTestDriver.builtInOracles.get(oracleConfig.type)
            ?? context.oracleRegistry.get(oracleConfig.type);

        if (!oracle) {
            this.logError(`Oracle not found: ${oracleConfig.type}`);
            return {
                oracleType: oracleConfig.type,
                passed: false,
                score: 0,
                message: `Oracle type "${oracleConfig.type}" not found in built-in or global registry`,
                advisory
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
            result.advisory = advisory;

            this.logToTestRun(
                context,
                result.passed ? 'info' : 'warn',
                `Oracle ${oracleConfig.type}${advisory ? ' (advisory)' : ''}: ${result.passed ? 'PASSED' : 'FAILED'} (Score: ${result.score.toFixed(2)})`
            );

            return result;

        } catch (error) {
            this.logError(`Oracle ${oracleConfig.type} failed`, error as Error);
            return {
                oracleType: oracleConfig.type,
                passed: false,
                score: 0,
                message: `Oracle execution failed: ${(error as Error).message}`,
                advisory
            };
        }
    }

    /**
     * Partition oracle results into gating (status-determining) and advisory,
     * and compute the diagnostic score. Advisory results are excluded from the
     * gating score unless *every* oracle is advisory (in which case they're all
     * we have to score against). (CU-D3)
     */
    private scoreOracleResults(
        oracleResults: OracleResult[],
        weights?: Record<string, number>
    ): { gating: OracleResult[]; score: number } {
        const gating = partitionGatingOracles(oracleResults);
        const scoringSet = gating.length > 0 ? gating : oracleResults;
        return { gating, score: this.calculateScore(scoringSet, weights) };
    }

    /**
     * Classify a finished run into a machine-readable failure class (CU-F5) from
     * engine signals (loop detection, settle-budget, beacon, diagnostics,
     * terminal status) + the gating oracle results. Returns undefined on success.
     * `gatingOracles` are the status-determining oracles (advisory excluded).
     */
    private computeFailureClass(
        result: ComputerUseResult,
        gatingOracles: OracleResult[],
        beaconConfigured: boolean,
        statusOverride?: ComputerUseResult['Status']
    ): string | undefined {
        const steps = result.Steps ?? [];
        const anyDiag = (predicate: (d: BrowserDiagnosticEvent) => boolean): boolean =>
            steps.some(s => (s.Diagnostics ?? []).some(predicate));

        const signals: FailureSignals = {
            status: statusOverride ?? result.Status,
            failureReason: result.FailureReason,
            hasCrash: anyDiag(d => d.type === 'crash'),
            hasAppError: anyDiag(isSevereBrowserFault),
            settleBudgetExhausted: steps.length > 0 && steps[steps.length - 1].SettleReason === 'budget',
            tailHashStable: this.tailHashStable(steps.map(s => s.ScreenshotHash)),
            beaconConfigured,
            beaconEverReady: steps.some(s => s.SettleReason === 'beacon-ready'),
            oraclesFailed: gatingOracles.some(r => !r.passed),
        };
        return classifyFailure(signals) ?? undefined;
    }

    /** True when the last few non-empty frame hashes are perceptually stable (a frozen/stuck tail). */
    private tailHashStable(hashes: string[]): boolean {
        const nonEmpty = hashes.filter(h => h !== '');
        if (nonEmpty.length < 2) {
            return false;
        }
        const tail = nonEmpty.slice(-3);
        return tail.every(h => hashesSimilar(tail[0], h));
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
