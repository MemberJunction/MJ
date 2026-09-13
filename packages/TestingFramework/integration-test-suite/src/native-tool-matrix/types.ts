/**
 * types.ts — the vocabulary of the BaseLLM tool-calling matrix.
 *
 * This is the DRIVER-LEVEL probe: it calls each tool-capable driver directly,
 * with no prompt runner, no agent loop and no database, and asks the providers the questions
 * the implementation plan left open —
 *
 *   §5.6  what does `responseFormat: 'JSON'` do when tools are also declared?
 *   §9.3  how much does parallel-call behavior, forcing semantics and mixed text+call
 *         frequency actually vary across providers?
 *   audit §7.2  does enabling thinking/effort change any of the above?
 *
 * Everything here is a plain data type over `@memberjunction/ai`'s tool surface. Nothing in this
 * directory imports `@memberjunction/testing-engine` or touches a database — the test plan's §2.1
 * rule, so the same evaluators survive a move from `mj test` to a bespoke runner (or, here, back
 * the other way when the corpus comparison adopts them).
 */
import type { ChatTool } from '@memberjunction/ai';

/**
 * The five request shapes the matrix sweeps per scenario.
 *
 * `no-tools` is the control — the exact request MJ sends today. The other four are the
 * `ChatToolChoice` values, named for the choice rather than the value so `none` (tools declared,
 * calling forbidden) reads distinctly from `no-tools` (nothing declared at all). Keeping both is
 * the point: the difference between them is the cost of declaring tools you do not want used,
 * which is what a hybrid loop pays on every non-action turn.
 */
export type ProbeToolMode = 'no-tools' | 'auto' | 'none' | 'required' | 'named';

/** The `responseFormat` axis. Only the two values that interact with tools are interesting. */
export type ProbeResponseFormat = 'Any' | 'JSON';

/**
 * A check on one argument of one tool call.
 *
 * Exact string equality is the wrong test for LLM-authored values, so matchers are declarative
 * and deliberately loose — the matrix measures whether a call is USABLE, not whether the model
 * phrased an argument the way we would have. Every variant is JSON-serializable so a scenario
 * can round-trip through a config file unchanged.
 */
export type ArgumentMatcher =
    | { kind: 'nonEmptyString'; parameter: string }
    | { kind: 'containsIgnoreCase'; parameter: string; value: string }
    | { kind: 'oneOf'; parameter: string; values: string[] };

/** One call a correct answer makes, with the argument checks that make it usable. */
export interface ExpectedToolCall {
    toolName: string;
    arguments: ArgumentMatcher[];
}

/**
 * What a correct answer looks like, stated WITHOUT reference to how the wire encodes it —
 * the test plan's mode-agnostic expectation rule (§1), which is what lets an envelope cell and
 * a native cell be compared on the same scenario.
 */
export interface ProbeExpectation {
    /**
     * Whether calling a tool is the right decision at all.
     *
     * `false` scenarios are the coherence probe: tools are declared but the question is answerable
     * from the model's own knowledge, and a call is a FAILURE. This is the 1/8 failure class the
     * hybrid loop has to survive.
     */
    toolCallWarranted: boolean;
    /** The calls a correct answer makes, in any order. Empty when `toolCallWarranted` is false. */
    calls: ExpectedToolCall[];
    /**
     * Whether the scenario's system prompt asks for MJ's `LoopAgentResponse` envelope, making
     * envelope compliance measurable on this cell. Set only on the envelope scenario.
     */
    envelopeRequested: boolean;
}

/** One probe: a fixed conversation plus the tools offered and what a correct answer looks like. */
export interface ProbeScenario {
    id: string;
    /** One line on what this scenario measures. Printed in the scorecard legend. */
    purpose: string;
    /** Only the envelope scenario needs one; the rest send a bare user turn. */
    systemPrompt?: string;
    userPrompt: string;
    /** Declarations sent whenever the cell's mode is not `no-tools`. */
    tools: ChatTool[];
    /** The tool a `named` cell forces. Scenarios never run in `named` mode omit it. */
    forcedToolName?: string;
    expectation: ProbeExpectation;
}

/**
 * One model to sweep, identified the way the MJ catalog identifies it: a driver class that is
 * registered on the ClassFactory plus the serving vendor's own model id.
 *
 * The pair comes from `MJ: AI Model Vendors` (`DriverClass` + `APIName`) so a cell in this matrix
 * names exactly what a catalog row would name. The matrix does NOT read the catalog at runtime,
 * because the whole point of a driver-level probe is that it runs with API keys and nothing else.
 */
export interface MatrixModel {
    /** Scorecard row label. */
    label: string;
    /** Model developer (Anthropic / OpenAI / Google) — NOT the serving vendor. */
    developer: string;
    /** Generation tag, so the scorecard can group "newest agentically-trained" against the rest. */
    generation: string;
    /** Driver class registered on the ClassFactory — `AIModelVendor.DriverClass`. */
    driverClass: string;
    /** The provider's own model id — `AIModelVendor.APIName`. */
    apiName: string;
    /**
     * Effort levels to sweep, `null` meaning "send no effortLevel and take the provider default".
     * Omit for the default-only single pass. The thinking axis exists because reasoning × tools is
     * the recurring cross-provider interaction (audit §7.2).
     */
    effortLevels?: (string | null)[];
    /**
     * Thinking budget to send alongside a non-null `effortLevel`. Anthropic's driver defaults this
     * to 31,000 tokens, which is a fortune to spend deciding whether to look up the weather — and
     * thinking tokens bill as output. A probe-sized budget keeps the thinking axis affordable
     * without changing what it measures.
     */
    reasoningBudgetTokens?: number;
}

/** The matrix definition: axes in, cells out. */
export interface MatrixSpec {
    models: MatrixModel[];
    scenarioIds: string[];
    toolModes: ProbeToolMode[];
    responseFormats: ProbeResponseFormat[];
    /** Repetitions per cell. Rates, not booleans — a model's choice varies run to run. */
    reps: number;
}

/** One (model × scenario × mode × format × effort) combination, repeated `reps` times. */
export interface MatrixCell {
    /** Stable key: the scorecard row id and the JSONL join key. */
    id: string;
    model: MatrixModel;
    scenarioId: string;
    toolMode: ProbeToolMode;
    responseFormat: ProbeResponseFormat;
    effortLevel: string | null;
}

/** A combination the sparseness rules dropped, with the reason — the matrix logs what it skips. */
export interface SkippedCell {
    id: string;
    reason: string;
}

/** What `expandMatrix` produces. */
export interface ExpandedMatrix {
    cells: MatrixCell[];
    skipped: SkippedCell[];
}
