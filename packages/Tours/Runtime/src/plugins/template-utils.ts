/**
 * @fileoverview Linear-time O(n) `{{...}}` template scanner and interpolator.
 * Avoids regular expressions with overlapping whitespace/negated-class quantifiers
 * so pathological inputs cannot trigger polynomial ReDoS.
 * @module @memberjunction/tours-runtime
 */

/**
 * Scans `input` in linear O(n) time for `{{token}}` placeholders and replaces each
 * with `resolveToken(trimmedInner)`. Unclosed `{{` sequences are left verbatim,
 * and nested `{{` before a closing `}}` advances to the innermost `{{`.
 */
export function InterpolateDoubleBraceString(
    input: string,
    resolveToken: (trimmedInner: string) => string,
): string {
    if (!input || !input.includes('{{')) {
        return input;
    }

    let out = '';
    let cursor = 0;

    while (cursor < input.length) {
        const openIdx = input.indexOf('{{', cursor);
        if (openIdx === -1) {
            out += input.slice(cursor);
            break;
        }

        const closeIdx = input.indexOf('}}', openIdx + 2);
        if (closeIdx === -1) {
            out += input.slice(cursor);
            break;
        }

        const nextOpenIdx = input.indexOf('{{', openIdx + 2);
        if (nextOpenIdx !== -1 && nextOpenIdx < closeIdx) {
            out += input.slice(cursor, nextOpenIdx);
            cursor = nextOpenIdx;
            continue;
        }

        out += input.slice(cursor, openIdx);
        const trimmedInner = input.slice(openIdx + 2, closeIdx).trim();
        out += trimmedInner.length > 0 ? resolveToken(trimmedInner) : input.slice(openIdx, closeIdx + 2);
        cursor = closeIdx + 2;
    }

    return out;
}

/**
 * Extracts all non-empty trimmed `{{token}}` contents in linear O(n) time.
 */
export function ExtractDoubleBraceTokens(input: string): string[] {
    if (!input || !input.includes('{{')) {
        return [];
    }

    const tokens: string[] = [];
    let cursor = 0;

    while (cursor < input.length) {
        const openIdx = input.indexOf('{{', cursor);
        if (openIdx === -1) {
            break;
        }

        const closeIdx = input.indexOf('}}', openIdx + 2);
        if (closeIdx === -1) {
            break;
        }

        const nextOpenIdx = input.indexOf('{{', openIdx + 2);
        if (nextOpenIdx !== -1 && nextOpenIdx < closeIdx) {
            cursor = nextOpenIdx;
            continue;
        }

        const trimmedInner = input.slice(openIdx + 2, closeIdx).trim();
        if (trimmedInner.length > 0) {
            tokens.push(trimmedInner);
        }
        cursor = closeIdx + 2;
    }

    return tokens;
}

/** Strips a leading `Context.` prefix (case-insensitive) without regexes. */
export function StripContextPrefix(token: string): string {
    const PREFIX = 'context.';
    if (token.length >= PREFIX.length && token.slice(0, PREFIX.length).toLowerCase() === PREFIX) {
        return token.slice(PREFIX.length);
    }
    return token;
}
