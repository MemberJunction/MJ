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
 * A backslash escapes a placeholder: `\{{ name }}` is literal text, never a
 * variable. Substitution leaves it alone and then removes the backslash, and the
 * unresolved-placeholder finders skip it. That lets a goal describe mustache syntax
 * (e.g. a template editor) without tripping the unresolved-variable guard.
 *
 * Both helpers are pure functions for easy unit testing.
 */

const ENV_PREFIX = 'MJ_TEST_VAR_';
const WHOLE_STRING = /^\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}$/;
/** A placeholder, with group 1 set when a backslash escapes it. */
const EMBEDDED = /(\\)?\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;
/** The escape marker removed by {@link UnescapeLiteralBraces}. */
const ESCAPED_OPEN = /\\\{\{/g;

/** Options for {@link SubstituteVariables}. */
export interface SubstituteVariablesOptions {
    /**
     * Keep `\{{…}}` escapes in the output instead of unescaping them to `{{…}}`.
     * Set this when the result is checked with {@link FindUnresolvedPlaceholders}
     * afterwards, then call {@link UnescapeLiteralBraces} once the check passes.
     */
    KeepEscapes?: boolean;
}

/**
 * Apply `fn` to every string in a parsed JSON value. Returns the original node
 * when nothing beneath it changed, so an untouched input keeps its identity.
 */
function mapStrings(node: unknown, fn: (s: string) => unknown): unknown {
    if (typeof node === 'string') {
        return fn(node);
    }
    if (Array.isArray(node)) {
        const mapped = node.map(item => mapStrings(item, fn));
        return mapped.some((item, i) => item !== node[i]) ? mapped : node;
    }
    if (node !== null && typeof node === 'object') {
        const source = node as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        let changed = false;
        for (const [k, v] of Object.entries(source)) {
            result[k] = mapStrings(v, fn);
            changed = changed || result[k] !== v;
        }
        return changed ? result : node;
    }
    return node;
}

/** Turn every `\{{` in a string into `{{`. */
function unescapeString(value: string): string {
    return value.replace(ESCAPED_OPEN, '{{');
}

/**
 * Replace every escaped `\{{` with a literal `{{` in the string values of a
 * parsed JSON object. Returns the input itself when it holds no escapes.
 */
export function UnescapeLiteralBraces<T>(obj: T): T {
    return mapStrings(obj, unescapeString) as T;
}

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
export function BuildVariableValuesFromContext(
    context: { resolvedVariables?: { values?: Record<string, unknown> } } | null | undefined,
    env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    // Layer 1: env vars (lowest priority) — JSON-parse when value looks structured.
    //
    // An EMPTY value counts as unset. docker-compose declares each variable as
    // `"${MJ_TEST_VAR_x:-}"`, so inside the container the key always exists — as ""
    // when the host never supplied one. Treating that as a value substituted the
    // empty string into every `{{authUsername}}`/`{{authPassword}}`, and the suite
    // submitted blank credentials to the identity provider instead of failing with
    // "variable not provided". A variable nobody set must look unset here.
    for (const [key, value] of Object.entries(env)) {
        if (key.startsWith(ENV_PREFIX) && value !== undefined && value.trim() !== '') {
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

/** @deprecated Use {@link BuildVariableValuesFromContext}. */
export function buildVariableValuesFromContext(
    context: { resolvedVariables?: { values?: Record<string, unknown> } } | null | undefined,
    env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
    return BuildVariableValuesFromContext(context, env);
}

/**
 * Every unresolved `{{var}}` in a test's auth bindings, labelled by where it sits.
 *
 * The auth block is the one place an unresolved placeholder cannot be seen in the
 * run: a blank or literal `{{authPassword}}` is typed into the password field and
 * the run fails at the identity provider looking like a credential problem, not a
 * configuration one. `startUrl` and `goal` fail loudly on their own; this does not.
 */
export function FindUnresolvedAuthPlaceholders(auth: unknown): string[] {
    const bindings = (auth as { bindings?: unknown })?.bindings;
    if (!Array.isArray(bindings)) {
        return [];
    }
    const out: string[] = [];
    bindings.forEach((binding, i) => {
        const method = (binding as { method?: Record<string, unknown> })?.method;
        if (!method) {
            return;
        }
        for (const [field, value] of Object.entries(method)) {
            if (typeof value !== 'string') {
                continue;
            }
            for (const key of FindUnresolvedPlaceholders(value)) {
                out.push(`auth.bindings[${i}].${field}:{{${key}}}`);
            }
        }
    });
    return out;
}

/** @deprecated Use {@link FindUnresolvedAuthPlaceholders}. */
export function findUnresolvedAuthPlaceholders(auth: unknown): string[] {
    return FindUnresolvedAuthPlaceholders(auth);
}

/** Options for {@link ComposeApplicationContext}. */
export interface ComposeApplicationContextOptions {
    /**
     * The per-test layer was already substituted and unescaped (it came from a test
     * input that went through {@link SubstituteVariables} and {@link UnescapeLiteralBraces}).
     * It is used as-is, so a literal `{{…}}` it holds is not substituted a second time.
     */
    PerTestResolved?: boolean;
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
export function ComposeApplicationContext(
    suiteLevel: string | undefined,
    perTest: string | undefined,
    values: Record<string, unknown>,
    options: ComposeApplicationContextOptions = {}
): string | undefined {
    const layers: string[] = [];
    const substitute = (s: string) => SubstituteVariables(s, values);

    if (typeof suiteLevel === 'string' && suiteLevel.trim()) {
        layers.push(substitute(suiteLevel));
    }
    if (typeof perTest === 'string' && perTest.trim()) {
        const notes = options.PerTestResolved ? perTest : substitute(perTest);
        layers.push(`## Test-specific Notes\n\n${notes}`);
    }
    return layers.length === 0 ? undefined : layers.join('\n\n');
}

/** @deprecated Use {@link ComposeApplicationContext}. */
export function composeApplicationContext(
    suiteLevel: string | undefined,
    perTest: string | undefined,
    values: Record<string, unknown>,
    options: ComposeApplicationContextOptions = {}
): string | undefined {
    return ComposeApplicationContext(suiteLevel, perTest, values, options);
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
 * - An escaped `\{{key}}` is never substituted; it becomes the literal `{{key}}`
 *   (or stays escaped with `KeepEscapes`).
 *
 * The input is not mutated. Parts with nothing to replace are returned as-is.
 */
export function SubstituteVariables<T>(
    obj: T,
    values: Record<string, unknown>,
    options: SubstituteVariablesOptions = {}
): T {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(values, key);

    return mapStrings(obj, (node: string): unknown => {
        const whole = node.match(WHOLE_STRING);
        if (whole && has(whole[1])) {
            return values[whole[1]];
        }
        const replaced = node.replace(EMBEDDED, (match: string, escape: string | undefined, key: string) =>
            !escape && has(key) ? String(values[key]) : match
        );
        return options.KeepEscapes ? replaced : unescapeString(replaced);
    }) as T;
}

/** @deprecated Use {@link SubstituteVariables}. */
export function substituteVariables<T>(
    obj: T,
    values: Record<string, unknown>,
    options: SubstituteVariablesOptions = {}
): T {
    return SubstituteVariables(obj, values, options);
}

/**
 * Return the distinct `{{key}}` placeholder names still present in a string
 * after substitution. A non-empty result means variables the string
 * referenced were never provided — the caller can fail fast with the missing
 * keys instead of letting the literal `{{key}}` flow into a URL/goal and
 * surface later as a mysterious navigation error. Escaped `\{{key}}` text is
 * literal and never reported.
 */
export function FindUnresolvedPlaceholders(value: string | undefined): string[] {
    if (!value) {
        return [];
    }
    const keys = new Set<string>();
    for (const match of value.matchAll(EMBEDDED)) {
        if (!match[1]) {
            keys.add(match[2]);
        }
    }
    return [...keys];
}

/** @deprecated Use {@link FindUnresolvedPlaceholders}. */
export function findUnresolvedPlaceholders(value: string | undefined): string[] {
    return FindUnresolvedPlaceholders(value);
}
