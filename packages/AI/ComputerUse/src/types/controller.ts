/**
 * Controller prompt types for the Computer Use engine.
 *
 * The Controller is the LLM that plans browser actions. It receives
 * a structured request (goal, screenshots, tools, feedback) and
 * returns a structured response (reasoning, actions, tool calls).
 *
 * These types are the contract for ComputerUseEngine.ExecuteControllerPrompt(),
 * which Layer 2 overrides to route through MJ's AIPromptRunner.
 */

import { BrowserAction } from './browser.js';
import { JsonSchema } from './tools.js';

// ─── Controller Prompt Request ─────────────────────────────
/**
 * Structured input to the controller LLM.
 *
 * Contains everything the LLM needs to decide the next action(s).
 * Layer 1 builds this from RunContext; Layer 2 may add MJ-specific
 * data before rendering via AIPromptRunner templates.
 */
export class ControllerPromptRequest {
    /** The natural-language goal being pursued */
    public Goal: string = '';

    /** Current screenshot as base64 PNG */
    public CurrentScreenshot: string = '';

    /** Recent screenshots as base64 PNGs (bounded ring buffer) */
    public ScreenshotHistory: string[] = [];

    /** Available tool definitions for the LLM to call */
    public ToolDefinitions: ToolDefinition[] = [];

    /** Feedback from the judge on the previous step (if available) */
    public JudgeFeedback?: string;

    /**
     * Engine-computed loop evidence for the previous step(s), when a repeated
     * state has been detected (CU-B1). Injected into the controller prompt so
     * the model can break out of the loop instead of repeating the same
     * ineffective action. Empty/undefined when no loop is active.
     */
    public LoopEvidence?: string;

    /**
     * Compact digest of browser diagnostics from the previous step (console
     * errors, failed requests, crashes) — CU-A7. Lets the controller see *why*
     * a page is blank/broken (e.g. `ChunkLoadError`, `POST /graphql 500`)
     * instead of guessing from pixels. Empty/undefined when the step was clean.
     */
    public Diagnostics?: string;

    /**
     * Serialized interactive-element list for this step (CU-A4), when element
     * grounding is on — `[12] button "Save"` / `[13] textbox "Name" (empty)`.
     * The controller targets these by index via ClickElement/TypeIntoElement.
     * Empty/undefined in coordinate/vision mode.
     */
    public InteractiveElements?: string;

    /**
     * Per-test UI hints (CU-E5) injected after the goal — documents the UI
     * contract ("search commits on Enter"). Empty/undefined when none.
     */
    public Hints?: string[];

    /**
     * Current date (YYYY-MM-DD) injected into the prompt (CU-E3) so the model can
     * reason about "today"/relative dates without hallucinating one.
     */
    public CurrentDate?: string;

    /**
     * The controller's durable memory + plan from the PREVIOUS step (CU-E2),
     * echoed back so history is self-describing and intent isn't re-derived.
     */
    public Memory?: string;
    public Plan?: string;

    /**
     * Cancellation signal for the controller LLM call (CU-B8). When the engine's
     * `Stop()` aborts it, an in-flight prompt returns promptly (Layer 2 threads
     * it into `AIPromptParams.cancellationToken`) instead of holding a worker
     * slot for the rest of a 30s+ call. Not template data — consumed by the
     * prompt executor only.
     */
    public Signal?: AbortSignal;

    /** Current URL the browser is on */
    public CurrentUrl: string = '';

    /** Current step number */
    public StepNumber: number = 0;

    /** Maximum steps for this run */
    public MaxSteps: number = 0;

    /**
     * FormLogin credentials to inject into the controller context.
     * Only populated when a BasicAuthMethod with Strategy='FormLogin'
     * matches the current domain. The controller LLM uses these to
     * fill login forms rather than having headers set automatically.
     */
    public FormLoginCredentials?: FormLoginCredentials;

    /** Previous actions and their results for context */
    public PreviousStepSummary?: string;

    /**
     * Free-form application context — typically markdown — that gives the
     * controller LLM a head-start on the app being tested (navigation landmarks,
     * common gotchas, route conventions). Sourced from `TestSuite.Configuration.
     * applicationContext` at the suite level; tests can append per-test notes.
     *
     * The engine renders this into the controller prompt's system message under
     * an "## Application Context" heading so the LLM doesn't waste steps
     * rediscovering app structure on every test.
     */
    public ApplicationContext?: string;
}

// ─── Form Login Credentials ────────────────────────────────
/**
 * Credentials injected into the controller context for form-based login.
 * Only used when BasicAuthMethod.Strategy is 'FormLogin'.
 */
export class FormLoginCredentials {
    public Username: string = '';
    public Password: string = '';
    public Domain: string = '';
}

// ─── Tool Definition (LLM-friendly format) ─────────────────
/**
 * Simplified tool definition for inclusion in LLM prompts.
 * Derived from ComputerUseTool but without the handler function.
 */
export class ToolDefinition {
    public Name: string = '';
    public Description: string = '';
    public InputSchema: JsonSchema = new JsonSchema();
}

// ─── Controller Prompt Response ────────────────────────────
/**
 * Parsed output from the controller LLM.
 *
 * The engine parses the LLM's text/structured output into this format.
 * Contains the reasoning, browser actions to execute, and any tool calls.
 */
export class ControllerPromptResponse {
    /** The LLM's reasoning for its decisions this step */
    public Reasoning: string = '';

    /** Browser actions the controller wants to execute */
    public Actions: BrowserAction[] = [];

    /** Tool calls the controller wants to make (executed before browser actions) */
    public ToolCalls: ToolCallRequest[] = [];

    /**
     * Whether the controller is requesting immediate judge evaluation.
     * When true, the judge will be consulted immediately regardless of
     * JudgeFrequency settings. Use this when the controller believes
     * the goal has been accomplished or needs confirmation of progress.
     */
    public RequestJudgement?: boolean;

    /**
     * Self-tracked agent state (CU-E2), all optional & parser-tolerant:
     * - `Evaluation` — did the PREVIOUS step's action achieve its intent
     *   (self-verification; pairs with Rule 11 / CU-E3).
     * - `Memory` — durable notes the model carries forward (≤~200 chars).
     * - `Plan` — a short checklist with the current item marked.
     * `Memory` and `Plan` are echoed back into the next prompt so history is
     * self-describing and the model stops re-deriving intent every step.
     */
    public Evaluation?: string;
    public Memory?: string;
    public Plan?: string;

    /** Raw text response from the LLM (for debugging/logging) */
    public RawResponse: string = '';
}

// ─── Tool Call Request ─────────────────────────────────────
/**
 * A tool call requested by the controller LLM.
 * Parsed from the LLM's function calling output.
 */
export class ToolCallRequest {
    /** Name of the tool to invoke */
    public ToolName: string = '';
    /** Arguments to pass to the tool handler */
    public Arguments: Record<string, unknown> = {};
}

// ─── Judge Prompt Types ────────────────────────────────────
/**
 * Structured input to the judge LLM.
 * Used by LLMJudge and MJLLMJudge to build judge prompts.
 */
export class JudgePromptRequest {
    /** The natural-language goal being evaluated */
    public Goal: string = '';
    /** Current screenshot as base64 PNG */
    public CurrentScreenshot: string = '';
    /** Recent screenshots for progression analysis */
    public ScreenshotHistory: string[] = [];
    /** Summary of actions taken so far */
    public StepSummary: string = '';
    /** Current step number */
    public StepNumber: number = 0;
    /** Maximum steps for this run */
    public MaxSteps: number = 0;
    /** Current URL */
    public CurrentUrl: string = '';
    /**
     * Compact browser-diagnostics digest for the current step (CU-A7) — console
     * errors, failed requests, crashes. Lets the judge explain an infrastructure
     * state (a blank page = `ChunkLoadError`) instead of hallucinating a reason.
     */
    public Diagnostics?: string;

    /**
     * Validation-criteria rubric for the run (CU-D1). When present, the judge is
     * asked for a per-criterion `{criterion, met, evidence}` verdict and `Done`
     * is derived as all-criteria-met.
     */
    public ValidationCriteria?: string[];

    /**
     * Cancellation signal for the judge LLM call (CU-B8) — see
     * {@link ControllerPromptRequest.Signal}. Threaded into
     * `AIPromptParams.cancellationToken` by Layer 2; not template data.
     */
    public Signal?: AbortSignal;
}

/**
 * Parsed output from the judge LLM.
 * Converted to JudgeVerdict by the judge implementation.
 */
export class JudgePromptResponse {
    /** Whether the goal has been accomplished */
    public Done: boolean = false;
    /** Whether the judge has determined the goal is impossible to accomplish */
    public Impossible: boolean = false;
    /** Confidence in the verdict (0.0 - 1.0) */
    public Confidence: number = 0;
    /** Feedback for the controller if continuing */
    public Feedback: string = '';
    /** Reasoning behind the verdict */
    public Reason: string = '';
    /** Raw text response from the LLM */
    public RawResponse: string = '';
}
