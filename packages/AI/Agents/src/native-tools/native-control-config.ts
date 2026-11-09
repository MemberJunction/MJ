/**
 * @fileoverview Per-agent configuration of the native control tools, read from the agent's
 * `TypeConfiguration` JSON under a `NativeControl` key:
 *
 * ```json
 * { "NativeControl": { "PayloadChangeTool": false, "Terminal": "text", "AskUser": true, "CompleteTaskPayload": "object", "NativeOnly": true } }
 * ```
 *
 * Every field is optional, and an agent with no `NativeControl` block keeps the default control
 * set: `payload_change_request`, `ask_user` and `complete_task`, with the final permitted turn
 * forced to `complete_task`.
 * @module @memberjunction/ai-agents
 */

/** How a native-mode run ends. */
export type NativeTerminalMode =
    /** `complete_task` is declared, and the final permitted turn is forced to call it. */
    | 'tool'
    /**
     * A plain-text reply ends the run. `complete_task` is not declared, and the final permitted turn
     * uses `toolChoice: 'none'`, so the model answers instead of calling a tool it could not see
     * the result of.
     */
    | 'text';

/** How `complete_task` declares its `payloadChangeRequest` parameter. */
export type CompleteTaskPayloadForm =
    /**
     * A JSON object string the loop decodes. The default: a forced, schema-constrained call can
     * only decode an object whose sections declare no properties as `{}`, which loses the change.
     */
    | 'string'
    /** An object parameter — no JSON inside a JSON string. For agents whose final turn is not forced. */
    | 'object';

/** The resolved native control configuration for one agent. */
export interface NativeControlConfig {
    /**
     * Whether `payload_change_request` is declared, and `complete_task` carries a payload change.
     * Off for an agent whose state changes go through its own tools.
     */
    PayloadChangeTool: boolean;
    /** Whether `ask_user` is declared. */
    AskUser: boolean;
    Terminal: NativeTerminalMode;
    CompleteTaskPayload: CompleteTaskPayloadForm;
    /**
     * One control plane. When the selected model runs implicit control flow, the system prompt
     * teaches tools only — no JSON envelope — and the scratchpad, durable memory, artifact tools,
     * conversation-history tools and decisions are declared as tools. Capabilities that exist only
     * as envelope steps (ForEach, While, Pipeline, Skill, Plan, Tasks, ClientTools, message
     * expansion, UI commands) are unavailable in this mode; an agent that needs them keeps this off.
     * Ignored for a model on the hybrid or envelope path, which keeps the hybrid prompt.
     */
    NativeOnly: boolean;
    /**
     * Shorten large string arguments of older tool calls in the history sent back to the model —
     * a write tool's whole document otherwise travels on every later turn. The two most recent
     * call turns are always kept whole. See `CompactAnsweredToolCallArguments`.
     */
    CompactToolArguments: boolean;
    /**
     * Let one tool-call turn mix calls the default routing asks to be made on turns of their own:
     * writes (agent tools, several `payload_change_request` calls) before `ask_user` or
     * `complete_task`, and Actions beside a delegation or `ask_user`. Writes run first, in call
     * order; a delegation, question or completion that came with Actions is answered as not run,
     * for the model to make again once it has read their results. Off by default: each such turn
     * is a Retry that runs nothing.
     */
    RelaxedTurnShapes: boolean;
}

/**
 * The prompt-data key a native-only agent sets. The Loop system prompt renders its tools-only form
 * when this is set and the runner resolved implicit control flow for the turn.
 */
export const NATIVE_ONLY_TEMPLATE_FLAG = '_NATIVE_ONLY_REQUESTED';

/** The prompt-data key carrying a native-only agent's control choices, so its prompt names only the tools it declares. */
export const NATIVE_CONTROL_TEMPLATE_DATA = '_NATIVE_CONTROL';

/** The control set every agent had before this configuration existed. */
export const DEFAULT_NATIVE_CONTROL_CONFIG: Readonly<NativeControlConfig> = Object.freeze({
    PayloadChangeTool: true,
    AskUser: true,
    Terminal: 'tool',
    CompleteTaskPayload: 'string',
    NativeOnly: false,
    CompactToolArguments: false,
    RelaxedTurnShapes: false
});

/** The resolved configuration, and any field that was present but unusable. */
export interface NativeControlConfigResult {
    Config: NativeControlConfig;
    /** One entry per ignored value, for the caller to log. Empty when the configuration was clean. */
    Problems: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reads `TypeConfiguration` as JSON; null when absent, an error message when unparseable. */
function parseTypeConfiguration(json: string | null | undefined): { Value: Record<string, unknown> | null } | { Error: string } {
    if (!json || !json.trim()) {
        return { Value: null };
    }
    try {
        const parsed: unknown = JSON.parse(json);
        return isPlainObject(parsed) ? { Value: parsed } : { Error: 'TypeConfiguration is not a JSON object' };
    } catch (error) {
        return { Error: `TypeConfiguration is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/** Copies a boolean field when it is one. */
function readBoolean(raw: Record<string, unknown>, key: 'PayloadChangeTool' | 'AskUser' | 'NativeOnly' | 'CompactToolArguments' | 'RelaxedTurnShapes', into: NativeControlConfig, problems: string[]): void {
    if (raw[key] === undefined) {
        return;
    }
    if (typeof raw[key] === 'boolean') {
        into[key] = raw[key];
    } else {
        problems.push(`NativeControl.${key} must be true or false; ignored`);
    }
}

/** Copies an enumerated field when its value is one of `allowed`. */
function readChoice<K extends 'Terminal' | 'CompleteTaskPayload'>(
    raw: Record<string, unknown>,
    key: K,
    allowed: readonly NativeControlConfig[K][],
    into: NativeControlConfig,
    problems: string[]
): void {
    const value = raw[key];
    if (value === undefined) {
        return;
    }
    const match = allowed.find((option) => option === value);
    if (match !== undefined) {
        into[key] = match;
    } else {
        problems.push(`NativeControl.${key} must be one of ${allowed.map((a) => `'${a}'`).join(', ')}; ignored`);
    }
}

/**
 * The native control configuration in an agent's `TypeConfiguration`.
 *
 * Tolerant by design: a run never fails over this. Anything unusable falls back to its default
 * and is reported in `Problems`, so a typo in one field leaves the others in force.
 *
 * @param typeConfiguration The agent's `TypeConfiguration` column
 */
export function ResolveNativeControlConfig(typeConfiguration: string | null | undefined): NativeControlConfigResult {
    const config: NativeControlConfig = { ...DEFAULT_NATIVE_CONTROL_CONFIG };
    const problems: string[] = [];
    const parsed = parseTypeConfiguration(typeConfiguration);
    if ('Error' in parsed) {
        return { Config: config, Problems: [parsed.Error] };
    }
    const raw = parsed.Value?.NativeControl;
    if (raw === undefined || raw === null) {
        return { Config: config, Problems: problems };
    }
    if (!isPlainObject(raw)) {
        return { Config: config, Problems: ['NativeControl must be an object; ignored'] };
    }
    readBoolean(raw, 'PayloadChangeTool', config, problems);
    readBoolean(raw, 'AskUser', config, problems);
    readBoolean(raw, 'NativeOnly', config, problems);
    readBoolean(raw, 'CompactToolArguments', config, problems);
    readBoolean(raw, 'RelaxedTurnShapes', config, problems);
    readChoice(raw, 'Terminal', ['tool', 'text'], config, problems);
    readChoice(raw, 'CompleteTaskPayload', ['string', 'object'], config, problems);
    return { Config: config, Problems: problems };
}
