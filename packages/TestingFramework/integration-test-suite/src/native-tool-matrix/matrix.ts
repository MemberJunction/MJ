/**
 * matrix.ts — the default sweep, its sparseness rules, and the pre-flight token manifest.
 *
 * The matrix is deliberately SPARSE: not every axis crosses every other, because most of the
 * missing combinations are vacuous rather than merely expensive (forcing a named tool while asking
 * for two parallel calls measures nothing about parallelism). Every dropped combination is
 * returned as a {@link SkippedCell} with its reason, so the grid's holes are visible in the run log
 * instead of being silently absent from the scorecard — the test plan's "logs what it skips" rule
 * (§3.3).
 */
import type { ExpandedMatrix, MatrixCell, MatrixModel, MatrixSpec, ProbeScenario, ProbeToolMode, SkippedCell } from './types';
import { GetScenario, PROBE_SCENARIOS } from './scenarios';

/**
 * The default model set: one model per generation per developer, chosen so each row answers a
 * question the audit raised rather than just adding coverage.
 *
 * `driverClass` / `apiName` pairs are the `MJ: AI Model Vendors` rows for each developer's own
 * first-party inference (`Type = 'Inference Provider'`). Aggregator vendors (OpenRouter, Bedrock,
 * Vertex, Azure) are their own cells by design — see the audit's per-vendor divergences — but they
 * need their own API keys, so they are opt-in through a `--matrix` file rather than default rows.
 */
export const DEFAULT_MATRIX_MODELS: MatrixModel[] = [
    {
        label: 'Claude Haiku 4.5', developer: 'Anthropic', generation: 'prior',
        driverClass: 'AnthropicLLM', apiName: 'claude-haiku-4-5-20251001'
    },
    {
        // Audit: forced tool_choice interacts with extended thinking on this generation, and
        // diverges again on Bedrock. The thinking axis is enabled here for exactly that reason.
        label: 'Claude Sonnet 5', developer: 'Anthropic', generation: 'current',
        driverClass: 'AnthropicLLM', apiName: 'claude-sonnet-5', effortLevels: [null, 'high'], reasoningBudgetTokens: 2000
    },
    {
        label: 'GPT 4.1-mini', developer: 'OpenAI', generation: 'pre-reasoning',
        driverClass: 'OpenAILLM', apiName: 'gpt-4.1-mini'
    },
    {
        label: 'GPT 5.4-mini', developer: 'OpenAI', generation: 'current',
        driverClass: 'OpenAILLM', apiName: 'gpt-5.4-mini', effortLevels: [null, 'high']
    },
    {
        // Audit: Gemini 2.x cannot combine structured output with function calling in one request.
        // That is the single most actionable vendor-level claim in the audit, and it is directly
        // testable by the responseFormat axis — so the deprecated generation earns its row.
        label: 'Gemini 2.5 Flash', developer: 'Google', generation: 'prior (2.x)',
        driverClass: 'GeminiLLM', apiName: 'gemini-2.5-flash'
    },
    {
        // Skip's Query Writer model — the configuration whose malformed function calls started this.
        label: 'Gemini 3 Flash', developer: 'Google', generation: 'originating failure',
        driverClass: 'GeminiLLM', apiName: 'gemini-3-flash-preview'
    },
    {
        label: 'Gemini 3.7 Flash', developer: 'Google', generation: 'current',
        driverClass: 'GeminiLLM', apiName: 'gemini-3.7-flash'
    }
];

/**
 * The default sweep.
 *
 * `reps` is 3, deliberately small. This probe answers QUALITATIVE questions — does forcing work,
 * does JSON mode survive declared tools, does a text-free call come back clean — where three
 * observations distinguish "always" from "sometimes" and a fourth buys nothing. Rate measurement
 * with confidence intervals belongs to the corpus comparison.
 */
export const DEFAULT_MATRIX_SPEC: MatrixSpec = {
    models: DEFAULT_MATRIX_MODELS,
    scenarioIds: PROBE_SCENARIOS.map((s) => s.id),
    toolModes: ['no-tools', 'auto', 'none', 'required', 'named'],
    responseFormats: ['Any', 'JSON'],
    reps: 3
};

/** Cells that sweep the thinking axis. Kept to one mode/format so the axis stays affordable. */
const THINKING_AXIS_MODE: ProbeToolMode = 'auto';
const THINKING_AXIS_FORMAT = 'Any';
const THINKING_AXIS_SCENARIOS = new Set(['single-call', 'envelope']);

/** Builds the stable cell id used as the scorecard key and the JSONL join key. */
export function CellId(model: MatrixModel, scenarioId: string, mode: ProbeToolMode, format: string, effortLevel: string | null): string {
    return [model.apiName, scenarioId, mode, format, effortLevel ?? 'default'].join(' × ');
}

/** @deprecated Use {@link CellId}. */
export function cellId(model: MatrixModel, scenarioId: string, mode: ProbeToolMode, format: string, effortLevel: string | null): string {
    return CellId(model, scenarioId, mode, format, effortLevel);
}

/**
 * Says why a combination is vacuous, or `null` when it is worth running.
 *
 * Every rule here drops a cell that could not produce a meaningful observation — never one that is
 * merely expensive. A cell dropped for cost would be a hole in the data; a cell dropped for
 * vacuity is a hole in the question.
 */
function skipReason(scenario: ProbeScenario, mode: ProbeToolMode, effortLevel: string | null, format: string): string | null {
    const { toolCallWarranted, envelopeRequested } = scenario.expectation;

    if (mode === 'no-tools' && toolCallWarranted && !envelopeRequested) {
        return 'no tools declared and no envelope to read — there is no decision to observe';
    }
    if (mode === 'none' && !toolCallWarranted) {
        return "toolChoice 'none' suppresses a call that was never warranted — nothing to suppress";
    }
    if (mode === 'named' && !scenario.forcedToolName) {
        return 'scenario declares no tool to force';
    }
    if (mode === 'named' && scenario.id === 'parallel-call') {
        return 'forcing one named tool makes the parallel-call count unmeasurable';
    }
    if (effortLevel !== null && (mode !== THINKING_AXIS_MODE || format !== THINKING_AXIS_FORMAT || !THINKING_AXIS_SCENARIOS.has(scenario.id))) {
        return `thinking axis is swept only on ${THINKING_AXIS_MODE} × ${THINKING_AXIS_FORMAT} × {${[...THINKING_AXIS_SCENARIOS].join(', ')}}`;
    }
    return null;
}

/** Expands the spec into the cells to run plus the combinations the rules dropped. */
export function ExpandMatrix(spec: MatrixSpec): ExpandedMatrix {
    const cells: MatrixCell[] = [];
    const skipped: SkippedCell[] = [];

    for (const model of spec.models) {
        const effortLevels = model.effortLevels ?? [null];
        for (const scenarioId of spec.scenarioIds) {
            const scenario = GetScenario(scenarioId);
            for (const toolMode of spec.toolModes) {
                for (const responseFormat of spec.responseFormats) {
                    for (const effortLevel of effortLevels) {
                        const id = CellId(model, scenarioId, toolMode, responseFormat, effortLevel);
                        const reason = skipReason(scenario, toolMode, effortLevel, responseFormat);
                        if (reason) {
                            skipped.push({ id, reason });
                        } else {
                            cells.push({ id, model, scenarioId, toolMode, responseFormat, effortLevel });
                        }
                    }
                }
            }
        }
    }
    return { cells, skipped };
}

/** @deprecated Use {@link ExpandMatrix}. */
export function expandMatrix(spec: MatrixSpec): ExpandedMatrix {
    return ExpandMatrix(spec);
}

/** A crude characters-to-tokens ratio. Only ever used for the pre-flight estimate, never for billing. */
const CHARS_PER_TOKEN = 4;
/** Generous allowance for a probe's reply: a short answer or one or two tool calls. */
const ESTIMATED_COMPLETION_TOKENS = 200;

function estimatePromptTokens(scenario: ProbeScenario, toolsDeclared: boolean): number {
    const promptChars = (scenario.systemPrompt?.length ?? 0) + scenario.userPrompt.length;
    const toolChars = toolsDeclared ? JSON.stringify(scenario.tools).length : 0;
    return Math.ceil((promptChars + toolChars) / CHARS_PER_TOKEN);
}

/** The pre-flight manifest: what a run will cost in calls and tokens, before a single request goes out. */
export interface MatrixManifest {
    cellCount: number;
    skippedCount: number;
    callCount: number;
    estimatedPromptTokens: number;
    estimatedCompletionTokens: number;
    perModel: Array<{ label: string; apiName: string; calls: number; estimatedTokens: number }>;
}

/** Builds the manifest. Sized off the real scenario text and tool schemas, not a guessed average. */
export function BuildManifest(expanded: ExpandedMatrix, reps: number): MatrixManifest {
    const perModel = new Map<string, { label: string; apiName: string; calls: number; estimatedTokens: number }>();
    let estimatedPromptTokens = 0;

    for (const cell of expanded.cells) {
        const scenario = GetScenario(cell.scenarioId);
        const prompt = estimatePromptTokens(scenario, cell.toolMode !== 'no-tools');
        estimatedPromptTokens += prompt * reps;

        const key = cell.model.apiName;
        const entry = perModel.get(key) ?? { label: cell.model.label, apiName: key, calls: 0, estimatedTokens: 0 };
        entry.calls += reps;
        entry.estimatedTokens += (prompt + ESTIMATED_COMPLETION_TOKENS) * reps;
        perModel.set(key, entry);
    }

    const callCount = expanded.cells.length * reps;
    return {
        cellCount: expanded.cells.length,
        skippedCount: expanded.skipped.length,
        callCount,
        estimatedPromptTokens,
        estimatedCompletionTokens: callCount * ESTIMATED_COMPLETION_TOKENS,
        perModel: [...perModel.values()]
    };
}

/** @deprecated Use {@link BuildManifest}. */
export function buildManifest(expanded: ExpandedMatrix, reps: number): MatrixManifest {
    return BuildManifest(expanded, reps);
}
