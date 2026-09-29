/**
 * @fileoverview Decision-eval driver: one typed decision, built exactly as production builds it,
 * scored against a label.
 * @module @memberjunction/testing-engine
 */

import type { ZodError } from 'zod';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { MJTestEntity } from '@memberjunction/core-entities';
import type { DecisionAnswer } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionParams, AIDecisionRunner, type AIDecisionRunResult } from '@memberjunction/ai-prompts';
import {
    BuildRoutingQuestions,
    BuildRoutingState,
    BuildRoutingStateStructured,
    CanAskRoutingDecision,
    InterpretRoutingAnswers,
    ROUTING_CONTINUES_QUESTION,
    ROUTING_ROUTE_QUESTION,
    type MJAIPromptEntityExtended,
    type RoutingAgent,
    type RoutingDecisionInput
} from '@memberjunction/ai-core-plus';
import { BaseTestDriver } from './BaseTestDriver';
import { PinnedDecisionRunner } from './PinnedDecisionRunner';
import { DriverExecutionContext, DriverExecutionResult, OracleInput, OracleResult, ValidationResult } from '../types';
import { MapPointToRoutingInput, type DecisionEvalAgentCatalog } from '../decision-eval/point-mapping';
import {
    DEFAULT_DECISION_PROMPT_NAME,
    DecisionEvalConfigSchema,
    DecisionEvalExpectedSchema,
    DecisionEvalInputSchema,
    DescribeZodError,
    type DecisionEvalActualOutput,
    type DecisionEvalAnswerSummary,
    type DecisionEvalConfig,
    type DecisionEvalExpected,
    type DecisionEvalInput,
    type DecisionEvalModelRecord,
    type DecisionEvalSampling
} from '../decision-eval/types';

/** The part of a decision runner the driver uses. `AIDecisionRunner` is one. */
export type DecisionEvalRunner = Pick<AIDecisionRunner, 'ExecuteDecision' | 'WaitForPendingPromptRunSaves'>;

/** What one run needs from the environment: the decision prompt and the agents to resolve against. */
export interface DecisionEvalEnvironment {
    /** The decision prompt, from `AIEngine`. */
    Prompt: MJAIPromptEntityExtended;
    /** The agents, from `AIEngine`, and the conversation manager. */
    Catalog: DecisionEvalAgentCatalog;
}

/** A Decision Eval test's three JSON columns, validated. */
export interface ParsedDecisionEvalTest {
    Config: DecisionEvalConfig;
    Input: DecisionEvalInput;
    Expected: DecisionEvalExpected;
}

/** One decision call and what came back. */
export interface DecisionEvalCall {
    /** The routing input the call was built from. */
    Input: RoutingDecisionInput;
    /** The runner's result. */
    Result: AIDecisionRunResult;
    /** Wall-clock time of the call, in milliseconds. It includes writing the prompt-run row. */
    LatencyMs: number;
}

/** The conversation manager the routing decision offers as "someone else". */
const CONVERSATION_MANAGER_NAME = 'Sage';

/**
 * Why a requested temperature or seed does not reach the model: say it plainly rather than fake it.
 */
const SAMPLING_NOT_APPLIED = 'The decision path has no sampling parameters: AIDecisionRunner passes only the model, '
    + 'state, questions and cancellation to the driver (DecisionParams), and LLMDecision builds its chat prompt\'s '
    + 'parameters without a temperature or seed. The request is recorded, not applied.';

/**
 * Runs ONE typed decision on a corpus point and scores it against the point's label.
 *
 * The point is mapped to the routing decision's input, and the questions and state are built, with
 * the same builders the chat uses (`@memberjunction/ai-core-plus`), so the eval sends exactly what
 * production sends. One `AIDecisionRunner.ExecuteDecision` answers it, and the oracles score the
 * answer. The prompt run is linked as the test run's target, so cost comes from it.
 *
 * **Pinning.** A cell that names `modelId` and/or `vendorId` pins them through the runner's own
 * mechanism, `AIDecisionParams.override`, and runs with failover off ({@link PinnedDecisionRunner})
 * unless the cell sets `failover: true`. The model that answered is recorded; a pinned run answered
 * by another model or vendor is flagged, and when failover was off it is an `Error`, not a data point.
 *
 * **Sampling.** `temperature` and `seed` are recorded but do not reach the model: the decision path
 * has no parameter for them (see {@link SAMPLING_NOT_APPLIED}).
 *
 * **Never throws.** A bad test, a missing prompt, a point with nothing to decide, and a failed
 * decision all come back as an `Error` run with the reason.
 */
@RegisterClass(BaseTestDriver, 'DecisionEvalDriver')
export class DecisionEvalDriver extends BaseTestDriver {
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        const startedAt = Date.now();
        let test: ParsedDecisionEvalTest | null = null;
        try {
            test = ParseDecisionEvalTest(context.test);
            return await this.evaluateTest(test, context, startedAt);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logToTestRun(context, 'error', `Decision evaluation failed: ${message}`);
            return this.errorResult(message, test, null, [], startedAt);
        }
    }

    public override async Validate(test: MJTestEntity): Promise<ValidationResult> {
        const base = await super.Validate(test);
        if (!base.valid) {
            return base;
        }
        try {
            ParseDecisionEvalTest(test);
            return base;
        } catch (error) {
            return {
                valid: false,
                errors: [{ category: 'configuration', message: error instanceof Error ? error.message : String(error), field: 'Configuration' }],
                warnings: base.warnings
            };
        }
    }

    /**
     * Loads what one run needs: `AIEngine`, the decision prompt by name, the agent catalog and the
     * conversation manager. Throws when the prompt is missing. Overridable, so a test can run the
     * driver without an engine.
     */
    protected async LoadEnvironment(config: DecisionEvalConfig, context: DriverExecutionContext): Promise<DecisionEvalEnvironment> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const promptName = config.promptName ?? DEFAULT_DECISION_PROMPT_NAME;
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === promptName.trim().toLowerCase());
        if (!prompt) {
            throw new Error(`Decision prompt '${promptName}' not found in AIEngine metadata`);
        }
        const agents = AIEngine.Instance.Agents;
        const manager = agents.find(a => a.Name?.trim().toLowerCase() === CONVERSATION_MANAGER_NAME.toLowerCase());
        return {
            Prompt: prompt,
            Catalog: {
                FindAgent: (agentId: string): RoutingAgent | undefined => agents.find(a => UUIDsEqual(a.ID, agentId)),
                ConversationManager: manager ?? null
            }
        };
    }

    /**
     * The runner for one call: failover as the prompt configures it, or none. Overridable, so a
     * test can supply a fake runner.
     *
     * @param failoverAllowed Whether the runner may fail over.
     */
    protected CreateRunner(failoverAllowed: boolean): DecisionEvalRunner {
        return failoverAllowed ? new AIDecisionRunner() : new PinnedDecisionRunner();
    }

    /** Maps the point, runs the one decision, and scores it. */
    private async evaluateTest(test: ParsedDecisionEvalTest, context: DriverExecutionContext, startedAt: number): Promise<DriverExecutionResult> {
        const environment = await this.LoadEnvironment(test.Config, context);
        const input = MapPointToRoutingInput(test.Input.point, environment.Catalog);
        if (!CanAskRoutingDecision(input)) {
            // Production asks nothing for this point, so there is no decision to measure: Skipped,
            // not Error, which would read as a failure of the model under test
            return {
                ...this.errorResult('Nothing to decide: the previous agent is not among the history\'s agents, '
                    + 'or the agent Choice would have fewer than two options. Production makes no call here.', test, null, [], startedAt),
                status: 'Skipped'
            };
        }
        this.logToTestRun(context, 'info', `Deciding point ${test.Input.point.id} with '${environment.Prompt.Name}' (${test.Config.stateLayout} state)`);
        const call = await this.callDecision(test.Config, input, environment.Prompt, context);
        const actual = BuildDecisionEvalActualOutput(test.Config, environment.Prompt.Name ?? DEFAULT_DECISION_PROMPT_NAME, call);
        const oracleResults = await this.runOracles(test, actual, call.Result, context);
        return this.completedResult(test, actual, oracleResults, call.Result, context, startedAt);
    }

    /** Builds the parameters and makes the one call, waiting for the prompt run to be saved. */
    private async callDecision(
        config: DecisionEvalConfig,
        input: RoutingDecisionInput,
        prompt: MJAIPromptEntityExtended,
        context: DriverExecutionContext
    ): Promise<DecisionEvalCall> {
        const params = BuildDecisionEvalParams(config, input, prompt, context, this.getEffectiveTimeout(context.test));
        const runner = this.CreateRunner(IsFailoverAllowed(config));
        const callStarted = Date.now();
        const result = await runner.ExecuteDecision(params);
        const latencyMs = Date.now() - callStarted;
        // Prompt-run persistence is fire-and-forget: settle it before the run links to the row.
        await runner.WaitForPendingPromptRunSaves();
        return { Input: input, Result: result, LatencyMs: latencyMs };
    }

    /**
     * Runs the configured oracles. A missing oracle is a failed result naming it, never a skip:
     * a weighted check that cannot run is a failure of the test, not an absence of one.
     */
    private async runOracles(
        test: ParsedDecisionEvalTest,
        actual: DecisionEvalActualOutput,
        result: AIDecisionRunResult,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const results: OracleResult[] = [];
        for (const spec of test.Config.oracles) {
            const oracle = context.oracleRegistry.get(spec.type);
            if (!oracle) {
                results.push({ oracleType: spec.type, passed: false, score: 0, message: `Oracle '${spec.type}' is not registered — its weight cannot be scored` });
                continue;
            }
            const oracleInput: OracleInput = {
                test: context.test,
                expectedOutput: test.Expected,
                actualOutput: actual,
                targetEntity: result.promptRun,
                contextUser: context.contextUser
            };
            try {
                results.push(await oracle.evaluate(oracleInput, spec.config ?? {}));
            } catch (error) {
                results.push({ oracleType: spec.type, passed: false, score: 0, message: `Oracle execution failed: ${error instanceof Error ? error.message : String(error)}` });
            }
        }
        return results;
    }

    /** The result of a run that reached the model. */
    private completedResult(
        test: ParsedDecisionEvalTest,
        actual: DecisionEvalActualOutput,
        oracleResults: OracleResult[],
        result: AIDecisionRunResult,
        context: DriverExecutionContext,
        startedAt: number
    ): DriverExecutionResult {
        const problem = this.runProblem(actual);
        if (problem) {
            this.logToTestRun(context, 'warn', problem);
            return this.errorResult(problem, test, actual, oracleResults, startedAt, result);
        }
        const gating = oracleResults.filter(r => !r.advisory);
        const passed = gating.filter(r => r.passed).length;
        return {
            ...this.targetLink(result),
            status: gating.length === 0 ? 'Skipped' : gating.every(r => r.passed) ? 'Passed' : 'Failed',
            score: gating.length === 0 ? 0 : this.calculateScore(gating, oracleWeights(test.Config)),
            oracleResults,
            passedChecks: passed,
            failedChecks: gating.length - passed,
            totalChecks: gating.length,
            skippedChecks: oracleResults.length - gating.length,
            inputData: test.Input,
            expectedOutput: test.Expected,
            actualOutput: actual,
            totalCost: actual.CostUSD ?? 0,
            durationMs: Date.now() - startedAt
        };
    }

    /** Why a run that reached the model is still not an observation, or null. */
    private runProblem(actual: DecisionEvalActualOutput): string | null {
        if (actual.Error) {
            return `The decision failed: ${actual.Error}`;
        }
        if (actual.Model.FailedOver && !actual.Model.FailoverAllowed) {
            return `Answered by ${actual.Model.AnsweredModelName ?? actual.Model.AnsweredModelId ?? 'another model'}`
                + `${actual.Model.AnsweredVendorName ? ` via ${actual.Model.AnsweredVendorName}` : ''}, not the pinned `
                + `${actual.Model.PinnedModelId ? `model ${actual.Model.PinnedModelId}` : ''}`
                + `${actual.Model.PinnedVendorId ? ` vendor ${actual.Model.PinnedVendorId}` : ''}, with failover off`;
        }
        return null;
    }

    /** A run that produced no observation: status `Error`, with the reason. */
    private errorResult(
        message: string,
        test: ParsedDecisionEvalTest | null,
        actual: DecisionEvalActualOutput | null,
        oracleResults: OracleResult[],
        startedAt: number,
        result?: AIDecisionRunResult
    ): DriverExecutionResult {
        return {
            ...this.targetLink(result),
            status: 'Error',
            score: 0,
            oracleResults,
            passedChecks: 0,
            failedChecks: 0,
            totalChecks: 0,
            skippedChecks: oracleResults.length,
            inputData: test?.Input,
            expectedOutput: test?.Expected,
            actualOutput: actual ?? undefined,
            totalCost: actual?.CostUSD ?? 0,
            durationMs: Date.now() - startedAt,
            errorMessage: message
        };
    }

    /** Links the prompt run as the test run's target, when there is one. */
    private targetLink(result?: AIDecisionRunResult): Pick<DriverExecutionResult, 'targetType' | 'targetLogEntityId' | 'targetLogId'> {
        return {
            targetType: 'AI Prompt',
            targetLogEntityId: this.Provider?.EntityByName('MJ: AI Prompt Runs')?.ID,
            targetLogId: result?.promptRun?.ID ?? ''
        };
    }
}

/**
 * Validates a test's `Configuration`, `InputDefinition` and `ExpectedOutcomes`. Throws naming the
 * column and the first problem.
 *
 * @param test The test.
 */
export function ParseDecisionEvalTest(test: MJTestEntity): ParsedDecisionEvalTest {
    return {
        Config: parseColumn('Configuration', test.Configuration, DecisionEvalConfigSchema),
        Input: parseColumn('InputDefinition', test.InputDefinition, DecisionEvalInputSchema),
        Expected: parseColumn('ExpectedOutcomes', test.ExpectedOutcomes, DecisionEvalExpectedSchema)
    };
}

/**
 * Whether a cell's runner may fail over: as the cell says, and otherwise only when it pins nothing.
 *
 * @param config The cell's configuration.
 */
export function IsFailoverAllowed(config: DecisionEvalConfig): boolean {
    return config.failover ?? !(config.modelId || config.vendorId);
}

/**
 * The runner's parameters for one call: the prompt, the context user, the cell's state layout, the
 * shared questions, a time bound, and the cell's pinning as `override`.
 *
 * @param config The cell's configuration.
 * @param input The routing input.
 * @param prompt The decision prompt.
 * @param context The run's context, for its user.
 * @param timeoutMS Bounds the model call.
 */
export function BuildDecisionEvalParams(
    config: DecisionEvalConfig,
    input: RoutingDecisionInput,
    prompt: MJAIPromptEntityExtended,
    context: Pick<DriverExecutionContext, 'contextUser'>,
    timeoutMS: number
): AIDecisionParams {
    const params = new AIDecisionParams();
    params.prompt = prompt;
    // Explicit, never the provider's CurrentUser, which is null on the CLI (#3251).
    params.contextUser = context.contextUser;
    params.State = config.stateLayout === 'structured' ? BuildRoutingStateStructured(input) : BuildRoutingState(input);
    params.Questions = BuildRoutingQuestions(input);
    params.timeoutMS = timeoutMS;
    if (config.modelId || config.vendorId) {
        params.override = { modelId: config.modelId ?? undefined, vendorId: config.vendorId ?? undefined };
    }
    return params;
}

/**
 * What a run records as its `ActualOutput`: the summarized answers, the `continues` probability,
 * the agent Choice, production's verdict, the model record, the sampling record, the latency, the
 * prompt run and its cost, and the error when there are no answers.
 *
 * @param config The cell's configuration.
 * @param promptName The decision prompt's name.
 * @param call The call and its result.
 */
export function BuildDecisionEvalActualOutput(config: DecisionEvalConfig, promptName: string, call: DecisionEvalCall): DecisionEvalActualOutput {
    const { Result: result } = call;
    const answers = result.success ? result.Answers : {};
    const continues = answers[ROUTING_CONTINUES_QUESTION];
    const route = answers[ROUTING_ROUTE_QUESTION];
    return {
        Decision: config.decision,
        StateLayout: config.stateLayout,
        PromptName: promptName,
        Answers: SummarizeDecisionEvalAnswers(answers),
        ContinuesProbability: continues?.Kind === 'Likelihood' ? continues.Probability : null,
        Route: route?.Kind === 'Choice' ? { Value: route.Value, Confidence: route.Confidence } : null,
        RoutingVerdict: result.success ? InterpretRoutingAnswers(call.Input, { Success: true, Answers: answers }).Verdict : null,
        Model: modelRecord(config, result),
        Sampling: samplingRecord(config),
        LatencyMs: call.LatencyMs,
        PromptRunId: result.promptRun?.ID ?? null,
        CostUSD: result.promptRun?.TotalCost ?? result.promptRun?.Cost ?? result.cost ?? null,
        Error: result.success ? null : (result.errorMessage || 'the decision failed with no message')
    };
}

/**
 * Summarizes answers for the record: a Likelihood's probability; a Choice's or Score's value and
 * confidence, keeping its full distribution.
 *
 * @param answers The answers by question key.
 */
export function SummarizeDecisionEvalAnswers(answers: Record<string, DecisionAnswer>): Record<string, DecisionEvalAnswerSummary> {
    const summary: Record<string, DecisionEvalAnswerSummary> = {};
    for (const [key, answer] of Object.entries(answers)) {
        summary[key] = answer.Kind === 'Likelihood'
            ? { Kind: 'Likelihood', Probability: answer.Probability }
            : { Kind: answer.Kind, Value: answer.Value, Confidence: answer.Confidence, Probabilities: { ...answer.Probabilities } };
    }
    return summary;
}

/** Which model was pinned, which answered (or, for a failed call, was selected), and whether they match. */
function modelRecord(config: DecisionEvalConfig, result: AIDecisionRunResult): DecisionEvalModelRecord {
    const pinnedModel = config.modelId ?? null;
    const pinnedVendor = config.vendorId ?? null;
    const answered = result.modelInfo;
    const matches = !answered || (!pinnedModel && !pinnedVendor)
        ? null
        : (!pinnedModel || UUIDsEqual(answered.modelId, pinnedModel)) && (!pinnedVendor || UUIDsEqual(answered.vendorId, pinnedVendor));
    return {
        PinnedModelId: pinnedModel,
        PinnedVendorId: pinnedVendor,
        FailoverAllowed: IsFailoverAllowed(config),
        AnsweredModelId: answered?.modelId ?? null,
        AnsweredModelName: answered?.modelName ?? null,
        AnsweredVendorId: answered?.vendorId ?? null,
        AnsweredVendorName: answered?.vendorName ?? null,
        DriverClass: result.DriverClass ?? null,
        ResolvedModel: result.DecisionResult?.ResolvedModel ?? null,
        AnsweredByPinned: matches,
        FailedOver: result.success && matches === false
    };
}

/** The sampling the cell asked for, recorded as not applied. */
function samplingRecord(config: DecisionEvalConfig): DecisionEvalSampling {
    const requested = config.temperature != null || config.seed != null;
    return {
        RequestedTemperature: config.temperature ?? null,
        RequestedSeed: config.seed ?? null,
        Applied: false,
        Note: requested ? SAMPLING_NOT_APPLIED : null
    };
}

/** Each oracle's weight by type, defaulting to 1. */
function oracleWeights(config: DecisionEvalConfig): Record<string, number> {
    return Object.fromEntries(config.oracles.map(o => [o.type, o.weight ?? 1]));
}

/** One JSON column, parsed and validated. */
function parseColumn<T>(
    column: string,
    text: string | null,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: ZodError } }
): T {
    if (!text || text.trim() === '') {
        throw new Error(`${column} is required`);
    }
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch (error) {
        throw new Error(`${column} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = schema.safeParse(json);
    if (!result.success) {
        throw new Error(`${column}: ${DescribeZodError(result.error)}`);
    }
    return result.data;
}
