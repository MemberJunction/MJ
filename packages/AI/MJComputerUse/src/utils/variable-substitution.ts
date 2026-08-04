/**
 * Variable substitution for parsed test definitions.
 *
 * Lets test JSONs reference `{{key}}` placeholders that get resolved against
 * a values map at execution time — making the same test definition reusable
 * across local (Mode A) / remote MJ (Mode B) / generic web (Mode C) / BYO app
 * (Mode D) targets without copy-pasting URLs and credentials.
 *
 * Two sources feed the values map (see `buildVariableValuesFromContext`):
 *   1. The TestingFramework variable resolver (schema-validated, CLI `--var` flags).
 *   2. Env vars prefixed `MJ_TEST_VAR_*` — ad-hoc fallback when no schema is declared.
 *
 * Both helpers are pure functions for easy unit testing.
 */

const ENV_PREFIX = 'MJ_TEST_VAR_';
const WHOLE_STRING = /^\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}$/;
const EMBEDDED = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;

/**
 * Try to parse a string env-var value as JSON when it looks structured
 * (array, object, quoted-string) or scalar JSON (`true`, `false`, `null`,
 * a number). Falls back to the raw string when parsing fails or the value
 * is plainly textual.
 *
 * This is what lets compose overlays pass arrays through env vars:
 *   `MJ_TEST_VAR_allowedDomains='["byo-app"]'` → `['byo-app']`
 * Without this, the whole-string placeholder substitution would inject the
 * literal string `'["byo-app"]'` into an array-typed field.
 */
function maybeParseJsonScalar(raw: string): unknown {
    const trimmed = raw.trim();
    if (trimmed === '') return raw;
    const first = trimmed[0];
    const looksJson =
        first === '[' || first === '{' || first === '"' ||
        trimmed === 'true' || trimmed === 'false' || trimmed === 'null' ||
        /^-?\d/.test(trimmed); // numeric
    if (!looksJson) return raw;
    try {
        return JSON.parse(trimmed);
    } catch {
        return raw;
    }
}

/**
 * Build the merged variable values map from a driver execution context.
 * Resolver values override env-var values when both are present.
 *
 * Accepts a loose shape so tests don't need the full DriverExecutionContext type.
 */
export function buildVariableValuesFromContext(
    context: { resolvedVariables?: { values?: Record<string, unknown> } } | null | undefined,
    env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    // Layer 1: env vars (lowest priority) — JSON-parse when value looks structured.
    for (const [key, value] of Object.entries(env)) {
        if (key.startsWith(ENV_PREFIX) && value !== undefined) {
            values[key.slice(ENV_PREFIX.length)] = maybeParseJsonScalar(value);
        }
    }

    // Layer 2: resolver values (overwrites env) — already typed by the resolver.
    const resolved = context?.resolvedVariables?.values;
    if (resolved) {
        for (const [key, value] of Object.entries(resolved)) {
            values[key] = value;
        }
    }

    return values;
}

/**
 * Compose suite-level + per-test application-context layers into a single
 * markdown string for the controller prompt, applying `{{var}}` substitution
 * to each layer.
 *
 * Order: suite context first (general), then per-test notes (specific) under
 * a `## Test-specific Notes` heading. Either layer can be empty/undefined.
 *
 * Returns `undefined` when neither layer has content — callers should skip
 * setting `params.ApplicationContext` in that case so the engine doesn't
 * render an empty heading.
 */
export function composeApplicationContext(
    suiteLevel: string | undefined,
    perTest: string | undefined,
    values: Record<string, unknown>
): string | undefined {
    const layers: string[] = [];
    const substitute = (s: string) => Object.keys(values).length === 0 ? s : substituteVariables(s, values);

    if (typeof suiteLevel === 'string' && suiteLevel.trim()) {
        layers.push(substitute(suiteLevel));
    }
    if (typeof perTest === 'string' && perTest.trim()) {
        layers.push(`## Test-specific Notes\n\n${substitute(perTest)}`);
    }
    return layers.length === 0 ? undefined : layers.join('\n\n');
}

/**
 * Recursively replace `{{key}}` placeholders inside string values of a parsed
 * JSON object.
 *
 * - A string that is *exactly* `"{{key}}"` is replaced with the raw value from
 *   `values` — preserving non-string types (arrays, numbers, booleans).
 * - An embedded placeholder (`"prefix {{key}} suffix"`) always produces a string;
 *   non-string values are coerced with `String()`.
 * - Unknown keys are left in place verbatim (no error) so authors can ship a
 *   partially-parameterized test without breaking it.
 *
 * Returns a NEW object — the input is not mutated.
 */
export function substituteVariables<T>(obj: T, values: Record<string, unknown>): T {
    if (Object.keys(values).length === 0) {
        return obj;
    }

    const walk = (node: unknown): unknown => {
        if (typeof node === 'string') {
            const whole = node.match(WHOLE_STRING);
            if (whole && Object.prototype.hasOwnProperty.call(values, whole[1])) {
                return values[whole[1]];
            }
            return node.replace(EMBEDDED, (match, key: string) =>
                Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
            );
        }
        if (Array.isArray(node)) {
            return node.map(walk);
        }
        if (node !== null && typeof node === 'object') {
            const result: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
                result[k] = walk(v);
            }
            return result;
        }
        return node;
    };

    return walk(obj) as T;
}
