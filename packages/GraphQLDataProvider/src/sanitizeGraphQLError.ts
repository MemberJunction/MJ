/**
 * Sanitisation for errors thrown by the underlying `graphql-request` client.
 *
 * ## Why this exists
 *
 * `graphql-request`'s `ClientError` builds its message like this:
 *
 * ```ts
 * const message = `${ClientError.extractMessage(response)}: ${JSON.stringify({ response, request })}`
 * ```
 *
 * The originating request — **including its `variables`** — is serialised into
 * `message` at construction time. Three consequences follow, and all three are
 * easy to get wrong:
 *
 * 1. `e.message` contains every variable value the mutation carried. For a
 *    mutation whose input holds a secret, that is the secret in plaintext.
 * 2. `String(e)` and `e.toString()` return that same message, so *any* logger
 *    that stringifies the error re-emits the secret. `LogError()` does exactly
 *    this — it calls `String(message)` internally.
 * 3. V8 composes `e.stack` as `` `${name}: ${message}\n    at …` ``, so the
 *    **stack string embeds the message**, and therefore the secret too. A
 *    sanitiser that preserves `stack` verbatim leaks everything it just
 *    stripped from `message`.
 *
 * Redacting `e.request.variables` on a shallow copy addresses none of these:
 * the serialised copy inside `message` is a different string, already built.
 *
 * ## What this does instead
 *
 * Rather than subtract secrets from the error, it **constructs a new diagnostic
 * object from only the fields known to be safe**, and re-derives the message
 * from `response.errors[0].message` instead of reusing `e.message`. Nothing is
 * copied wholesale, so a future change to the upstream error shape cannot
 * silently widen what gets logged.
 *
 * Every field the original log line depended on is preserved — response status,
 * GraphQL error details, the query text, and the stack frames — so this is a
 * strict improvement in diagnostics over both the raw log and the shallow-spread
 * redaction it replaces.
 */

/** GraphQL error entry as returned in a response's `errors` array. */
export interface SanitizedGraphQLErrorDetail {
    message?: string;
    path?: readonly (string | number)[];
    extensions?: Record<string, unknown>;
}

/**
 * A diagnostic view of a failed GraphQL request that is safe to write to a log.
 *
 * Deliberately carries **no** `variables` and **no** verbatim upstream `message`
 * — the two places a request payload can hide.
 */
export interface SanitizedGraphQLError {
    /** Error class name, e.g. `ClientError`. */
    name: string;
    /**
     * Re-derived from `response.errors[0].message`, or the HTTP status when the
     * response carried no GraphQL errors. Never the upstream `message`.
     */
    message: string;
    /** HTTP status of the GraphQL response, when present. */
    status?: number;
    /** GraphQL error details — the actual diagnostic payload. */
    errors?: SanitizedGraphQLErrorDetail[];
    /** Error code from the first GraphQL error, e.g. `JWT_EXPIRED`. */
    code?: string;
    /** The query text. Safe: it is the static document, not the values bound to it. */
    query?: string;
    /**
     * Stack **frames only** — the `Name: message` header line V8 prepends is
     * removed, because that header embeds the unsanitised message.
     */
    stackFrames?: string;
    /**
     * `'[REDACTED]'` by default. Carries the actual variable values only when the
     * caller explicitly opts in via `includeVariableValues` — see
     * `GraphQLProviderConfigData.LogVariableValues`.
     */
    variables: '[REDACTED]' | unknown;
    /**
     * The **shape** of the withheld variables — key names and value types, never
     * values. Schema, not data.
     *
     * This is what makes the redaction debuggable: it answers "was the field even
     * sent?", "was it empty?", "is the nesting what I expect?" — the questions a
     * failed mutation actually raises — without printing anything a log file must
     * not retain. Follows the precedent set by `ParamRedaction` in
     * `@memberjunction/actions-base`.
     */
    variableShape?: VariableShape;
}

/**
 * A recursive description of a value's structure with all leaves replaced by
 * type names. `{ input: { Name: 'x', Age: 3 } }` becomes
 * `{ input: { Name: 'string', Age: 'number' } }`.
 */
export type VariableShape = string | { [key: string]: VariableShape };

/**
 * The error `ExecuteGQL` rethrows in place of the raw client error.
 *
 * Sanitising only the log line is not enough to close the leak. `ExecuteGQL`
 * rethrows, and its callers catch and log — `LogError(e)` appears 19 times in this
 * package alone, and there are ~178 `ExecuteGQL` call sites across the repo. Every
 * one of those receives an error whose `message` and `stack` still contain the
 * serialised request, and any of them may stringify it. Redacting at one log
 * statement fixes one log statement; replacing the propagated object fixes all of
 * them at once, including callers not yet written.
 *
 * What is preserved, and why it is safe:
 * - `response.status` / `response.errors` — the server's diagnosis of the failure.
 *   Every known downstream consumer reads exactly these (and `extensions.code`).
 * - `request.query` — the static document, which binds values but contains none.
 *
 * What is dropped:
 * - `request.variables` — the caller's payload, where secrets live.
 * - `response.data` — a partial success on a credential-bearing read could return
 *   decrypted values here, so it is not forwarded.
 * - the upstream `message` and `stack`, both of which embed the serialised request.
 *
 * `name` is preserved from the original (e.g. `ClientError`) so code that branches
 * on the error's name keeps working.
 */
export class SafeGraphQLError extends Error {
    /**
     * Server response, narrowed to status and GraphQL errors.
     *
     * NAMING: `response` and `request` are intentionally camelCase, against MJ's
     * PascalCase convention for public members. They exist to mirror the shape of
     * the upstream `ClientError` this replaces, and downstream code reads them by
     * those exact names — `err?.response?.errors` in the workspace initializer, the
     * Bootstrap initialization service, and the DevTools GraphQL console. Renaming
     * them would break the compatibility that is this class's entire purpose.
     * Members that are new here, rather than inherited from the upstream surface,
     * follow the MJ convention below.
     */
    public readonly response?: { status?: number; errors?: SanitizedGraphQLErrorDetail[] };
    /** Originating request, narrowed to the query document. See the note above on casing. */
    public readonly request?: { query?: string };
    /** Error code from the first GraphQL error, e.g. `JWT_EXPIRED`. */
    public readonly Code?: string;
    /** Shape of the withheld variables — key names and value types, never values. */
    public readonly VariableShape?: VariableShape;

    constructor(sanitized: SanitizedGraphQLError) {
        super(sanitized.message);
        this.name = sanitized.name;
        this.response = { status: sanitized.status, errors: sanitized.errors };
        this.request = { query: sanitized.query };
        this.Code = sanitized.code;
        this.VariableShape = sanitized.variableShape;
        // Rebuild the stack with a header derived from the sanitised message, keeping
        // the original frames. Assigning the raw `stack` would reintroduce the payload,
        // since V8's header line is `${name}: ${unsanitised message}`.
        this.stack = sanitized.stackFrames
            ? `${sanitized.name}: ${sanitized.message}\n${sanitized.stackFrames}`
            : this.stack;
    }
}

/**
 * Wraps a caught GraphQL client error in a {@link SafeGraphQLError} suitable for
 * rethrowing. The input is not mutated.
 */
export function ToSafeGraphQLError(e: unknown): SafeGraphQLError {
    return e instanceof SafeGraphQLError ? e : new SafeGraphQLError(SanitizeGraphQLError(e));
}

/** Narrow structural view of the upstream error; avoids importing its type. */
interface ClientErrorLike {
    name?: unknown;
    stack?: unknown;
    response?: {
        status?: unknown;
        errors?: unknown;
    };
    request?: {
        query?: unknown;
        variables?: unknown;
    };
}

/** Depth beyond which nesting is summarised rather than walked. */
const MAX_SHAPE_DEPTH = 3;
/** Key count beyond which an object is summarised rather than enumerated. */
const MAX_SHAPE_KEYS = 25;

/**
 * Describes a value's structure with every leaf replaced by its type name.
 *
 * Strings report emptiness but never length or content — "was the field blank?"
 * is the common debugging question, and answering it costs nothing. No value is
 * ever reproduced, at any depth.
 */
function describeShape(value: unknown, depth = 0): VariableShape {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (Array.isArray(value)) {
        // Element type of the first entry stands for the array; arrays in GraphQL
        // variables are homogeneous by schema.
        return value.length === 0 ? 'array(empty)' : `array(${value.length} × ${typeOf(describeShape(value[0], depth + 1))})`;
    }

    if (typeof value === 'object') {
        if (depth >= MAX_SHAPE_DEPTH) return 'object(…)';
        const keys = Object.keys(value as object);
        if (keys.length > MAX_SHAPE_KEYS) return `object(${keys.length} keys)`;

        const shape: { [key: string]: VariableShape } = {};
        for (const key of keys) {
            shape[key] = describeShape((value as Record<string, unknown>)[key], depth + 1);
        }
        return shape;
    }

    if (typeof value === 'string') return value.length === 0 ? 'string(empty)' : 'string';
    return typeof value;
}

/** Renders a shape as a short type name for use inside an array summary. */
function typeOf(shape: VariableShape): string {
    return typeof shape === 'string' ? shape : 'object';
}

/** Drops the `Name: message` header V8 puts at the top of a stack string. */
function stripStackHeader(stack: string): string {
    const firstFrame = stack.indexOf('\n    at ');
    return firstFrame === -1 ? '' : stack.slice(firstFrame + 1);
}

/** Mirrors `ClientError.extractMessage` without touching the built message. */
function deriveMessage(errors: SanitizedGraphQLErrorDetail[] | undefined, status: number | undefined): string {
    const first = errors?.[0]?.message;
    if (typeof first === 'string' && first.length > 0) {
        return first;
    }
    return `GraphQL Error (Code: ${String(status ?? 'unknown')})`;
}

/** Reads the `errors` array off a response, keeping only known-safe fields. */
function extractErrors(raw: unknown): SanitizedGraphQLErrorDetail[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    return raw.map((entry): SanitizedGraphQLErrorDetail => {
        const e = (entry ?? {}) as SanitizedGraphQLErrorDetail;
        return {
            message: typeof e.message === 'string' ? e.message : undefined,
            path: Array.isArray(e.path) ? e.path : undefined,
            extensions: e.extensions && typeof e.extensions === 'object' ? e.extensions : undefined,
        };
    });
}

/**
 * Builds a log-safe diagnostic object for an error thrown by the GraphQL client.
 *
 * The input error is **never mutated** — callers can and do continue to inspect
 * and rethrow the original, so control flow that depends on it (JWT-expiry
 * detection, upstream `catch` blocks) is unaffected.
 *
 * @param e The caught value. Non-object inputs are described, never stringified,
 *          since an arbitrary thrown value may itself be a payload.
 * @param includeVariableValues Opt in to emitting the variables verbatim instead of
 *          `'[REDACTED]'`. Development use only — see
 *          `GraphQLProviderConfigData.LogVariableValues`. Note the message and stack
 *          remain sanitised even when this is `true`, because the upstream copies
 *          there are unbounded and unstructured; the opt-in returns the *variables*,
 *          which is what a developer is actually asking for.
 * @returns A structure safe to pass to `console.error` or a file logger.
 */
export function SanitizeGraphQLError(e: unknown, includeVariableValues = false): SanitizedGraphQLError {
    if (!e || typeof e !== 'object') {
        return {
            name: typeof e,
            message: 'Non-object value thrown; contents withheld',
            variables: '[REDACTED]',
        };
    }

    const err = e as ClientErrorLike;
    const status = typeof err.response?.status === 'number' ? err.response.status : undefined;
    const errors = extractErrors(err.response?.errors);
    const rawCode = errors?.[0]?.extensions?.['code'];

    return {
        name: typeof err.name === 'string' ? err.name : 'Error',
        message: deriveMessage(errors, status),
        status,
        errors,
        code: typeof rawCode === 'string' ? rawCode : undefined,
        query: typeof err.request?.query === 'string' ? err.request.query : undefined,
        stackFrames: typeof err.stack === 'string' ? stripStackHeader(err.stack) : undefined,
        variables: includeVariableValues ? err.request?.variables : '[REDACTED]',
        variableShape: err.request?.variables === undefined ? undefined : describeShape(err.request.variables),
    };
}
