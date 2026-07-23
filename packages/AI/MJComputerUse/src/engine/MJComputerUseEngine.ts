/**
 * MJ-aware Computer Use engine subclass.
 *
 * MJComputerUseEngine extends the base ComputerUseEngine to integrate
 * with MemberJunction's infrastructure:
 *
 * - **Prompt execution** routes through AIPromptRunner for template
 *   rendering, model selection, prompt run logging, and token tracking
 * - **Credential resolution** maps MJDomainAuthBinding with MJCredentialEntity
 *   to concrete AuthMethod instances (API Key, Basic, OAuth, Bearer)
 * - **Action-to-tool wrapping** exposes MJ Actions as ComputerUseTool
 *   instances so the controller LLM can invoke them
 * - **Media persistence** saves step screenshots as AIPromptRunMedia entities
 * - **Agent run linkage** links all prompt runs to a parent agent run
 */

import { LogError, LogStatus, Metadata, RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, MJAIPromptEntityExtended, MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { ChatMessageRole, createBase64DataUrl } from '@memberjunction/ai';
import type { ChatMessage, ChatMessageContentBlock } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    MJActionEntity,
    MJActionParamEntity,
    MJAIPromptRunMediaEntity,
    MJCredentialEntity,
} from '@memberjunction/core-entities';

import {
    ComputerUseEngine,
    ComputerUseResult,
    ComputerUseError,
    ControllerPromptRequest,
    ControllerPromptResponse,
    JudgePromptRequest,
    JudgePromptResponse,
    ResponseParser,
    DomainAuthBinding,
    ComputerUseTool,
    JsonSchema,
    JsonSchemaProperty,
    StepRecord,
    ModelConfig,
    InteractiveElement,
    TraceTarget,
} from '@memberjunction/computer-use';
import type { JsonSchemaType, AuthMethod, ComputerUseTrace } from '@memberjunction/computer-use';

import { MJRunComputerUseParams, MJDomainAuthBinding, ActionRef, PromptEntityRef } from '../types/mj-params.js';
import { AgentRunStepTracker } from './agent-run-step-tracker.js';

/**
 * Default stored-prompt name the goal loop's controller uses when the caller pins neither a prompt nor a
 * model — the golden-source "Computer Use - Controller" metadata prompt (template + model selection). See
 * the FLIP in {@link MJComputerUseEngine.Run}.
 */
export const DEFAULT_CONTROLLER_PROMPT_NAME = 'Computer Use - Controller';

/**
 * Default stored-prompt name the judge uses when the caller pins neither a judge prompt nor a judge model —
 * the "Computer Use - Judge" metadata prompt. See the FLIP in {@link MJComputerUseEngine.Run}.
 */
export const DEFAULT_JUDGE_PROMPT_NAME = 'Computer Use - Judge';

/**
 * Default stored-prompt name for the self-heal LLM disambiguation seam (RI-C2 /
 * CU-C3 leg 1b). Resolved from metadata like the controller/judge prompts;
 * absent → {@link MJComputerUseEngine.healTargetViaLLM} keeps the base behavior
 * (deterministic heal only, confidence 0). Only invoked on the replay-with-heal
 * tier when deterministic role+name re-resolution is ambiguous.
 */
export const DEFAULT_HEAL_PROMPT_NAME = 'Computer Use - Heal';

/**
 * Picks the highest-power LLM that supports Image **input** (a vision-capable controller), or `undefined`
 * when none qualify. Filters the candidate models to the `LLM` type, narrows to those for which
 * `supportsImageInput` is true, then returns the one with the highest `PowerRank` (descending).
 *
 * Pure (no engine/singleton state) so it is unit-testable in isolation; {@link MJComputerUseEngine}'s
 * `selectHighestPowerVisionLLM` supplies `AIEngine.Instance.Models` + an `AIEngine.ModelSupportsModality`
 * predicate. The original input array is not mutated.
 *
 * @param models The candidate models (typically `AIEngine.Instance.Models`).
 * @param supportsImageInput Predicate: does the model id accept Image input modality?
 * @returns The best vision-capable LLM, or `undefined` when none qualify.
 */
export function pickHighestPowerVisionLLM(
    models: MJAIModelEntityExtended[],
    supportsImageInput: (modelId: string) => boolean,
): MJAIModelEntityExtended | undefined {
    const visionLLMs = models
        .filter((m) => typeof m.AIModelType === 'string' && m.AIModelType.trim().toLowerCase() === 'llm')
        .filter((m) => supportsImageInput(m.ID));
    if (visionLLMs.length === 0) {
        return undefined;
    }
    return [...visionLLMs].sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0))[0];
}

export class MJComputerUseEngine extends ComputerUseEngine {
    private promptRunner: AIPromptRunner;
    private contextUser: UserInfo | undefined;
    private agentRunId: string | undefined;
    private lastPromptRunId: string | undefined;
    private lastJudgePromptRunId: string | undefined;
    private _provider: IMetadataProvider | null = null;

    /**
     * When the run is linked to a parent agent-run step (AgentRunId + AgentRunStepID), this tracker nests a
     * child `Prompt` step per controller/judge prompt under it. Undefined when no step linkage was supplied.
     */
    private stepTracker: AgentRunStepTracker | undefined;

    /**
     * Optional metadata provider override. Callers should set
     * `instance.Provider = providerToUse` before invoking `Run()`
     * in multi-provider contexts. Falls back to the global default provider when unset.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    /** Resolved prompt entities — populated in Run() from PromptEntityRef refs */
    private controllerPromptEntity: MJAIPromptEntityExtended | undefined;
    private judgePromptEntity: MJAIPromptEntityExtended | undefined;
    private healPromptEntity: MJAIPromptEntityExtended | undefined;

    /** Per-test controller generation overrides (CU-E6), populated in Run(). */
    private controllerGeneration?: { temperature?: number; effortLevel?: number };

    constructor() {
        super();
        this.promptRunner = new AIPromptRunner();
    }

    // ═══════════════════════════════════════════════════════════
    // PUBLIC API OVERRIDE
    // ═══════════════════════════════════════════════════════════

    /**
     * Replay a recorded trace on the deterministic tier. The RI-C1 driver
     * dispatch calls this instead of {@link Run} when a valid trace exists; the
     * base {@link ComputerUseEngine.Replay} owns the full replay/heal/postcondition
     * loop. This override primes the MJ-specific fields the replay tier needs:
     * `contextUser`, the resolved "Computer Use - Heal" prompt (so
     * {@link healTargetViaLLM} can disambiguate a drifted target through
     * AIPromptRunner instead of its confidence-0 no-op), and the "Computer Use -
     * Judge" prompt so the base loop can score the replayed end-state for
     * goal-completion parity with the LLM tier — the driver returns a Completed
     * replay directly with no LLM leg, so the goal verdict must originate here.
     * Run()'s controller/tools setup is deliberately skipped — replay never
     * invokes the controller.
     */
    public override async Replay(trace: ComputerUseTrace, params: MJRunComputerUseParams): Promise<ComputerUseResult> {
        this.contextUser = params.ContextUser;
        this.agentRunId = params.AgentRunId;
        // Resolve the heal-disambiguation prompt (non-throwing; absent ⇒ deterministic-only heal).
        if (!this.healPromptEntity) {
            this.healPromptEntity = await this.resolveDefaultPromptByName(DEFAULT_HEAL_PROMPT_NAME);
        }
        // Resolve the judge prompt exactly as Run() does — the base replay loop now
        // judges the end-state, and without a judge prompt (nor a JudgeModel) the
        // goal-completion oracle has no verdict and every replayed test auto-fails.
        this.judgePromptEntity = await this.resolvePromptRef(params.JudgePromptRef);
        if (!this.judgePromptEntity && !params.JudgeModel) {
            this.judgePromptEntity = await this.resolveDefaultPromptByName(DEFAULT_JUDGE_PROMPT_NAME);
        }
        return super.Replay(trace, params);
    }

    /**
     * Execute a Computer Use run with MJ infrastructure integration.
     *
     * Before calling the base Run():
     * 1. Stashes MJ-specific fields (contextUser, agentRunId)
     * 2. Resolves MJDomainAuthBindings with MJCredentialEntity → AuthMethod
     * 3. Wraps MJ Actions as ComputerUseTool instances
     *
     * Then delegates to super.Run() which handles the full execution loop.
     */
    public override async Run(params: MJRunComputerUseParams): Promise<ComputerUseResult> {
        this.contextUser = params.ContextUser;
        this.agentRunId = params.AgentRunId;
        this.controllerGeneration = params.ControllerGeneration;   // per-test determinism knobs (CU-E6)
        this.lastPromptRunId = undefined;
        this.lastJudgePromptRunId = undefined;

        // When linked to a parent agent-run step, nest a child Prompt step per prompt under it.
        this.stepTracker = undefined;
        if (params.AgentRunId && params.AgentRunStepID) {
            const tracker = new AgentRunStepTracker(this.Provider, this.contextUser, params.AgentRunId, params.AgentRunStepID);
            await tracker.Init();
            this.stepTracker = tracker;
        }

        // Resolve prompt entity refs → full MJAIPromptEntityExtended (explicit caller override first).
        this.controllerPromptEntity = await this.resolvePromptRef(params.ControllerPromptRef);
        this.judgePromptEntity = await this.resolvePromptRef(params.JudgePromptRef);

        // FLIP THE DEFAULT: when the caller pinned neither a prompt nor a model, default the controller +
        // judge to the stored "Computer Use - Controller"/"- Judge" metadata prompts — the golden source of
        // BOTH the prompt text AND model selection (Gemini 3.1 Flash-Lite → Haiku 4.5 → GPT 5.5 by priority).
        // This routes the goal loop through AIPromptRunner with the prompt's configured models + prompt-run
        // logging, instead of the legacy "auto-select a vision model + built-in code prompt" path. Resolution
        // is non-throwing — if the stored prompt is absent from metadata we fall through to that legacy path,
        // so the engine never hard-fails (and standalone/no-metadata callers are unaffected).
        if (!this.controllerPromptEntity && !params.ControllerModel) {
            this.controllerPromptEntity = await this.resolveDefaultPromptByName(DEFAULT_CONTROLLER_PROMPT_NAME);
        }
        if (!this.judgePromptEntity && !params.JudgeModel) {
            this.judgePromptEntity = await this.resolveDefaultPromptByName(DEFAULT_JUDGE_PROMPT_NAME);
        }
        // Self-heal disambiguation prompt (RI-C2) — resolved like controller/judge.
        // Absent is fine: healTargetViaLLM then keeps the base confidence-0 behavior
        // (deterministic heal only). Non-throwing.
        if (!this.healPromptEntity) {
            this.healPromptEntity = await this.resolveDefaultPromptByName(DEFAULT_HEAL_PROMPT_NAME);
        }

        // If STILL no controller prompt or model (the stored default is missing too), auto-select the best
        // vision-capable LLM from MJ metadata. The base engine already has a DEFAULT_CONTROLLER_PROMPT, so
        // all we need is a model to send it to.
        if (!this.controllerPromptEntity && !params.ControllerModel) {
            const autoModel = await this.autoSelectControllerModel();
            if (!autoModel) {
                const result = new ComputerUseResult();
                result.Status = 'Error';
                result.Success = false;
                result.Error = new ComputerUseError(
                    'LLMError',
                    'No controller configured and no vision-capable AI model found in metadata. ' +
                    'Either set ControllerPromptRef, set ControllerModel, or ensure at least one ' +
                    'active LLM with Image input modality exists in the AI Models entity.'
                );
                LogError(result.Error.Message);
                return result;
            }
            params.ControllerModel = autoModel;
        }

        // Resolve MJ credential-backed auth bindings
        if (params.Auth?.Bindings) {
            params.Auth.Bindings = await this.resolveAuthBindings(params.Auth.Bindings);
        }

        // Wrap MJ Actions as tools for the controller LLM
        if (params.Actions && params.Actions.length > 0) {
            const actionTools = await this.wrapActionsAsTools(params.Actions);
            params.Tools = [...(params.Tools ?? []), ...actionTools];
        }

        try {
            return await super.Run(params);
        } finally {
            // Flush the fire-and-forget child step saves now that the goal is done (no-op when untracked).
            await this.stepTracker?.Flush();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // PROTECTED OVERRIDES
    // ═══════════════════════════════════════════════════════════

    /**
     * Route controller prompt through MJ AIPromptRunner.
     *
     * If a ControllerPromptRef was resolved to an entity, uses AIPromptRunner
     * for full MJ integration (template rendering, model selection,
     * prompt run logging, token tracking). Otherwise falls back to
     * the base implementation (direct LLM call).
     */
    protected override async executeControllerPrompt(
        request: ControllerPromptRequest
    ): Promise<ControllerPromptResponse> {
        if (!this.controllerPromptEntity) {
            this.log('No ControllerPromptRef set — falling back to base LLM call');
            return super.executeControllerPrompt(request);
        }
        const promptEntity = this.controllerPromptEntity;

        try {
            this.log(`Executing controller prompt via AIPromptRunner (prompt: "${promptEntity.Name}")`);
            const result = await this.executePromptViaRunner(promptEntity, {
                goal: request.Goal,
                currentScreenshot: request.CurrentScreenshot,
                screenshotHistory: request.ScreenshotHistory,
                toolDefinitions: request.ToolDefinitions,
                judgeFeedback: request.JudgeFeedback,
                loopEvidence: request.LoopEvidence,
                diagnostics: request.Diagnostics,
                interactiveElements: request.InteractiveElements,
                hints: request.Hints,
                previousAttemptSummary: request.PreviousAttemptSummary,
                currentDate: request.CurrentDate,
                memory: request.Memory,
                plan: request.Plan,
                currentUrl: request.CurrentUrl,
                stepNumber: request.StepNumber,
                maxSteps: request.MaxSteps,
                formLoginCredentials: request.FormLoginCredentials,
                previousStepSummary: request.PreviousStepSummary,
                applicationContext: request.ApplicationContext,
            }, request.Signal, this.controllerGeneration);

            if (!result.success) {
                this.logError(`AIPromptRunner failed: ${result.errorMessage ?? 'unknown error'}`);
                const response = new ControllerPromptResponse();
                response.Reasoning = `AIPromptRunner failed: ${result.errorMessage ?? 'unknown error'}`;
                response.RawResponse = response.Reasoning;
                return response;
            }

            // Track prompt run ID for media persistence
            if (result.promptRun?.ID) {
                this.lastPromptRunId = result.promptRun.ID;
            }

            const rawText = result.rawResult ?? '';
            this.log(`AIPromptRunner response: ${rawText.length} chars`);
            this.log(`AIPromptRunner raw response (first 1000 chars): ${rawText.substring(0, 1000)}`);
            return ResponseParser.ParseControllerResponse(rawText);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logError(`MJ controller prompt threw exception: ${message}`);
            const response = new ControllerPromptResponse();
            response.Reasoning = `MJ controller prompt error: ${message}`;
            response.RawResponse = response.Reasoning;
            return response;
        }
    }

    /**
     * Route judge prompt through MJ AIPromptRunner.
     *
     * If a JudgePromptRef was resolved to an entity, uses AIPromptRunner.
     * Otherwise falls back to the base implementation.
     */
    protected override async executeJudgePrompt(
        request: JudgePromptRequest
    ): Promise<JudgePromptResponse> {
        if (!this.judgePromptEntity) {
            return super.executeJudgePrompt(request);
        }
        const promptEntity = this.judgePromptEntity;

        try {
            const result = await this.executePromptViaRunner(promptEntity, {
                goal: request.Goal,
                currentScreenshot: request.CurrentScreenshot,
                screenshotHistory: request.ScreenshotHistory,
                stepSummary: request.StepSummary,
                stepNumber: request.StepNumber,
                maxSteps: request.MaxSteps,
                currentUrl: request.CurrentUrl,
                diagnostics: request.Diagnostics,
                validationCriteria: request.ValidationCriteria,
            }, request.Signal);

            if (!result.success) {
                const response = new JudgePromptResponse();
                response.Reason = `AIPromptRunner failed: ${result.errorMessage ?? 'unknown error'}`;
                response.RawResponse = response.Reason;
                return response;
            }

            // Track the judge prompt run ID for step-level correlation (CU-F2).
            if (result.promptRun?.ID) {
                this.lastJudgePromptRunId = result.promptRun.ID;
            }

            const response = new JudgePromptResponse();
            response.RawResponse = result.rawResult ?? '';
            return response;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const response = new JudgePromptResponse();
            response.Reason = `MJ judge prompt error: ${message}`;
            response.RawResponse = response.Reason;
            return response;
        }
    }

    /**
     * LLM heal disambiguation (RI-C2 / CU-C3 leg 1b). Overrides the base no-op:
     * when deterministic role+name re-resolution can't uniquely re-find a drifted
     * target, ask the cheap "Computer Use - Heal" prompt which of the CURRENT
     * indexed elements is the intended one, returning `{ index, confidence }`. The
     * caller's `shouldAcceptHeal` gate (0.6) decides whether to trust it — a
     * low-confidence heal still fails the step rather than guessing.
     *
     * Fail-soft everywhere: no heal prompt in metadata, a failed/errored prompt
     * run, or an unparseable response all return confidence 0 — heal then only
     * succeeds on the deterministic path, exactly as before this override existed.
     *
     * NOTE (RI-C2): this AIPromptRunner routing mirrors the proven controller/judge
     * path. It runs on the replay-with-heal tier, which the RI-C1 driver dispatch
     * now reaches; the MJ {@link Replay} override primes `healPromptEntity` so this
     * override is live rather than the base confidence-0 no-op. The response parser
     * below is pure + tested.
     */
    protected override async healTargetViaLLM(request: {
        instruction: string;
        goal: string;
        elements: InteractiveElement[];
        recorded: TraceTarget;
    }): Promise<{ index?: number; confidence: number }> {
        if (!this.healPromptEntity) {
            return { confidence: 0 };
        }
        try {
            const result = await this.executePromptViaRunner(this.healPromptEntity, {
                goal: request.goal,
                instruction: request.instruction,
                recordedTarget: {
                    role: request.recorded.Role,
                    name: request.recorded.Name,
                    selector: request.recorded.Selector,
                },
                elements: request.elements.map((e, index) => ({
                    index,
                    role: e.Role,
                    name: e.Name,
                    selector: e.Selector,
                })),
            });
            if (!result.success) {
                this.logError(`Heal prompt failed: ${result.errorMessage ?? 'unknown error'}`);
                return { confidence: 0 };
            }
            return MJComputerUseEngine.parseHealResponse(result.rawResult ?? '');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logError(`MJ heal prompt threw: ${message}`);
            return { confidence: 0 };
        }
    }

    /**
     * Parse the heal prompt's JSON `{ index, confidence }` response (RI-C2). Pure +
     * static so it is unit-testable without an engine. Tolerant: strips a fenced
     * code block; a missing / non-integer / negative index or non-numeric
     * confidence yields `{ confidence: 0 }` (no disambiguation); confidence is
     * clamped to [0, 1]. A confident heal MUST name an index.
     */
    public static parseHealResponse(raw: string): { index?: number; confidence: number } {
        try {
            const jsonText = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const parsed = JSON.parse(jsonText) as { index?: unknown; confidence?: unknown };
            const index = typeof parsed.index === 'number' && Number.isInteger(parsed.index) && parsed.index >= 0
                ? parsed.index
                : undefined;
            if (index === undefined) {
                return { confidence: 0 };
            }
            const rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
            return { index, confidence: Math.max(0, Math.min(1, rawConfidence)) };
        } catch {
            return { confidence: 0 };
        }
    }

    /**
     * Persist step screenshot as AIPromptRunMedia entity.
     *
     * Links the screenshot to the most recent prompt run (from
     * the controller call in this step). Fire-and-forget — media
     * persistence errors are logged but don't fail the run.
     */
    protected override onStepComplete(step: StepRecord, params: MJRunComputerUseParams): void {
        // Correlate the step with the LLM prompt runs it produced (CU-F2), so
        // tokens/cost/serving-model can be joined from AIPromptRun. The controller
        // runs every step; the judge only when this step was judged.
        step.ControllerPromptRunId = this.lastPromptRunId;
        if (step.JudgeVerdict) {
            step.JudgePromptRunId = this.lastJudgePromptRunId;
        }

        // Persist the step screenshot as AIPromptRunMedia. Opt-OUT via
        // PersistStepMedia=false (CU-G1): the regression suite disables this so
        // it stops writing tens of GB of base64 PNGs, mid-run and unthrottled,
        // into the very SQL Server serving the app under test (a direct
        // contributor to second-half render degradation). Default preserves the
        // prior always-persist behavior for other consumers.
        if (params.PersistStepMedia !== false && step.Screenshot && this.lastPromptRunId && this.contextUser) {
            this.persistStepMedia(step, params.BrowserConfig?.ViewportHeight, params.BrowserConfig?.ViewportWidth).catch(err => {
                LogError(`Failed to persist step ${step.StepNumber} media: ${err instanceof Error ? err.message : String(err)}`);
            });
        }
    }

    /**
     * Hook for run completion.
     * Currently logs completion status. Can be extended to update
     * agent run records or trigger post-run workflows.
     */
    protected override onRunComplete(result: ComputerUseResult): void {
        LogStatus(`Computer Use run complete: ${result.Status} (${result.TotalSteps} steps, ${result.TotalDurationMs}ms)`);
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT RESOLUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Resolve a PromptEntityRef to a full MJAIPromptEntityExtended.
     *
     * Uses AIEngine's in-memory Prompts cache for fast lookup.
     * Looks up by PromptId first (if set), then by PromptName.
     * Returns undefined if the ref is not provided.
     * Throws if the ref is provided but the prompt is not found.
     */
    private async resolvePromptRef(
        ref: PromptEntityRef | undefined
    ): Promise<MJAIPromptEntityExtended | undefined> {
        if (!ref) return undefined;
        if (!ref.PromptId && !ref.PromptName) return undefined;

        // Ensure AIEngine metadata is loaded before accessing Prompts
        await AIEngine.Instance.Config(false, this.contextUser);

        let prompt: MJAIPromptEntityExtended | undefined;
        if (ref.PromptId) {
            prompt = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, ref.PromptId));
        } else if (ref.PromptName) {
            // Case-insensitive, trimmed match (CU-E6) — mirrors the repo's
            // EntityByName convention; a stray case/whitespace difference in a
            // test's PromptName should still resolve.
            const target = ref.PromptName.trim().toLowerCase();
            prompt = AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === target);
        }

        if (!prompt) {
            const identifier = ref.PromptId ?? ref.PromptName;
            throw new Error(
                `AI Prompt "${identifier}" not found. ` +
                `Verify the prompt exists in the AI Prompts entity.`
            );
        }

        return prompt;
    }

    /**
     * Resolves a DEFAULT prompt by name from the AIEngine cache — the goal-loop FLIP's golden-source lookup.
     * Unlike {@link resolvePromptRef}, this is **non-throwing**: a missing default (e.g. the metadata isn't
     * seeded, or a standalone caller) returns `undefined` and the engine falls through to its legacy
     * auto-select path, so the default-to-stored-prompt behavior degrades gracefully and never hard-fails.
     *
     * @param name The stored prompt name (e.g. {@link DEFAULT_CONTROLLER_PROMPT_NAME}).
     * @returns The prompt entity, or `undefined` when not present in metadata.
     */
    private async resolveDefaultPromptByName(name: string): Promise<MJAIPromptEntityExtended | undefined> {
        await AIEngine.Instance.Config(false, this.contextUser);
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === name && p.Status === 'Active');
        if (!prompt) {
            this.log(`Default stored prompt "${name}" not found/active in metadata — falling back to auto-selection.`);
        }
        return prompt;
    }

    /**
     * Auto-select the best controller model from MJ metadata.
     *
     * Uses the canonical MJ pattern: AIEngine.GetHighestPowerLLM()
     * which returns the highest-PowerRank active LLM across all vendors.
     *
     * Returns undefined if no active LLM exists at all.
     */
    private async autoSelectControllerModel(): Promise<ModelConfig | undefined> {
        // Make sure model metadata is warm (cheap no-op when already loaded).
        await AIEngine.Instance.Config(false, this.contextUser);

        // The controller drives the browser from SCREENSHOTS, so it MUST accept image input. Prefer the
        // highest-power LLM that explicitly advertises Image *input* modality; fall back to the plain
        // highest-power LLM only when none do (e.g. a deployment relying on AIModelType-inherited
        // modalities that aren't captured as explicit AIModelModality rows) so selection never hard-fails.
        const vision = this.selectHighestPowerVisionLLM();
        const selected = vision ?? (await AIEngine.Instance.GetHighestPowerLLM(undefined, this.contextUser));
        if (!selected) return undefined;

        const vendor = selected.Vendor ?? 'unknown';
        const model = selected.APIName ?? selected.Name;
        const driverClass = selected.DriverClass ?? undefined;

        LogStatus(
            `Auto-selected controller model: ${vendor}:${model} ` +
            `(PowerRank=${selected.PowerRank ?? 0}, driver=${driverClass ?? 'auto'}, vision=${vision ? 'yes' : 'fallback'})`,
        );

        return new ModelConfig(vendor, model, driverClass);
    }

    /**
     * Returns the highest-power LLM that explicitly supports Image **input** (vision), or `undefined`
     * when none do. Mirrors `GetHighestPowerModel`'s LLM-type filter, then narrows to vision-capable
     * models via `AIEngine.ModelSupportsModality` before ranking by `PowerRank` (descending).
     *
     * Note: `ModelSupportsModality` reads explicit `AIModelModality` rows; a model that inherits Image
     * input from its `AIModelType` without an explicit row won't match here — that's the documented
     * fall-back case in {@link autoSelectControllerModel}.
     */
    private selectHighestPowerVisionLLM(): MJAIModelEntityExtended | undefined {
        return pickHighestPowerVisionLLM(
            AIEngine.Instance.Models,
            (modelId) => AIEngine.Instance.ModelSupportsModality(modelId, 'Image', 'Input'),
        );
    }

    // ═══════════════════════════════════════════════════════════
    // PROMPT EXECUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute a prompt via AIPromptRunner with standard MJ integration.
     * Shared by both controller and judge prompt execution paths.
     *
     * Screenshots are extracted from the data object and sent as image
     * content blocks in conversationMessages (not as template variables),
     * since vision models require actual image attachments rather than
     * base64 strings embedded in text.
     */
    private async executePromptViaRunner(
        promptEntity: MJAIPromptEntityExtended,
        data: Record<string, unknown>,
        signal?: AbortSignal,
        generation?: { temperature?: number; effortLevel?: number }
    ) {
        // Extract screenshot fields — these go as image messages, not template data
        const currentScreenshot = data.currentScreenshot as string | undefined;
        const screenshotHistory = data.screenshotHistory as string[] | undefined;

        // Build template-only data (exclude binary screenshot fields)
        const templateData = { ...data };
        delete templateData.currentScreenshot;
        delete templateData.screenshotHistory;

        // Build image conversation messages for the vision model
        const conversationMessages = this.buildScreenshotMessages(currentScreenshot, screenshotHistory);

        const params = new AIPromptParams();
        params.prompt = promptEntity;
        params.data = templateData;
        params.contextUser = this.contextUser;
        params.agentRunId = this.agentRunId;
        params.attemptJSONRepair = true;
        // Cancellation (CU-B8): let engine.Stop() abort an in-flight LLM call so a
        // cancelled run releases its worker slot in seconds instead of at step end.
        if (signal) {
            params.cancellationToken = signal;
        }
        // Per-test generation overrides (CU-E6): determinism knobs (e.g. temp≈0
        // for pinned regression runs). temperature rides additionalParameters;
        // effortLevel is a first-class AIPromptParams field.
        if (generation?.temperature != null) {
            params.additionalParameters = { ...params.additionalParameters, temperature: generation.temperature };
        }
        if (generation?.effortLevel != null) {
            params.effortLevel = generation.effortLevel;
        }

        if (conversationMessages.length > 0) {
            params.conversationMessages = conversationMessages;
        }

        // Nest a child `Prompt` step under the goal's parent step (no-op when step-tracking is inactive),
        // finalizing it with the produced prompt-run id whether the prompt succeeds, fails, or throws.
        const step = this.stepTracker ? await this.stepTracker.BeginPromptStep(promptEntity) : null;
        try {
            const result = await this.promptRunner.ExecutePrompt(params);
            this.stepTracker?.EndPromptStep(step, result.promptRun?.ID, result.success, result.errorMessage); // fire-and-forget
            return result;
        } catch (err) {
            this.stepTracker?.EndPromptStep(step, undefined, false, err instanceof Error ? err.message : String(err));
            throw err;
        }
    }

    /**
     * Build ChatMessage array with screenshot images for the vision model.
     *
     * Includes screenshot history (oldest → newest) followed by the
     * current screenshot, each as an image_url content block.
     */
    private buildScreenshotMessages(
        currentScreenshot: string | undefined,
        screenshotHistory: string[] | undefined
    ): ChatMessage[] {
        const messages: ChatMessage[] = [];

        // Include screenshot history if available. The engine's ring buffer ends
        // with the CURRENT frame, which is also sent on its own below — so drop
        // that trailing duplicate to avoid transmitting the current frame twice
        // (CU-A5: ~25% of image payload at the fleet's history depth).
        const allHistory = screenshotHistory?.filter(s => s.length > 0) ?? [];
        const historyImages = (currentScreenshot && allHistory.length > 0 && allHistory[allHistory.length - 1] === currentScreenshot)
            ? allHistory.slice(0, -1)
            : allHistory;
        if (historyImages.length > 0) {
            const historyContent: ChatMessageContentBlock[] = [
                {
                    type: 'text' as const,
                    content: `Here are the ${historyImages.length} most recent screenshots showing how the page has changed (oldest first):`,
                },
                ...historyImages.map((img) => ({
                    type: 'image_url' as const,
                    content: createBase64DataUrl(img, 'image/png'),
                    mimeType: 'image/png',
                } as ChatMessageContentBlock)),
            ];
            messages.push({
                role: ChatMessageRole.user,
                content: historyContent,
            });
        }

        // Include current screenshot
        if (currentScreenshot) {
            messages.push({
                role: ChatMessageRole.user,
                content: [
                    {
                        type: 'text' as const,
                        content: 'Here is the current screenshot of the browser. Analyze it and decide what to do next.',
                    },
                    {
                        type: 'image_url' as const,
                        content: createBase64DataUrl(currentScreenshot, 'image/png'),
                        mimeType: 'image/png',
                    },
                ],
            });
        }

        return messages;
    }

    // ═══════════════════════════════════════════════════════════
    // CREDENTIAL RESOLUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Resolve all MJDomainAuthBinding instances that have Credential set.
     * Maps MJCredentialEntity → concrete AuthMethod based on CredentialType.
     * Returns a clean DomainAuthBinding[] that the base engine can consume.
     */
    private async resolveAuthBindings(
        bindings: DomainAuthBinding[]
    ): Promise<DomainAuthBinding[]> {
        const resolved: DomainAuthBinding[] = [];

        for (const binding of bindings) {
            if (binding instanceof MJDomainAuthBinding && binding.Credential) {
                const resolvedBinding = await this.resolveCredentialBinding(binding);
                resolved.push(resolvedBinding);
            } else {
                resolved.push(binding);
            }
        }

        return resolved;
    }

    /**
     * Resolve a single MJDomainAuthBinding with a MJCredentialEntity
     * into a plain DomainAuthBinding with a concrete AuthMethod.
     */
    private async resolveCredentialBinding(
        binding: MJDomainAuthBinding
    ): Promise<DomainAuthBinding> {
        const credential = binding.Credential!;
        const credTypeName = credential.CredentialType;
        const values = this.parseCredentialValues(credential);
        const method = this.mapCredentialToAuthMethod(credTypeName, values);

        const resolved = new DomainAuthBinding();
        resolved.Domains = binding.Domains;
        resolved.Method = method;
        return resolved;
    }

    /**
     * Parse the credential's Values JSON string into a record.
     * Values is auto-decrypted by MJ's field-level encryption on load.
     */
    private parseCredentialValues(credential: MJCredentialEntity): Record<string, string> {
        try {
            return JSON.parse(credential.Values) as Record<string, string>;
        } catch {
            throw new Error(
                `Failed to parse credential values for "${credential.Name}". ` +
                `Ensure the credential's Values field contains valid JSON.`
            );
        }
    }

    /**
     * Map a credential type name + decrypted values to a concrete AuthMethod.
     *
     * The mapping is deterministic based on the CredentialType.Name:
     * - "API Key"                   → APIKeyHeaderAuthMethod
     * - "API Key with Endpoint"     → BearerTokenAuthMethod
     * - "Basic Auth"                → BasicAuthMethod (FormLogin default)
     * - "OAuth2 Client Credentials" → OAuthClientCredentialsAuthMethod
     */
    private mapCredentialToAuthMethod(
        credentialTypeName: string,
        values: Record<string, string>
    ): AuthMethod {
        switch (credentialTypeName) {
            case 'API Key':
                return {
                    Type: 'APIKey' as const,
                    Key: values.apiKey ?? values.key ?? '',
                    HeaderName: values.headerName ?? 'Authorization',
                    Prefix: values.prefix ?? 'Bearer ',
                };

            case 'API Key with Endpoint':
                return {
                    Type: 'Bearer' as const,
                    Token: values.apiKey ?? values.token ?? '',
                    HeaderName: values.headerName ?? 'Authorization',
                    Prefix: values.prefix ?? 'Bearer',
                };

            case 'Basic Auth':
                return {
                    Type: 'Basic' as const,
                    Username: values.username ?? '',
                    Password: values.password ?? '',
                    Strategy: 'FormLogin' as const,
                };

            case 'OAuth2 Client Credentials':
                return {
                    Type: 'OAuthClientCredentials' as const,
                    ClientId: values.clientId ?? '',
                    ClientSecret: values.clientSecret ?? '',
                    TokenUrl: values.tokenUrl ?? '',
                    Scope: values.scope,
                };

            default:
                throw new Error(
                    `Unsupported credential type for auth mapping: "${credentialTypeName}". ` +
                    `Use a DomainAuthBinding with an explicit Method instead.`
                );
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ACTION-TO-TOOL WRAPPING
    // ═══════════════════════════════════════════════════════════

    /**
     * Wrap MJ Actions as ComputerUseTool instances.
     *
     * For each ActionRef, loads the action metadata from ActionEngineBase,
     * builds a JSON Schema from ActionParam metadata, and creates a handler
     * that routes to ActionEngineBase.RunAction().
     */
    private async wrapActionsAsTools(
        actionRefs: ActionRef[]
    ): Promise<ComputerUseTool[]> {
        const tools: ComputerUseTool[] = [];
        const actionEngine = ActionEngineBase.Instance;

        // Ensure ActionEngine is configured before accessing Actions/ActionParams
        if (!actionEngine.Loaded) {
            await actionEngine.Config(false, this.contextUser);
        }
        
        LogStatus(`ActionEngine has ${actionEngine.Actions.length} actions, ${actionEngine.ActionParams.length} action params loaded`);

        for (const ref of actionRefs) {
            const action = this.findAction(actionEngine, ref);
            if (!action) {
                LogError(`Action not found: ${ref.ActionName ?? ref.ActionId}`);
                continue;
            }

            let actionParams = this.getActionParams(actionEngine, action.ID);
            if (actionParams.length === 0) {
                // Fallback: query Action Params directly from DB when engine cache is empty
                LogStatus(`Action "${action.Name}" has 0 cached params — querying DB directly`);
                actionParams = await this.loadActionParamsFromDB(action.ID);
            }

            if (actionParams.length === 0) {
                LogStatus(`Warning: Action "${action.Name}" (ID: ${action.ID}) has 0 input params — tool schema will be empty`);
            } else {
                LogStatus(`Action "${action.Name}" has ${actionParams.length} input params: ${actionParams.map(p => p.Name).join(', ')}`);
            }

            const tool = this.buildToolFromAction(action, actionParams);
            tools.push(tool);
        }

        return tools;
    }

    /**
     * Find an action entity by ID or Name.
     */
    private findAction(
        actionEngine: ActionEngineBase,
        ref: ActionRef
    ): MJActionEntity | undefined {
        if (ref.ActionId) {
            return actionEngine.Actions.find(a => UUIDsEqual(a.ID, ref.ActionId));
        }
        if (ref.ActionName) {
            return actionEngine.Actions.find(a => a.Name === ref.ActionName);
        }
        return undefined;
    }

    /**
     * Get action params for a given action from the engine's cached metadata.
     * Uses case-insensitive GUID comparison because the mssql driver returns
     * lowercase GUIDs while MJ entity objects may uppercase them.
     */
    private getActionParams(
        actionEngine: ActionEngineBase,
        actionId: string
    ): MJActionParamEntity[] {
        const normalizedId = actionId.trim().toUpperCase();
        return actionEngine.ActionParams.filter(
            p => p.ActionID.trim().toUpperCase() === normalizedId && (p.Type === 'Input' || p.Type === 'Both')
        );
    }

    /**
     * Fallback: load action params directly from the database via RunView.
     * Used when ActionEngineBase.ActionParams cache doesn't contain params
     * for a given action (e.g., engine was loaded before params were synced).
     */
    private async loadActionParamsFromDB(actionId: string): Promise<MJActionParamEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJActionParamEntity>(
            {
                EntityName: 'Action Params',
                ExtraFilter: `ActionID='${actionId}' AND (Type='Input' OR Type='Both')`,
                ResultType: 'entity_object',
            },
            this.contextUser
        );

        if (!result.Success) {
            LogError(`Failed to load Action Params from DB for action ${actionId}: ${result.ErrorMessage}`);
            return [];
        }

        return result.Results;
    }

    /**
     * Build a ComputerUseTool from an MJActionEntity and its params.
     */
    private buildToolFromAction(
        action: MJActionEntity,
        actionParams: MJActionParamEntity[]
    ): ComputerUseTool {
        const toolName = this.sanitizeToolName(action.Name);
        const inputSchema = this.buildSchemaFromActionParams(actionParams);

        return new ComputerUseTool({
            Name: toolName,
            Description: action.Description ?? action.Name,
            InputSchema: inputSchema,
            Handler: async (args: Record<string, unknown>) => {
                return this.executeActionAsTool(action, args);
            },
        });
    }

    /**
     * Execute an MJ Action via ActionEngineBase and return the result.
     */
    private async executeActionAsTool(
        action: MJActionEntity,
        args: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        if (!this.contextUser) {
            throw new Error(
                `Cannot execute action "${action.Name}" as tool: ContextUser is not set. ` +
                `Ensure MJRunComputerUseParams.ContextUser is provided.`
            );
        }

        // Ensure ActionEngineServer is configured before running actions
        if (!ActionEngineServer.Instance.Loaded) {
            await ActionEngineServer.Instance.Config(false, this.contextUser);
        }

        const actionParams = Object.entries(args).map(([name, value]) => ({
            Name: name,
            Value: value,
            Type: 'Input' as const,
        }));

        const result = await ActionEngineServer.Instance.RunAction({
            Action: action,
            ContextUser: this.contextUser,
            Params: actionParams,
            Filters: [],
        });

        return {
            Success: result.Success,
            Message: result.Message,
            Outputs: result.Params?.filter(p => p.Type === 'Output') ?? [],
        };
    }

    /**
     * Sanitize action name for use as a tool name.
     * LLM function calling requires alphanumeric + underscores.
     */
    private sanitizeToolName(name: string): string {
        return name.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    /**
     * Build a JSON Schema from MJActionParamEntity metadata.
     * Maps ActionParam fields to JSON Schema properties.
     */
    private buildSchemaFromActionParams(params: MJActionParamEntity[]): JsonSchema {
        const schema = new JsonSchema();
        schema.Required = [];

        for (const param of params) {
            const prop = new JsonSchemaProperty();
            prop.Type = this.mapValueTypeToJsonSchemaType(param.ValueType);
            prop.Description = param.Description ?? param.Name;
            schema.Properties[param.Name] = prop;

            if (param.IsRequired) {
                schema.Required.push(param.Name);
            }
        }

        return schema;
    }

    /**
     * Map MJ ActionParam.ValueType to JSON Schema type string.
     */
    private mapValueTypeToJsonSchemaType(
        valueType: string
    ): JsonSchemaType {
        switch (valueType) {
            case 'Scalar':
                return 'string';
            case 'Simple Object':
                return 'object';
            case 'BaseEntity Sub-Class':
                return 'object';
            default:
                return 'string';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MEDIA PERSISTENCE
    // ═══════════════════════════════════════════════════════════

    /**
     * Persist a step's screenshot as an AIPromptRunMedia entity.
     *
     * Links the media to the most recent prompt run (from the controller
     * call in this step). Uses InlineData for base64 storage.
     * Sets ModalityID by looking up the "Image" modality from AIEngine.
     */
    private async persistStepMedia(step: StepRecord, height: number | undefined, width: number | undefined): Promise<void> {
        if (!this.lastPromptRunId || !this.contextUser) return;

        const imageModality = AIEngine.Instance.GetModalityByName('Image');
        if (!imageModality) {
            LogError(`Cannot persist step ${step.StepNumber} media: "Image" modality not found in AIEngine`);
            return;
        }

        const md = this.Provider;
        const mediaEntity = await md.GetEntityObject<MJAIPromptRunMediaEntity>(
            'MJ: AI Prompt Run Medias',
            this.contextUser
        );

        mediaEntity.PromptRunID = this.lastPromptRunId;
        mediaEntity.ModalityID = imageModality.ID;
        mediaEntity.MimeType = 'image/png';
        mediaEntity.InlineData = step.Screenshot;
        mediaEntity.DisplayOrder = step.StepNumber;
        mediaEntity.Width = width ?? null;
        mediaEntity.Height = height ?? null;
        mediaEntity.DurationSeconds = 0;
        let dateTime = new Date().toLocaleString();

        mediaEntity.FileName = `ComputerUse-${dateTime}-step${step.StepNumber}`;
        mediaEntity.Description = step.ControllerReasoning;

        const saved = await mediaEntity.Save();
        if (!saved) {
            LogError(`Failed to save screenshot media for step ${step.StepNumber}: ${mediaEntity.LatestResult?.Message}`);
        }
    }

}
