/**
 * @fileoverview Prepares structured values (an agent payload, a loop item, a flow context) for a
 * nunjucks prompt template, so every way an author reaches them works.
 *
 * @module @memberjunction/ai-core-plus
 */

/**
 * Indentation of the JSON a structured value renders as when a template prints it whole.
 *
 * Two spaces because that is what `{{ _CURRENT_PAYLOAD }}` printed when the task-graph dispatcher
 * handed the payload over as a pre-serialized string, so a template written against that output sees
 * the same text it always did.
 */
const RENDERED_JSON_INDENT = 2;

/**
 * Prepares a structured value for a prompt template.
 *
 * A template reaches structured data in three ways, and each container type serves only some of them:
 *
 * | Template                         | Plain object        | JSON string            |
 * |----------------------------------|---------------------|------------------------|
 * | `{{ payload.field }}`            | the field           | **empty** (a string has no `.field`) |
 * | `{{ payload \| dump }}`          | JSON                | **double-encoded** JSON |
 * | `{{ payload }}`                  | **`[object Object]`** | JSON                 |
 *
 * Each failure is silent: the prompt renders, the model answers, and it answers about nothing. The
 * in-run Flow executor handed templates a plain object and the task-graph dispatcher handed them a
 * string, so a workflow's templates worked under one execution mode and silently broke under the other.
 *
 * This returns a deep copy in which every plain object and array carries a **non-enumerable**
 * `toString()` returning its JSON. Field access and `| dump` see an ordinary object (a non-enumerable
 * member is invisible to `JSON.stringify` and to key iteration), while printing the value whole — which
 * nunjucks does through `toString()` — yields JSON instead of `[object Object]`. The `jsonparse` filter
 * keeps working too: `JSON.parse` reads the value through the same `toString()` and returns an equal
 * plain object.
 *
 * Anything that is not a plain object or array (strings, numbers, booleans, `null`, Dates, class
 * instances) is returned unchanged. The input is never mutated. An object that already has its own
 * `toString` key keeps it, so a payload field of that name is never overwritten.
 *
 * @param value The value a template will receive.
 * @returns A template-ready copy of `value`, of the same shape.
 */
export function ToPromptTemplateValue<T>(value: T): T {
    return prepareValue(value, new WeakMap<object, object>()) as T;
}

/** Dispatches on container type; the `seen` map keeps a cyclic value from recursing forever. */
function prepareValue(value: unknown, seen: WeakMap<object, object>): unknown {
    if (Array.isArray(value)) {
        return prepareArray(value, seen);
    }
    if (isPlainObject(value)) {
        return prepareObject(value, seen);
    }
    return value;
}

/** True for `{}`-style objects only — never for Dates, Maps or class instances, which stay as they are. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function prepareObject(source: Record<string, unknown>, seen: WeakMap<object, object>): object {
    const existing = seen.get(source);
    if (existing) {
        return existing;
    }
    const copy: Record<string, unknown> = {};
    seen.set(source, copy);
    for (const [key, item] of Object.entries(source)) {
        copy[key] = prepareValue(item, seen);
    }
    return withJsonRendering(copy);
}

function prepareArray(source: unknown[], seen: WeakMap<object, object>): object {
    const existing = seen.get(source);
    if (existing) {
        return existing;
    }
    const copy: unknown[] = [];
    seen.set(source, copy);
    for (const item of source) {
        copy.push(prepareValue(item, seen));
    }
    return withJsonRendering(copy);
}

/** Gives `container` a non-enumerable `toString()` that renders it as JSON, unless it has its own `toString` key. */
function withJsonRendering(container: object): object {
    if (Object.prototype.hasOwnProperty.call(container, 'toString')) {
        return container;
    }
    Object.defineProperty(container, 'toString', {
        value: () => renderJson(container),
        enumerable: false,
        writable: true,
        configurable: true,
    });
    return container;
}

/**
 * The JSON a template prints for a structured value. A value JSON cannot represent (a cycle, a BigInt)
 * says so rather than throwing out of the render.
 */
function renderJson(container: object): string {
    try {
        return JSON.stringify(container, null, RENDERED_JSON_INDENT);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return `[value could not be rendered as JSON: ${reason}]`;
    }
}
