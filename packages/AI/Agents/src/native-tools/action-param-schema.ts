/**
 * @fileoverview The JSON Schema an Action param declares for its value, from `ActionParam.ValueSchema`
 * when the param has one and from its coarse `ValueType` otherwise — and argument coercion that
 * follows that schema.
 * @module @memberjunction/ai-agents
 */

import type { MJActionParamEntity, MJActionParamEntity_IActionParamValueSchema } from '@memberjunction/core-entities';

/** A JSON Schema fragment in the cross-provider subset `ActionParam.ValueSchema` allows. */
export type ParamValueSchema = MJActionParamEntity_IActionParamValueSchema;

/** One JSON type name a schema may declare. */
type SchemaTypeName = Extract<NonNullable<ParamValueSchema['type']>, string>;

const SCHEMA_TYPE_NAMES: ReadonlySet<string> = new Set<SchemaTypeName>(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

/** The only values a stored `enum` may hold. */
type EnumValue = NonNullable<ParamValueSchema['enum']>[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSchemaTypeName(value: unknown): value is SchemaTypeName {
    return typeof value === 'string' && SCHEMA_TYPE_NAMES.has(value);
}

function isEnumValue(value: unknown): value is EnumValue {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** Keeps a `type` that names only known JSON types; drops it otherwise. */
function sanitizeType(raw: unknown): ParamValueSchema['type'] | undefined {
    if (isSchemaTypeName(raw)) {
        return raw;
    }
    if (Array.isArray(raw) && raw.length > 0 && raw.every(isSchemaTypeName)) {
        return raw;
    }
    return undefined;
}

/** Sanitizes each named property, keeping only those whose schema survives. */
function sanitizeProperties(raw: unknown): Record<string, ParamValueSchema> | undefined {
    if (!isPlainObject(raw)) {
        return undefined;
    }
    const properties: Record<string, ParamValueSchema> = {};
    for (const [name, child] of Object.entries(raw)) {
        const sanitized = SanitizeValueSchema(child);
        if (sanitized) {
            properties[name] = sanitized;
        }
    }
    return properties;
}

/**
 * Keeps a `required` list of names, minus any the schema does not declare as properties — a
 * provider rejects a required name with no property behind it. Empty resolves to undefined.
 */
function sanitizeRequired(raw: unknown, properties: Record<string, ParamValueSchema> | undefined): string[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const names = raw.filter((r): r is string => typeof r === 'string' && (!properties || r in properties));
    return names.length > 0 ? names : undefined;
}

/**
 * Copies a stored schema down to the cross-provider subset, recursively.
 *
 * `ValueSchema` is hand-authored metadata, and providers reject a declaration over one bad keyword
 * — the whole request fails, not just this tool. So anything outside the subset (`oneOf`, `$ref`,
 * `format`, a misspelled key, a `type` that names no JSON type) is dropped here rather than passed
 * through. The result is a fresh plain object: the entity accessor returns a live view, and a tool
 * declaration must not write back into the record.
 *
 * @param raw The parsed `ValueSchema` value, or any nested schema inside it
 * @returns The sanitized schema, or null when `raw` is not an object
 */
export function SanitizeValueSchema(raw: unknown): ParamValueSchema | null {
    if (!isPlainObject(raw)) {
        return null;
    }
    const schema: ParamValueSchema = {};
    const type = sanitizeType(raw.type);
    if (type !== undefined) {
        schema.type = type;
    }
    if (typeof raw.description === 'string' && raw.description.trim().length > 0) {
        schema.description = raw.description.trim();
    }
    if (Array.isArray(raw.enum) && raw.enum.length > 0 && raw.enum.every(isEnumValue)) {
        schema.enum = [...raw.enum];
    }
    const items = SanitizeValueSchema(raw.items);
    if (items) {
        schema.items = items;
    }
    const properties = sanitizeProperties(raw.properties);
    if (properties) {
        schema.properties = properties;
    }
    const required = sanitizeRequired(raw.required, properties);
    if (required) {
        schema.required = required;
    }
    return schema;
}

/**
 * Maps one param's `ValueType` onto a JSON Schema fragment (§8.2 table) — the fallback when the
 * param has no `ValueSchema`.
 *
 * `ActionParam.ValueType` distinguishes only five coarse kinds, so this mapping is lossy by
 * construction and the prose `Description` carries the real type. Choices settled by measurement:
 *
 * - **`Scalar` emits a union type.** It appears to violate the cross-provider common subset —
 *   OpenAPI 3.0, which Gemini's classic function declarations follow, has no union `type` — but it
 *   measured clean on every provider tested, so the plan's literal mapping stands.
 * - **The opaque kinds emit `string`, not `object`.** `Run Ad-hoc Query.Query` is
 *   `ValueType: 'Other'` but holds SQL text, and typing it as an object made models emit
 *   `Query: {}` on 40% of calls — well-formed, dispatchable and useless. Switching to `string` took
 *   usable arguments from 60% to 100% on the same prompts. The structural type beats the prose
 *   description whenever the two disagree, so it must not disagree.
 * - **`Simple Object` emits `object`.** Unlike the opaque kinds it says what the value is, and
 *   typing a real object as `string` fails the other way: the model JSON-encodes it, and an Action
 *   expecting an object receives text.
 */
function schemaForValueType(valueType: MJActionParamEntity['ValueType']): ParamValueSchema {
    switch (valueType) {
        case 'Scalar':
            return { type: ['string', 'number', 'boolean'] };
        case 'Simple Object':
            return { type: 'object' };
        default:
            return { type: 'string' };
    }
}

/**
 * The param's stored `ValueSchema`, sanitized, or null when it has none or it cannot be read.
 *
 * Text that is not valid JSON makes the entity accessor throw. A broken schema on one param must
 * not stop the agent from declaring its tools, so that case warns and falls back to `ValueType`.
 */
export function GetStoredValueSchema(param: MJActionParamEntity): ParamValueSchema | null {
    try {
        return SanitizeValueSchema(param.ValueSchemaObject);
    } catch (error) {
        console.warn(
            `Action param '${param.Name}' has a ValueSchema that is not valid JSON; declaring it from ValueType '${param.ValueType}' instead.`,
            error
        );
        return null;
    }
}

/**
 * The schema of ONE value of this param: the stored `ValueSchema` when present, else the
 * `ValueType` mapping. For an `IsArray` param this is the element schema; the caller wraps it.
 */
export function ResolveParamElementSchema(param: MJActionParamEntity): ParamValueSchema {
    return GetStoredValueSchema(param) ?? schemaForValueType(param.ValueType);
}

/** The JSON types a schema allows, or null when it does not say. */
function allowedTypes(schema: ParamValueSchema): ReadonlySet<SchemaTypeName> | null {
    if (schema.type === undefined) {
        return null;
    }
    return new Set(Array.isArray(schema.type) ? schema.type : [schema.type]);
}

/** Turns a string back into the non-string value the schema asks for, when it unambiguously is one. */
function decodeString(value: string, types: ReadonlySet<SchemaTypeName>): unknown {
    const trimmed = value.trim();
    if ((types.has('object') && trimmed.startsWith('{')) || (types.has('array') && trimmed.startsWith('['))) {
        try {
            const decoded: unknown = JSON.parse(trimmed);
            const fits = Array.isArray(decoded) ? types.has('array') : isPlainObject(decoded) && types.has('object');
            return fits ? decoded : value;
        } catch {
            return value;
        }
    }
    if ((types.has('number') || types.has('integer')) && trimmed.length > 0 && Number.isFinite(Number(trimmed))) {
        const n = Number(trimmed);
        return types.has('number') || Number.isInteger(n) ? n : value;
    }
    if (types.has('boolean') && (trimmed === 'true' || trimmed === 'false')) {
        return trimmed === 'true';
    }
    return value;
}

/** Coerces each declared property of an object; undeclared keys pass through untouched. */
function coerceProperties(value: Record<string, unknown>, properties: Record<string, ParamValueSchema>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...value };
    for (const [name, child] of Object.entries(properties)) {
        if (name in result) {
            result[name] = CoerceValueToSchema(result[name], child);
        }
    }
    return result;
}

/**
 * Coerces one argument value toward its schema, recursively.
 *
 * Models follow a declared type most of the time, but sometimes send an object as JSON text, a
 * number as `"10"`, or a boolean as `"true"` — and an Action expecting the real type receives text.
 * A string is converted only when the schema does NOT allow strings and the text unambiguously
 * encodes an allowed type; anything else is returned unchanged. A value that still does not fit is
 * the Action's to reject with its own message rather than ours to guess at.
 *
 * @param value The value as the provider returned it
 * @param schema The schema it was declared with
 * @returns The coerced value; `value` is not mutated
 */
export function CoerceValueToSchema(value: unknown, schema: ParamValueSchema): unknown {
    const types = allowedTypes(schema);
    let current = value;
    if (typeof current === 'string' && types && !types.has('string')) {
        current = decodeString(current, types);
    }
    if (Array.isArray(current) && schema.items) {
        const items = schema.items;
        return current.map((item) => CoerceValueToSchema(item, items));
    }
    if (isPlainObject(current) && schema.properties) {
        return coerceProperties(current, schema.properties);
    }
    return current;
}

/** The compact type text for one schema, e.g. `integer`, `"asc"|"desc"`, `{TopCount: integer}`. */
function inlineType(schema: ParamValueSchema): string {
    if (schema.enum) {
        return schema.enum.map((v) => JSON.stringify(v)).join('|');
    }
    const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.length === 1 && types[0] === 'array' && schema.items) {
        return `${inlineType(schema.items)}[]`;
    }
    if (schema.properties && Object.keys(schema.properties).length > 0) {
        const required = new Set(schema.required ?? []);
        const fields = Object.entries(schema.properties)
            .map(([name, child]) => `${name}${required.has(name) ? '' : '?'}: ${inlineType(child)}`);
        return `{${fields.join(', ')}}`;
    }
    return types.length > 0 ? types.join('|') : 'any';
}

/**
 * Describes a stored `ValueSchema` in one line for the prose action catalog, so the envelope path
 * tells the model the same type information a native tool declaration does.
 *
 * Nested descriptions are omitted to keep the catalog compact; the shape, required markers and
 * allowed values are what discriminate.
 */
export function DescribeValueSchemaInline(schema: ParamValueSchema): string {
    return inlineType(schema);
}
