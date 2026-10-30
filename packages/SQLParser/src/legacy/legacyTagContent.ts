/**
 * Reads the content of one MJ template tag into the legacy token shapes (`MJToken`), exactly as
 * the original MJ lexer read it: the variable and filter chain of a `{{ }}` hole, the path and
 * arguments of a `{{query:"…"}}` composition, and the kind of a `{% %}` block tag. Tags are found
 * by the caller; this module only reads their content, in time linear in the tag.
 */
import type {
    MJBlockTagContent,
    MJCommentContent,
    MJCompositionParam,
    MJCompositionRefContent,
    MJFilter,
    MJSetContent,
    MJTemplateExprContent,
    MJToken,
    MJTokenType,
} from '../mj-ast-types.js';

/** Reads a `{# … #}` comment tag. */
export function ParseLegacyCommentTag(content: string, raw: string, start: number, end: number): MJToken {
    const parsed: MJCommentContent = { kind: 'comment', text: content.trim() };
    return { type: 'MJ_COMMENT', start, end, raw, parsed };
}

/**
 * Parses the content of a {{ ... }} token.
 * Determines if it's a composition reference or a template expression.
 */
export function ParseLegacyExpressionTag(content: string, raw: string, start: number, end: number): MJToken {
    const trimmed = content.trim();

    // Check for composition reference: query:"..."
    if (/^query\s*:\s*"/.test(trimmed)) {
        return parseCompositionRef(trimmed, raw, start, end);
    }

    // Regular template expression
    return parseTemplateExpr(trimmed, raw, start, end);
}

/**
 * Parses a template expression like: Region | sqlString | default('US')
 */
function parseTemplateExpr(content: string, raw: string, start: number, end: number): MJToken {
    const { variable, filters } = ParseLegacyFilterChain(content);

    const parsed: MJTemplateExprContent = {
        kind: 'template_expr',
        variable,
        filters,
    };

    return {
        type: 'MJ_TEMPLATE_EXPR',
        start,
        end,
        raw,
        parsed,
    };
}

/**
 * Parses a filter chain like: "varName | filter1 | filter2('arg')"
 * into a variable name and filter array.
 */
export function ParseLegacyFilterChain(content: string): { variable: string; filters: MJFilter[] } {
    const parts = splitPipes(content);
    const variable = parts[0].trim();
    const filters: MJFilter[] = [];

    for (let i = 1; i < parts.length; i++) {
        const filterStr = parts[i].trim();
        const filter = parseSingleFilter(filterStr);
        if (filter) filters.push(filter);
    }

    return { variable, filters };
}


/**
 * Splits on pipe characters, respecting quoted strings and parentheses.
 */
function splitPipes(content: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];

        if (ch === "'" && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
        } else if (ch === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
        } else if (ch === '(' && !inSingleQuote && !inDoubleQuote) {
            parenDepth++;
        } else if (ch === ')' && !inSingleQuote && !inDoubleQuote) {
            parenDepth--;
        }

        if (ch === '|' && parenDepth === 0 && !inSingleQuote && !inDoubleQuote) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    parts.push(current);
    return parts;
}

/**
 * Parses a single filter like "sqlString", "default('N/A')", or "sqlNumber".
 */
function parseSingleFilter(filterStr: string): MJFilter | null {
    if (!filterStr) return null;

    const parenIdx = filterStr.indexOf('(');
    if (parenIdx < 0) {
        return { name: filterStr, args: [] };
    }

    const name = filterStr.substring(0, parenIdx).trim();
    const argsStr = filterStr.substring(parenIdx + 1, filterStr.lastIndexOf(')'));
    const args = parseFilterArgs(argsStr);
    return { name, args };
}

/**
 * Parses filter arguments, handling quoted strings and numeric literals.
 */
function parseFilterArgs(argsStr: string): (string | number)[] {
    if (!argsStr.trim()) return [];

    const args: (string | number)[] = [];
    const rawArgs = argsStr.split(',').map(a => a.trim());

    for (const arg of rawArgs) {
        if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
            args.push(arg.slice(1, -1));
        } else {
            const num = Number(arg);
            args.push(isNaN(num) ? arg : num);
        }
    }

    return args;
}

// ─────────────────────────────────────────────────────
// Composition Reference Parsing
// ─────────────────────────────────────────────────────

/**
 * Parses a composition reference like: query:"Path/Name(p1='v1', p2=var)"
 */
function parseCompositionRef(content: string, raw: string, start: number, end: number): MJToken {
    // Extract the quoted path
    const quoteStart = content.indexOf('"');
    const quoteEnd = content.lastIndexOf('"');
    const fullPath = content.substring(quoteStart + 1, quoteEnd);

    // Split path from parameters — only treat (...) at the END of the path as parameters.
    // This avoids misinterpreting parentheses in query names like "Year-End (2024) Summary".
    // We find the LAST '(' and check if the path ends with ')'.
    let pathPart = fullPath;
    let paramsPart = '';
    if (fullPath.endsWith(')')) {
        const lastOpenParen = fullPath.lastIndexOf('(');
        if (lastOpenParen >= 0) {
            const candidateParams = fullPath.substring(lastOpenParen + 1, fullPath.length - 1);
            // Only treat as parameters if content looks like key=value assignments
            if (/\w+\s*=/.test(candidateParams)) {
                pathPart = fullPath.substring(0, lastOpenParen);
                paramsPart = candidateParams;
            }
        }
    }

    // Extract category path and query name
    const segments = pathPart.split('/');
    const queryName = segments[segments.length - 1].trim();
    const categoryPath = segments.slice(0, -1).join('/');

    // Parse parameters
    const parameters = parseCompositionParams(paramsPart);

    const parsed: MJCompositionRefContent = {
        kind: 'composition_ref',
        categoryPath,
        queryName,
        parameters,
    };

    return {
        type: 'MJ_COMPOSITION_REF',
        start,
        end,
        raw,
        parsed,
    };
}

/**
 * Parses composition parameters like: p1='literal', p2=variable, p3={{nunjucks}}
 */
function parseCompositionParams(paramsStr: string): MJCompositionParam[] {
    if (!paramsStr.trim()) return [];

    const params: MJCompositionParam[] = [];
    // Split on commas, but respect nested {{ }} and quotes
    const parts = splitCompositionArgs(paramsStr);

    for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx < 0) continue;

        const key = part.substring(0, eqIdx).trim();
        const value = part.substring(eqIdx + 1).trim();

        // Determine if it's a literal (quoted) or pass-through (variable)
        const isLiteral = (value.startsWith("'") && value.endsWith("'")) ||
                          (value.startsWith('"') && value.endsWith('"'));
        // Inside a quoted value, a doubled quote stands for one, as in SQL
        const cleanValue = isLiteral ? value.slice(1, -1).split(value[0] + value[0]).join(value[0]) : value;

        params.push({
            key,
            value: cleanValue,
            isPassThrough: !isLiteral,
        });
    }

    return params;
}

/**
 * Splits composition argument string on commas, respecting nested {{ }} and quotes.
 */
function splitCompositionArgs(argsStr: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsStr.length; i++) {
        const ch = argsStr[i];

        if (!inQuote && (ch === "'" || ch === '"')) {
            inQuote = true;
            quoteChar = ch;
        } else if (inQuote && ch === quoteChar) {
            inQuote = false;
        } else if (!inQuote && ch === '{') {
            depth++;
        } else if (!inQuote && ch === '}') {
            depth--;
        }

        if (ch === ',' && depth === 0 && !inQuote) {
            parts.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    if (current.trim()) parts.push(current);
    return parts;
}

// ─────────────────────────────────────────────────────
// Block Tag Parsing ({% ... %})
// ─────────────────────────────────────────────────────

/** The block tags that carry a condition or nothing, by the token type they produce. */
const SIMPLE_BLOCK_TAGS: ReadonlyArray<readonly [RegExp, MJTokenType, boolean]> = [
    [/^if\s+/i, 'MJ_IF_OPEN', true],
    [/^elif\s+/i, 'MJ_ELIF', true],
    [/^else\s*$/i, 'MJ_ELSE', false],
    [/^endif\s*$/i, 'MJ_ENDIF', false],
    [/^endfor\s*$/i, 'MJ_ENDFOR', false],
];

/**
 * Parses a block tag and returns the appropriate token type: if / elif (with the condition text),
 * else, endif, for (with the loop variable and iterable), endfor and set. Any other tag is read
 * as an `MJ_IF_OPEN` whose condition is the whole tag, as the original lexer read it.
 */
export function ParseLegacyBlockTag(content: string, raw: string, start: number, end: number): MJToken {
    const trimmed = content.trim();
    for (const [pattern, type, hasCondition] of SIMPLE_BLOCK_TAGS) {
        if (pattern.test(trimmed)) return makeBlockToken(type, raw, start, end, hasCondition ? trimmed.replace(pattern, '').trim() : null);
    }
    if (/^for\s+/i.test(trimmed)) return forTag(trimmed, raw, start, end);
    const setMatch = /^set\s+/i.test(trimmed) ? trimmed.match(/^set\s+(\w+)\s*=\s*(.+)$/i) : null;
    if (setMatch) {
        const parsed: MJSetContent = { kind: 'set', variable: setMatch[1], expression: setMatch[2].trim() };
        return { type: 'MJ_SET', start, end, raw, parsed };
    }
    return makeBlockToken('MJ_IF_OPEN', raw, start, end, trimmed);
}

/** `{% for variable in iterable %}`; a for tag of another shape keeps its text as the expression. */
function forTag(trimmed: string, raw: string, start: number, end: number): MJToken {
    const forMatch = trimmed.match(/^for\s+(\w+)\s+in\s+(.+)$/i);
    if (!forMatch) return makeBlockToken('MJ_FOR_OPEN', raw, start, end, trimmed.replace(/^for\s+/i, ''));
    const parsed: MJBlockTagContent = {
        kind: 'block_tag', expression: forMatch[2].trim(), loopVariable: forMatch[1], loopIterable: forMatch[2].trim(),
    };
    return { type: 'MJ_FOR_OPEN', start, end, raw, parsed };
}

/**
 * Creates a block tag token with standard MJBlockTagContent.
 */
function makeBlockToken(
    type: MJTokenType,
    raw: string,
    start: number,
    end: number,
    expression: string | null
): MJToken {
    const parsed: MJBlockTagContent = {
        kind: 'block_tag',
        expression,
    };
    return { type, start, end, raw, parsed };
}
