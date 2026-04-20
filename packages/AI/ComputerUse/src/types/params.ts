/**
 * Run parameters for the Computer Use engine.
 *
 * RunComputerUseParams is the single entry point for configuring a run.
 * It composes types from other modules (auth, tools, browser, judge)
 * into a unified configuration object.
 *
 * Layer 2 (MJRunComputerUseParams) extends this with MJ-specific fields
 * like prompt entity references, contextUser, and agentRunId.
 *
 * Most fields are optional with sensible defaults — callers only need
 * to set `Goal` (and optionally `StartUrl`) for a basic run.
 */

import { ComputerUseAuthConfig } from './auth.js';
import { BrowserConfig } from './browser.js';
import { ComputerUseTool } from './tools.js';
import type { JudgeFrequency } from './judge.js';

// ─── Model Config ──────────────────────────────────────────
/**
 * Lightweight model selection for the controller and judge LLMs.
 *
 * Layer 1 only needs vendor + model name strings — it passes these
 * to the LLM provider without MJ-specific entity resolution.
 * Layer 2 overrides this with MJ prompt entity references.
 */
export class ModelConfig {
    /** AI vendor identifier (e.g., "anthropic", "openai", "google") */
    public Vendor: string;
    /** Model identifier (e.g., "claude-sonnet-4-5-20250929", "gpt-4o") */
    public Model: string;
    /**
     * Optional: explicit LLM driver class name (e.g., "AnthropicLLM", "VertexLLM").
     * When set, the engine uses this directly for ClassFactory instead of
     * mapping from the Vendor string. Set by Layer 2 from AI Model metadata.
     */
    public DriverClass?: string;

    constructor(vendor: string, model: string, driverClass?: string) {
        this.Vendor = vendor;
        this.Model = model;
        this.DriverClass = driverClass;
    }
}

// ─── Run Parameters ────────────────────────────────────────
/**
 * Complete configuration for a Computer Use engine run.
 *
 * Required: `Goal` (what to accomplish)
 * Recommended: `StartUrl` (where to begin)
 * Everything else has sensible defaults.
 */
export class RunComputerUseParams {
    /** Natural-language goal for the agent to accomplish */
    public Goal: string = '';

    /** Starting URL to navigate to */
    public StartUrl?: string;

    /** Run browser in headless mode (default: true) */
    public Headless: boolean = true;

    /**
     * Domains the browser is allowed to visit.
     * If set, all other domains are blocked.
     * If empty/undefined, all domains are allowed (open navigation).
     */
    public AllowedDomains?: string[];

    /**
     * Domains explicitly blocked.
     * Evaluated AFTER AllowedDomains — blocked always wins.
     */
    public BlockedDomains?: string[];

    /** Maximum number of controller loop steps before forced termination (default: 30) */
    public MaxSteps: number = 30;

    /**
     * Number of recent screenshots to include in controller context.
     * Acts as a ring buffer — older screenshots are dropped.
     * Higher values give more context but increase token usage. (default: 20)
     */
    public ScreenshotHistoryDepth: number = 20;

    /**
     * Delay in milliseconds before each screenshot capture.
     * Gives the page time to render after actions (clicks, navigation, typing)
     * before the screenshot is taken for the next LLM reasoning step.
     * Set to 0 to disable. (default: 500)
     */
    public ScreenshotDelayMs: number = 500;

    /** Override for the controller system prompt */
    public ControllerPrompt?: string;

    /** Override for the judge prompt */
    public JudgePrompt?: string;

    /** Model selection for the controller LLM */
    public ControllerModel?: ModelConfig;

    /** Model selection for the judge LLM */
    public JudgeModel?: ModelConfig;

    /** Tools the LLM can invoke during execution */
    public Tools?: ComputerUseTool[];

    /** Per-domain authentication configuration */
    public Auth?: ComputerUseAuthConfig;

    /**
     * Judge evaluation frequency (default: EveryStep).
     * Use EveryNSteps or OnStagnation to reduce LLM costs.
     */
    public JudgeFrequency?: JudgeFrequency;

    /** Browser-specific configuration (viewport, user agent, timeouts) */
    public BrowserConfig?: BrowserConfig;

    /**
     * Optional callback for logging engine messages.
     * If provided, all log messages will be sent to this callback
     * in addition to (or instead of) console output.
     * Useful for test drivers to capture logs for test run records.
     */
    public LogCallback?: (level: 'info' | 'warn' | 'error', message: string) => void;
}
