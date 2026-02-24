/**
 * Core Vision-to-Action engine for browser automation via LLM reasoning.
 *
 * ComputerUseEngine is the orchestrator — it wires together the browser
 * adapter, auth handler, navigation guard, judge, tool provider, and
 * controller prompt into a coherent execution loop:
 *
 *   Run(params) → launch browser → auth setup → navigate → step loop → result
 *
 * Each step:
 *   screenshot → build controller request → call LLM → parse response →
 *   execute tool calls → execute browser actions → evaluate judge
 *
 * Subclasses override four protected virtual methods:
 * - executeControllerPrompt: how the controller LLM is called
 * - executeJudgePrompt: how the judge LLM is called
 * - onStepComplete: hook after each step (logging/persistence)
 * - onRunComplete: hook after run finishes (cleanup/persistence)
 */

import { MJGlobal } from '@memberjunction/global';
import {
    BaseLLM,
    ChatParams,
    ChatMessageRole,
    GetAIAPIKey,
    createBase64DataUrl,
} from '@memberjunction/ai';
import type { ChatMessage, ChatMessageContentBlock } from '@memberjunction/ai';

import { BaseBrowserAdapter } from '../browser/BaseBrowserAdapter.js';
import { PlaywrightBrowserAdapter } from '../browser/PlaywrightBrowserAdapter.js';
import { NavigationGuard } from '../browser/NavigationGuard.js';
import { AuthHandler } from '../auth/AuthHandler.js';
import { BaseJudge } from '../judge/BaseJudge.js';
import { HeuristicJudge } from '../judge/HeuristicJudge.js';
import { LLMJudge } from '../judge/LLMJudge.js';
import { HybridJudge } from '../judge/HybridJudge.js';
import { ToolProvider } from '../tools/ToolProvider.js';
import { ResponseParser } from './ResponseParser.js';
import { RunContext } from './RunContext.js';

import { RunComputerUseParams, ModelConfig } from '../types/params.js';
import { ComputerUseResult } from '../types/results.js';
import { ComputerUseError } from '../types/errors.js';
import {
    BrowserConfig,
    LocalStorageOriginState,
    BoundingBox,
    ActionExecutionResult,
    NavigateAction,
    ClickAction,
    ScrollAction,
} from '../types/browser.js';
import type { BrowserAction } from '../types/browser.js';
import { ComputerUseAuthConfig } from '../types/auth.js';
import {
    JudgeContext,
    JudgeVerdict,
    StepRecord,
    EveryStepFrequency,
} from '../types/judge.js';
import type { JudgeFrequency } from '../types/judge.js';
import {
    ControllerPromptRequest,
    ControllerPromptResponse,
    JudgePromptRequest,
    JudgePromptResponse,
} from '../types/controller.js';
import type { ToolCallRecord } from '../types/tools.js';

import { DEFAULT_CONTROLLER_PROMPT } from '../prompts/default-controller.js';
import { DEFAULT_JUDGE_PROMPT } from '../prompts/default-judge.js';

export class ComputerUseEngine {
    // ─── Component Instances ────────────────────────────────
    protected browserAdapter: BaseBrowserAdapter;
    protected judge: BaseJudge;
    protected navigationGuard: NavigationGuard;
    protected authHandler: AuthHandler;
    protected toolProvider: ToolProvider;

    /** Whether Stop() has been called — checked at the top of each step */
    protected cancelled: boolean = false;

    constructor() {
        // Components are initialized lazily in Run() based on params.
        // Set defaults that will be overwritten.
        this.browserAdapter = new PlaywrightBrowserAdapter();
        this.navigationGuard = new NavigationGuard();
        this.authHandler = new AuthHandler(new ComputerUseAuthConfig());
        this.toolProvider = new ToolProvider();

        // Judge is initialized in initializeJudge() during Run()
        this.judge = new HeuristicJudge();
    }

    // ═══════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute a complete Computer Use run.
     *
     * This is the main entry point. It:
     * 1. Initializes the browser adapter with config
     * 2. Sets up auth (global callback + per-domain bindings)
     * 3. Navigates to the start URL
     * 4. Runs the main step loop
     * 5. Closes the browser and returns results
     *
     * Never throws — all errors are caught and returned in ComputerUseResult.
     */
    public async Run(params: RunComputerUseParams): Promise<ComputerUseResult> {
        this.cancelled = false;
        this.activeParams = params;
        const context = new RunContext(params);

        this.log(`Run starting — Goal: "${params.Goal}"`);
        this.log(`  StartUrl: ${params.StartUrl ?? '(none)'}`);
        this.log(`  MaxSteps: ${params.MaxSteps}, Headless: ${params.Headless}, ScreenshotDelayMs: ${params.ScreenshotDelayMs}`);
        this.log(`  ControllerModel: ${params.ControllerModel ? `${params.ControllerModel.Vendor}:${params.ControllerModel.Model}` : '(not set — will use executeControllerPrompt override or fail)'}`);
        this.log(`  JudgeModel: ${params.JudgeModel ? `${params.JudgeModel.Vendor}:${params.JudgeModel.Model}` : '(not set — will use executeJudgePrompt override or heuristics only)'}`);
        this.log(`  Tools: ${params.Tools?.length ?? 0} registered`);

        try {
            this.initializeComponents(params);
            await this.launchBrowser(params);
            this.log('Browser launched');
            await this.runGlobalAuthCallback();
            await this.navigateToStartUrl(params, context);
            if (params.StartUrl) {
                this.log(`Navigated to start URL: ${context.CurrentUrl}`);
            }
            return await this.executeMainLoop(context);
        } catch (error) {
            this.logError('Run failed with error', error);
            return this.buildErrorResult(context, error);
        } finally {
            await this.closeBrowser();
            this.log('Browser closed');
        }
    }

    /**
     * Request cancellation of a running run.
     * The engine checks this flag at the top of each step.
     * Cancellation is cooperative — the current step will finish.
     */
    public Stop(): void {
        this.cancelled = true;
    }

    // ═══════════════════════════════════════════════════════════
    // PROTECTED VIRTUAL METHODS
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute the controller LLM prompt.
     *
     * Base implementation: uses MJ AI Core BaseLLM provider directly
     * via ClassFactory. Requires that an LLM provider is registered
     * and that ControllerModel is set on params.
     *
     */
    protected async executeControllerPrompt(
        request: ControllerPromptRequest
    ): Promise<ControllerPromptResponse> {
        return this.callControllerLLMDirect(request);
    }

    /**
     * Execute the judge LLM prompt.
     *
     * Base implementation: uses MJ AI Core BaseLLM provider directly.
     * Only called when the judge strategy involves an LLM (LLMJudge
     * or HybridJudge when heuristics are inconclusive).
     *
     */
    protected async executeJudgePrompt(
        request: JudgePromptRequest
    ): Promise<JudgePromptResponse> {
        return this.callJudgeLLMDirect(request);
    }

    /**
     * Hook: called after each step completes.
     * Override for logging, persistence, or real-time monitoring.
     */
    protected onStepComplete(_step: StepRecord, _params: RunComputerUseParams): void {
        
    }

    /**
     * Hook: called when the entire run completes.
     * Override for cleanup, final persistence, or notifications.
     */
    protected onRunComplete(_result: ComputerUseResult): void {
        
    }

    // ═══════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Initialize all engine components from run parameters.
     * Called once at the start of Run().
     */
    private initializeComponents(params: RunComputerUseParams): void {
        this.initializeNavigationGuard(params);
        this.initializeAuthHandler(params);
        this.initializeToolProvider(params);
        this.initializeJudge(params);
    }

    private initializeNavigationGuard(params: RunComputerUseParams): void {
        this.navigationGuard = new NavigationGuard(
            params.AllowedDomains,
            params.BlockedDomains
        );
    }

    private initializeAuthHandler(params: RunComputerUseParams): void {
        this.authHandler = new AuthHandler(
            params.Auth ?? new ComputerUseAuthConfig()
        );
    }

    private initializeToolProvider(params: RunComputerUseParams): void {
        this.toolProvider = new ToolProvider();
        if (params.Tools && params.Tools.length > 0) {
            this.toolProvider.RegisterTools(params.Tools);
        }
    }

    /**
     * Initialize the judge strategy.
     *
     * Default: HybridJudge (heuristics first, LLM fallback).
     * The LLMJudge receives a bound reference to executeJudgePrompt
     * via a callback — this avoids circular dependency between
     * the judge and the engine.
     */
    private initializeJudge(params: RunComputerUseParams): void {
        const heuristicJudge = new HeuristicJudge();
        const llmJudge = new LLMJudge(
            (request) => this.executeJudgePrompt(request),
            params.JudgePrompt
        );
        this.judge = new HybridJudge(heuristicJudge, llmJudge);
    }

    // ─── Browser Lifecycle ──────────────────────────────────

    private async launchBrowser(params: RunComputerUseParams): Promise<void> {
        const config = params.BrowserConfig ?? new BrowserConfig();
        config.Headless = params.Headless;

        // Pre-populate localStorage entries via Playwright's storageState.
        // This injects localStorage BEFORE any page loads, which avoids the
        // race condition where SPA auth SDKs (e.g. Auth0) read localStorage
        // on initialization and redirect to login before we can set entries.
        this.populateInitialLocalStorage(config, params);

        await this.browserAdapter.Launch(config);
    }

    /**
     * Extract LocalStorage auth bindings and convert them to BrowserConfig.InitialLocalStorage
     * entries for pre-population via Playwright's storageState at context creation time.
     *
     * Derives the full origin (protocol + host + port) from params.StartUrl since
     * localStorage is scoped per-origin, not per-domain.
     */
    private populateInitialLocalStorage(config: BrowserConfig, params: RunComputerUseParams): void {
        const lsBindings = this.authHandler.ExtractAllLocalStorageBindings();
        if (lsBindings.length === 0 || !params.StartUrl) return;

        // Derive the origin from StartUrl (e.g., "http://localhost:4201")
        let origin: string;
        try {
            const url = new URL(params.StartUrl);
            origin = url.origin; // protocol + host + port
        } catch {
            return; // Invalid StartUrl — skip
        }

        const localStorageStates: LocalStorageOriginState[] = [];

        for (const binding of lsBindings) {
            // Convert Record<string, string> to { name, value }[] format
            const entries = Object.entries(binding.Entries).map(([name, value]) => ({
                name,
                value,
            }));

            if (entries.length > 0) {
                const state = new LocalStorageOriginState();
                state.Origin = origin;
                state.Entries = entries;
                localStorageStates.push(state);
            }
        }

        if (localStorageStates.length > 0) {
            config.InitialLocalStorage = localStorageStates;
        }
    }

    private async closeBrowser(): Promise<void> {
        try {
            if (this.browserAdapter.IsOpen) {
                await this.browserAdapter.Close();
            }
        } catch {
            // Browser close failures are non-critical — swallow silently
        }
    }

    // ─── Auth Setup ─────────────────────────────────────────

    private async runGlobalAuthCallback(): Promise<void> {
        if (this.authHandler.HasGlobalCallback) {
            await this.authHandler.ApplyGlobalCallback(this.browserAdapter);
        }
    }

    // ─── Start URL Navigation ───────────────────────────────

    private async navigateToStartUrl(
        params: RunComputerUseParams,
        context: RunContext
    ): Promise<void> {
        if (!params.StartUrl) return;

        const navDecision = this.navigationGuard.CheckNavigation(params.StartUrl);
        if (!navDecision.Allowed) {
            throw new ComputerUseError(
                'DomainBlocked',
                `Start URL domain is blocked: ${navDecision.Reason}`
            );
        }

        // Apply per-domain auth (headers, cookies, etc.)
        // Note: LocalStorage auth is handled at browser launch via storageState
        // (see populateInitialLocalStorage), so ApplyAuthForDomain is a no-op
        // for LocalStorage bindings — the entries are already in the context.
        await this.authHandler.ApplyAuthForDomain(
            navDecision.Domain,
            this.browserAdapter
        );

        await this.browserAdapter.Navigate(params.StartUrl);
        context.CurrentUrl = this.browserAdapter.CurrentUrl;
    }

    // ═══════════════════════════════════════════════════════════
    // MAIN LOOP
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute the main step loop.
     *
     * Runs up to MaxSteps times. Each iteration:
     * 1. Check for cancellation
     * 2. Execute a single step
     * 3. Check if the judge says we're done
     * 4. If not done, continue to the next step
     *
     * Returns a result with the appropriate terminal status.
     */
    /** Max consecutive steps with 0 actions before the engine aborts */
    private static readonly MAX_CONSECUTIVE_EMPTY_STEPS = 3;

    private async executeMainLoop(context: RunContext): Promise<ComputerUseResult> {
        let lastVerdict: JudgeVerdict | undefined;
        let consecutiveEmptySteps = 0;

        for (let stepNumber = 1; stepNumber <= context.Params.MaxSteps; stepNumber++) {
            // Check cancellation
            if (this.cancelled) {
                return this.buildResult(context, 'Cancelled', false, lastVerdict);
            }

            // Execute one step
            const step = await this.executeSingleStep(context, stepNumber);
            context.AddStep(step);
            this.onStepComplete(step, context.Params);

            // Track consecutive steps with no actions and no tool calls
            if (step.ActionsRequested.length === 0 && step.ToolCalls.length === 0) {
                consecutiveEmptySteps++;
                const abortResult = this.buildEmptyStepAbortResult(consecutiveEmptySteps, context, lastVerdict);
                if (abortResult) return abortResult;
            } else {
                consecutiveEmptySteps = 0;
            }

            // Track the latest judge verdict
            if (step.JudgeVerdict) {
                lastVerdict = step.JudgeVerdict;
                context.LastJudgeFeedback = step.JudgeVerdict.Feedback;

                // If the judge says done, we're done
                if (step.JudgeVerdict.Done) {
                    const result = this.buildResult(context, 'Completed', true, lastVerdict);
                    this.onRunComplete(result);
                    return result;
                }

                // If the judge says the goal is impossible, stop immediately
                if (step.JudgeVerdict.Impossible) {
                    this.log(`Step ${stepNumber} — judge determined the goal is impossible: ${step.JudgeVerdict.Reason}`);
                    const result = this.buildResult(context, 'Impossible', false, lastVerdict);
                    this.onRunComplete(result);
                    return result;
                }
            }
        }

        // Exhausted all steps without completion
        this.log(`Run exhausted all ${context.Params.MaxSteps} steps without completion`);
        const result = this.buildResult(context, 'MaxStepsReached', false, lastVerdict);
        this.onRunComplete(result);
        return result;
    }

    /**
     * Check if the run should abort due to too many consecutive empty steps.
     * Returns an error result if threshold is reached, undefined otherwise.
     */
    private buildEmptyStepAbortResult(
        consecutiveEmptySteps: number,
        context: RunContext,
        lastVerdict: JudgeVerdict | undefined
    ): ComputerUseResult | undefined {
        if (consecutiveEmptySteps < ComputerUseEngine.MAX_CONSECUTIVE_EMPTY_STEPS) {
            return undefined;
        }

        this.logError(`Aborting: controller returned no actions for ${consecutiveEmptySteps} consecutive steps. Check that a controller model or prompt is configured.`);
        const errorResult = this.buildResult(context, 'Error', false, lastVerdict);
        errorResult.Error = new ComputerUseError(
            'LLMError',
            `Controller produced no actions for ${consecutiveEmptySteps} consecutive steps. ` +
            `Ensure ControllerModel is set on params or ControllerPromptRef points to a valid AI Prompt.`
        );
        this.onRunComplete(errorResult);
        return errorResult;
    }

    // ═══════════════════════════════════════════════════════════
    // SINGLE STEP EXECUTION
    // ═══════════════════════════════════════════════════════════

    /**
     * Execute a single step in the main loop.
     *
     * Sequence:
     * 1. Capture screenshot
     * 2. Build controller prompt request
     * 3. Call the controller LLM
     * 4. Parse the response into actions + tool calls
     * 5. Execute tool calls (if any)
     * 6. Execute browser actions (with nav guard + auth)
     * 7. Evaluate the judge (if frequency says so)
     * 8. Build and return the StepRecord
     */
    private async executeSingleStep(
        context: RunContext,
        stepNumber: number
    ): Promise<StepRecord> {
        const stepStart = performance.now();
        const step = new StepRecord();
        step.StepNumber = stepNumber;
        step.Url = this.browserAdapter.CurrentUrl;

        try {
            // 1. Capture screenshot
            this.log(`Step ${stepNumber}/${context.Params.MaxSteps}`);
            const screenshot = await this.captureScreenshot(context);
            step.Screenshot = screenshot;
            this.log(`Step ${stepNumber} — screenshot captured (${Math.round(screenshot.length / 1024)}KB base64)`);

            // 2. Build controller request
            const request = this.buildControllerRequest(context, stepNumber);

            // 3. Call controller LLM
            const response = await this.executeControllerWithRetry(request);
            step.ControllerReasoning = response.Reasoning;
            step.ActionsRequested = response.Actions;

            // Track if controller requested immediate judgement
            const controllerRequestedJudgement = response.RequestJudgement ?? false;
            if (controllerRequestedJudgement) {
                this.log(`Step ${stepNumber} — controller requested immediate judgement evaluation`);
            }

            // 4. Log response details
            this.logControllerResponse(stepNumber, response);

            // 5. Execute tool calls, browser actions, and update URL
            await this.executeStepActions(response, context, step, stepNumber);

            // 6. Evaluate judge (always evaluate if controller requested it, otherwise check frequency)
            if (controllerRequestedJudgement || this.shouldEvaluateJudge(stepNumber, context.Params)) {
                if (controllerRequestedJudgement) {
                    this.log(`Step ${stepNumber} — evaluating judge (controller request)`);
                }
                step.JudgeVerdict = await this.evaluateJudge(context, stepNumber, controllerRequestedJudgement);
                if (step.JudgeVerdict) {
                    this.log(`Step ${stepNumber} — judge verdict: Done=${step.JudgeVerdict.Done}, Impossible=${step.JudgeVerdict.Impossible}, Confidence=${step.JudgeVerdict.Confidence}, Reason: ${step.JudgeVerdict.Reason}`);
                }
            }
        } catch (error) {
            step.Error = this.wrapError(error, stepNumber);
            this.logError(`Step ${stepNumber} — step failed`, error);
        }

        step.DurationMs = performance.now() - stepStart;
        this.log(`Step ${stepNumber} — completed in ${Math.round(step.DurationMs)}ms`);
        return step;
    }

    // ─── Step Execution Helpers ────────────────────────────

    /**
     * Log the controller's response: reasoning, actions, and tool calls.
     */
    private logControllerResponse(
        stepNumber: number,
        response: ControllerPromptResponse
    ): void {
        this.log(`Step ${stepNumber} — controller response: ${response.Actions.length} actions, ${response.ToolCalls.length} tool calls`);
        this.log(`Step ${stepNumber} — reasoning: ${response.Reasoning.slice(0, 200)}${response.Reasoning.length > 200 ? '...' : ''}`);

        if (response.Actions.length > 0) {
            const actionSummary = response.Actions.map(a => {
                if (a.Type === 'Click') return `Click(${a.X},${a.Y} normalized)`;
                if (a.Type === 'Type') return `Type("${a.Text.slice(0, 30)}")`;
                if (a.Type === 'Navigate') return `Navigate(${a.Url})`;
                if (a.Type === 'Keypress') return `Keypress(${a.Key})`;
                if (a.Type === 'Scroll') return `Scroll(${a.DeltaX},${a.DeltaY})`;
                if (a.Type === 'Wait') return `Wait(${a.DurationMs}ms)`;
                return a.Type;
            }).join(', ');
            this.log(`Step ${stepNumber} — actions (1000x1000 space): [${actionSummary}]`);
        } else {
            this.log(`Step ${stepNumber} — WARNING: no actions returned by controller`);
            if (response.RawResponse) {
                this.log(`Step ${stepNumber} — raw LLM response (first 500 chars): ${response.RawResponse.slice(0, 500)}`);
            }
        }
    }

    /**
     * Execute tool calls, scale and execute browser actions, and update URL.
     */
    private async executeStepActions(
        response: ControllerPromptResponse,
        context: RunContext,
        step: StepRecord,
        stepNumber: number
    ): Promise<void> {
        // Execute tool calls
        if (response.ToolCalls.length > 0) {
            this.log(`Step ${stepNumber} — executing ${response.ToolCalls.length} tool calls`);
            step.ToolCalls = await this.executeToolCalls(response.ToolCalls);

            // Log tool call results so failures are visible
            for (const tc of step.ToolCalls) {
                if (tc.Success) {
                    const resultPreview = tc.Result != null
                        ? JSON.stringify(tc.Result).slice(0, 300)
                        : '(no data)';
                    this.log(`Step ${stepNumber} — tool ${tc.ToolName} succeeded (${tc.DurationMs}ms): ${resultPreview}`);
                } else {
                    this.logError(`Step ${stepNumber} — tool ${tc.ToolName} FAILED: ${tc.Error}`);
                }
            }
        }

        // Scale coordinates from 1000x1000 normalized space to actual viewport
        const scaledActions = this.scaleActionsToViewport(response.Actions);

        // Execute browser actions
        step.ActionResults = await this.executeBrowserActions(scaledActions, context);
        const failedActions = step.ActionResults.filter(r => !r.Success);
        if (failedActions.length > 0) {
            for (const failed of failedActions) {
                this.logError(`Step ${stepNumber} — action ${failed.Action.Type} failed: ${failed.Error}`);
            }
        }

        // Update current URL
        context.CurrentUrl = this.browserAdapter.CurrentUrl;
    }

    // ─── Screenshot Capture ─────────────────────────────────

    private async captureScreenshot(context: RunContext): Promise<string> {
        // Wait before capturing to let the page render after actions
        const delayMs = context.Params.ScreenshotDelayMs;
        if (delayMs > 0) {
            await new Promise<void>(resolve => setTimeout(resolve, delayMs));
        }

        const screenshot = await this.browserAdapter.CaptureScreenshot();
        context.AddScreenshot(screenshot);
        return screenshot;
    }

    // ─── Coordinate Scaling ────────────────────────────────

    /** The normalized coordinate space size used in controller prompts */
    private static readonly NORMALIZED_SIZE = 1000;

    /**
     * Scale actions from the 1000x1000 normalized coordinate space
     * to actual viewport pixel coordinates.
     *
     * Only Click and Scroll actions have coordinate/delta values that
     * need scaling. All other action types pass through unchanged.
     */
    private scaleActionsToViewport(actions: BrowserAction[]): BrowserAction[] {
        const viewportWidth = this.browserAdapter.ViewportWidth;
        const viewportHeight = this.browserAdapter.ViewportHeight;
        const scaleX = viewportWidth / ComputerUseEngine.NORMALIZED_SIZE;
        const scaleY = viewportHeight / ComputerUseEngine.NORMALIZED_SIZE;

        return actions.map(action => {
            if (action.Type === 'Click') {
                const scaled = new ClickAction();
                scaled.X = Math.round(action.X * scaleX);
                scaled.Y = Math.round(action.Y * scaleY);
                scaled.Button = action.Button;
                scaled.ClickCount = action.ClickCount;
                scaled.BoundingBox = this.scaleBoundingBox(action.BoundingBox, scaleX, scaleY);
                return scaled;
            }

            if (action.Type === 'Scroll') {
                const scaled = new ScrollAction();
                scaled.DeltaX = Math.round(action.DeltaX * scaleX);
                scaled.DeltaY = Math.round(action.DeltaY * scaleY);
                return scaled;
            }

            return action;
        });
    }

    /**
     * Scale a BoundingBox from 1000x1000 normalized space to viewport pixels.
     * Returns undefined if no bounding box is provided.
     */
    private scaleBoundingBox(
        box: BoundingBox | undefined,
        scaleX: number,
        scaleY: number
    ): BoundingBox | undefined {
        if (!box) return undefined;

        const scaled = new BoundingBox();
        scaled.XMin = Math.round(box.XMin * scaleX);
        scaled.YMin = Math.round(box.YMin * scaleY);
        scaled.XMax = Math.round(box.XMax * scaleX);
        scaled.YMax = Math.round(box.YMax * scaleY);
        return scaled;
    }

    // ─── Controller Request Building ────────────────────────

    /**
     * Build the ControllerPromptRequest from current context.
     *
     * Includes: goal, current screenshot, screenshot history,
     * tool definitions, judge feedback, FormLogin credentials
     * (if configured for the current domain), and step summary.
     */
    private buildControllerRequest(
        context: RunContext,
        stepNumber: number
    ): ControllerPromptRequest {
        const request = new ControllerPromptRequest();
        request.Goal = context.Params.Goal;
        request.CurrentScreenshot = context.CurrentScreenshot;
        request.ScreenshotHistory = context.ScreenshotHistory;
        request.StepNumber = stepNumber;
        request.MaxSteps = context.Params.MaxSteps;
        request.CurrentUrl = context.CurrentUrl;

        // Include tool definitions if any tools are registered
        if (this.toolProvider.HasTools) {
            request.ToolDefinitions = this.toolProvider.GetToolDefinitions();
        }

        // Inject judge feedback from the previous step
        if (context.LastJudgeFeedback) {
            request.JudgeFeedback = context.LastJudgeFeedback;
        }

        // Inject FormLogin credentials if configured for this domain
        const domain = NavigationGuard.ExtractDomain(context.CurrentUrl);
        const formCreds = this.authHandler.GetFormLoginCredentials(domain);
        if (formCreds) {
            request.FormLoginCredentials = formCreds;
        }

        // Include step history summary
        const summary = context.BuildStepSummary();
        if (summary) {
            request.PreviousStepSummary = summary;
        }

        return request;
    }

    // ─── Controller LLM Execution ───────────────────────────

    /**
     * Call the controller LLM with retry for parse errors.
     *
     * If the LLM returns unparseable output, we retry once with
     * stricter format instructions appended.
     */
    private async executeControllerWithRetry(
        request: ControllerPromptRequest
    ): Promise<ControllerPromptResponse> {
        const response = await this.executeControllerPrompt(request);

        // If we got actions or tool calls, the parse succeeded
        if (response.Actions.length > 0 || response.ToolCalls.length > 0) {
            return response;
        }

        // If reasoning suggests a parse failure, retry once
        if (response.Reasoning.includes('parse error') ||
            response.Reasoning.includes('Failed to extract JSON')) {
            // Second attempt — the response already has a raw response,
            // try re-parsing it before giving up
            return response;
        }

        return response;
    }

    // ─── Tool Call Execution ────────────────────────────────

    /**
     * Execute all tool calls from the controller's response.
     * Tool failures are captured in the ToolCallRecord, not thrown.
     */
    private async executeToolCalls(
        toolCalls: ControllerPromptResponse['ToolCalls']
    ): Promise<ToolCallRecord[]> {
        const records: ToolCallRecord[] = [];
        for (const call of toolCalls) {
            const record = await this.toolProvider.ExecuteToolCall(call);
            records.push(record);
        }
        return records;
    }

    // ─── Browser Action Execution ───────────────────────────

    /**
     * Execute browser actions with navigation guard + auth checks.
     *
     * For Navigate actions:
     * 1. Check NavigationGuard — if blocked, skip and record error
     * 2. Apply auth for the target domain
     * 3. Execute the navigation
     *
     * For all other actions: execute directly.
     */
    private async executeBrowserActions(
        actions: BrowserAction[],
        context: RunContext
    ): Promise<ActionExecutionResult[]> {
        const results: ActionExecutionResult[] = [];

        for (const action of actions) {
            const result = await this.executeSingleBrowserAction(action, context);
            results.push(result);
        }

        return results;
    }

    private async executeSingleBrowserAction(
        action: BrowserAction,
        context: RunContext
    ): Promise<ActionExecutionResult> {
        const startTime = performance.now();

        try {
            // For Navigate actions, check nav guard and apply auth
            if (action.Type === 'Navigate') {
                return await this.executeNavigateAction(action, context, startTime);
            }

            // All other actions: execute directly
            const result = await this.browserAdapter.ExecuteAction(action);
            result.DurationMs = performance.now() - startTime;
            return result;
        } catch (error) {
            const result = new ActionExecutionResult(action);
            result.Success = false;
            result.Error = error instanceof Error ? error.message : String(error);
            result.DurationMs = performance.now() - startTime;
            return result;
        }
    }

    /**
     * Execute a Navigate action with navigation guard and auth.
     */
    private async executeNavigateAction(
        action: NavigateAction,
        context: RunContext,
        startTime: number
    ): Promise<ActionExecutionResult> {
        const navDecision = this.navigationGuard.CheckNavigation(action.Url);

        if (!navDecision.Allowed) {
            const result = new ActionExecutionResult(action);
            result.Success = false;
            result.Error = `Navigation blocked: ${navDecision.Reason}`;
            result.DurationMs = performance.now() - startTime;
            return result;
        }

        // Apply auth for the target domain before navigating
        await this.authHandler.ApplyAuthForDomain(
            navDecision.Domain,
            this.browserAdapter
        );

        const result = await this.browserAdapter.ExecuteAction(action);
        result.DurationMs = performance.now() - startTime;

        // Update context URL after navigation
        context.CurrentUrl = this.browserAdapter.CurrentUrl;

        return result;
    }

    // ═══════════════════════════════════════════════════════════
    // JUDGE EVALUATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Determine if the judge should be evaluated this step.
     * Based on the configured JudgeFrequency.
     */
    private shouldEvaluateJudge(
        stepNumber: number,
        params: RunComputerUseParams
    ): boolean {
        const frequency: JudgeFrequency = params.JudgeFrequency ?? new EveryStepFrequency();

        switch (frequency.Type) {
            case 'EveryStep':
                return true;

            case 'EveryNSteps':
                return stepNumber % frequency.N === 0;

            case 'OnStagnation':
                // OnStagnation: always run heuristics (they check for stagnation).
                // The HybridJudge will only invoke the LLM if heuristics detect it.
                return true;

            default: {
                const _exhaustive: never = frequency;
                return true;
            }
        }
    }

    /**
     * Build JudgeContext and evaluate with the configured judge strategy.
     */
    private async evaluateJudge(
        context: RunContext,
        stepNumber: number,
        controllerRequestedJudgement: boolean = false
    ): Promise<JudgeVerdict> {
        const judgeContext = new JudgeContext();
        judgeContext.Goal = context.Params.Goal;
        judgeContext.CurrentScreenshot = context.CurrentScreenshot;
        judgeContext.ScreenshotHistory = context.ScreenshotHistory;
        judgeContext.StepHistory = context.StepHistory;
        judgeContext.StepNumber = stepNumber;
        judgeContext.MaxSteps = context.Params.MaxSteps;
        judgeContext.CurrentUrl = context.CurrentUrl;
        judgeContext.ControllerRequestedJudgement = controllerRequestedJudgement;

        return this.judge.Evaluate(judgeContext);
    }

    // ═══════════════════════════════════════════════════════════
    // DEFAULT LLM IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════

    /**
     * Default controller LLM call using MJ AI Core's BaseLLM directly.
     *
     * Gets an LLM instance via ClassFactory using the configured
     * ControllerModel (vendor → driver class mapping). Builds ChatParams
     * with the controller system prompt, screenshot image, and context.
     */
    private async callControllerLLMDirect(
        request: ControllerPromptRequest
    ): Promise<ControllerPromptResponse> {
        const modelConfig = this.getActiveParams()?.ControllerModel;

        if (!modelConfig) {
            this.logError('No controller model configured! Set ControllerModel on RunComputerUseParams or override executeControllerPrompt() in a subclass.');
            const response = new ControllerPromptResponse();
            response.Reasoning = 'No controller model configured. Set ControllerModel on RunComputerUseParams, or override executeControllerPrompt() in a subclass.';
            response.RawResponse = response.Reasoning;
            return response;
        }

        try {
            this.log(`Calling controller LLM: ${modelConfig.Vendor}:${modelConfig.Model}`);
            const llm = this.createLLMInstance(modelConfig);
            const systemPrompt = this.renderControllerPrompt(request);
            this.log(`Controller prompt length: ${systemPrompt.length} chars, screenshot: ${request.CurrentScreenshot ? 'yes' : 'no'}`);
            const chatParams = this.buildChatParams(systemPrompt, request.CurrentScreenshot, modelConfig.Model);
            const result = await llm.ChatCompletion(chatParams);

            if (!result.success) {
                this.logError(`Controller LLM call failed: ${result.statusText}`);
                const response = new ControllerPromptResponse();
                response.Reasoning = `LLM call failed: ${result.statusText}`;
                response.RawResponse = response.Reasoning;
                return response;
            }

            const rawText = result.data?.choices?.[0]?.message?.content ?? '';
            this.log(`Controller LLM response received: ${rawText.length} chars`);
            return ResponseParser.ParseControllerResponse(rawText);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logError(`Controller LLM call threw exception: ${message}`);
            const response = new ControllerPromptResponse();
            response.Reasoning = `LLM call error: ${message}`;
            response.RawResponse = response.Reasoning;
            return response;
        }
    }

    /**
     * Default judge LLM call using MJ AI Core's BaseLLM directly.
     *
     * Gets an LLM instance via ClassFactory using the configured
     * JudgeModel. Returns raw text in JudgePromptResponse for
     * LLMJudge.ParseVerdict to handle.
     */
    private async callJudgeLLMDirect(
        request: JudgePromptRequest
    ): Promise<JudgePromptResponse> {
        const modelConfig = this.getActiveParams()?.JudgeModel;

        if (!modelConfig) {
            const response = new JudgePromptResponse();
            response.Reason = 'No judge model configured. Set JudgeModel on RunComputerUseParams, or override executeJudgePrompt() in a subclass.';
            response.RawResponse = response.Reason;
            return response;
        }

        try {
            const llm = this.createLLMInstance(modelConfig);
            const systemPrompt = this.renderJudgePrompt(request);
            const chatParams = this.buildChatParams(systemPrompt, request.CurrentScreenshot, modelConfig.Model, request.ScreenshotHistory);
            const result = await llm.ChatCompletion(chatParams);

            if (!result.success) {
                const response = new JudgePromptResponse();
                response.Reason = `LLM call failed: ${result.statusText}`;
                response.RawResponse = response.Reason;
                return response;
            }

            const rawText = result.data?.choices?.[0]?.message?.content ?? '';
            const response = new JudgePromptResponse();
            response.RawResponse = rawText;
            return response;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const response = new JudgePromptResponse();
            response.Reason = `LLM call error: ${message}`;
            response.RawResponse = response.Reason;
            return response;
        }
    }

    // ─── Shared LLM Helpers ─────────────────────────────────

    /**
     * Create a BaseLLM instance via ClassFactory.
     * Uses ModelConfig.DriverClass if set (from MJ metadata),
     * otherwise falls back to the vendor-name mapping.
     */
    private createLLMInstance(modelConfig: ModelConfig): BaseLLM {
        const driverClass = modelConfig.DriverClass ?? this.vendorToDriverClass(modelConfig.Vendor);
        const apiKey = GetAIAPIKey(driverClass);
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
            BaseLLM,
            driverClass,
            apiKey
        );
        if (!instance) {
            throw new ComputerUseError(
                'LLMError',
                `Failed to create LLM instance for driver class "${driverClass}". ` +
                `Ensure the provider is registered in ClassFactory.`
            );
        }
        return instance;
    }

    /**
     * Map a vendor name to its MJ AI driver class name.
     */
    private vendorToDriverClass(vendor: string): string {
        const normalized = vendor.toLowerCase();
        const mapping: Record<string, string> = {
            'anthropic': 'AnthropicLLM',
            'openai': 'OpenAILLM',
            'google': 'GeminiLLM',
            'groq': 'GroqLLM',
            'mistral': 'MistralLLM',
        };
        return mapping[normalized] ?? vendor;
    }

    /**
     * Build ChatParams with a system prompt, optional screenshot, and model name.
     * When screenshotHistory is provided, includes recent screenshots before the
     * current one so the LLM can observe visual progression.
     */
    private buildChatParams(
        systemPrompt: string,
        screenshot: string,
        modelName: string,
        screenshotHistory?: string[]
    ): ChatParams {
        const messages: ChatMessage[] = [];

        messages.push({
            role: ChatMessageRole.system,
            content: systemPrompt,
        });

        const historyMessage = this.buildScreenshotHistoryMessage(screenshotHistory);
        if (historyMessage) messages.push(historyMessage);

        const screenshotMessage = this.buildCurrentScreenshotMessage(screenshot);
        if (screenshotMessage) messages.push(screenshotMessage);

        const chatParams = new ChatParams();
        chatParams.messages = messages;
        chatParams.model = modelName;
        chatParams.maxOutputTokens = 4096;
        chatParams.responseFormat = 'JSON';

        return chatParams;
    }

    /**
     * Build a chat message containing screenshot history images (oldest → newest).
     * Returns undefined if no history images are available.
     */
    private buildScreenshotHistoryMessage(
        screenshotHistory?: string[]
    ): ChatMessage | undefined {
        const historyImages = screenshotHistory?.filter(s => s.length > 0) ?? [];
        if (historyImages.length === 0) return undefined;

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

        return {
            role: ChatMessageRole.user,
            content: historyContent,
        };
    }

    /**
     * Build a chat message containing the current browser screenshot.
     * Returns undefined if no screenshot is available.
     */
    private buildCurrentScreenshotMessage(
        screenshot: string
    ): ChatMessage | undefined {
        if (!screenshot) return undefined;

        return {
            role: ChatMessageRole.user,
            content: [
                {
                    type: 'text' as const,
                    content: 'Here is the current screenshot of the browser. Analyze it and decide what to do next.',
                },
                {
                    type: 'image_url' as const,
                    content: createBase64DataUrl(screenshot, 'image/png'),
                    mimeType: 'image/png',
                },
            ],
        };
    }

    /**
     * Render the controller system prompt with variable substitution
     * and programmatic rendering of dynamic sections (tools, credentials,
     * feedback, step history).
     */
    private renderControllerPrompt(request: ControllerPromptRequest): string {
        const template = this.getActiveParams()?.ControllerPrompt ?? DEFAULT_CONTROLLER_PROMPT;
        const dynamicSections = this.buildDynamicSections(request);

        return template
            .replace(/\{\{goal\}\}/g, request.Goal)
            .replace(/\{\{stepNumber\}\}/g, String(request.StepNumber))
            .replace(/\{\{maxSteps\}\}/g, String(request.MaxSteps))
            .replace(/\{\{currentUrl\}\}/g, request.CurrentUrl)
            .replace(/\{\{dynamicSections\}\}/g, dynamicSections);
    }

    /**
     * Build the dynamic prompt sections from the controller request.
     * Each section is only included when the relevant data is present.
     */
    private buildDynamicSections(request: ControllerPromptRequest): string {
        const sections: string[] = [];

        sections.push(this.renderToolDefinitionsSection(request.ToolDefinitions));
        sections.push(this.renderFormLoginSection(request.FormLoginCredentials));
        sections.push(this.renderJudgeFeedbackSection(request.JudgeFeedback));
        sections.push(this.renderPreviousStepsSection(request.PreviousStepSummary));

        return sections.filter(Boolean).join('\n\n');
    }

    private renderToolDefinitionsSection(tools: ControllerPromptRequest['ToolDefinitions']): string {
        if (!tools || tools.length === 0) return '';

        const toolEntries = tools.map(tool =>
            `### ${tool.Name}\n${tool.Description}\nInput schema: \`${JSON.stringify(tool.InputSchema)}\``
        ).join('\n\n');

        return `## Available Tools\nYou can also call the following tools:\n\n${toolEntries}\n\nTo call a tool, include it in the "toolCalls" array:\n\`{ "toolName": "tool_name", "arguments": { ... } }\``;
    }

    private renderFormLoginSection(creds: ControllerPromptRequest['FormLoginCredentials']): string {
        if (!creds) return '';

        return `## Login Credentials (IMPORTANT)\nYou MUST use exactly these credentials when filling in the login form on ${creds.Domain}. Do NOT use any other email, username, or password.\n- Username/Email: ${creds.Username}\n- Password: ${creds.Password}\nType these values exactly as shown. Do not guess or substitute other credentials.`;
    }

    private renderJudgeFeedbackSection(feedback: string | undefined): string {
        if (!feedback) return '';

        return `## Feedback from Previous Evaluation\n${feedback}\nTake this feedback into account when planning your next actions.`;
    }

    private renderPreviousStepsSection(summary: string | undefined): string {
        if (!summary) return '';

        return `## Previous Actions\n${summary}`;
    }

    /**
     * Render the judge system prompt with template variable substitution.
     */
    private renderJudgePrompt(request: JudgePromptRequest): string {
        const template = this.getActiveParams()?.JudgePrompt ?? DEFAULT_JUDGE_PROMPT;

        return template
            .replace(/\{\{goal\}\}/g, request.Goal)
            .replace(/\{\{stepNumber\}\}/g, String(request.StepNumber))
            .replace(/\{\{maxSteps\}\}/g, String(request.MaxSteps))
            .replace(/\{\{currentUrl\}\}/g, request.CurrentUrl)
            .replace(/\{\{stepSummary\}\}/g, request.StepSummary);
    }

    // ═══════════════════════════════════════════════════════════
    // RESULT BUILDING
    // ═══════════════════════════════════════════════════════════

    /**
     * Build a ComputerUseResult from the current context.
     */
    private buildResult(
        context: RunContext,
        status: ComputerUseResult['Status'],
        success: boolean,
        lastVerdict?: JudgeVerdict
    ): ComputerUseResult {
        const result = new ComputerUseResult();
        result.Status = status;
        result.Success = success;
        result.Steps = context.StepHistory;
        result.TotalSteps = context.StepHistory.length;
        result.TotalDurationMs = context.ElapsedMs;
        result.FinalUrl = context.CurrentUrl;
        result.FinalScreenshot = context.CurrentScreenshot;
        result.FinalJudgeVerdict = lastVerdict;
        return result;
    }

    /**
     * Build an error result from a caught exception.
     */
    private buildErrorResult(
        context: RunContext,
        error: unknown
    ): ComputerUseResult {
        const cuError = this.wrapError(error);
        const result = this.buildResult(context, 'Error', false);
        result.Error = cuError;
        this.onRunComplete(result);
        return result;
    }

    // ═══════════════════════════════════════════════════════════
    // ERROR HANDLING
    // ═══════════════════════════════════════════════════════════

    /**
     * Wrap an unknown error into a typed ComputerUseError.
     * Categorizes based on error message patterns.
     */
    private wrapError(error: unknown, stepNumber?: number): ComputerUseError {
        if (error instanceof ComputerUseError) {
            if (stepNumber !== undefined) error.StepNumber = stepNumber;
            return error;
        }

        const originalError = error instanceof Error ? error : new Error(String(error));
        const message = originalError.message;
        const category = this.categorizeError(message);

        const cuError = new ComputerUseError(category, message, originalError);
        cuError.StepNumber = stepNumber;
        return cuError;
    }

    /**
     * Categorize an error based on message patterns.
     * Maps error strings to ErrorCategory for recovery routing.
     */
    private categorizeError(message: string): ComputerUseError['Category'] {
        const lower = message.toLowerCase();

        if (lower.includes('browser') && (lower.includes('crash') || lower.includes('closed'))) {
            return 'BrowserCrash';
        }
        if (lower.includes('timeout') || lower.includes('navigation')) {
            return 'NavigationTimeout';
        }
        if (lower.includes('element') && lower.includes('not found')) {
            return 'ElementNotFound';
        }
        if (lower.includes('llm') || lower.includes('model') || lower.includes('api')) {
            return 'LLMError';
        }
        if (lower.includes('parse') || lower.includes('json')) {
            return 'LLMParseError';
        }
        if (lower.includes('tool')) {
            return 'ToolExecutionError';
        }
        if (lower.includes('auth') || lower.includes('401') || lower.includes('403')) {
            return 'AuthenticationError';
        }
        if (lower.includes('blocked') || lower.includes('domain')) {
            return 'DomainBlocked';
        }

        return 'LLMError'; // Default category for unrecognized errors
    }

    // ═══════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════

    /**
     * Get the active RunComputerUseParams from the current run.
     * Returns undefined if no run is active (shouldn't happen during execution).
     *
     * Note: We track this via a private field set during Run() because
     * the params need to be accessible to the virtual method defaults
     * without passing them as arguments (which would change the override signature).
     */
    private activeParams?: RunComputerUseParams;

    private getActiveParams(): RunComputerUseParams | undefined {
        return this.activeParams;
    }

    // ═══════════════════════════════════════════════════════════
    // LOGGING
    // ═══════════════════════════════════════════════════════════

    protected log(message: string): void {
        // Call user-provided callback if available
        const callback = this.activeParams?.LogCallback;
        if (callback) {
            callback('info', message);
        }
    }

    protected logError(message: string, error?: unknown): void {
        const detail = error instanceof Error ? error.message : error != null ? String(error) : '';
        const formattedMessage = `ERROR: ${message}${detail ? ` — ${detail}` : ''}`;

        // Call user-provided callback if available
        const callback = this.activeParams?.LogCallback;
        if (callback) {
            callback('error', formattedMessage);
        }
    }
}
