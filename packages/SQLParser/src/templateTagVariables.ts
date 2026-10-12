import type { MJTokenType } from './mj-ast-types.js';

/** Block tags whose text can read a template variable. */
export const VARIABLE_READING_TAGS: ReadonlySet<MJTokenType> = new Set<MJTokenType>(['MJ_IF_OPEN', 'MJ_ELIF', 'MJ_FOR_OPEN', 'MJ_SET']);

/**
 * Replaces every read of a variable in one `{% … %}` block tag.
 *
 * Only reads are replaced: the variable a `{% set %}` assigns and the loop variables a
 * `{% for %}` declares are left alone, as are attribute names (`obj.name`), function names
 * (`name(…)`) and anything inside a string literal. Names compare case-insensitively, matching
 * how `{{ }}` expressions are matched.
 *
 * @param raw - The tag's full text, from `{%` to `%}`.
 * @param name - The variable to replace.
 * @param replacement - Template text to put in its place: another variable name or a literal.
 */
export function ReplaceVariableInTag(raw: string, name: string, replacement: string): string {
    const target = name.toLowerCase();
    let result = '';
    let i = readsStart(raw);
    result += raw.substring(0, i);
    while (i < raw.length) {
        const c = raw[i];
        if (c === "'" || c === '"') {
            const end = stringEnd(raw, i);
            result += raw.substring(i, end);
            i = end;
        } else if (isIdentifierStart(c) && !isIdentifierChar(raw[i - 1])) {
            const end = identifierEnd(raw, i);
            const word = raw.substring(i, end);
            const isRead = word.toLowerCase() === target && previousSignificant(raw, i) !== '.' && nextSignificant(raw, end) !== '(';
            result += isRead ? replacement : word;
            i = end;
        } else {
            result += c;
            i++;
        }
    }
    return result;
}

/** Offset in the tag where variable reads can begin: after the tag keyword and any names it declares. */
function readsStart(raw: string): number {
    const keyword = /^\{%-?\s*(\w+)\s*/.exec(raw);
    if (!keyword) return 0;
    const afterKeyword = keyword[0].length;
    const lower = keyword[1].toLowerCase();
    if (lower === 'set') {
        const assign = raw.indexOf('=', afterKeyword);
        return assign === -1 ? raw.length : assign + 1;
    }
    if (lower === 'for') {
        const inKeyword = /\sin\s/i.exec(raw.substring(afterKeyword));
        return inKeyword ? afterKeyword + inKeyword.index + inKeyword[0].length : raw.length;
    }
    return afterKeyword;
}

/** Offset just past a single- or double-quoted template string starting at `start`. */
function stringEnd(raw: string, start: number): number {
    const quote = raw[start];
    let i = start + 1;
    while (i < raw.length && raw[i] !== quote) {
        i += raw[i] === '\\' ? 2 : 1;
    }
    return Math.min(i + 1, raw.length);
}

function identifierEnd(raw: string, start: number): number {
    let i = start;
    while (i < raw.length && isIdentifierChar(raw[i])) i++;
    return i;
}

function isIdentifierStart(c: string | undefined): boolean {
    return c !== undefined && /[A-Za-z_]/.test(c);
}

function isIdentifierChar(c: string | undefined): boolean {
    return c !== undefined && /\w/.test(c);
}

function previousSignificant(raw: string, before: number): string | undefined {
    let i = before - 1;
    while (i >= 0 && /\s/.test(raw[i])) i--;
    return raw[i];
}

function nextSignificant(raw: string, from: number): string | undefined {
    let i = from;
    while (i < raw.length && /\s/.test(raw[i])) i++;
    return raw[i];
}
