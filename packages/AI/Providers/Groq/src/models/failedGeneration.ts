/**
 * @fileoverview Reads the tool call out of Groq's `tool_use_failed` rejection.
 *
 * Groq validates tool-call arguments against the declared JSON Schema on its side. When they do not
 * match it answers HTTP 400 with `code: 'tool_use_failed'` and puts the model's own generation in
 * `failed_generation`. That text still says which tool the model meant to call and with what, so the
 * driver can hand the call back to MJ, whose argument coercion fixes the mistake Groq refused (a
 * boolean sent as the string "true", say). Issue #5847.
 *
 * Two shapes have been seen:
 * - Qwen's XML-like form: `<tool_call><function=NAME><parameter=KEY>VALUE</parameter>…</function></tool_call>`,
 *   where each value is raw text that may itself be JSON.
 * - JSON: `{"name": "…", "arguments": {…}}` (GPT-OSS), optionally a list of them, and `arguments`
 *   optionally a JSON string.
 *
 * @module @memberjunction/ai-groq
 */

/** One tool call read from a `failed_generation` text. Arguments are parsed, not coerced. */
export interface FailedGenerationCall {
    /** The function name the model wrote. */
    Name: string;
    /** The arguments, each value parsed as JSON when it is JSON and kept as text otherwise. */
    Arguments: Record<string, unknown>;
}

/** The fields of Groq's error body that recovery reads. */
interface GroqToolUseFailedBody {
    code?: unknown;
    failed_generation?: unknown;
}

const FUNCTION_BLOCK = /<function=([^>\s]+)\s*>([\s\S]*?)(?:<\/function>|(?=<function=)|$)/g;
const PARAMETER_BLOCK = /<parameter=([^>\s]+)\s*>([\s\S]*?)(?:<\/parameter>|(?=<parameter=)|(?=<\/function>)|$)/g;

/**
 * Returns the `failed_generation` text when the thrown error is Groq's `tool_use_failed` rejection,
 * otherwise undefined. The SDK keeps the response body on `error.error`, which holds Groq's
 * `{ error: { code, failed_generation } }`; a body that is already the inner object is read too.
 */
export function GetToolUseFailedGeneration(error: unknown): string | undefined {
    if (!isRecord(error) || error.status !== 400 || !isRecord(error.error)) {
        return undefined;
    }
    const outer = error.error;
    const body: GroqToolUseFailedBody = isRecord(outer.error) ? outer.error : outer;
    if (body.code !== 'tool_use_failed' || typeof body.failed_generation !== 'string') {
        return undefined;
    }
    return body.failed_generation;
}

/**
 * Parses the tool calls a `failed_generation` text holds.
 *
 * @param text The `failed_generation` string from Groq's error body
 * @returns The calls in the order written, or an empty array when the text holds neither shape
 */
export function ParseFailedGeneration(text: string | null | undefined): FailedGenerationCall[] {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
        return [];
    }
    if (trimmed.includes('<function=')) {
        return parseFunctionTags(trimmed);
    }
    return parseJsonCalls(trimmed);
}

/** The Qwen form. A call without a name is skipped; parameter values are JSON-parsed when they can be. */
function parseFunctionTags(text: string): FailedGenerationCall[] {
    const calls: FailedGenerationCall[] = [];
    for (const fn of text.matchAll(FUNCTION_BLOCK)) {
        const name = fn[1].trim();
        if (!name) {
            continue;
        }
        const args: Record<string, unknown> = {};
        for (const param of fn[2].matchAll(PARAMETER_BLOCK)) {
            args[param[1].trim()] = parseParameterValue(param[2]);
        }
        calls.push({ Name: name, Arguments: args });
    }
    return calls;
}

/**
 * A parameter's raw text: the surrounding newlines Qwen writes are layout, not value. JSON objects,
 * arrays, numbers and booleans come back parsed; anything else stays text, so the action's own
 * coercion decides what a bare word means.
 */
function parseParameterValue(raw: string): unknown {
    const value = raw.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    const candidate = value.trim();
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
        const parsed = tryParseJson(candidate);
        if (parsed !== undefined) {
            return parsed;
        }
    }
    return value;
}

/** The JSON form: one call object or a list of them, inside an optional ```json fence. */
function parseJsonCalls(text: string): FailedGenerationCall[] {
    const parsed = tryParseJson(stripCodeFence(text));
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const calls: FailedGenerationCall[] = [];
    for (const item of items) {
        const call = readJsonCall(item);
        if (call) {
            calls.push(call);
        }
    }
    return calls;
}

/** Reads `{name, arguments}` (or `parameters`), also nested under `function` as OpenAI writes it. */
function readJsonCall(item: unknown): FailedGenerationCall | undefined {
    if (!isRecord(item)) {
        return undefined;
    }
    const source = isRecord(item.function) ? item.function : item;
    const name = source.name;
    if (typeof name !== 'string' || !name.trim()) {
        return undefined;
    }
    const rawArgs = source.arguments ?? source.parameters ?? {};
    const args = typeof rawArgs === 'string' ? tryParseJson(rawArgs) : rawArgs;
    if (!isRecord(args)) {
        return undefined;
    }
    return { Name: name.trim(), Arguments: args };
}

function stripCodeFence(text: string): string {
    const fenced = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/.exec(text);
    return fenced ? fenced[1].trim() : text;
}

function tryParseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
