/**
 * matchers.ts — per-parameter matchers for LLM-authored values.
 *
 * Exact string equality is the wrong test for most action parameters, and using it would make the
 * harness measure phrasing instead of correctness. A SQL string, a search query, a summary
 * instruction — all are correct in many forms. But enums, ids and booleans genuinely are exact.
 * So matching is declarative and chosen per parameter by whoever writes the case (§3.2).
 *
 * Every variant is JSON-serializable, because a matcher arrives inside a `MJ: Tests`
 * `Configuration` blob and has to survive that round trip. That constraint is why there is no
 * `predicate` variant, however tempting: a function cannot be stored as metadata, and a corpus that
 * needs code to express an expectation is a corpus that cannot be generated or diffed.
 *
 * FRAMEWORK-FREE (test plan §2.1) — imports nothing from the testing engine.
 */

/** One check against one parameter value. */
export type ParamMatcher =
    /** Deep equality against a literal. For enums, ids, booleans, numbers. */
    | { kind: 'exact'; value: unknown }
    /** The value is a string with non-whitespace content. The weakest useful check. */
    | { kind: 'nonEmptyString' }
    | { kind: 'nonEmpty' }
    /** Case-insensitive substring. For free text where a keyword must appear. */
    | { kind: 'containsIgnoreCase'; value: string }
    /** Membership in a fixed set. For value-list parameters. */
    | { kind: 'oneOf'; values: unknown[] }
    /** A regular expression, supplied as a string with optional flags. */
    | { kind: 'regex'; pattern: string; flags?: string }
    /** Numeric bound, either end optional. */
    | { kind: 'numberRange'; min?: number; max?: number }
    /** The value's JSON type. For asserting shape without asserting content. */
    | { kind: 'typeOf'; type: 'string' | 'number' | 'boolean' | 'object' | 'array' }
    /** The parameter must be absent or null — for asserting a default was left alone. */
    | { kind: 'absent' };

/** One matcher bound to the parameter it checks. */
export interface ParamExpectation {
    param: string;
    matcher: ParamMatcher;
    /**
     * When true, an ABSENT parameter passes; a present one is still checked.
     *
     * This is how a case asserts "if the model sets `Format`, it must be `json`" without
     * requiring it to set `Format` at all — the common shape for optional action params that
     * carry a server-side default.
     */
    optional?: boolean;
}

/** The outcome of one matcher, kept per-parameter so param fidelity aggregates without a re-run. */
export interface ParamMatchResult {
    param: string;
    matcherKind: ParamMatcher['kind'];
    passed: boolean;
    /** Why it failed, phrased for a human reading a test report. */
    detail?: string;
}

function describe(value: unknown): string {
    if (value === undefined) {
        return 'absent';
    }
    const rendered = typeof value === 'string' ? value : JSON.stringify(value);
    return rendered !== undefined && rendered.length > 80 ? `${rendered.slice(0, 80)}…` : String(rendered);
}

function deepEqual(a: unknown, b: unknown): boolean {
    // JSON round-trip equality is the right notion here: both sides originate as JSON (one from
    // the model, one from a test record), so key order is the only difference it could miss.
    if (a === b) {
        return true;
    }
    if (typeof a !== typeof b || a === null || b === null) {
        return false;
    }
    if (typeof a !== 'object') {
        return false;
    }
    const aKeys = Object.keys(a as Record<string, unknown>).sort();
    const bKeys = Object.keys(b as Record<string, unknown>).sort();
    if (Array.isArray(a) !== Array.isArray(b) || aKeys.length !== bKeys.length) {
        return false;
    }
    return aKeys.every((k, i) => k === bKeys[i] && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Applies one matcher to one value, returning why it failed rather than just that it did. */
export function applyMatcher(matcher: ParamMatcher, value: unknown): { passed: boolean; detail?: string } {
    switch (matcher.kind) {
        case 'absent':
            return value === undefined || value === null
                ? { passed: true }
                : { passed: false, detail: `expected absent, got ${describe(value)}` };
        case 'exact':
            return deepEqual(value, matcher.value)
                ? { passed: true }
                : { passed: false, detail: `expected ${describe(matcher.value)}, got ${describe(value)}` };
        case 'nonEmpty': {
            // Generic non-emptiness (payload paths hold arrays and objects, not only strings).
            const ok = typeof value === 'string' ? value.trim().length > 0
                : Array.isArray(value) ? value.length > 0
                : value !== null && typeof value === 'object' ? Object.keys(value).length > 0
                : value !== null && value !== undefined;
            return ok ? { passed: true } : { passed: false, detail: `expected a non-empty value, got ${describe(value)}` };
        }
        case 'nonEmptyString':
            return typeof value === 'string' && value.trim().length > 0
                ? { passed: true }
                : { passed: false, detail: `expected a non-empty string, got ${describe(value)}` };
        case 'containsIgnoreCase':
            return typeof value === 'string' && value.toLowerCase().includes(matcher.value.toLowerCase())
                ? { passed: true }
                : { passed: false, detail: `expected text containing "${matcher.value}", got ${describe(value)}` };
        case 'oneOf':
            return matcher.values.some((candidate) => deepEqual(candidate, value))
                ? { passed: true }
                : { passed: false, detail: `expected one of ${describe(matcher.values)}, got ${describe(value)}` };
        case 'regex': {
            // A bad pattern in a test record is a authoring bug, and reporting it as a failed
            // match would hide it. Surface it as its own message instead.
            let expression: RegExp;
            try {
                expression = new RegExp(matcher.pattern, matcher.flags);
            } catch (error) {
                return { passed: false, detail: `invalid regex in expectation: ${(error as Error).message}` };
            }
            return typeof value === 'string' && expression.test(value)
                ? { passed: true }
                : { passed: false, detail: `expected /${matcher.pattern}/${matcher.flags ?? ''}, got ${describe(value)}` };
        }
        case 'numberRange': {
            if (typeof value !== 'number' || Number.isNaN(value)) {
                return { passed: false, detail: `expected a number, got ${describe(value)}` };
            }
            const belowMin = matcher.min !== undefined && value < matcher.min;
            const aboveMax = matcher.max !== undefined && value > matcher.max;
            return belowMin || aboveMax
                ? { passed: false, detail: `expected ${matcher.min ?? '-∞'}..${matcher.max ?? '∞'}, got ${value}` }
                : { passed: true };
        }
        case 'typeOf': {
            const actual = Array.isArray(value) ? 'array' : typeof value;
            return actual === matcher.type
                ? { passed: true }
                : { passed: false, detail: `expected type ${matcher.type}, got ${actual}` };
        }
        default:
            // Exhaustive today; a `default` keeps the function total if a variant is added.
            return { passed: false, detail: 'unknown matcher kind' };
    }
}

/** Runs every expectation against one params object. */
export function matchParams(expectations: ParamExpectation[], params: Record<string, unknown>): ParamMatchResult[] {
    return expectations.map((expectation) => {
        const value = params[expectation.param];
        if (expectation.optional && (value === undefined || value === null)) {
            return { param: expectation.param, matcherKind: expectation.matcher.kind, passed: true };
        }
        const { passed, detail } = applyMatcher(expectation.matcher, value);
        return { param: expectation.param, matcherKind: expectation.matcher.kind, passed, detail };
    });
}
