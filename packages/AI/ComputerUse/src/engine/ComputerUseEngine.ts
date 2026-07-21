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
import { computePerceptualHash, hashesSimilar } from '../utils/perceptual-hash.js';

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
    ElementInfo,
} from '../types/browser.js';
import type { BrowserAction } from '../types/browser.js';
import { ComputerUseAuthConfig } from '../types/auth.js';
import { SettleConfig, DEFAULT_BUSY_MARKERS, LoopConfig } from '../types/app-profile.js';
import type { SettleReason } from '../types/app-profile.js';
import { resolveSettleExit } from './settle-decision.js';
import { computeStateSignature, detectLoop } from './loop-detection.js';
import { evaluateAuthDetour } from './auth-detour.js';
import { CancellationError, abortableDelay } from './cancellation.js';
import { serializeInteractiveElements } from './element-serializer.js';
import { evaluateBatchStop, DEFAULT_MAX_ACTIONS_PER_BATCH } from './batch-control.js';
import { gateImpossibleVerdict, DEFAULT_IMPOSSIBLE_QUORUM } from './terminal-verdict.js';
import { formatDiagnosticsDigest } from './diagnostics-digest.js';
import {
    JudgeContext,
    JudgeVerdict,
    StepRecord,
    EveryStepFrequency,
    OnStagnationFrequency,
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

    /** Whether Stop() has been called — checked at the top of each step and at
     *  the finer-grained checkpoints inside a step (CU-B8). */
    protected cancelled: boolean = false;

    /** Aborted by Stop() (CU-B8) so in-flight LLM calls and settle/backoff
     *  delays return promptly instead of holding a worker slot to step's end.
     *  Recreated per Run() so a reused engine instance starts un-aborted. */
    private abortController: AbortController = new AbortController();

    /** Whether this engine owns its browser adapter lifecycle (Launch/Close) */
    private _ownsAdapter: boolean = true;

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
        this.abortController = new AbortController();
        this.activeParams = params;
        const context = new RunContext(params);

        this.log(`Run starting — Goal: "${params.Goal}"`);
        this.log(`  StartUrl: ${params.StartUrl ?? '(none)'}`);
        this.log(`  MaxSteps: ${params.MaxSteps}, Headless: ${params.Headless}, ScreenshotDelayMs: ${params.ScreenshotDelayMs}`);
        this.log(`  ControllerModel: ${params.ControllerModel ? `${params.ControllerModel.Vendor}:${params.ControllerModel.Model}` : '(not set — will use executeControllerPrompt override or fail)'}`);
        this.log(`  JudgeModel: ${params.JudgeModel ? `${params.JudgeModel.Vendor}:${params.JudgeModel.Model}` : '(not set — will use executeJudgePrompt override or heuristics only)'}`);
        this.log(`  Tools: ${params.Tools?.length ?? 0} registered`);

        let result: ComputerUseResult | undefined;
        try {
            this.initializeComponents(params);
            await this.launchBrowser(params);
            this.log('Browser launched');
            await this.startTracingIfRequested(params);
            await this.runGlobalAuthCallback();
            await this.navigateToStartUrl(params, context);
            if (params.StartUrl) {
                this.log(`Navigated to start URL: ${context.CurrentUrl}`);
            }
            result = await this.executeMainLoop(context);
            return result;
        } catch (error) {
            this.logError('Run failed with error', error);
            result = this.buildErrorResult(context, error);
            return result;
        } finally {
            // Stop the trace (if any) BEFORE the context closes, stamping the
            // path on the result so the caller can retain-or-discard (CU-F4).
            await this.stopTracingIfRequested(params, result);
            await this.closeBrowser();
            this.log('Browser closed');
        }
    }

    /** Start a forensic trace when the caller requested one via TracePath (CU-F4). Best-effort. */
    private async startTracingIfRequested(params: RunComputerUseParams): Promise<void> {
        if (!params.TracePath) {
            return;
        }
        try {
            await this.browserAdapter.StartTracing();
        } catch (error) {
            this.logError('Failed to start tracing (continuing without a trace)', error);
        }
    }

    /**
     * Stop a trace started for this run and, if a file was written, stamp its
     * path on the result. The caller (driver) owns the retain-or-discard policy
     * (CU-F4) — the engine only produces the artifact. Best-effort: never throws.
     */
    private async stopTracingIfRequested(
        params: RunComputerUseParams,
        result: ComputerUseResult | undefined
    ): Promise<void> {
        if (!params.TracePath) {
            return;
        }
        try {
            const wrote = await this.browserAdapter.StopTracing(params.TracePath);
            if (wrote && result) {
                result.TracePath = params.TracePath;
            }
        } catch (error) {
            this.logError('Failed to stop tracing', error);
        }
    }

    /**
     * Inject a pre-created browser adapter for shared session support.
     * When set, the engine skips Launch()/Close() — the caller owns the lifecycle.
     * Used by parallel test execution to share browser contexts across tests.
     */
    public SetBrowserAdapter(adapter: BaseBrowserAdapter): void {
        this.browserAdapter = adapter;
        this._ownsAdapter = false;
    }

    /**
     * Request cancellation of a running run. Cooperative: sets the flag the
     * engine's checkpoints observe AND aborts the shared signal so in-flight LLM
     * calls and settle/backoff delays return promptly (CU-B8). The run unwinds
     * to a `Cancelled` result within seconds — at the next checkpoint — rather
     * than running the current step to completion.
     */
    public Stop(): void {
        this.cancelled = true;
        this.abortController.abort();
    }

    /**
     * Cooperative-cancellation checkpoint (CU-B8): throw {@link CancellationError}
     * if the run has been stopped. Placed after each long await (settle, LLM,
     * actions, judge) so the step unwinds promptly; the main loop maps the throw
     * to a single clean `Cancelled` status.
     */
    private ensureNotCancelled(): void {
        if (this.cancelled) {
            throw new CancellationError();
        }
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
        // Wire the OnStagnation threshold through to the heuristic judge (CU-B2).
        // Previously this parsed config was dropped on the floor and the judge
        // always used its default threshold.
        const frequency = params.JudgeFrequency;
        const heuristicJudge = frequency instanceof OnStagnationFrequency
            ? new HeuristicJudge(frequency.StagnationThreshold)
            : new HeuristicJudge();
        const llmJudge = new LLMJudge(
            (request) => this.executeJudgePrompt(request),
            params.JudgePrompt
        );
        this.judge = new HybridJudge(heuristicJudge, llmJudge);
    }

    // ─── Browser Lifecycle ──────────────────────────────────

    private async launchBrowser(params: RunComputerUseParams): Promise<void> {
        // If adapter was injected externally and is already open, just launch a
        // new page within the existing context (SharedContextBrowserAdapter handles this)
        const config = params.BrowserConfig ?? new BrowserConfig();
        config.Headless = params.Headless;

        if (!this._ownsAdapter) {
            // Shared adapter: Launch() creates a new page in the shared context
            await this.browserAdapter.Launch(config);
            return;
        }

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
        if (!this._ownsAdapter) {
            // Shared adapter: between tests, the BrowserContext lives on but
            // we must clean per-session state (IndexedDB, sessionStorage,
            // non-auth localStorage, service workers) — otherwise stale
            // cache from this test deadlocks the next test's app boot.
            // Auth tokens in localStorage are preserved so the next test
            // doesn't have to re-login.
            //
            // EXCEPTION (CU-G3): when the context is ephemeral (destroyed right
            // after this run, not recycled), the scrub is pure waste — it
            // re-navigates to the app origin, triggering another full app boot,
            // in a context that's about to be thrown away. Skip it.
            const startUrl = this.activeParams?.StartUrl;
            if (startUrl && !this.activeParams?.EphemeralContext) {
                try {
                    const origin = new URL(startUrl).origin;
                    await this.browserAdapter.ResetStatePreservingAuth(origin);
                } catch { /* swallow — best effort */ }
            }

            // Now close the page; the context and browser are owned by the pool
            try {
                if (this.browserAdapter.IsOpen) {
                    await this.browserAdapter.Close();
                }
            } catch { /* swallow */ }
            return;
        }

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

    private static readonly MAX_CONSECUTIVE_JUDGE_DISAGREEMENTS = 3;

    private async executeMainLoop(context: RunContext): Promise<ComputerUseResult> {
        let lastVerdict: JudgeVerdict | undefined;
        let consecutiveEmptySteps = 0;
        let consecutiveJudgeDisagreements = 0;
        // Cumulative engine-side settle wait, excluded from the agent-time budget
        // so a slow app doesn't consume the agent's reasoning time (CU-B4/A1).
        let cumulativeSettleMs = 0;
        // Loop detection (CU-B1): per-step state signatures + an escalating trip counter.
        const loopCfg = context.Params.AppProfile?.Loop ?? new LoopConfig();
        const stateSignatures: string[] = [];
        let loopTrips = 0;
        // Terminal-verdict guard (CU-D6): concurring Impossible verdicts needed before we accept one.
        let impossibleCount = 0;

        for (let stepNumber = 1; stepNumber <= context.Params.MaxSteps; stepNumber++) {
            // Check cancellation
            if (this.cancelled) {
                return this.buildResult(context, 'Cancelled', false, lastVerdict);
            }

            // Auth-detour watchdog (CU-B7): if the session was invalidated and
            // the page bounced to an identity provider, recover it here —
            // BEFORE perceiving — so the step runs against the recovered app,
            // not the login page. No step and no agent-time is charged for the
            // detour (recovery time is accounted as settle). After MaxDetours
            // the recovery clearly isn't holding, so we terminate as an
            // infrastructure AuthDetour instead of grading the agent on it.
            const authResult = await this.handleAuthDetour(context, stepNumber, lastVerdict);
            if (authResult.result) {
                return authResult.result;
            }
            cumulativeSettleMs += authResult.recoveryMs;

            // Agent-time budget (CU-B4): never START a step past the budget.
            // Graceful expiry runs one forced final judge so the run is scored
            // on real end-state, not zeroed (pairs with CU-D4).
            if (this.agentTimeBudgetExceeded(context, cumulativeSettleMs)) {
                this.log(`Agent-time budget (${context.Params.MaxExecutionTimeMs}ms, settle excluded) exceeded before step ${stepNumber} — expiring gracefully`);
                const verdict = await this.forceFinalJudge(context, stepNumber, lastVerdict);
                const result = this.buildResult(context, 'TimeBudgetExceeded', false, verdict);
                this.onRunComplete(result);
                return result;
            }

            // Execute one step. A Stop() mid-step unwinds as a CancellationError
            // (CU-B8) — catch it here and return a single clean Cancelled result
            // rather than letting it surface as an infrastructure Error.
            let step: StepRecord;
            try {
                step = await this.executeSingleStep(context, stepNumber);
            } catch (error) {
                if (error instanceof CancellationError) {
                    this.log('Run cancelled mid-step (CU-B8) — returning Cancelled');
                    return this.buildResult(context, 'Cancelled', false, lastVerdict);
                }
                throw error;
            }
            cumulativeSettleMs += step.SettleMs;
            context.AddStep(step);
            this.onStepComplete(step, context.Params);

            // Track consecutive steps where the controller produced NOTHING to do.
            // A step that requested judgement (a deliberate "am I done?" checkpoint)
            // or that errored is NOT a misconfigured/stuck empty step, so it must
            // not count toward the "controller produced no actions" abort (CU-B3).
            const producedNothing = step.ActionsRequested.length === 0 && step.ToolCalls.length === 0;
            if (producedNothing && !step.RequestedJudgement && !step.Error) {
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

                // Impossible guard (CU-D6): don't end on a single sample. Require a
                // quorum of concurring Impossible verdicts across ≥2 steps, and never
                // accept Impossible while the page is still loading (settle gave up as
                // 'budget') — a boot screen is not evidence the goal is impossible.
                const impossibleGate = gateImpossibleVerdict({
                    impossible: step.JudgeVerdict.Impossible,
                    pageLoading: step.SettleReason === 'budget',
                    priorCount: impossibleCount,
                    quorum: DEFAULT_IMPOSSIBLE_QUORUM,
                });
                impossibleCount = impossibleGate.newCount;
                if (impossibleGate.suppressed) {
                    this.log(`Step ${stepNumber} — judge said impossible but the page is still loading; not accepting it (CU-D6)`);
                } else if (step.JudgeVerdict.Impossible && !impossibleGate.accept) {
                    this.log(`Step ${stepNumber} — impossible verdict ${impossibleCount}/${DEFAULT_IMPOSSIBLE_QUORUM}; need a concurring verdict before ending (CU-D6)`);
                } else if (impossibleGate.accept) {
                    this.log(`Step ${stepNumber} — goal confirmed impossible (${impossibleCount} concurring verdicts): ${step.JudgeVerdict.Reason}`);
                    const result = this.buildResult(context, 'Impossible', false, lastVerdict);
                    this.onRunComplete(result);
                    return result;
                }
            }

            // If the controller keeps parking on "I'm done / it's blocked" (no
            // actions, requested judgement) but the judge keeps disagreeing, that
            // is a genuine, truthful Failed outcome — not an infrastructure Error
            // and not worth burning the rest of the step budget (CU-B3).
            if (producedNothing && step.RequestedJudgement && step.JudgeVerdict &&
                !step.JudgeVerdict.Done && !step.JudgeVerdict.Impossible) {
                consecutiveJudgeDisagreements++;
                if (consecutiveJudgeDisagreements >= ComputerUseEngine.MAX_CONSECUTIVE_JUDGE_DISAGREEMENTS) {
                    this.log(`Step ${stepNumber} — controller declared completion ${consecutiveJudgeDisagreements}× but the judge disagreed each time; ending as Failed (CU-B3)`);
                    const result = this.buildResult(context, 'Failed', false, lastVerdict);
                    this.onRunComplete(result);
                    return result;
                }
            } else {
                consecutiveJudgeDisagreements = 0;
            }

            // Loop detection (CU-B1): every step, free. Suppressed while the page
            // is still booting (settle gave up as 'budget') — waiting on a boot
            // screen is correct recovery, not a loop (the CU-B2 contradiction fix).
            if (step.SettleReason !== 'budget') {
                const signature = computeStateSignature(step.UrlAfter, step.ScreenshotHash, loopCfg.VolatileParams);
                stateSignatures.push(signature);
                const loop = detectLoop(stateSignatures, loopCfg.StateRepeatThreshold);
                if (loop) {
                    loopTrips++;
                    if (loopTrips >= loopCfg.TerminateAfterTrips) {
                        // A truthful early verdict beats 20 more wasted steps.
                        this.log(`Step ${stepNumber} — loop persisted ${loopTrips} trips (${loop.kind}); terminating as Failed/LoopDetected (CU-B1)`);
                        const verdict = await this.forceFinalJudge(context, stepNumber, lastVerdict);
                        const result = this.buildResult(context, 'Failed', false, verdict);
                        result.FailureReason = 'LoopDetected';
                        this.onRunComplete(result);
                        return result;
                    }
                    // Earlier trips: inject engine-computed evidence into the next prompt.
                    context.LoopEvidence = loop.detail;
                    this.log(`Step ${stepNumber} — loop trip ${loopTrips}/${loopCfg.TerminateAfterTrips} (${loop.kind}): ${loop.detail}`);
                } else {
                    // Progress made — clear loop state so stale evidence doesn't linger.
                    loopTrips = 0;
                    context.LoopEvidence = undefined;
                }
            }
        }

        // Exhausted all steps without completion. Force a fresh final judge so
        // the verdict reflects the true end-state (it may be up to a few steps
        // stale) and the run is scored on evidence (CU-B4.3 / CU-D4).
        this.log(`Run exhausted all ${context.Params.MaxSteps} steps without completion`);
        const finalVerdict = await this.forceFinalJudge(context, context.Params.MaxSteps, lastVerdict);
        const result = this.buildResult(context, 'MaxStepsReached', false, finalVerdict);
        this.onRunComplete(result);
        return result;
    }

    /**
     * Whether the agent-time budget is exhausted (CU-B4). Agent time excludes
     * cumulative settle wait, so a slow-to-render app doesn't burn the agent's
     * reasoning budget. Returns false when no budget is configured.
     */
    private agentTimeBudgetExceeded(context: RunContext, cumulativeSettleMs: number): boolean {
        const max = context.Params.MaxExecutionTimeMs;
        if (!max || max <= 0) {
            return false;
        }
        const agentTimeMs = Math.max(0, context.ElapsedMs - cumulativeSettleMs);
        return agentTimeMs >= max;
    }

    /**
     * Run one forced judge evaluation of the current end-state, used on graceful
     * budget expiry (step or time) so the run is scored on a fresh verdict
     * rather than a stale/absent one (CU-B4.3 / CU-D4). Never throws — falls
     * back to the prior verdict on any failure or when no judge is configured.
     */
    private async forceFinalJudge(
        context: RunContext,
        stepNumber: number,
        lastVerdict?: JudgeVerdict
    ): Promise<JudgeVerdict | undefined> {
        try {
            const lastStep = context.StepHistory[context.StepHistory.length - 1];
            // If the last step already judged the final frame, that verdict IS
            // fresh — don't pay for a redundant re-judge of the same state.
            if (lastStep?.JudgeVerdict) {
                return lastStep.JudgeVerdict;
            }
            const verdict = await this.evaluateJudge(context, stepNumber, true, lastStep?.ScreenshotHash ?? '', context.LastDiagnosticsDigest ?? '');
            return verdict ?? lastVerdict;
        } catch (error) {
            this.logError('Forced final judge evaluation failed', error);
            return lastVerdict;
        }
    }

    /**
     * Auth-detour watchdog (CU-B7). Runs at the top of each step, before
     * perception. If the current URL matches an identity-provider pattern from
     * the {@link AppProfile}, the session was invalidated mid-run and the page
     * bounced to login. We recover generically (re-apply auth + re-navigate to
     * the start URL) so the step then perceives the recovered app — the agent
     * never sees the login page and burns no steps re-consenting. After
     * `MaxDetours` detours in one run the recovery clearly isn't holding, so we
     * terminate the run as an infrastructure `AuthDetour` (a counted, alarmable
     * signal) rather than grade the agent on a harness/session fault.
     *
     * Returns `{ result?, recoveryMs }`. A set `result` means the run
     * terminated (MaxDetours exceeded) and the caller must return it.
     * `recoveryMs` is the wall time spent recovering, which the caller folds
     * into cumulative settle so the detour is excluded from the agent-time
     * budget. A no-op (no profile / no patterns / URL clean) returns
     * `{ recoveryMs: 0 }`.
     */
    private async handleAuthDetour(
        context: RunContext,
        stepNumber: number,
        lastVerdict: JudgeVerdict | undefined
    ): Promise<{ result?: ComputerUseResult; recoveryMs: number }> {
        const authCfg = context.Params.AppProfile?.Auth;
        if (!authCfg || authCfg.IdentityProviderPatterns.length === 0) {
            return { recoveryMs: 0 };
        }

        const currentUrl = this.browserAdapter.CurrentUrl;
        const decision = evaluateAuthDetour(
            currentUrl,
            authCfg.IdentityProviderPatterns,
            context.AuthDetourCount,
            authCfg.MaxDetours
        );
        if (!decision.isDetour) {
            return { recoveryMs: 0 };
        }

        context.AuthDetourCount++;

        if (decision.shouldTerminate) {
            this.logError(`Step ${stepNumber} — auth detour #${context.AuthDetourCount} to ${currentUrl}; exceeded MaxDetours (${authCfg.MaxDetours}). Terminating as Failed/AuthDetour — an infrastructure/session fault, not an agent failure (CU-B7)`);
            const verdict = await this.forceFinalJudge(context, stepNumber, lastVerdict);
            const result = this.buildResult(context, 'Failed', false, verdict);
            result.FailureReason = 'AuthDetour';
            this.onRunComplete(result);
            return { result, recoveryMs: 0 };
        }

        this.log(`Step ${stepNumber} — auth detour #${context.AuthDetourCount} detected (${currentUrl}); recovering (re-apply auth + navigate to start URL), not charging the agent (CU-B7)`);
        const recoveryMs = await this.recoverFromAuthDetour(context);
        return { recoveryMs };
    }

    /**
     * Recover from an auth detour by re-applying the run's configured auth and
     * re-navigating to the start URL. Reuses the same generic primitives the
     * engine uses at launch — it holds no app- or provider-specific knowledge.
     * `ResetDomain` clears the "already applied" guard so header/cookie auth is
     * genuinely re-applied for the start domain. Best-effort: never throws (a
     * failed recovery just leaves the login page up, and the next detour will
     * escalate toward the MaxDetours terminate). Returns the elapsed ms.
     */
    private async recoverFromAuthDetour(context: RunContext): Promise<number> {
        const start = performance.now();
        try {
            const startUrl = context.Params.StartUrl;
            if (startUrl) {
                this.authHandler.ResetDomain(NavigationGuard.ExtractDomain(startUrl));
            }
            await this.runGlobalAuthCallback();
            await this.navigateToStartUrl(context.Params, context);
        } catch (error) {
            this.logError('Auth-detour recovery failed (leaving current page for the next detour check)', error);
        }
        return performance.now() - start;
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
        step.StartedAt = Date.now();
        step.UrlBefore = this.browserAdapter.CurrentUrl;
        step.Url = step.UrlBefore;        // back-compat alias for UrlBefore
        step.UrlAfter = step.UrlBefore;   // updated after actions run (CU-A8)

        try {
            this.log(`Step ${stepNumber}/${context.Params.MaxSteps}`);

            // 1. Settle: wait for the page to actually finish rendering after the
            //    previous step's actions before we perceive (CU-A1/A2). Adaptive —
            //    networkidle fast path, then a poll loop over the readiness beacon,
            //    busy markers, and perceptual-hash stability. Timed separately
            //    (SettleMs) so agent-time accounting can exclude environment wait
            //    (CU-F1/B4). Converts wasted LLM round-trips on a slow load into
            //    free engine polling.
            const settle = await this.settleBeforePerception(context);
            step.SettleMs = settle.ms;
            step.SettleReason = settle.reason;
            if (settle.reason === 'budget') {
                this.log(`Step ${stepNumber} — settle budget expired after ${Math.round(settle.ms)}ms (page still busy/unstable)`);
            } else {
                this.log(`Step ${stepNumber} — page settled in ${Math.round(settle.ms)}ms (${settle.reason})`);
            }

            // Cancellation checkpoint (CU-B8): a Stop() during settle already
            // broke the poll delay — bail before paying for screenshot + LLM.
            this.ensureNotCancelled();

            // 2. Capture screenshot + perceptual hash (CU-F6)
            const screenshotStart = performance.now();
            const screenshot = await this.captureScreenshot(context);
            step.Screenshot = screenshot;
            step.ScreenshotHash = computePerceptualHash(screenshot);
            step.ScreenshotMs = performance.now() - screenshotStart;
            this.log(`Step ${stepNumber} — screenshot captured (${Math.round(screenshot.length / 1024)}KB base64)`);

            // 2b. Element-grounded perception (CU-A4): extract the interactive
            //     elements, record them on the step (raw material for replayable
            //     traces), and serialize an indexed list for the controller so it
            //     can act by index instead of estimating coordinates.
            const elementList = await this.perceiveInteractiveElements(context, step);

            // 3. Build controller request + call controller LLM (timed — CU-F1)
            const request = this.buildControllerRequest(context, stepNumber);
            request.InteractiveElements = elementList;
            const llmStart = performance.now();
            const response = await this.executeControllerWithRetry(request);
            step.LlmMs = performance.now() - llmStart;
            step.ControllerReasoning = response.Reasoning;
            step.ActionsRequested = response.Actions;

            // A step that asks for judgement is a deliberate checkpoint, not an
            // empty/stuck step — record it so the main loop's empty-step abort
            // does not misfire (CU-B3).
            const controllerRequestedJudgement = response.RequestJudgement ?? false;
            step.RequestedJudgement = controllerRequestedJudgement;
            if (controllerRequestedJudgement) {
                this.log(`Step ${stepNumber} — controller requested immediate judgement evaluation`);
            }

            this.logControllerResponse(stepNumber, response);

            // Cancellation checkpoint (CU-B8): if Stop() aborted the controller
            // call, don't execute its (now-stale, possibly empty) actions.
            this.ensureNotCancelled();

            // 4. Execute tool calls + browser actions (timed — CU-F1); record post-action URL (CU-A8)
            const actionStart = performance.now();
            await this.executeStepActions(response, context, step, stepNumber);
            step.ActionMs = performance.now() - actionStart;
            step.UrlAfter = this.browserAdapter.CurrentUrl;

            // 4b. Drain this step's browser diagnostics (CU-A7). GetDiagnostics()
            //     clears the buffer, so each step gets exactly its own events.
            //     A compact digest goes to the judge (this step) and the next
            //     controller prompt so a blank/broken page becomes explainable
            //     (ChunkLoadError, POST /graphql 500) instead of guessed at.
            step.Diagnostics = this.browserAdapter.GetDiagnostics();
            const diagnosticsDigest = formatDiagnosticsDigest(step.Diagnostics);
            context.LastDiagnosticsDigest = diagnosticsDigest || undefined;
            if (diagnosticsDigest) {
                this.log(`Step ${stepNumber} — browser diagnostics: ${diagnosticsDigest.replace(/\n/g, ' | ')}`);
            }

            // 5. Evaluate judge. Gate (CU-G5): if the controller did not explicitly
            //    request judgement and the visible state is unchanged since the last
            //    judged step (same perceptual hash) with a non-terminal prior verdict,
            //    skip the (expensive) re-judge — nothing changed, the prior verdict
            //    still stands. This kills the ~12 redundant "still stuck" judge calls
            //    on a stalled/looping run.
            const scheduledJudge = this.shouldEvaluateJudge(stepNumber, context.Params);
            const stateUnchanged =
                context.LastJudgedHash !== undefined &&
                step.ScreenshotHash !== '' &&
                hashesSimilar(context.LastJudgedHash, step.ScreenshotHash) &&
                context.LastJudgeVerdict !== undefined &&
                !context.LastJudgeVerdict.Done &&
                !context.LastJudgeVerdict.Impossible;
            const runJudge = controllerRequestedJudgement || (scheduledJudge && !stateUnchanged);

            if (scheduledJudge && stateUnchanged && !controllerRequestedJudgement) {
                this.log(`Step ${stepNumber} — skipping judge: visible state unchanged since last judged step (CU-G5)`);
            }

            if (runJudge) {
                // Cancellation checkpoint (CU-B8): don't start a judge LLM call
                // for a run that's already been stopped.
                this.ensureNotCancelled();
                if (controllerRequestedJudgement) {
                    this.log(`Step ${stepNumber} — evaluating judge (controller request)`);
                }
                const judgeStart = performance.now();
                step.JudgeVerdict = await this.evaluateJudge(context, stepNumber, controllerRequestedJudgement, step.ScreenshotHash, diagnosticsDigest);
                step.JudgeMs = performance.now() - judgeStart;
                context.LastJudgedHash = step.ScreenshotHash;
                context.LastJudgeVerdict = step.JudgeVerdict;
                if (step.JudgeVerdict) {
                    this.log(`Step ${stepNumber} — judge verdict: Done=${step.JudgeVerdict.Done}, Impossible=${step.JudgeVerdict.Impossible}, Confidence=${step.JudgeVerdict.Confidence}, Reason: ${step.JudgeVerdict.Reason}`);
                }
            }
        } catch (error) {
            // Cancellation is control flow, not a step failure — let it unwind to
            // the main loop, which maps it to a clean Cancelled status (CU-B8).
            if (error instanceof CancellationError) {
                throw error;
            }
            step.Error = this.wrapError(error, stepNumber);
            this.logError(`Step ${stepNumber} — step failed`, error);
        }

        step.DurationMs = performance.now() - stepStart;
        this.log(`Step ${stepNumber} — completed in ${Math.round(step.DurationMs)}ms (settle ${Math.round(step.SettleMs)}ms · llm ${Math.round(step.LlmMs)}ms · action ${Math.round(step.ActionMs)}ms · judge ${Math.round(step.JudgeMs)}ms)`);
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
        step.ActionResults = await this.executeBrowserActions(scaledActions, context, step);
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
        // The settle delay is owned and timed by executeSingleStep (SettleMs)
        // so it is not conflated with capture time; here we only capture.
        const screenshot = await this.browserAdapter.CaptureScreenshot();
        context.AddScreenshot(screenshot);
        return screenshot;
    }

    // ─── Element-Grounded Perception (CU-A4) ───────────────

    /**
     * When element grounding is enabled, extract the page's interactive elements,
     * record them on the step (raw material for replayable traces), and return
     * the serialized indexed list for the controller prompt (with `*` markers on
     * elements new since the previous step). Returns undefined when grounding is
     * off or nothing was found — the controller then works in coordinate mode.
     * Never throws: an extractor failure degrades to coordinate mode.
     */
    private async perceiveInteractiveElements(
        context: RunContext,
        step: StepRecord
    ): Promise<string | undefined> {
        if (!context.Params.ElementGrounding) {
            return undefined;
        }
        try {
            const elements = await this.browserAdapter.ExtractInteractiveElements();
            step.InteractiveElements = elements;
            const serialized = serializeInteractiveElements(elements, context.LastInteractiveElements);
            context.LastInteractiveElements = elements;
            if (elements.length > 0) {
                this.log(`Step ${step.StepNumber} — element grounding: ${elements.length} interactive elements`);
            }
            return elements.length > 0 ? serialized : undefined;
        } catch (error) {
            this.logError('Interactive-element extraction failed (falling back to coordinate mode)', error);
            return undefined;
        }
    }

    // ─── Settle Loop (CU-A1/A2) ────────────────────────────

    /**
     * Wait for the page to finish rendering before we perceive it. Adaptive:
     * a `networkidle` fast path, then a poll loop that consults (in priority
     * order) the app's readiness beacon, its busy markers, and perceptual-hash
     * stability. Returns the elapsed ms and the reason it stopped.
     *
     * The engine is app-agnostic: beacon and extra busy markers come from the
     * {@link AppProfile} the caller supplies; the engine only adds its own
     * app-neutral markers and knows how to poll. A probe failure degrades to
     * "keep waiting until budget"; the only throw is a {@link CancellationError}
     * when the run is stopped mid-settle (CU-B8), which unwinds to Cancelled.
     */
    private async settleBeforePerception(context: RunContext): Promise<{ ms: number; reason: SettleReason }> {
        const start = performance.now();
        if (!this.browserAdapter?.IsOpen) {
            return { ms: 0, reason: 'none' };
        }

        const profile = context.Params.AppProfile;
        const cfg = profile?.Settle ?? new SettleConfig();
        const markers = [...DEFAULT_BUSY_MARKERS, ...(profile?.BusyMarkers ?? [])];
        const beacon = profile?.ReadinessBeacon;
        // Floor: a profile governs its own MinWaitMs; without one, preserve the
        // legacy ScreenshotDelayMs as the minimum wait so behavior is unchanged.
        const floorMs = profile ? cfg.MinWaitMs : context.Params.ScreenshotDelayMs;

        // Fast path: networkidle, capped (it can hang on long-poll / websocket
        // apps like GraphQL subscriptions, so it must never be the sole signal).
        const networkIdle = await this.raceWithTimeout(
            this.browserAdapter.WaitForLoadState('networkidle'),
            cfg.NetworkIdleCapMs
        );

        let lastHash = '';
        let sawBusy = false;

        while (performance.now() - start < cfg.MaxWaitMs) {
            // Cancellation checkpoint (CU-B8): Stop() makes the poll delay below
            // resolve instantly, so without this the loop would busy-spin until
            // MaxWaitMs. Throw to unwind straight to a Cancelled result.
            this.ensureNotCancelled();

            // 1. Readiness beacon (CU-A2) — the declared, deterministic signal.
            const beaconPresent = beacon ? (await this.safeQuery(beacon)).Exists : false;
            // 2. Busy markers — any present-and-visible marker means still loading.
            const busy = await this.anyMarkerBusy(markers);
            if (busy) {
                sawBusy = true;
            }
            // 3. Perceptual-hash stability — two consecutive similar frames.
            const hash = computePerceptualHash(await this.browserAdapter.CaptureScreenshot());
            const hashStable = lastHash !== '' && hash !== '' && hashesSimilar(lastHash, hash);
            lastHash = hash;

            const reason = resolveSettleExit({
                beaconDeclared: beacon !== undefined,
                beaconPresent,
                busy,
                hashStable,
                sawBusy,
                networkIdle,
                elapsedMs: performance.now() - start,
                floorMs,
            });
            if (reason) {
                return { ms: performance.now() - start, reason };
            }

            await this.delay(cfg.PollMs);
        }

        return { ms: performance.now() - start, reason: 'budget' };
    }

    /** QueryElement that never throws — an errored probe reports "absent". */
    private async safeQuery(selector: string): Promise<ElementInfo> {
        try {
            return await this.browserAdapter.QueryElement(selector);
        } catch {
            return new ElementInfo();
        }
    }

    /** True when any of the given selectors matches a visible element. */
    private async anyMarkerBusy(markers: string[]): Promise<boolean> {
        for (const marker of markers) {
            const info = await this.safeQuery(marker);
            if (info.Exists && info.Visible) {
                return true;
            }
        }
        return false;
    }

    /** Resolve when `p` settles or `ms` elapses; returns true iff `p` won the race. */
    private async raceWithTimeout(p: Promise<unknown>, ms: number): Promise<boolean> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), ms); });
        const completed = p.then(() => true).catch(() => true);
        const won = await Promise.race([completed, timeout]);
        if (timer) {
            clearTimeout(timer);
        }
        return won;
    }

    private delay(ms: number): Promise<void> {
        // Abortable (CU-B8): a cancelled run's pending settle poll / retry
        // backoff resolves early instead of holding the worker slot; the caller's
        // next ensureNotCancelled() checkpoint turns that into a clean Cancelled.
        return abortableDelay(ms, this.abortController.signal);
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
                // Pass through the DOM-targeting fields (CU-A6): when Selector is
                // set the adapter ignores X/Y, and Modifiers apply on both paths.
                scaled.Selector = action.Selector;
                scaled.Modifiers = action.Modifiers;
                return scaled;
            }

            if (action.Type === 'Scroll') {
                const scaled = new ScrollAction();
                scaled.DeltaX = Math.round(action.DeltaX * scaleX);
                scaled.DeltaY = Math.round(action.DeltaY * scaleY);
                scaled.Selector = action.Selector;   // CU-A6: preserve scroll-into-view target
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
        // Thread the cancellation signal so an in-flight controller call aborts
        // promptly on Stop() (CU-B8); consumed by Layer 2, not template data.
        request.Signal = this.abortController.signal;

        // Include tool definitions if any tools are registered
        if (this.toolProvider.HasTools) {
            request.ToolDefinitions = this.toolProvider.GetToolDefinitions();
        }

        // Inject judge feedback from the previous step
        if (context.LastJudgeFeedback) {
            request.JudgeFeedback = context.LastJudgeFeedback;
        }

        // Inject loop evidence when the engine has detected a repeated state (CU-B1)
        if (context.LoopEvidence) {
            request.LoopEvidence = context.LoopEvidence;
        }

        // Inject the previous step's browser-diagnostics digest (CU-A7)
        if (context.LastDiagnosticsDigest) {
            request.Diagnostics = context.LastDiagnosticsDigest;
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

        // Forward application context (suite-level + per-test) if set
        if (context.Params.ApplicationContext) {
            request.ApplicationContext = context.Params.ApplicationContext;
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
    private static readonly CONTROLLER_MAX_ATTEMPTS = 3;

    /**
     * Call the controller with bounded retry for transient failures (CU-B3).
     *
     * The controller LLM is nondeterministic and, under host/provider load,
     * transiently fails (rate limits, transport errors) or returns an
     * unparseable response. Previously this method retried nothing — a single
     * hiccup produced an empty step, and three in a row killed the run as an
     * infrastructure 'Error' precisely when the environment was worst. Now:
     *  - a thrown transport/rate-limit error is retried with exponential
     *    backoff + jitter;
     *  - an empty response whose reasoning matches a transient/parse signature
     *    is retried (a fresh sample may parse);
     *  - a genuine, well-formed empty response (e.g. a config error, or an
     *    intentional judgement request) is returned immediately — retrying it
     *    would not help.
     */
    private async executeControllerWithRetry(
        request: ControllerPromptRequest
    ): Promise<ControllerPromptResponse> {
        const maxAttempts = ComputerUseEngine.CONTROLLER_MAX_ATTEMPTS;
        let lastResponse: ControllerPromptResponse | undefined;
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            // Cancellation checkpoint (CU-B8): don't retry a controller call for a
            // run that's been stopped — the aborted signal makes the call return
            // fast, and this unwinds before another (pointless) attempt.
            this.ensureNotCancelled();
            try {
                const response = await this.executeControllerPrompt(request);

                // Actionable (or a deliberate judgement request) → success.
                if (response.Actions.length > 0 || response.ToolCalls.length > 0 || (response.RequestJudgement ?? false)) {
                    return response;
                }

                lastResponse = response;
                if (attempt === maxAttempts || !this.isTransientControllerResponse(response)) {
                    return response;
                }
                this.log(`Controller returned a transient/unparseable response (attempt ${attempt}/${maxAttempts}); retrying after backoff`);
            } catch (error) {
                lastError = error;
                this.logError(`Controller call threw (attempt ${attempt}/${maxAttempts})`, error);
                if (attempt === maxAttempts) {
                    break;
                }
            }
            await this.backoffDelay(attempt);
        }

        if (lastResponse) {
            return lastResponse;
        }
        // Every attempt threw — surface the failure as a controller response so
        // the step records it (rather than throwing out of the loop, which the
        // caller's try/catch would then log as a generic step error).
        const response = new ControllerPromptResponse();
        response.Reasoning = `Controller call failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`;
        response.RawResponse = response.Reasoning;
        return response;
    }

    /**
     * True for an empty controller response worth retrying — a transient LLM
     * failure or an unparseable payload. A missing-model configuration error is
     * NOT transient and returns false (retrying cannot fix configuration).
     */
    private isTransientControllerResponse(response: ControllerPromptResponse): boolean {
        const reasoning = response.Reasoning ?? '';
        if (reasoning.includes('No controller model configured')) {
            return false;
        }
        return (
            reasoning.includes('LLM call failed') ||
            reasoning.includes('parse error') ||
            reasoning.includes('Failed to extract JSON') ||
            reasoning.includes('timeout') ||
            reasoning.includes('rate limit')
        );
    }

    /** Exponential backoff (250ms, 500ms, …) with jitter, bounded by attempt. */
    private async backoffDelay(attempt: number): Promise<void> {
        const base = 250 * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 100;
        await new Promise<void>(resolve => setTimeout(resolve, base + jitter));
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
        context: RunContext,
        step: StepRecord
    ): Promise<ActionExecutionResult[]> {
        const results: ActionExecutionResult[] = [];
        const maxActions = context.Params.MaxActionsPerStep ?? DEFAULT_MAX_ACTIONS_PER_BATCH;

        for (const action of actions) {
            // Cancellation checkpoint (CU-B8): stop between actions so a Stop()
            // during a multi-action step releases the slot without running the rest.
            this.ensureNotCancelled();

            const urlBefore = this.browserAdapter.CurrentUrl;
            const result = await this.executeSingleBrowserAction(action, context);
            results.push(result);

            // Batch guards (CU-B5): after each action decide whether the rest of
            // the batch should still run. Stops on a failed action (so a queued
            // Type can't fire into the wrong place), a mid-batch route change, a
            // page-changing action, or the per-step cap. Partial results are kept
            // and the reason is surfaced to the next step's summary.
            const urlChanged = this.browserAdapter.CurrentUrl !== urlBefore;
            const stop = evaluateBatchStop({
                actionType: action.Type,
                success: result.Success,
                urlChanged,
                executedCount: results.length,
                maxActions,
            });
            if (stop && results.length < actions.length) {
                const skipped = actions.length - results.length;
                step.BatchStopReason = `executed ${results.length}/${actions.length} actions, stopped: ${stop}`;
                this.log(`Step ${step.StepNumber} — ${step.BatchStopReason} (${skipped} not run)`);
                break;
            }
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
        controllerRequestedJudgement: boolean = false,
        currentScreenshotHash: string = '',
        currentDiagnosticsDigest: string = ''
    ): Promise<JudgeVerdict> {
        const judgeContext = new JudgeContext();
        judgeContext.Goal = context.Params.Goal;
        judgeContext.CurrentScreenshot = context.CurrentScreenshot;
        judgeContext.CurrentScreenshotHash = currentScreenshotHash;
        judgeContext.ScreenshotHistory = context.ScreenshotHistory;
        judgeContext.StepHistory = context.StepHistory;
        judgeContext.StepNumber = stepNumber;
        judgeContext.MaxSteps = context.Params.MaxSteps;
        judgeContext.CurrentUrl = context.CurrentUrl;
        judgeContext.ControllerRequestedJudgement = controllerRequestedJudgement;
        judgeContext.CurrentDiagnosticsDigest = currentDiagnosticsDigest;
        judgeContext.ValidationCriteria = context.Params.ValidationCriteria;   // rubric judging (CU-D1)
        judgeContext.Signal = this.abortController.signal;   // abort in-flight judge call on Stop() (CU-B8)

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

        // Application context first — it's the most general signal, sets the
        // stage before per-step/per-tool-specific guidance.
        sections.push(this.renderApplicationContextSection(request.ApplicationContext));
        sections.push(this.renderToolDefinitionsSection(request.ToolDefinitions));
        sections.push(this.renderFormLoginSection(request.FormLoginCredentials));
        sections.push(this.renderJudgeFeedbackSection(request.JudgeFeedback));
        sections.push(this.renderLoopEvidenceSection(request.LoopEvidence));
        sections.push(this.renderDiagnosticsSection(request.Diagnostics));
        sections.push(this.renderInteractiveElementsSection(request.InteractiveElements));
        sections.push(this.renderPreviousStepsSection(request.PreviousStepSummary));

        return sections.filter(Boolean).join('\n\n');
    }

    private renderApplicationContextSection(context: string | undefined): string {
        if (!context || !context.trim()) return '';
        return `## Application Context\nYou are testing the application described below. Use this context to navigate efficiently — do NOT waste steps rediscovering these facts.\n\n${context.trim()}`;
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

    private renderLoopEvidenceSection(evidence: string | undefined): string {
        if (!evidence) return '';

        return `## ⚠️ Loop Detected\n${evidence}\nYou appear to be repeating actions without making progress. Do NOT repeat the same navigation or clicks. Try a DIFFERENT approach — a different element, a different route, or request judgement if you believe the goal is genuinely blocked.`;
    }

    private renderDiagnosticsSection(diagnostics: string | undefined): string {
        if (!diagnostics) return '';

        return `## Browser Diagnostics (previous step)\nThe browser reported the following errors, which may explain a blank, broken, or unexpected page:\n${diagnostics}\nFactor these in — e.g. a failed script/chunk load or a failed API request means the page did not render, not that you clicked the wrong thing.`;
    }

    private renderInteractiveElementsSection(elementList: string | undefined): string {
        if (!elementList) return '';

        return `## Interactive Elements (this page)\nEach line is \`[index] role "name"\`. A \`*\` marks an element new since the previous step; \`|SCROLL|\` marks a scrollable container.\n${elementList}\n**Prefer targeting these by index** — \`{ "Type": "ClickElement", "Index": 12 }\` or \`{ "Type": "TypeIntoElement", "Index": 13, "Text": "…" }\` — over estimating coordinates. Index targeting waits for the element and clicks it precisely. Fall back to coordinate Click only for elements not in this list (e.g. canvas/custom-rendered surfaces).`;
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

        const rendered = template
            .replace(/\{\{goal\}\}/g, request.Goal)
            .replace(/\{\{stepNumber\}\}/g, String(request.StepNumber))
            .replace(/\{\{maxSteps\}\}/g, String(request.MaxSteps))
            .replace(/\{\{currentUrl\}\}/g, request.CurrentUrl)
            .replace(/\{\{stepSummary\}\}/g, request.StepSummary);

        const sections = [rendered];

        // Rubric (CU-D1): when the run supplied validation criteria, ask the judge
        // for a binary per-criterion verdict. Done is then derived as
        // all-criteria-met (the generic prompt has no {{criteria}} slot).
        if (request.ValidationCriteria && request.ValidationCriteria.length > 0) {
            const list = request.ValidationCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
            sections.push(`## Validation Criteria\nEvaluate the end-state against EACH criterion below. In your JSON response, include a "criteria" array of \`{ "criterion": "<text>", "met": true|false, "evidence": "<what you observed>" }\` — one entry per criterion. The goal is "done" only when EVERY criterion is met.\n${list}`);
        }

        // Append the current step's browser-diagnostics digest (CU-A7) so the
        // judge can explain an infrastructure state instead of guessing.
        if (request.Diagnostics) {
            sections.push(`## Browser Diagnostics (current step)\nThe browser reported the following errors this step — use them to explain the visible state instead of guessing:\n${request.Diagnostics}`);
        }
        return sections.join('\n\n');
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
        result.AuthDetourCount = context.AuthDetourCount;
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
