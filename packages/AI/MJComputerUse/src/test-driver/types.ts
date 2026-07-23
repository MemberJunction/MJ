/**
 * Configuration and type definitions for the Computer Use test driver.
 *
 * These interfaces define the JSON structure for the three core fields
 * on a TestEntity: Configuration, InputDefinition, and ExpectedOutcomes.
 *
 * Usage example (TestEntity JSON fields):
 *
 * Configuration:
 * {
 *   "headless": true,
 *   "maxSteps": 20,
 *   "maxExecutionTime": 120000,
 *   "controllerPromptName": "Computer Use: Controller",
 *   "judgePromptName": "Computer Use: Judge",
 *   "judgeFrequency": "EveryStep",
 *   "oracles": [
 *     { "type": "goal-completion", "weight": 0.6 },
 *     { "type": "url-match", "weight": 0.4, "config": { "pattern": "^https://example\\.com/success" } }
 *   ],
 *   "scoringWeights": { "goal-completion": 0.6, "url-match": 0.4 }
 * }
 *
 * InputDefinition:
 * {
 *   "goal": "Navigate to the login page and sign in",
 *   "startUrl": "https://example.com",
 *   "allowedDomains": ["example.com", "*.auth0.com"],
 *   "blockedDomains": ["ads.example.com"]
 * }
 *
 * ExpectedOutcomes:
 * {
 *   "goalCompleted": true,
 *   "finalUrlPattern": "^https://example\\.com/dashboard",
 *   "minConfidence": 0.7,
 *   "maxSteps": 15
 * }
 */

// ─── Configuration (TestEntity.Configuration JSON) ────────────────

/**
 * Oracle configuration within the test.
 * Each oracle specifies a type, optional config, and optional weight.
 */
export interface ComputerUseOracleConfig {
    /** Oracle type identifier (e.g., "goal-completion", "url-match") */
    type: string;

    /** Oracle-specific configuration */
    config?: Record<string, unknown>;

    /** Weight for scoring (0.0 to 1.0) */
    weight?: number;

    /**
     * When true, this oracle is advisory — reported and scored for diagnostics
     * but non-gating for Passed/Failed (CU-D3). Defaults per oracle type:
     * `step-count` is advisory by default (it's an efficiency signal, and the
     * engine already caps steps at the same limit, making a gating check a
     * tautology); all other oracles gate by default. Set explicitly to override.
     */
    advisory?: boolean;
}

/**
 * Configuration for a Computer Use test.
 * Stored as JSON in TestEntity.Configuration.
 */
import type { ArtifactRetentionPolicy } from './artifact-retention.js';
import type { ReplayTier } from '@memberjunction/computer-use';

export interface ComputerUseTestConfig {
    /** Run browser in headless mode (default: true) */
    headless?: boolean;

    /** Maximum number of controller loop steps (default: 30) */
    maxSteps?: number;

    /** Maximum execution time in milliseconds (default: 300000 / 5 min) */
    maxExecutionTime?: number;

    /** Number of recent screenshots to include in controller context */
    screenshotHistoryDepth?: number;

    /** MJ AI Prompt entity name for controller */
    controllerPromptName?: string;

    /** MJ AI Prompt entity name for judge */
    judgePromptName?: string;

    /** Direct model override for controller (bypasses auto-select and prompt lookup) */
    controllerModel?: { vendor: string; model: string; driverClass?: string };

    /** Direct model override for judge */
    judgeModel?: { vendor: string; model: string; driverClass?: string };

    /**
     * Judge evaluation frequency.
     * Formats: "EveryStep", "EveryNSteps:N", "OnStagnation:N"
     */
    judgeFrequency?: string;

    /** Browser viewport width (default: 1280) */
    viewportWidth?: number;

    /** Browser viewport height (default: 720) */
    viewportHeight?: number;

    /** Oracles to run for evaluation */
    oracles?: ComputerUseOracleConfig[];

    /** Scoring weights by oracle type */
    scoringWeights?: Record<string, number>;

    /** Agent run ID to link prompt runs to (optional, typically set at runtime) */
    agentRunId?: string;

    /** MJ Actions to expose as tools to the controller LLM (resolved by MJComputerUseEngine) */
    actions?: Array<{ actionName?: string; actionId?: string }>;

    /** Additional Chromium launch arguments (e.g., ["--unsafely-treat-insecure-origin-as-secure=http://example:4200"]) */
    browserArgs?: string[];

    /**
     * Attach to an already-running browser instead of launching one.
     * Auto-detects the connect method from the URL scheme:
     *   - `http(s)://…`  → Chrome DevTools Protocol (`chromium.connectOverCDP`)
     *   - `ws(s)://…`    → Playwright browser server (`chromium.connect`)
     *
     * When set, the test driver does NOT close the browser at shutdown — the
     * caller owns its lifecycle. `headless` is ignored (the external browser
     * already decided).
     *
     * In parallel-worker test runs, `HeadlessBrowserEngine` is a process-global
     * singleton — the first worker to initialize wins. All workers in a suite
     * must agree on this endpoint or behavior is undefined.
     */
    connect?: string;

    /**
     * Force the connect method. A raw CDP websocket also uses `ws://`, which
     * auto-detect would treat as a Playwright server; set `'cdp'` to override.
     * Defaults to `'auto'` (scheme-based detection). Ignored when `connect` is unset.
     */
    connectType?: 'cdp' | 'server' | 'auto';

    /**
     * When attached, reuse the running browser's first existing context so its
     * cookies / auth / session are shared, instead of creating a fresh isolated
     * context. Defaults to false. Breaks per-test isolation. Ignored when
     * `connect` is unset.
     *
     * Only honored on the engine.Run() path (sequential / `"new-clean"` strategy).
     * The parallel path (`HeadlessBrowserEngine.GetIsolated`/`GetRecycled`)
     * always creates its own contexts under the attached browser.
     */
    reuseExistingContext?: boolean;

    /**
     * Browser session strategy. Controls how the browser context is managed.
     *
     * - `"new"` — Fresh context every test (default for sequential execution)
     * - `"shared:suite"` — Shared context per suite run + worker (default for parallel execution)
     * - `"shared:global"` — Shared context globally per worker
     * - Any other string — Used as a literal key for HeadlessBrowserEngine.GetRecycled()
     *
     * When running in parallel (workerIndex is set on context), defaults to "shared:suite"
     * so that auth state persists between tests in the same worker.
     */
    browserSession?: string;

    /**
     * App-specific readiness/busy signals for the adaptive settle loop
     * (CU-A1/A2). Optional — the driver applies MJ-Explorer-sensible defaults (a
     * `[data-mj-ready="true"]` readiness beacon and MJ loading-spinner markers)
     * when omitted. Provide to override when the target app under test isn't MJ
     * Explorer, or to tune settle timing.
     */
    appProfile?: {
        /** CSS selector for the app's readiness beacon (polled first; wins over heuristics). */
        readinessBeacon?: string;
        /** Additional busy-marker CSS selectors (merged with the engine's app-neutral defaults). */
        busyMarkers?: string[];
        /** Settle-loop timing overrides. */
        settle?: {
            maxWaitMs?: number;
            pollMs?: number;
            networkIdleCapMs?: number;
            minWaitMs?: number;
        };
        /**
         * Auth-detour watchdog (CU-B7). When the session is invalidated mid-run
         * and the page bounces to an identity provider, the watchdog recovers it
         * (re-auth + re-navigate) without charging the agent a step, and after
         * `maxDetours` ends the run as an infrastructure `AuthDetour` instead of
         * grading the agent on it. Defaults to MJ's providers (Auth0 + Entra);
         * pass `identityProviderPatterns: []` to disable.
         */
        auth?: {
            /** Case-insensitive URL substrings marking an identity-provider bounce. */
            identityProviderPatterns?: string[];
            /** Terminate as AuthDetour after this many detours (default 2). */
            maxDetours?: number;
        };
    };

    /**
     * Per-test controller generation overrides (CU-E6) — determinism knobs
     * threaded into the controller prompt. `temperature` (e.g. 0 for pinned
     * regression runs) and `effortLevel` (1–100). Judge generation is unaffected.
     */
    generation?: { temperature?: number; effortLevel?: number };

    /**
     * Element-grounded perception (CU-A4). When true, each step the engine
     * extracts the page's interactive elements into an indexed list, renders it
     * into the controller prompt, and lets the controller act by index
     * (ClickElement/TypeIntoElement) with locator actionability auto-wait instead
     * of estimating coordinates. Default false (coordinate/vision mode) until
     * baked in across the suite.
     */
    elementGrounding?: boolean;

    /**
     * Failure-artifact trace policy (CU-F4). When enabled, the run records a
     * Playwright trace (DOM snapshots + network + console) viewable at
     * trace.playwright.dev, retained per this policy as a `File` TestRunOutput:
     * - `off` (default) — no trace, zero overhead.
     * - `retain-on-failure` — trace every run, keep it only when the test fails.
     * - `on` — trace every run, always keep it.
     * Tracing carries ~5–15% per-run overhead; measure on a smoke test before
     * enabling suite-wide (hence the default is `off`).
     */
    trace?: ArtifactRetentionPolicy;

    /**
     * Force a replay tier for this test (RI-C1 / RI-C6 canary override), bypassing
     * `decideReplayTier`. `'llm'` runs the full agent (the `rerun-failures --llm`
     * / canary escape hatch); `'replay'` / `'replay-with-heal'` force the
     * deterministic tier when a trace exists (no trace ⇒ still falls to LLM).
     * Unset (default) ⇒ the tier is decided per build/goal/heal-rate.
     */
    forceTier?: ReplayTier;
}

// ─── Input Definition (TestEntity.InputDefinition JSON) ───────────

/**
 * Input definition for a Computer Use test.
 * Stored as JSON in TestEntity.InputDefinition.
 */
export interface ComputerUseTestInput {
    /** Natural-language goal for the agent to accomplish (required) */
    goal: string;

    /**
     * Optional per-test UI hints injected after the goal (CU-E5) — e.g. "the
     * filter panel opens via the funnel icon", "search commits on Enter".
     * Documents the UI contract; harvested from failure triage. When a hint goes
     * stale that is itself a finding — pair each with a linked issue where it
     * compensates for a real defect.
     */
    hints?: string[];

    /** Starting URL to navigate to */
    startUrl?: string;

    /** Domains the browser is allowed to visit */
    allowedDomains?: string[];

    /** Domains explicitly blocked */
    blockedDomains?: string[];

    /** Per-domain authentication bindings (inline, not credential-based) */
    auth?: {
        bindings?: Array<{
            domains: string[];
            method: Record<string, unknown>;
        }>;
    };
}

// ─── Expected Outcomes (TestEntity.ExpectedOutcomes JSON) ─────────

/**
 * Expected outcomes for a Computer Use test.
 * Stored as JSON in TestEntity.ExpectedOutcomes.
 */
export interface ComputerUseExpectedOutcomes {
    /** Whether the goal should be completed (default: true) */
    goalCompleted?: boolean;

    /**
     * Regex pattern that the final URL must match.
     * Tested with `new RegExp(pattern).test(finalUrl)`.
     */
    finalUrlPattern?: string;

    /** Minimum judge confidence for a passing result (0.0 to 1.0) */
    minConfidence?: number;

    /** Maximum number of steps allowed (exceeding = fail) */
    maxSteps?: number;

    /** Custom validation criteria for LLM judge oracles */
    judgeValidationCriteria?: string[];
}

// ─── Actual Output (built by ComputerUseTestDriver, consumed by oracles) ──

/**
 * Shape of the actual output built by ComputerUseTestDriver.buildActualOutput()
 * and passed to every oracle via OracleInput.actualOutput.
 *
 * Mirrors fields extracted from ComputerUseResult.
 */
export interface ComputerUseActualOutput {
    success: boolean;
    status: string;
    totalSteps: number;
    totalDurationMs: number;
    finalUrl: string;
    finalScreenshot?: string;
    finalJudgeVerdict?: {
        Done: boolean;
        Confidence: number;
        Reason: string;
        Feedback?: string;
    };
    error?: string;
    stepCount: number;
}
