/**
 * @fileoverview Prompt-eval driver — one model decision, evaluated deterministically.
 * @module @memberjunction/testing-engine
 */

import type { ControlToolRole } from '../eval/decision';
import { encodeHistoryForArm } from '../eval/history';
import { RegisterClass } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { MJTestEntity, MJAIAgentPromptEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AgentPromptComposer } from './AgentPromptComposer';
import { PinnedVendorPromptRunner } from './PinnedVendorPromptRunner';
import type { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { ChatMessage, ChatToolChoice } from '@memberjunction/ai';
import { BaseTestDriver } from './BaseTestDriver';
import { DriverExecutionContext, DriverExecutionResult, OracleInput, ValidationResult } from '../types';
import type { OracleResult } from '@memberjunction/testing-engine-base';
import type { PromptEvalActualOutput } from '../oracles/AgentDecisionOracle';

/** One oracle to run, as it appears in the test's `Configuration`. */
export interface PromptEvalOracleConfig {
    type: string;
    weight?: number;
    config?: Record<string, unknown>;
}

/** `Configuration` for a Prompt Eval test. */
export interface PromptEvalConfig {
    /** The prompt to run. Exactly one of `promptId` / `agentId` is required. */
    promptId?: string;
    /** Resolve the prompt from an agent's active prompt binding instead of naming it. */
    agentId?: string;
    /**
     * Same, by agent NAME. The corpus states its agent by name — golden files stay readable and
     * diffable, and the suite generator runs offline with no database to resolve a GUID against.
     */
    agentName?: string;
    oracles: PromptEvalOracleConfig[];
    /** Per-cell model pinning — this is the matrix axis (§3.3). */
    modelId?: string;
    vendorId?: string;
    configurationId?: string;
    /**
     * Per-cell reasoning effort. Numeric 1-100 is MJ's cross-provider scale; a provider-named
     * level (OpenAI's `'xhigh'` / `'none'`) is passed through verbatim for the levels that scale
     * cannot express. Part of the cell identity, so two effort levels are two cells, not noise
     * pooled into one.
     */
    effortLevel?: number | string;
    /**
     * Which wire encoding this cell observes.
     *
     * The composer attaches the agent's Actions as native tool declarations unconditionally,
     * because that is what `BaseAgent` does and the whole point of composing through it is to send
     * what production sends. A cell measuring the ENVELOPE therefore has to take them back off:
     * `toolsProvided` is one of the three terms in the runner's gate, so withholding declarations
     * is exactly how a real envelope-mode call differs from a native one. Nothing else about the
     * request changes, which is what keeps the two arms comparable.
     *
     * Defaults to `'envelope'`, so a record written before this axis existed —
     * keeps measuring the baseline it was generated to measure.
     */
    toolCallingMode?: 'envelope' | 'native';
    /**
     * Control-flow arm for a native cell. `'implicit'` keeps the control tools the composer
     * declared (the model's catalog must also say `NativeControlFlow: 'implicit'` for the runner to
     * send them); `'envelope'` (default) strips them here so the cell measures the hybrid on a
     * model whose catalog has been switched to implicit for the gate run.
     */
    nativeControlFlow?: 'envelope' | 'implicit';
    /**
     * Native-tool-results arm: send tool-form history (assistant toolCalls + tool turns) as native tool turns.
     * Otherwise the driver renders that history as the corpus's `[Action Result] …` prose, which is
     * what the loop shows models that do not return results natively.
     */
    nativeToolResults?: boolean;
    /** `tool_choice` for a native cell. Omitted accepts the agent's own default (`'auto'`). */
    toolChoice?: ChatToolChoice;
    /** Replaces the composed system prompt wholesale. Used by the trimmed-prompt variant cells. */
    systemPromptOverride?: string;
    maxExecutionTime?: number;
    scoringWeights?: Record<string, number>;
}

/**
 * The composed request, plus the map that makes a native turn readable as a decision.
 *
 * The map is carried separately rather than stuffed into `AIPromptParams` because it is the
 * HARNESS's need, not the runner's: the runner sends sanitized tool names and is done, while the
 * oracle has to compare what came back against a corpus expectation written in Action names.
 */
interface ComposedPromptEvalParams {
    params: AIPromptParams;
    /** Sanitized tool name → Action name. Absent when no agent (and so no Actions) is involved. */
    toolNameMap?: Readonly<Record<string, string>>;
    /** Control-flow tool name → the decision it encodes (sub-agent, payload change, chat). */
    controlToolMap?: Readonly<Record<string, ControlToolRole>>;
}

/** `InputDefinition` for a Prompt Eval test — the frozen state the model decides from. */
export interface PromptEvalInput {
    /** Prior conversation, including any action-result annotations for mid-loop cases. */
    conversationMessages?: ChatMessage[];
    /** The starting payload. Surfaced to the template as `_CURRENT_PAYLOAD` (§3.1). */
    payload?: Record<string, unknown>;
    /** Anything else the template needs. */
    templateData?: Record<string, unknown>;
}

/**
 * Runs ONE prompt and evaluates the single decision it produced.
 *
 * This is the corpus workhorse (test plan §3.1). Given frozen mid-loop state — a payload, a
 * conversation, a system prompt — it asks the model for exactly one decision and hands the raw turn
 * to the decision oracles. **No action ever executes.** `AIPromptRunner.ExecutePrompt` returns the
 * model's reply and nothing is dispatched, which is what makes the evaluation a plain data
 * assertion rather than a side-effecting integration test.
 *
 * Why a separate driver rather than reusing `AgentEvalDriver`: an agent run is a *loop*, and a loop
 * confounds the measurement. If the corpus is asking "does this model, in this state, choose action
 * B", then a run that recovered on iteration three answers a different question. Loop-level cases
 * still go through `AgentEvalDriver`; this driver isolates the single decision.
 *
 * Three execution details are load-bearing and easy to get wrong:
 * - **explicit `contextUser`** — the CLI provider's `CurrentUser` is null (#3251), so an omitted
 *   context user fails deep inside template rendering with an unrelated-looking error;
 * - **`AIEngine.Config()` before the first run** — otherwise prompt/model metadata is empty;
 * - **`WaitForPendingPromptRunSaves()` before oracles read back** — prompt-run persistence is
 *   fire-and-forget, so an oracle asserting on `AIPromptRun` would race it.
 */
@RegisterClass(BaseTestDriver, 'PromptEvalDriver')
export class PromptEvalDriver extends BaseTestDriver {
    private static readonly AI_PROMPT_RUNS_ENTITY_NAME = 'MJ: AI Prompt Runs';
    private _promptRunsEntityId: string | null = null;

    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        this.logToTestRun(context, 'info', 'Starting prompt evaluation');

        const config = this.parseConfig<PromptEvalConfig>(context.test);
        const input = this.parseInputDefinition<PromptEvalInput>(context.test);
        const expected = this.parseExpectedOutcomes<Record<string, unknown>>(context.test);

        await AIEngine.Instance.Config(false, context.contextUser);
        const { params: built, toolNameMap, controlToolMap } = await this.buildComposedParams(config, input, context);
        this.logToTestRun(context, 'info', `Executing prompt: ${built.prompt?.Name ?? '(unresolved)'}`);

        // A cell that pinned a vendor must be measured on THAT vendor or not at all — see
        // {@link PinnedVendorPromptRunner}. Unpinned configurations keep the stock runner, and
        // with it production's failover behavior.
        const runner = config.vendorId ? new PinnedVendorPromptRunner() : new AIPromptRunner();
        const startedAt = Date.now();
        const result = await runner.ExecutePrompt(built);
        // Fire-and-forget persistence: settle it before any oracle reads AIPromptRun back.
        await runner.WaitForPendingPromptRunSaves();
        const durationMs = Date.now() - startedAt;

        const actualOutput = this.extractTurn(result, toolNameMap, controlToolMap, this.protocolOf(config));
        const oracleResults = await this.runOracles(config, actualOutput, result, expected, context);

        const passedChecks = oracleResults.filter((r) => r.passed).length;
        return {
            targetType: 'AI Prompt',
            targetLogEntityId: this.getPromptRunsEntityId() ?? undefined,
            targetLogId: result.promptRun?.ID ?? '',
            status: this.determineStatus(oracleResults),
            score: this.calculateScore(oracleResults, config.scoringWeights),
            oracleResults,
            passedChecks,
            failedChecks: oracleResults.length - passedChecks,
            totalChecks: oracleResults.length,
            inputData: input,
            expectedOutput: expected,
            actualOutput,
            totalCost: result.promptRun?.TotalCost ?? 0,
            durationMs
        };
    }

    /**
     * Turns the runner's result into the encoding-neutral shape the decision oracles read.
     *
     * Both channels are carried, unjudged: the raw text and any native tool calls. Deciding which
     * one *counts* is the normalizer's job, not the driver's — that separation is what lets the
     * same corpus case score an envelope run and a native run.
     */
    /** Which protocol a cell measures — the normalizer reads plain text differently under implicit. */
    private protocolOf(config: PromptEvalConfig): 'envelope' | 'hybrid' | 'implicit' {
        if ((config.toolCallingMode ?? 'envelope') === 'envelope') return 'envelope';
        return (config.nativeControlFlow ?? 'envelope') === 'implicit' ? 'implicit' : 'hybrid';
    }

    private extractTurn(
        result: AIPromptRunResult,
        toolNameMap?: Readonly<Record<string, string>>,
        controlToolMap?: Readonly<Record<string, ControlToolRole>>,
        protocol: 'envelope' | 'hybrid' | 'implicit' = 'envelope'
    ): PromptEvalActualOutput {
        const choice = result.chatResult?.data?.choices?.[0];
        return {
            turn: {
                text: choice?.message?.content ?? result.rawResult ?? '',
                toolCalls: choice?.message?.toolCalls?.map((c) => ({ name: c.name, arguments: c.arguments })) ?? null,
                toolNameMap,
                controlToolMap,
                protocol
            },
            finishReason: choice?.finish_reason ?? null,
            executionError: result.success ? null : (result.errorMessage ?? 'prompt execution failed')
        };
    }

    private buildParams(
        prompt: MJAIPromptEntityExtended,
        config: PromptEvalConfig,
        input: PromptEvalInput,
        context: DriverExecutionContext
    ): AIPromptParams {
        const built: AIPromptParams = {
            prompt,
            // #3251: never rely on the provider's CurrentUser here.
            contextUser: context.contextUser,
            conversationMessages: encodeHistoryForArm(input.conversationMessages ?? [], config.nativeToolResults === true),
            // The corpus states a starting payload; the loop templates read it as _CURRENT_PAYLOAD.
            templateData: { ...(input.templateData ?? {}), _CURRENT_PAYLOAD: input.payload ?? {} },
            configurationId: config.configurationId,
            effortLevel: config.effortLevel,
            systemPromptOverride: config.systemPromptOverride,
            timeoutMS: this.getEffectiveTimeout(context.test, config)
        };
        if (config.modelId || config.vendorId) {
            built.override = { modelId: config.modelId, vendorId: config.vendorId };
        }
        return built;
    }

    /**
     * Builds the prompt parameters, composing the agent the way the runtime composes it.
     *
     * An MJ agent's prompt is not its own prompt record: `BaseAgent` runs the AGENT TYPE's system
     * prompt as the parent and injects the agent's prompt as a child, and only the parent carries
     * the response contract, the action catalog and the sub-agent list. Executing the agent's own
     * prompt alone measures a prompt production never sends — see {@link AgentPromptComposer}.
     *
     * `promptId` still runs that one prompt bare, which is the point of naming a prompt rather
     * than an agent: it is the only way to evaluate a prompt outside any agent.
     */
    private async buildComposedParams(
        config: PromptEvalConfig,
        input: PromptEvalInput,
        context: DriverExecutionContext
    ): Promise<ComposedPromptEvalParams> {
        if (config.promptId) {
            // A bare prompt has no agent, so no Actions and no tool bindings to map back from.
            return {
                params: this.applyCellOverrides(
                    this.buildParams(await this.resolvePrompt(config, context.contextUser), config, input, context),
                    config, context)
            };
        }

        const agentId = config.agentId ?? await this.resolveAgentIdByName(config.agentName, context.contextUser);
        if (!agentId) {
            throw new Error('Configuration requires promptId, agentId or agentName');
        }
        const agent = AIEngine.Instance.Agents.find((a) => a.ID === agentId);
        if (!agent) {
            throw new Error(`Agent '${config.agentName ?? agentId}' not found in AIEngine metadata`);
        }

        const composer = new AgentPromptComposer();
        const agentConfig = await composer.LoadConfiguration(agent);
        if (!agentConfig.success) {
            throw new Error(`Could not load agent configuration for '${agent.Name}': ${agentConfig.errorMessage}`);
        }

        const params = await composer.ComposeParams(agentConfig, input.payload ?? {}, {
            agent,
            contextUser: context.contextUser,
            conversationMessages: encodeHistoryForArm(input.conversationMessages ?? [], config.nativeToolResults === true),
            data: input.templateData
        } as ExecuteAgentParams);

        params.timeoutMS = this.getEffectiveTimeout(context.test, config);
        if (config.systemPromptOverride) {
            params.systemPromptOverride = config.systemPromptOverride;
        }
        return {
            params: this.applyCellOverrides(params, config, context),
            // Action bindings only: control-flow tools (sub-agents, payload_change_request, ask_user)
            // are mapped separately into the decision vocabulary by `controlToolMap` (Task 8).
            toolNameMap: Object.fromEntries(
                [...(composer.NativeToolBindings ?? [])].flatMap(([toolName, binding]) =>
                    binding.kind === 'action' ? [[toolName, binding.action.Name] as const] : [])),
            controlToolMap: Object.fromEntries(
                [...(composer.NativeToolBindings ?? [])].flatMap(([toolName, binding]): Array<readonly [string, ControlToolRole]> => {
                    switch (binding.kind) {
                        case 'subAgent': return [[toolName, { kind: 'subAgent', name: binding.agent.Name ?? toolName }] as const];
                        case 'payloadChange': return [[toolName, { kind: 'payloadChange' }] as const];
                        case 'askUser': return [[toolName, { kind: 'chat' }] as const];
                        default: return [];
                    }
                }))
        };
    }

    /** The matrix axes (§3.3): model/vendor pinning, effort, configuration — applied last so a cell wins. */
    private applyCellOverrides(
        params: AIPromptParams,
        config: PromptEvalConfig,
        context: DriverExecutionContext
    ): AIPromptParams {
        if (config.modelId || config.vendorId) {
            params.override = { modelId: config.modelId, vendorId: config.vendorId };
        }
        if (config.effortLevel !== undefined) {
            params.effortLevel = config.effortLevel;
        }
        if (config.configurationId) {
            params.configurationId = config.configurationId;
        }
        this.applyToolCallingMode(params, config, context);
        return params;
    }

    /**
     * Applies the cell's tool-calling mode by adding or withholding the tool declarations.
     *
     * This driver never decides whether tools GO OUT — `AIPromptRunner`'s gate does, from metadata,
     * exactly as it does in production. All the cell controls is whether any were offered. That
     * split matters for what a comparison number means: a `native` cell whose model or prompt is not
     * configured for native mode does not quietly become a native run, it records an envelope one,
     * and the mismatch shows up here rather than as an unexplained delta in the scorecard.
     */
    private applyToolCallingMode(
        params: AIPromptParams,
        config: PromptEvalConfig,
        context: DriverExecutionContext
    ): void {
        if ((config.toolCallingMode ?? 'envelope') === 'envelope') {
            params.tools = undefined;
            params.toolChoice = undefined;
            params.parallelToolCalls = undefined;
            return;
        }
        if (!params.tools?.length) {
            // Worth saying out loud: the cell asked for native mode and there is nothing to declare,
            // so the gate cannot resolve true and this cell is measuring the envelope under a
            // native label. Usually means the agent has no Actions, or the composer dropped them.
            this.logToTestRun(context, 'warn',
                'Cell requested native tool calling but no tool declarations were composed — ' +
                'this run will be recorded as Envelope');
            return;
        }
        if ((config.nativeControlFlow ?? 'envelope') === 'envelope') {
            // The hybrid arm on a model whose catalog says implicit for the gate run: strip the
            // control tools here so the runner's gate resolves 'Native', not 'NativeImplicit'.
            const control = new Set(params.controlFlowToolNames ?? []);
            params.tools = params.tools.filter((t) => !control.has(t.name));
            params.controlFlowToolNames = undefined;
            if (params.tools.length === 0) {
                this.logToTestRun(context, 'warn',
                    'Hybrid cell: only control tools were declared (orchestrator) — this run will be recorded as Envelope');
                params.tools = undefined;
                return;
            }
        }
        if (config.toolChoice) {
            params.toolChoice = config.toolChoice;
        }
    }

    /** Resolves the prompt either directly or through the agent's active prompt binding. */
    private async resolvePrompt(config: PromptEvalConfig, contextUser: UserInfo): Promise<MJAIPromptEntityExtended> {
        const agentId = config.agentId ?? await this.resolveAgentIdByName(config.agentName, contextUser);
        const promptId = config.promptId ?? await this.findAgentPromptId(agentId, contextUser);
        const prompt = AIEngine.Instance.Prompts.find((p) => p.ID === promptId);
        if (!prompt) {
            throw new Error(`Prompt '${promptId}' not found in AIEngine metadata`);
        }
        return prompt;
    }

    /** Agent name -> ID. Returns undefined when no name was given, so `agentId` can be absent too. */
    private async resolveAgentIdByName(agentName: string | undefined, contextUser: UserInfo): Promise<string | undefined> {
        if (!agentName) {
            return undefined;
        }
        const result = await new RunView().RunView({
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${agentName.replace(/'/g, "''")}'`,
            ResultType: 'simple'
        }, contextUser);
        // RunView reports failure by returning Success:false, never by throwing. Folding that into
        // "0 rows" made a failed query indistinguishable from a missing agent — and the two need
        // completely different fixes, so the message has to say which one happened.
        if (!result.Success) {
            throw new Error(`Could not query 'MJ: AI Agents' for '${agentName}': ${result.ErrorMessage ?? 'no error message'}`);
        }
        const rows = (result.Results ?? []) as Array<{ ID: string }>;
        if (rows.length !== 1) {
            throw new Error(`Agent '${agentName}' resolved to ${rows.length} rows — expected exactly one`);
        }
        return rows[0].ID;
    }

    private async findAgentPromptId(agentId: string | undefined, contextUser: UserInfo): Promise<string> {
        if (!agentId) {
            throw new Error('Configuration requires promptId, agentId or agentName');
        }
        const result = await new RunView().RunView<MJAIAgentPromptEntity>({
            EntityName: 'MJ: AI Agent Prompts',
            ExtraFilter: `AgentID='${agentId}' AND Status='Active'`,
            OrderBy: 'ExecutionOrder',
            ResultType: 'entity_object'
        }, contextUser);
        const first = result.Success ? result.Results?.[0] : undefined;
        if (!first) {
            throw new Error(`Agent '${agentId}' has no active prompt binding`);
        }
        return first.PromptID;
    }

    /**
     * Runs the configured oracles.
     *
     * A missing oracle becomes a FAILED result naming it, rather than being skipped. Skipping is
     * how `trace-validate-sub-agents` went unimplemented while the tests referencing it reported
     * green — a quarter of their weight silently left the score. A weighted check that cannot run
     * is a failure of the test, not an absence of one.
     */
    private async runOracles(
        config: PromptEvalConfig,
        actualOutput: PromptEvalActualOutput,
        result: AIPromptRunResult,
        expected: Record<string, unknown>,
        context: DriverExecutionContext
    ): Promise<OracleResult[]> {
        const results: OracleResult[] = [];
        for (const oracleConfig of config.oracles ?? []) {
            const oracle = context.oracleRegistry.get(oracleConfig.type);
            if (!oracle) {
                results.push({
                    oracleType: oracleConfig.type,
                    passed: false,
                    score: 0,
                    message: `Oracle '${oracleConfig.type}' is not registered — its weight cannot be scored`
                });
                continue;
            }
            const oracleInput: OracleInput = {
                test: context.test,
                expectedOutput: expected,
                actualOutput,
                targetEntity: result.promptRun,
                contextUser: context.contextUser
            };
            try {
                results.push(await oracle.evaluate(oracleInput, oracleConfig.config ?? {}));
            } catch (error) {
                results.push({
                    oracleType: oracleConfig.type,
                    passed: false,
                    score: 0,
                    message: `Oracle execution failed: ${(error as Error).message}`
                });
            }
        }
        return results;
    }

    public override async Validate(test: MJTestEntity): Promise<ValidationResult> {
        const base = await super.Validate(test);
        if (!base.valid) {
            return base;
        }
        try {
            const config = this.parseConfig<PromptEvalConfig>(test);
            const errors = base.errors ?? [];
            if (!config.promptId && !config.agentId) {
                errors.push({ category: 'configuration', message: 'Either promptId or agentId is required', field: 'Configuration.promptId' });
            }
            if (!config.oracles?.length) {
                errors.push({ category: 'configuration', message: 'At least one oracle is required', field: 'Configuration.oracles' });
            }
            return { ...base, valid: errors.length === 0, errors };
        } catch (error) {
            return {
                valid: false,
                errors: [{ category: 'configuration', message: `Configuration validation failed: ${(error as Error).message}`, field: 'Configuration' }],
                warnings: []
            };
        }
    }

    private getPromptRunsEntityId(): string | null {
        if (this._promptRunsEntityId === null) {
            this._promptRunsEntityId = this._metadata.Entities.find(
                (e) => e.Name === PromptEvalDriver.AI_PROMPT_RUNS_ENTITY_NAME
            )?.ID ?? null;
        }
        return this._promptRunsEntityId;
    }
}
