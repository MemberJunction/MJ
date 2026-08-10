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
        if (!isRecord(current) || Array.isArray(current)) return undefined;
        const actualKey = Object.keys(current).find((k) => k.toLowerCase() === part.toLowerCase());
        if (!actualKey) return undefined;
        current = current[actualKey];
    }
    return current;
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
 */
export function ApplyOutputMapping(
    result: Record<string, unknown>,
    mappingJSON: string | null | undefined,
): OutputMappingResult {
    const errors: string[] = [];
    if (!mappingJSON?.trim()) return { updates: {}, errors };

    let mapping: PayloadMapping;
    try {
        const parsed: unknown = JSON.parse(mappingJSON);
        if (!isRecord(parsed)) return { updates: {}, errors: ['Output mapping must be a JSON object.'] };
        mapping = parsed as PayloadMapping;
    } catch (e) {
        return { updates: {}, errors: [`Output mapping is not valid JSON: ${errorText(e)}`] };
    }

    const updates: Record<string, unknown> = {};
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
        let current = updates;
        for (let i = 0; i < parts.length - 1; i++) {
            const cleanPart = parts[i].endsWith('[]') ? parts[i].slice(0, -2) : parts[i];
            if (!isRecord(current[cleanPart])) current[cleanPart] = {};
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
