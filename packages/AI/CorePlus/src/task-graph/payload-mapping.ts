/**
 * @fileoverview How a workflow step's inputs are built and its outputs are filed (plan §5.2).
 *
 * **Why this is its own module rather than dispatcher code.** These mappings are the only way data
 * moves between the steps of a workflow: an input mapping builds a step's parameters out of the
 * payload, an output mapping writes the step's results back into it, and every branch condition
 * downstream reads what those mappings wrote. The rules have accumulated real semantics — a `*`
 * wildcard, dotted paths, case-insensitive result lookup, `[]` array append, `$message`-style
 * special fields, `static:` / `payload.` / `data.` / `context.` prefixes on the input side.
 *
 * Both the in-run flow walker and the durable dispatcher have to apply exactly these rules. Two
 * implementations would be two dialects, and they would diverge precisely where the compile is
 * supposed to be lossless — a workflow would map differently depending on which engine ran it,
 * which is invisible until someone's branch takes the wrong path in production. So the rules live
 * here once, as pure functions, and both engines call them.
 *
 * Nothing in here touches entities, engines or IO, which is what lets the dispatcher use it without
 * pulling in the agent framework.
 *
 * @module @memberjunction/ai-core-plus
 */

/**
 * A mapping of result field -> payload path (output), or parameter name -> value spec (input).
 *
 * Stored as a JSON string on the step, because it is authored in an editor as JSON and never
 * queried relationally.
 */
export type PayloadMapping = Record<string, string>;

/** Everything an input mapping can read from, beyond the literal values in the mapping itself. */
export type PayloadMappingContext = {
    /** The workflow payload — what `payload.x` resolves against. */
    payload?: unknown;
    /** Template data — what `data.x` resolves against. */
    data?: unknown;
    /** Runtime context (API keys, environment settings) — what `context.x` resolves against. */
    context?: unknown;
    /**
     * Resolves a `conversation[N].content`-style reference.
     *
     * Supplied by callers that have a conversation; omitted by those that do not, in which case
     * such a reference resolves to the literal string rather than throwing. A dispatched workflow
     * legitimately runs with no conversation attached.
     */
    resolveConversationReference?: (reference: string) => unknown;
    /** Recognizes a conversation reference. Paired with {@link resolveConversationReference}. */
    isConversationReference?: (value: string) => boolean;
};

/** Fields an output mapping can route away from the payload, using a `$`-prefixed target. */
export type MappedSpecialFields = {
    message?: string;
    reasoning?: string;
    confidence?: number;
};

/** What an output mapping produced. */
export type OutputMappingResult = {
    /** Nested object of payload updates, ready to merge. Empty when the mapping matched nothing. */
    updates: Record<string, unknown>;
    /** Present only when the mapping routed something to a `$` field. */
    specialFields?: MappedSpecialFields;
    /**
     * Problems that did not stop the mapping — an unknown `$field`, unparseable JSON.
     *
     * Returned rather than logged so the caller decides how loud to be: the dispatcher records them
     * on the Task row, where an operator will actually see them.
     */
    errors: string[];
    /**
     * Output parameters the mapping named that the result did not contain.
     *
     * **Why this is separate from `errors`.** An absent output is not always a defect — an action may
     * emit a parameter only on some paths — so it must not fail the step. But it is not nothing
     * either: a mapping that names a parameter the action never produces means the step ran, cost
     * real money, and contributed NOTHING to the payload, while reporting Complete.
     *
     * That is exactly what happened to the Content Pipeline demo: its research step was pointed at
     * `Google Custom Search` while its mapping still named Web Search's `SearchResults`, so every
     * run discarded a whole research pass in silence. Diagnosing it took reading four tables. The
     * caller can now say so in one line.
     */
    unmapped?: string[];
};

/**
 * Reads a value out of an object by dotted path, with `name[0]` array indexing.
 *
 * Returns `undefined` for any path that does not fully resolve — including an out-of-range index —
 * rather than throwing, because a mapping that references a field an earlier step did not produce
 * is a normal condition in a branching workflow, not an error.
 */
export function GetValueFromPath(obj: unknown, path: string): unknown {
    let current: unknown = obj;

    for (const part of path.split('.')) {
        if (!part) continue;

        const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, arrayName, rawIndex] = arrayMatch;
            if (!isRecord(current) || !(arrayName in current)) return undefined;
            const arr = current[arrayName];
            const index = parseInt(rawIndex, 10);
            if (!Array.isArray(arr) || index < 0 || index >= arr.length) return undefined;
            current = arr[index];
        } else {
            if (!isRecord(current) || !(part in current)) return undefined;
            current = current[part];
        }
    }

    return current;
}

/**
 * Resolves one input-mapping value, recursing through arrays and objects.
 *
 * A string is a **literal unless it carries a recognized prefix** — `payload.`, `static:`, `data.`,
 * `context.`, or a conversation reference. That default matters: most authored mappings are literals
 * (`{"ticker": "NVDA"}`), and treating an unprefixed string as a path would turn every one of them
 * into `undefined`. Prefix matching is case-insensitive, matching what workflow authors already
 * have stored.
 */
export function ResolveMappedInput(value: unknown, ctx: PayloadMappingContext): unknown {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const lower = trimmed.toLowerCase();

        if (ctx.isConversationReference?.(trimmed) && ctx.resolveConversationReference) {
            return ctx.resolveConversationReference(trimmed);
        }
        if (lower.startsWith('static:')) return value.substring(value.indexOf(':') + 1);
        if (lower.startsWith('payload.')) return GetValueFromPath(ctx.payload, value.substring(value.indexOf('.') + 1));
        if (lower.startsWith('data.') && ctx.data !== undefined) {
            return GetValueFromPath(ctx.data, value.substring(value.indexOf('.') + 1));
        }
        if (lower.startsWith('context.') && ctx.context !== undefined) {
            return GetValueFromPath(ctx.context, value.substring(value.indexOf('.') + 1));
        }
        return value;
    }

    if (Array.isArray(value)) return value.map((item) => ResolveMappedInput(item, ctx));

    if (isRecord(value)) {
        const resolved: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) resolved[key] = ResolveMappedInput(val, ctx);
        return resolved;
    }

    return value;
}

const FORBIDDEN_PATH_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Parses an array-indexed path segment (`items[0]`) without regex backtracking.
 */
function parseArrayAccessSegment(part: string): { arrayName: string; index: number } | null {
    if (!part.endsWith(']')) return null;
    const bracketIdx = part.indexOf('[');
    if (bracketIdx <= 0 || bracketIdx >= part.length - 2) return null;
    const arrayName = part.slice(0, bracketIdx);
    if (arrayName.includes('[')) return null;
    const rawDigits = part.slice(bracketIdx + 1, -1);
    for (let i = 0; i < rawDigits.length; i++) {
        const code = rawDigits.charCodeAt(i);
        if (code < 48 || code > 57) return null;
    }
    return { arrayName, index: parseInt(rawDigits, 10) };
}

/**
 * True when a single path segment (or its bracketed base name, e.g. `constructor[0]`) targets an
 * `Object.prototype` slot (`__proto__`, `constructor`, `prototype`).
 */
function isForbiddenSegment(part: string): boolean {
    if (FORBIDDEN_PATH_KEYS.has(part)) return true;
    const bracketIdx = part.indexOf('[');
    if (bracketIdx > 0 && FORBIDDEN_PATH_KEYS.has(part.slice(0, bracketIdx))) return true;
    return false;
}

/**
 * Walks an object path with `name[index]` array indexing and exact-first, case-insensitive-fallback
 * own-property lookup so loop step outputs (`steps.s1.Result` vs `steps.s1.result`) resolve reliably
 * without ever reading `Object.prototype` members.
 */
function getLoopPathValue(obj: unknown, path: string): unknown {
    let current: unknown = obj;
    const segments = path.split('.');
    for (const part of segments) {
        if (!part) continue;
        if (isForbiddenSegment(part)) return undefined;

        const arrayAccess = parseArrayAccessSegment(part);
        if (arrayAccess) {
            const { arrayName, index } = arrayAccess;
            if (!isRecord(current) || Array.isArray(current)) return undefined;
            const actualKey = Object.prototype.hasOwnProperty.call(current, arrayName)
                ? arrayName
                : Object.keys(current).find((k) => k.toLowerCase() === arrayName.toLowerCase());
            if (!actualKey || FORBIDDEN_PATH_KEYS.has(actualKey)) return undefined;
            const arr = current[actualKey];
            if (!Array.isArray(arr) || index < 0 || index >= arr.length) return undefined;
            current = arr[index];
        } else {
            if (!isRecord(current) || Array.isArray(current)) return undefined;
            const actualKey = Object.prototype.hasOwnProperty.call(current, part)
                ? part
                : Object.keys(current).find((k) => k.toLowerCase() === part.toLowerCase());
            if (!actualKey || FORBIDDEN_PATH_KEYS.has(actualKey)) return undefined;
            current = current[actualKey];
        }
    }
    return current;
}

/**
 * Evaluates a single loop expression (`item.email`, `steps.s1.Result`, `payload.companyName`, etc.)
 * against the iteration's explicit bindings and payload/data/context roots.
 */
function resolveLoopExpression(
    expression: string,
    bindings: Record<string, unknown>,
    ctx: PayloadMappingContext,
): unknown {
    const trimmed = expression.trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();

    if (lower === 'payload') return ctx.payload;
    if (lower.startsWith('payload.')) return getLoopPathValue(ctx.payload, trimmed.substring(trimmed.indexOf('.') + 1));
    if (lower === 'data' && ctx.data !== undefined) return ctx.data;
    if (lower.startsWith('data.') && ctx.data !== undefined) {
        return getLoopPathValue(ctx.data, trimmed.substring(trimmed.indexOf('.') + 1));
    }
    if (lower === 'context' && ctx.context !== undefined) return ctx.context;
    if (lower.startsWith('context.') && ctx.context !== undefined) {
        return getLoopPathValue(ctx.context, trimmed.substring(trimmed.indexOf('.') + 1));
    }

    const fromBindings = getLoopPathValue(bindings, trimmed);
    if (fromBindings !== undefined) return fromBindings;

    return getLoopPathValue(ctx.payload, trimmed);
}

function isIdentifierStartCode(code: number): boolean {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || code === 36;
}

function isIdentifierPartCode(code: number): boolean {
    return isIdentifierStartCode(code) || (code >= 48 && code <= 57);
}

/**
 * Extracts the leading identifier root from an unbraced binding reference (`item`, `item.email`,
 * `steps.s1.Result`, `item[0].id`), or `null` when the string is not a binding path.
 */
function extractBindingRoot(trimmed: string): string | null {
    if (trimmed.length === 0 || !isIdentifierStartCode(trimmed.charCodeAt(0))) return null;
    let end = 1;
    while (end < trimmed.length && isIdentifierPartCode(trimmed.charCodeAt(end))) {
        end++;
    }
    if (end === trimmed.length || trimmed[end] === '.' || trimmed[end] === '[') {
        return trimmed.slice(0, end);
    }
    return null;
}

/**
 * Interpolates inline `{{expr}}` placeholders in a single linear `O(n)` pass without regex
 * backtracking (preventing polynomial ReDoS on pathological `{{{{...` strings).
 */
function interpolateLoopTemplates(
    template: string,
    bindings: Record<string, unknown>,
    ctx: PayloadMappingContext,
): string {
    let result = '';
    let cursor = 0;
    while (cursor < template.length) {
        const openIdx = template.indexOf('{{', cursor);
        if (openIdx === -1) {
            result += template.slice(cursor);
            break;
        }
        const braceIdx = template.indexOf('}', openIdx + 2);
        if (braceIdx === -1 || braceIdx + 1 >= template.length) {
            result += template.slice(cursor);
            break;
        }
        if (template[braceIdx + 1] !== '}' || braceIdx === openIdx + 2) {
            // A lone `}` or empty `{{}}` cannot close a `{{[^}]+}}` token; jump past `braceIdx`
            // so no character before it is ever rescanned.
            result += template.slice(cursor, braceIdx + 1);
            cursor = braceIdx + 1;
            continue;
        }
        // Span `[openIdx + 2, braceIdx)` contains zero `}` characters and closes at `}}`.
        const inner = template.slice(openIdx + 2, braceIdx);
        result += template.slice(cursor, openIdx);
        const resolved = resolveLoopExpression(inner, bindings, ctx);
        if (resolved === undefined) {
            result += template.slice(openIdx, braceIdx + 2);
        } else if (resolved === null) {
            // append empty string
        } else if (typeof resolved === 'object') {
            result += JSON.stringify(resolved);
        } else {
            result += String(resolved);
        }
        cursor = braceIdx + 2;
    }
    return result;
}

/**
 * Resolves one loop-body parameter value, supporting BOTH the Flow/TaskGraph input-mapping dialect
 * (`payload.*`, `data.*`, `context.*`, `static:*`) AND the Loop Agent template dialect
 * (`"{{item.field}}"`, `"company in {{city.name}}"`, `"{{steps.s1.Result}}"`, and unbraced
 * `<bindingKey>.<path>` such as `"item.email"` or `"steps.s1.Result"`).
 */
function resolveLoopBodyValue(
    value: unknown,
    bindings: Record<string, unknown>,
    ctx: PayloadMappingContext,
): unknown {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const lower = trimmed.toLowerCase();

        if (ctx.isConversationReference?.(trimmed) && ctx.resolveConversationReference) {
            return ctx.resolveConversationReference(trimmed);
        }
        if (lower.startsWith('static:')) return value.substring(value.indexOf(':') + 1);

        // Pure single-token template `{{expr}}` preserves raw value type (number, boolean, object, array).
        if (
            trimmed.startsWith('{{') &&
            trimmed.endsWith('}}') &&
            !trimmed.slice(2, -2).includes('{{') &&
            !trimmed.slice(2, -2).includes('}}')
        ) {
            return resolveLoopExpression(trimmed.slice(2, -2), bindings, ctx);
        }

        // Inline template interpolation: `"({{item.x}} * 2) + {{steps.s1.Result}}"`.
        if (trimmed.includes('{{') && trimmed.includes('}}')) {
            return interpolateLoopTemplates(value, bindings, ctx);
        }

        if (lower.startsWith('payload.')) {
            return getLoopPathValue(ctx.payload, trimmed.substring(trimmed.indexOf('.') + 1));
        }
        if (lower.startsWith('data.') && ctx.data !== undefined) {
            return getLoopPathValue(ctx.data, trimmed.substring(trimmed.indexOf('.') + 1));
        }
        if (lower.startsWith('context.') && ctx.context !== undefined) {
            return getLoopPathValue(ctx.context, trimmed.substring(trimmed.indexOf('.') + 1));
        }

        // Unbraced explicit loop binding reference: e.g. `item.email`, `city.name`, `steps.s1.Result`,
        // `item[0].id`, or exact binding variable name (`city`, `index`).
        const rootName = extractBindingRoot(trimmed);
        if (rootName && Object.prototype.hasOwnProperty.call(bindings, rootName)) {
            const hasTail = trimmed.length > rootName.length;
            if (hasTail) {
                return getLoopPathValue(bindings, trimmed);
            }
            return bindings[rootName];
        }

        return value;
    }

    if (Array.isArray(value)) return value.map((entry) => resolveLoopBodyValue(entry, bindings, ctx));

    if (isRecord(value)) {
        const resolved: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            if (FORBIDDEN_PATH_KEYS.has(key)) continue;
            resolved[key] = resolveLoopBodyValue(val, bindings, ctx);
        }
        return resolved;
    }

    return value;
}

/**
 * Resolves an action or loop-step parameter map for one pass of a `ForEach` or `While` loop.
 *
 * Bridges the two historical loop parameter dialects (`ResolveMappedInput`'s `payload.*`/`static:*`
 * and `BaseAgent`'s `{{item.field}}` / `steps.<id>.<field>`) into one deterministic pure function
 * shared by `TaskGraphDispatcher` and `BaseAgent`.
 */
export function ResolveLoopBodyParams(
    params: Record<string, unknown> | undefined,
    bindings: Record<string, unknown>,
    ctx: PayloadMappingContext,
): Record<string, unknown> {
    if (!params || !isRecord(params)) return {};
    const resolved = resolveLoopBodyValue(params, bindings, ctx);
    return isRecord(resolved) ? resolved : {};
}

/**
 * Builds a step's parameters from its input mapping.
 *
 * A missing or unparseable mapping yields no parameters and an error, never a throw — a step with a
 * malformed mapping should fail with a legible reason, not take the dispatcher down.
 */
export function BuildMappedInput(
    mappingJSON: string | null | undefined,
    ctx: PayloadMappingContext,
): { params: Record<string, unknown>; errors: string[] } {
    if (!mappingJSON?.trim()) return { params: {}, errors: [] };

    let parsed: unknown;
    try {
        parsed = JSON.parse(mappingJSON);
    } catch (e) {
        return { params: {}, errors: [`Input mapping is not valid JSON: ${errorText(e)}`] };
    }

    if (!isRecord(parsed)) {
        return { params: {}, errors: ['Input mapping must be a JSON object of parameter names to values.'] };
    }

    const resolved = ResolveMappedInput(parsed, ctx);
    return { params: isRecord(resolved) ? resolved : {}, errors: [] };
}

/**
 * Sets a value on a target object, honouring the `[]` array-append suffix.
 *
 * `results[]` appends and auto-creates the array; `results` assigns. Appending to something that is
 * already a non-array is an error rather than a silent overwrite, because the two mean opposite
 * things and quietly picking one would lose data the author expected to accumulate.
 */
export function SetMappedValue(target: Record<string, unknown>, key: string, value: unknown): void {
    const isAppend = key.endsWith('[]');
    const actualKey = isAppend ? key.slice(0, -2) : key;

    if (!isAppend) {
        target[actualKey] = value;
        return;
    }

    if (!(actualKey in target)) target[actualKey] = [];
    if (!Array.isArray(target[actualKey])) {
        throw new Error(
            `Cannot append to '${actualKey}': it is not a list. ` +
            `Use '${actualKey}' without [] to replace its value instead.`,
        );
    }
    (target[actualKey] as unknown[]).push(value);
}

/**
 * Reads one value out of a step's result, by the output mapping's key.
 *
 * Three forms, in the order they are tried: `*` means the whole result; a dotted key walks into it;
 * anything else is a single field. Field lookup is **case-insensitive at every level**, because an
 * action's declared output names and the casing an author types rarely agree, and a case-sensitive
 * miss would silently map nothing.
 */
export function ResolveMappedOutput(result: Record<string, unknown>, outputParam: string): unknown {
    if (outputParam === '*') return result;

    let current: unknown = result;
    for (const part of outputParam.split('.')) {
        if (FORBIDDEN_PATH_KEYS.has(part)) return undefined;
        if (!isRecord(current) || Array.isArray(current)) return undefined;
        const actualKey = Object.prototype.hasOwnProperty.call(current, part)
            ? part
            : Object.keys(current).find((k) => k.toLowerCase() === part.toLowerCase());
        if (!actualKey || FORBIDDEN_PATH_KEYS.has(actualKey)) return undefined;
        current = current[actualKey];
    }
    return current;
}

/**
 * Minimal structural shape of an `ActionParam` (`@memberjunction/actions-base`) so `@memberjunction/ai-core-plus`
 * stays dependency-free while sharing one exact action-output projection across `BaseAgent` and `TaskGraphActionRunner`.
 *
 * @since 6.2.0
 */
export interface ActionOutputParamLike {
    Name: string;
    Value?: unknown;
    Type?: string | null;
}

/**
 * Projects an action's `Params` and optional `Message` into the flat output object exposed to
 * `steps.<id>.*` references and `outputMapping` rules in both in-turn (`BaseAgent`) and durable
 * (`TaskGraphActionRunner`) execution.
 *
 * Parses a structured JSON-object `resultMessage` first (so actions returning JSON metadata in
 * `Message` expose their fields directly) and overlays declared `Output` and `Both` parameters on top.
 *
 * @since 6.2.0
 */
export function BuildActionOutputObject(
    actionParams: readonly ActionOutputParamLike[] | null | undefined,
    resultMessage?: string | null,
): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    if (typeof resultMessage === 'string') {
        const trimmed = resultMessage.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                if (isRecord(parsed) && !Array.isArray(parsed)) {
                    for (const [k, v] of Object.entries(parsed)) {
                        if (!FORBIDDEN_PATH_KEYS.has(k)) {
                            output[k] = v;
                        }
                    }
                }
            } catch {
                // Non-JSON prose message; ignore.
            }
        }
    }
    for (const param of actionParams ?? []) {
        if ((param.Type === 'Output' || param.Type === 'Both') && !FORBIDDEN_PATH_KEYS.has(param.Name)) {
            output[param.Name] = param.Value;
        }
    }
    return output;
}

/**
 * One recorded per-step `outputMapping` fold from a `steps[]` loop iteration, ready to be replayed
 * onto the loop's shared payload in deterministic iteration-index order.
 *
 * @since 6.2.0
 */
export interface LoopStepFold {
    Output: Record<string, unknown>;
    Mapping: string;
}

/**
 * Applies a step's output mapping, producing payload updates and any special fields.
 *
 * **This is what makes a branch condition possible.** A workflow that branches on
 * `payload.stockPrice` has that value only because an earlier step mapped `CurrentPrice ->
 * stockPrice`. Skip this and the condition reads `undefined`, which is merely falsy — so the
 * workflow takes the wrong branch without anything reporting a problem.
 *
 * Values that resolve to `undefined` are skipped rather than written, so a step that did not produce
 * an optional field leaves the payload as it was instead of stamping it with nothing.
 *
 * @param into an object to apply the updates ONTO, defaulting to a fresh one. Pass the current
 *   payload when the mapping must see what is already there — which is the only way `name[]` can
 *   mean anything, since appending is defined relative to an existing list. A loop applying its
 *   body's mapping once per pass needs exactly this: with a fresh object each pass, every append
 *   produces a new one-element array that replaces the last, and the loop keeps only its final
 *   iteration. **The object is mutated**, so callers that must not disturb the value they hold
 *   should pass a copy.
 */
export function ApplyOutputMapping(
    result: Record<string, unknown>,
    mappingJSON: string | null | undefined,
    into: Record<string, unknown> = {},
): OutputMappingResult {
    const errors: string[] = [];
    if (!mappingJSON?.trim()) return { updates: into, errors };

    let mapping: PayloadMapping;
    try {
        const parsed: unknown = JSON.parse(mappingJSON);
        if (!isRecord(parsed)) return { updates: into, errors: ['Output mapping must be a JSON object.'] };
        mapping = parsed as PayloadMapping;
    } catch (e) {
        return { updates: into, errors: [`Output mapping is not valid JSON: ${errorText(e)}`] };
    }

    const updates: Record<string, unknown> = into;
    const specialFields: MappedSpecialFields = {};
    const unmapped: string[] = [];

    for (const [outputParam, payloadPath] of Object.entries(mapping)) {
        const value = ResolveMappedOutput(result, outputParam);
        // Recorded rather than ignored. Skipping in silence is what let a step run, succeed, and
        // contribute nothing — see `unmapped` on OutputMappingResult.
        if (value === undefined) { unmapped.push(outputParam); continue; }

        if (payloadPath.startsWith('$')) {
            applySpecialField(specialFields, payloadPath, value, errors);
            continue;
        }

        const parts = payloadPath.split('.');
        const cleanSegments = parts.map((p) => (p.endsWith('[]') ? p.slice(0, -2) : p));
        if (cleanSegments.some((seg) => !seg || FORBIDDEN_PATH_KEYS.has(seg))) {
            errors.push(`Forbidden target path '${payloadPath}' in output mapping.`);
            continue;
        }
        let current = updates;
        for (let i = 0; i < parts.length - 1; i++) {
            const cleanPart = cleanSegments[i];
            if (!Object.prototype.hasOwnProperty.call(current, cleanPart) || !isRecord(current[cleanPart])) {
                current[cleanPart] = {};
            }
            current = current[cleanPart] as Record<string, unknown>;
        }
        try {
            SetMappedValue(current, parts[parts.length - 1], value);
        } catch (e) {
            errors.push(errorText(e));
        }
    }

    return {
        updates,
        specialFields: Object.keys(specialFields).length > 0 ? specialFields : undefined,
        errors,
        unmapped: unmapped.length > 0 ? unmapped : undefined,
    };
}

/** Routes a `$`-prefixed target to its typed slot, reporting anything unrecognized. */
function applySpecialField(
    into: MappedSpecialFields,
    payloadPath: string,
    value: unknown,
    errors: string[],
): void {
    const field = payloadPath.substring(1).toLowerCase();
    if (field === 'message' && typeof value === 'string') into.message = value;
    else if (field === 'reasoning' && typeof value === 'string') into.reasoning = value;
    else if (field === 'confidence' && typeof value === 'number') into.confidence = value;
    else {
        errors.push(
            `Unknown or mistyped special field '${payloadPath}' in an output mapping. ` +
            `Valid targets are $message and $reasoning (text) and $confidence (number).`,
        );
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
