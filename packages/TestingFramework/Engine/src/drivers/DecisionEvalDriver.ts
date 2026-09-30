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
    BuildDecisionDiscoveryOptionSet,
    BuildDecisionDiscoveryQuestions,
    CanSearchEntities,
    DECISION_DISCOVERY_MIN_CONFIDENCE,
    DECISION_DISCOVERY_MIN_OPTIONS,
    DECISION_DISCOVERY_TIMEOUT_MS,
    DecisionDiscoveryAgentSearch,
    DecisionDiscoveryCatalog,
    DecisionDiscoveryRunnableAgents,
    DecisionPromptOptionCap,
    JudgeDecisionDiscovery,
    MentionsAgent,
    type DecisionDiscoveryAgent,
    type DecisionDiscoveryOption,
    type DecisionDiscoveryOptionSet,
    type DecisionDiscoverySearch
} from '@memberjunction/ai-agents';
import {
    BuildRoutingQuestions,
    BuildRoutingState,
    BuildRoutingStateStructured,
    CanAskRoutingDecision,
    DECISION_ROUTING_MIN_CONFIDENCE,
    DECISION_ROUTING_TIMEOUT_MS,
    FindDecisionCalibration,
    InterpretRoutingAnswers,
    ROUTING_CONTINUES_CALIBRATION,
    ROUTING_CONTINUES_QUESTION,
    ROUTING_ROUTE_QUESTION,
    type DecisionAnsweringModel,
    type MJAIPromptEntityExtended,
    type RoutingCatalogAgent,
    type RoutingDecisionInput
} from '@memberjunction/ai-core-plus';
import { BaseTestDriver } from './BaseTestDriver';
import { PinnedDecisionRunner } from './PinnedDecisionRunner';
import { DriverExecutionContext, DriverExecutionResult, OracleInput, OracleResult, ValidationResult } from '../types';
import { MapPointToRoutingInput, type DecisionEvalAgentCatalog } from '../decision-eval/point-mapping';
import { DiscoveryDecisionState } from '../decision-eval/discovery-mapping';
import { FIND_CANDIDATE_AGENTS_TOP_K, RankSemanticSearchBaseline } from '../decision-eval/discovery-baseline';
import {
    DiscoveryEvalConfigSchema,
    DiscoveryEvalExpectedSchema,
    DiscoveryEvalInputSchema,
    type DiscoveryBaselineRecord,
    type DiscoveryEvalActualOutput,
    type DiscoveryEvalConfig,
    type DiscoveryEvalExpected,
    type DiscoveryEvalInput,
    type DiscoveryOptionsRecord
} from '../decision-eval/discovery-types';
import {
    DEFAULT_DECISION_PROMPT_NAME,
    DecisionEvalConfigSchema,
    DecisionEvalExpectedSchema,
    DecisionEvalInputSchema,
    DecisionEvalKindSchema,
    DescribeZodError,
    type DecisionEvalActualOutput,
    type DecisionEvalAnswerSummary,
    type DecisionEvalConfig,
    type DecisionEvalDecision,
    type DecisionEvalExpected,
    type DecisionEvalInput,
    type DecisionEvalModelRecord,
    type DecisionEvalRoutingPolicy,
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

/** A discovery test's three JSON columns, validated. */
export interface ParsedDiscoveryEvalTest {
    Config: DiscoveryEvalConfig;
    Input: DiscoveryEvalInput;
    Expected: DiscoveryEvalExpected;
}

/**
 * What one discovery run needs from the environment, loaded the way production's discovery loads
 * it: the agents the run's user may run, the conversation manager that runs discovery, the
 * decision prompt's option cap, and the semantic search.
 */
export interface DiscoveryEvalEnvironment {
    /** The decision prompt, from `AIEngine`. Null for a baseline cell, which makes no call. */
    Prompt: MJAIPromptEntityExtended | null;
    /** The conversation manager (Sage): never an option, and the agent whose @mention does not count. */
    ConversationManager: { ID: string; Name: string | null };
    /** Every agent in the engine's catalog: what an @mention may name. */
    AllAgents: ReadonlyArray<{ ID: string; Name: string | null }>;
    /** The agents the run's user may run (`DecisionDiscoveryRunnableAgents`). */
    RunnableAgents: ReadonlyArray<DecisionDiscoveryAgent>;
    /** The decision prompt's option cap (`DecisionPromptOptionCap`), when one is declared. */
    DeclaredCap?: number;
    /** The semantic search for a request (`DecisionDiscoveryAgentSearch`), or undefined when the provider cannot run it. */
    SearchFor?: (request: string) => DecisionDiscoverySearch;
}

/** One discovery decision call and what came back. */
export interface DiscoveryEvalCall {
    /** The options the call offered, and how they were reached. */
    OptionSet: DecisionDiscoveryOptionSet;
    /** The runner's result. */
    Result: AIDecisionRunResult;
    /** Wall-clock time of the call, in milliseconds. It includes writing the prompt-run row. */
    LatencyMs: number;
    /**
     * Wall-clock time from building the options, the semantic search included, through the call, in
     * milliseconds: the span production's discovery timeout ({@link DECISION_DISCOVERY_TIMEOUT_MS}) bounds.
     */
    DiscoveryLatencyMs: number;
}

/** What the shared result helpers read from either decision's parsed test. */
interface EvalTestParts {
    Config: { oracles: DecisionEvalConfig['oracles'] };
    Input: object;
    Expected: object;
}

/** The conversation manager the routing decision offers as "someone else", and the agent that runs discovery. */
export const CONVERSATION_MANAGER_NAME = 'Sage';

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
 * **Agent discovery.** A test whose `Configuration.decision` is `agent-discovery` asks production's
 * discovery decision instead (plan Task 3.1): the options come from `BuildDecisionDiscoveryOptionSet`
 * over the agents the run's user may run, with the real semantic search, and the questions from
 * `BuildDecisionDiscoveryQuestions`, both from `@memberjunction/ai-agents`, the code `BaseAgent`
 * runs. Production gives up after {@link DECISION_DISCOVERY_TIMEOUT_MS}, counted from building the
 * options, so the driver times the same span and records an answer that came later as not injected.
 * The call itself runs to the end, so the late answer is still recorded. A `semantic-search`
 * baseline cell makes no decision call: it records what `Find Candidate Agents` would have listed
 * first.
 *
 * **Never throws.** A bad test, a missing prompt and a failed decision come back as an `Error` run
 * with the reason. A point or request with nothing to decide is `Skipped`: production makes no call there.
 */
@RegisterClass(BaseTestDriver, 'DecisionEvalDriver')
export class DecisionEvalDriver extends BaseTestDriver {
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        const startedAt = Date.now();
        let test: ParsedDecisionEvalTest | ParsedDiscoveryEvalTest | null = null;
        try {
            if (ReadDecisionEvalKind(context.test) === 'agent-discovery') {
                const discovery = ParseDiscoveryEvalTest(context.test);
                test = discovery;
                return await this.evaluateDiscoveryTest(discovery, context, startedAt);
            }
            const routing = ParseDecisionEvalTest(context.test);
            test = routing;
            return await this.evaluateTest(routing, context, startedAt);
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
            if (ReadDecisionEvalKind(test) === 'agent-discovery') {
                ParseDiscoveryEvalTest(test);
            } else {
                ParseDecisionEvalTest(test);
            }
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
        const prompt = this.findDecisionPrompt(config.promptName ?? DEFAULT_DECISION_PROMPT_NAME);
        const agents = AIEngine.Instance.Agents;
        const manager = agents.find(a => a.Name?.trim().toLowerCase() === CONVERSATION_MANAGER_NAME.toLowerCase());
        return {
            Prompt: prompt,
            Catalog: {
                FindAgent: (agentId: string): RoutingCatalogAgent | undefined => agents.find(a => UUIDsEqual(a.ID, agentId)),
                ConversationManager: manager ?? null
            }
        };
    }

    /**
     * Loads what one discovery run needs, the way production's discovery loads it: `AIEngine`, the
     * decision prompt by name (not for a baseline cell, which makes no call), the conversation
     * manager, the agents the run's user may run, the prompt's option cap, and the semantic search
     * when the provider can run it. Throws when the prompt or the conversation manager is missing.
     * Overridable, so a test can run the driver without an engine or a provider.
     */
    protected async LoadDiscoveryEnvironment(config: DiscoveryEvalConfig, context: DriverExecutionContext): Promise<DiscoveryEvalEnvironment> {
        await AIEngine.Instance.Config(false, context.contextUser);
        const promptName = config.promptName ?? DEFAULT_DECISION_PROMPT_NAME;
        const agents = AIEngine.Instance.Agents;
        const manager = agents.find(a => a.Name?.trim().toLowerCase() === CONVERSATION_MANAGER_NAME.toLowerCase());
        if (!manager) {
            throw new Error(`The conversation manager '${CONVERSATION_MANAGER_NAME}' is not in AIEngine metadata, and discovery runs as it`);
        }
        const provider = this.Provider;
        const searcher = CanSearchEntities(provider) ? provider : undefined;
        return {
            Prompt: config.baseline ? null : this.findDecisionPrompt(promptName),
            ConversationManager: manager,
            AllAgents: agents,
            RunnableAgents: await DecisionDiscoveryRunnableAgents(agents, context.contextUser),
            DeclaredCap: DecisionPromptOptionCap(AIEngine.Instance, promptName),
            SearchFor: searcher ? (request: string) => DecisionDiscoveryAgentSearch(searcher, request, context.contextUser) : undefined
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

    /** The decision prompt by name, from the loaded `AIEngine`. Throws when it is missing. */
    private findDecisionPrompt(promptName: string): MJAIPromptEntityExtended {
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === promptName.trim().toLowerCase());
        if (!prompt) {
            throw new Error(`Decision prompt '${promptName}' not found in AIEngine metadata`);
        }
        return prompt;
    }

    /**
     * Maps the request to production's state, then runs the `semantic-search` baseline, or builds
     * the options and runs the one decision, and scores it. A request production would ask nothing
     * about is Skipped, including one with fewer than {@link DECISION_DISCOVERY_MIN_OPTIONS} options;
     * options that cannot be built are an Error. Every corpus request is a conversation's opening
     * request, the only turn production's discovery asks about.
     */
    private async evaluateDiscoveryTest(test: ParsedDiscoveryEvalTest, context: DriverExecutionContext, startedAt: number): Promise<DriverExecutionResult> {
        const environment = await this.LoadDiscoveryEnvironment(test.Config, context);
        const request = DiscoveryDecisionState(test.Input.request);
        const skip = DiscoverySkipReason(request, environment);
        if (skip) {
            return { ...this.errorResult(skip, test, null, [], startedAt), status: 'Skipped' };
        }
        if (test.Config.baseline) {
            const baseline = await this.runSemanticSearchBaseline(test, environment, request);
            return this.completedResult(test, baseline, await this.runOracles(test, baseline, undefined, context), undefined, context, startedAt);
        }
        // Production's timeout covers the options (and their semantic search) as well as the call.
        const discoveryStarted = Date.now();
        const optionSet = await BuildDecisionDiscoveryOptionSet({
            Agents: environment.RunnableAgents,
            RunningAgentID: environment.ConversationManager.ID,
            DeclaredCap: environment.DeclaredCap,
            Search: environment.SearchFor?.(request)
        });
        if (optionSet.Error) {
            throw new Error(`The options could not be built: ${optionSet.Error}`);
        }
        if (optionSet.Options.length < DECISION_DISCOVERY_MIN_OPTIONS) {
            const reason = `There are ${optionSet.Options.length} agents to choose from, fewer than the ${DECISION_DISCOVERY_MIN_OPTIONS} production's `
                + 'discovery needs, so production asks nothing.';
            return { ...this.errorResult(reason, test, null, [], startedAt), status: 'Skipped' };
        }
        this.logToTestRun(context, 'info', `Asking agent discovery with '${environment.Prompt?.Name}' over ${optionSet.Options.length} option(s)`);
        const call = await this.callDiscoveryDecision(test.Config, request, optionSet, environment.Prompt, context, discoveryStarted);
        const actual = BuildDiscoveryEvalActualOutput(test.Config, environment.Prompt?.Name ?? DEFAULT_DECISION_PROMPT_NAME, call, test.Expected);
        return this.completedResult(test, actual, await this.runOracles(test, actual, call.Result, context), call.Result, context, startedAt);
    }

    /**
     * Builds the discovery decision's parameters and makes the one call, waiting for the prompt run to
     * be saved. `discoveryStarted` is when building the options began, where production's timeout starts.
     */
    private async callDiscoveryDecision(
        config: DiscoveryEvalConfig,
        request: string,
        optionSet: DecisionDiscoveryOptionSet,
        prompt: MJAIPromptEntityExtended | null,
        context: DriverExecutionContext,
        discoveryStarted: number
    ): Promise<DiscoveryEvalCall> {
        if (!prompt) {
            throw new Error('No decision prompt was loaded for a decision cell');
        }
        const params = BuildDiscoveryDecisionParams(config, request, optionSet.Options, prompt, context, this.getEffectiveTimeout(context.test));
        const runner = this.CreateRunner(IsFailoverAllowed(config));
        const callStarted = Date.now();
        const result = await runner.ExecuteDecision(params);
        const callEnded = Date.now();
        // Prompt-run persistence is fire-and-forget: settle it before the run links to the row.
        await runner.WaitForPendingPromptRunSaves();
        return { OptionSet: optionSet, Result: result, LatencyMs: callEnded - callStarted, DiscoveryLatencyMs: callEnded - discoveryStarted };
    }

    /**
     * The `semantic-search` baseline: no decision call. The search `Find Candidate Agents` runs, over
     * the request, read as the action reads it. Throws when the provider cannot run the search.
     */
    private async runSemanticSearchBaseline(
        test: ParsedDiscoveryEvalTest,
        environment: DiscoveryEvalEnvironment,
        request: string
    ): Promise<DiscoveryEvalActualOutput> {
        if (!environment.SearchFor) {
            throw new Error('The provider cannot run the semantic search the baseline measures');
        }
        const candidates = DecisionDiscoveryCatalog(environment.RunnableAgents, environment.ConversationManager.ID);
        const searchStarted = Date.now();
        const results = await environment.SearchFor(request)(FIND_CANDIDATE_AGENTS_TOP_K);
        const latencyMs = Date.now() - searchStarted;
        return BuildBaselineEvalActualOutput(test.Config, RankSemanticSearchBaseline(results, candidates), latencyMs, test.Expected, candidates);
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
        test: EvalTestParts,
        actual: DecisionEvalActualOutput | DiscoveryEvalActualOutput,
        result: AIDecisionRunResult | undefined,
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
                targetEntity: result?.promptRun,
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

    /** The result of a run that reached the model (or, for a baseline, the search). */
    private completedResult(
        test: EvalTestParts,
        actual: DecisionEvalActualOutput | DiscoveryEvalActualOutput,
        oracleResults: OracleResult[],
        result: AIDecisionRunResult | undefined,
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

    /** Why a run that reached the model is still not an observation, or null. A baseline run has no model. */
    private runProblem(actual: { Error: string | null; Model: DecisionEvalModelRecord | null }): string | null {
        if (actual.Error) {
            return `The decision failed: ${actual.Error}`;
        }
        const model = actual.Model;
        if (model && model.FailedOver && !model.FailoverAllowed) {
            return `Answered by ${model.AnsweredModelName ?? model.AnsweredModelId ?? 'another model'}`
                + `${model.AnsweredVendorName ? ` via ${model.AnsweredVendorName}` : ''}, not the pinned `
                + `${model.PinnedModelId ? `model ${model.PinnedModelId}` : ''}`
                + `${model.PinnedVendorId ? ` vendor ${model.PinnedVendorId}` : ''}, with failover off`;
        }
        return null;
    }

    /** A run that produced no observation: status `Error`, with the reason. */
    private errorResult(
        message: string,
        test: EvalTestParts | null,
        actual: DecisionEvalActualOutput | DiscoveryEvalActualOutput | null,
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
export function IsFailoverAllowed(config: Pick<DecisionEvalConfig, 'failover' | 'modelId' | 'vendorId'>): boolean {
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
 * the agent Choice, production's verdict and the policy it was reached under, the model record, the
 * sampling record, the latency, the prompt run and its cost, and the error when there are no answers.
 *
 * The verdict is production's: the answers are read by `InterpretRoutingAnswers` with the model
 * that answered and the model behind it, as the chat passes them from `RunDecision`, so the thread
 * Likelihood is calibrated exactly when production would calibrate it.
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
    const answeredBy = answeringModelOf(result);
    return {
        Decision: config.decision,
        StateLayout: config.stateLayout,
        PromptName: promptName,
        Answers: SummarizeDecisionEvalAnswers(answers),
        ContinuesProbability: continues?.Kind === 'Likelihood' ? continues.Probability : null,
        Route: route?.Kind === 'Choice' ? { Value: route.Value, Confidence: route.Confidence } : null,
        RoutingVerdict: result.success ? InterpretRoutingAnswers(call.Input, { Success: true, Answers: answers, ...answeredBy }).Verdict : null,
        RoutingPolicy: result.success ? routingPolicyFor(answeredBy) : null,
        Model: modelRecord(config, result),
        Sampling: samplingRecord(config),
        LatencyMs: call.LatencyMs,
        PromptRunId: result.promptRun?.ID ?? null,
        CostUSD: result.promptRun?.TotalCost ?? result.promptRun?.Cost ?? result.cost ?? null,
        Error: result.success ? null : (result.errorMessage || 'the decision failed with no message')
    };
}

/**
 * The model that answered a decision, as `RunDecision` reports it to the chat: the MJ decision
 * model (`modelInfo.modelName`) and the exact model behind it (`DecisionResult.ResolvedModel`).
 *
 * @param result The runner's result.
 */
function answeringModelOf(result: AIDecisionRunResult): DecisionAnsweringModel {
    return { ModelName: result.modelInfo?.modelName, ResolvedModel: result.DecisionResult?.ResolvedModel };
}

/**
 * The routing policy production applies to an answer from this model: the confidence bar, the
 * timeout, and the thread Likelihood's calibration for this exact model, or null when it has none.
 *
 * @param answeredBy The model that answered.
 */
function routingPolicyFor(answeredBy: DecisionAnsweringModel): DecisionEvalRoutingPolicy {
    const calibration = FindDecisionCalibration(ROUTING_CONTINUES_CALIBRATION, answeredBy);
    return {
        MinConfidence: DECISION_ROUTING_MIN_CONFIDENCE,
        TimeoutMs: DECISION_ROUTING_TIMEOUT_MS,
        Calibration: calibration ? { A: calibration.A, B: calibration.B } : null
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

/**
 * Which decision a test asks, from its `Configuration`. Throws naming the column when the
 * configuration is missing, is not JSON, or names no known decision.
 *
 * @param test The test.
 */
export function ReadDecisionEvalKind(test: Pick<MJTestEntity, 'Configuration'>): DecisionEvalDecision {
    return parseColumn('Configuration', test.Configuration, DecisionEvalKindSchema).decision;
}

/**
 * Validates a discovery test's `Configuration`, `InputDefinition` and `ExpectedOutcomes`. Throws
 * naming the column and the first problem.
 *
 * @param test The test.
 */
export function ParseDiscoveryEvalTest(test: MJTestEntity): ParsedDiscoveryEvalTest {
    return {
        Config: parseColumn('Configuration', test.Configuration, DiscoveryEvalConfigSchema),
        Input: parseColumn('InputDefinition', test.InputDefinition, DiscoveryEvalInputSchema),
        Expected: parseColumn('ExpectedOutcomes', test.ExpectedOutcomes, DiscoveryEvalExpectedSchema)
    };
}

/**
 * Why production's discovery would ask nothing about a request, or null when it would ask:
 * the request is empty, or it @mentions an agent other than the conversation manager
 * (`MentionsAgent`, as `BaseAgent` checks it).
 *
 * @param state The request as production reads it (`DiscoveryDecisionState`).
 * @param environment The catalog and the conversation manager.
 */
export function DiscoverySkipReason(state: string, environment: Pick<DiscoveryEvalEnvironment, 'AllAgents' | 'ConversationManager'>): string | null {
    if (!state) {
        return 'The request is empty, so production asks nothing.';
    }
    if (MentionsAgent(state, environment.AllAgents, environment.ConversationManager.ID)) {
        return 'The request @mentions an agent, so production asks nothing: the user has already chosen.';
    }
    return null;
}

/**
 * The runner's parameters for one discovery call: the prompt, the context user, the request as the
 * state, production's questions over the options, a time bound, and the cell's pinning as
 * `override`. The prompt run is not attributed to the conversation manager (production sets
 * `agentId`, which only labels the row), so eval runs stay out of its analytics.
 *
 * @param config The cell's configuration.
 * @param state The request as production reads it (`DiscoveryDecisionState`).
 * @param options The Choice's options (`BuildDecisionDiscoveryOptionSet`).
 * @param prompt The decision prompt.
 * @param context The run's context, for its user.
 * @param timeoutMS Bounds the model call.
 */
export function BuildDiscoveryDecisionParams(
    config: DiscoveryEvalConfig,
    state: string,
    options: ReadonlyArray<DecisionDiscoveryOption>,
    prompt: MJAIPromptEntityExtended,
    context: Pick<DriverExecutionContext, 'contextUser'>,
    timeoutMS: number
): AIDecisionParams {
    const params = new AIDecisionParams();
    params.prompt = prompt;
    // Explicit, never the provider's CurrentUser, which is null on the CLI (#3251).
    params.contextUser = context.contextUser;
    params.State = state;
    params.Questions = BuildDecisionDiscoveryQuestions(options);
    params.timeoutMS = timeoutMS;
    if (config.modelId || config.vendorId) {
        params.override = { modelId: config.modelId ?? undefined, vendorId: config.vendorId ?? undefined };
    }
    return params;
}

/**
 * What a discovery decision run records as its `ActualOutput`: the options, the summarized answers,
 * the chosen agent with its confidence, the `anyApplies` probability, `JudgeDecisionDiscovery`'s
 * verdict at production's threshold, whether the labelled agent was an option, the model and
 * sampling records, the call's latency and the whole discovery's, the prompt run and its cost, and
 * the error when there are no answers.
 *
 * A discovery that took longer than {@link DECISION_DISCOVERY_TIMEOUT_MS} is recorded as not
 * injected, with a "timed out" reason, whatever its answer: production would have given up by then.
 *
 * @param config The cell's configuration.
 * @param promptName The decision prompt's name.
 * @param call The call, its options and its result.
 * @param expected The request's label.
 */
export function BuildDiscoveryEvalActualOutput(
    config: DiscoveryEvalConfig,
    promptName: string,
    call: DiscoveryEvalCall,
    expected: DiscoveryEvalExpected
): DiscoveryEvalActualOutput {
    const { Result: result, OptionSet: optionSet } = call;
    const answers = result.success ? result.Answers : {};
    const verdict = result.success ? JudgeDecisionDiscovery(answers, optionSet.Options, DECISION_DISCOVERY_MIN_CONFIDENCE) : null;
    const answer = verdict?.Answer;
    const onTime = call.DiscoveryLatencyMs <= DECISION_DISCOVERY_TIMEOUT_MS;
    return {
        Decision: 'agent-discovery',
        Arm: 'decision',
        PromptName: promptName,
        Options: optionsRecord(optionSet),
        LabelledAgentOffered: expected.label === 'agent' ? optionSet.Options.some(o => UUIDsEqual(o.ID, expected.agentId)) : null,
        Answers: SummarizeDecisionEvalAnswers(answers),
        ChosenAgentId: answer?.Agent.ID ?? null,
        ChosenAgentName: answer?.Agent.Name ?? null,
        Confidence: answer?.Confidence ?? null,
        AnyApplies: answer?.AnyApplies ?? null,
        WouldInject: answer && verdict ? verdict.Confident && onTime : null,
        MinConfidence: DECISION_DISCOVERY_MIN_CONFIDENCE,
        VerdictReason: answer && !onTime ? DiscoveryTimedOutReason(call.DiscoveryLatencyMs) : verdict?.Reason ?? null,
        Baseline: null,
        Model: modelRecord(config, result),
        Sampling: samplingRecord(config),
        LatencyMs: call.LatencyMs,
        DiscoveryLatencyMs: call.DiscoveryLatencyMs,
        WithinProductionTimeout: result.success ? onTime : null,
        PromptRunId: result.promptRun?.ID ?? null,
        CostUSD: result.promptRun?.TotalCost ?? result.promptRun?.Cost ?? result.cost ?? null,
        Error: result.success ? null : (result.errorMessage || 'the decision failed with no message')
    };
}

/**
 * What a `semantic-search` baseline run records as its `ActualOutput`: the ranking, the action's
 * first row as the chosen agent, and whether it lists anything at all as `WouldInject`. It has no
 * answers, no model and no cost.
 *
 * @param config The cell's configuration.
 * @param baseline The ranking (`RankSemanticSearchBaseline`).
 * @param latencyMs Wall-clock time of the search.
 * @param expected The request's label.
 * @param candidates The agents the action may list.
 */
export function BuildBaselineEvalActualOutput(
    config: DiscoveryEvalConfig,
    baseline: DiscoveryBaselineRecord,
    latencyMs: number,
    expected: DiscoveryEvalExpected,
    candidates: ReadonlyArray<{ ID: string }>
): DiscoveryEvalActualOutput {
    return {
        Decision: 'agent-discovery',
        Arm: 'semantic-search',
        PromptName: null,
        Options: null,
        LabelledAgentOffered: expected.label === 'agent' ? candidates.some(c => UUIDsEqual(c.ID, expected.agentId)) : null,
        Answers: {},
        ChosenAgentId: baseline.TopMatch?.AgentId ?? null,
        ChosenAgentName: baseline.TopMatch?.AgentName ?? null,
        Confidence: null,
        AnyApplies: null,
        WouldInject: baseline.TopMatch !== null,
        MinConfidence: null,
        VerdictReason: baseline.TopMatch ? null : `no candidate reaches the similarity floor of ${baseline.Floor}`,
        Baseline: baseline,
        Model: null,
        Sampling: samplingRecord(config),
        LatencyMs: latencyMs,
        DiscoveryLatencyMs: null,
        WithinProductionTimeout: null,
        PromptRunId: null,
        CostUSD: null,
        Error: null
    };
}

/**
 * Why a discovery that answered too late injects nothing: production had given up.
 *
 * @param discoveryLatencyMs How long the discovery took, options and call.
 */
export function DiscoveryTimedOutReason(discoveryLatencyMs: number): string {
    return `timed out: the discovery took ${Math.round(discoveryLatencyMs)} ms, past production's ${DECISION_DISCOVERY_TIMEOUT_MS} ms limit, `
        + 'so production would have given up and injected nothing';
}

/** How the options were reached, for the record. */
function optionsRecord(optionSet: DecisionDiscoveryOptionSet): DiscoveryOptionsRecord {
    return {
        Count: optionSet.Options.length,
        Limit: optionSet.OptionLimit,
        CatalogSize: optionSet.CatalogSize,
        WithoutDescription: optionSet.WithoutDescription.length,
        DeclaredCap: optionSet.DeclaredOptionCap ?? null,
        NarrowedFrom: optionSet.NarrowedFrom ?? null
    };
}

/** Which model was pinned, which answered (or, for a failed call, was selected), and whether they match. */
function modelRecord(config: Pick<DecisionEvalConfig, 'failover' | 'modelId' | 'vendorId'>, result: AIDecisionRunResult): DecisionEvalModelRecord {
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
function samplingRecord(config: Pick<DecisionEvalConfig, 'temperature' | 'seed'>): DecisionEvalSampling {
    const requested = config.temperature != null || config.seed != null;
    return {
        RequestedTemperature: config.temperature ?? null,
        RequestedSeed: config.seed ?? null,
        Applied: false,
        Note: requested ? SAMPLING_NOT_APPLIED : null
    };
}

/** Each oracle's weight by type, defaulting to 1. */
function oracleWeights(config: EvalTestParts['Config']): Record<string, number> {
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
