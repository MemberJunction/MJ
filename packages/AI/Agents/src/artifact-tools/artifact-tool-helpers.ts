/**
 * @fileoverview Shared internal helpers for artifact tool libraries (safe regex
 * compilation, base64/Buffer decoding, and stack-safe numeric reductions).
 */
import { CompileSafeUserRegex } from '@memberjunction/core-entities';

const DATA_URL_BASE64_PREFIX = /^data:[^;,]*;base64,/i;
const VALID_REGEX_FLAGS = /^[dgimsuvy]*$/;

/**
 * Normalizes binary artifact content into a `Buffer`.
 * Supports raw `Buffer`, `data:<mime>;base64,<payload>` URLs, and raw base64 strings.
 */
export function DecodeBinaryArtifactContent(content: string | Buffer): Buffer {
    if (Buffer.isBuffer(content)) {
        return content;
    }
    const stripped = DATA_URL_BASE64_PREFIX.test(content)
        ? content.replace(DATA_URL_BASE64_PREFIX, '')
        : content;
    return Buffer.from(stripped, 'base64');
}

export interface CompiledToolRegexResult {
    Regex: RegExp | null;
    ErrorMessage?: string;
}

/**
 * Validates user-supplied regex pattern and flags, strips stateful `g`/`y`
 * flags so repeated `.test()` calls never drift via `lastIndex`, and compiles
 * through `CompileSafeUserRegex` to reject catastrophic backtracking (ReDoS).
 */
export function CompileSafeToolRegex(pattern: string, rawFlags?: string): CompiledToolRegexResult {
    const flags = rawFlags ?? '';
    if (!VALID_REGEX_FLAGS.test(flags)) {
        return { Regex: null, ErrorMessage: `Invalid regex flags: "${flags}".` };
    }

    const statelessFlags = Array.from(new Set(flags.split('').filter((ch) => ch !== 'g' && ch !== 'y'))).join('');

    // Verify syntax first so invalid patterns get a clear syntax error distinct from ReDoS rejection.
    try {
        new RegExp(pattern, statelessFlags);
    } catch (err) {
        return {
            Regex: null,
            ErrorMessage: `Invalid regex pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`
        };
    }

    const compiled = CompileSafeUserRegex(pattern, statelessFlags);
    if (!compiled) {
        return {
            Regex: null,
            ErrorMessage: `Unsafe regex pattern "${pattern}" rejected: nested quantifiers or backtracking-prone constructs are disallowed.`
        };
    }

    return { Regex: compiled };
}

/**
 * Stack-safe extremum over large arrays (>100k elements where `Math.min(...arr)`
 * would throw `RangeError: Maximum call stack size exceeded`).
 */
export function ComputeNumericExtremum(values: readonly number[], mode: 'min' | 'max'): number {
    if (values.length === 0) {
        return 0;
    }
    let best = values[0];
    if (mode === 'min') {
        for (let i = 1; i < values.length; i++) {
            if (values[i] < best) best = values[i];
        }
    } else {
        for (let i = 1; i < values.length; i++) {
            if (values[i] > best) best = values[i];
        }
    }
    return best;
}
