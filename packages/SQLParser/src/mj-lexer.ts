/**
 * MJ Lexer — Tokenizes MJ SQL extensions (Nunjucks templates, composition tokens)
 *
 * Scans SQL character-by-character, extracting MJ tokens while preserving
 * position information for later placeholder substitution and reconstruction.
 *
 * The three MJ syntax layers have unambiguous delimiters:
 * - {{ ... }}  — Template expressions and composition references
 * - {% ... %}  — Block tags (if/elif/else/endif/for/endfor/set)
 * - {# ... #}  — Template comments
 *
 * None of these sequences appear in valid SQL, so the lexer can reliably
 * distinguish MJ tokens from SQL text without context-sensitive parsing.
 */

import {
    MJToken,
    MJTokenType,
    MJFilter,
    MJCompositionParam,
    MJTemplateExprContent,
    MJCompositionRefContent,
    MJBlockTagContent,
    MJCommentContent,
    MJSetContent,
    MJSQLTextContent,
    MJParseResult,
} from './mj-ast-types.js';

/**
 * Tokenizes MJ SQL into an ordered list of MJ tokens and SQL text segments.
 */
export class MJLexer {
    /**
     * Tokenize a SQL string containing MJ extensions.
     * Returns tokens in source order, with SQL_TEXT tokens for non-MJ segments.
     */
    public static Tokenize(sql: string): MJToken[] {
        if (!sql || sql.length === 0) return [];

        const tokens: MJToken[] = [];
        let pos = 0;
        let sqlStart = 0;

        while (pos < sql.length) {
            // Check for MJ token starts
            if (pos + 1 < sql.length && sql[pos] === '{') {
                const nextChar = sql[pos + 1];

                if (nextChar === '{') {
                    // {{ ... }} — template expression or composition reference
                    const token = MJLexer.readDoubleDelimited(sql, pos, '{{', '}}');
                    if (token) {
                        MJLexer.flushSQLText(sql, sqlStart, pos, tokens);
                        const parsed = MJLexer.parseExpressionToken(token.content, token.raw, token.start, token.end);
                        tokens.push(parsed);
                        pos = token.end;
                        sqlStart = pos;
                        continue;
                    }
                } else if (nextChar === '%') {
                    // {% ... %} — block tag
                    const token = MJLexer.readDoubleDelimited(sql, pos, '{%', '%}');
                    if (token) {
                        MJLexer.flushSQLText(sql, sqlStart, pos, tokens);
                        const parsed = MJLexer.parseBlockTag(token.content, token.raw, token.start, token.end);
                        tokens.push(parsed);
                        pos = token.end;
                        sqlStart = pos;
                        continue;
                    }
                } else if (nextChar === '#') {
                    // {# ... #} — comment
                    const token = MJLexer.readDoubleDelimited(sql, pos, '{#', '#}');
                    if (token) {
                        MJLexer.flushSQLText(sql, sqlStart, pos, tokens);
                        const commentContent = token.content.trim();
                        const commentParsed: MJCommentContent = { kind: 'comment', text: commentContent };
                        tokens.push({
                            type: 'MJ_COMMENT',
                            start: token.start,
                            end: token.end,
                            raw: token.raw,
                            parsed: commentParsed,
                        });
                        pos = token.end;
                        sqlStart = pos;
                        continue;
                    }
                }
            }

            pos++;
        }

        // Flush remaining SQL text
        MJLexer.flushSQLText(sql, sqlStart, pos, tokens);
        return tokens;
    }

    /**
     * Convenience method that tokenizes and returns a summary result.
     */
    public static Parse(sql: string): MJParseResult {
        const tokens = MJLexer.Tokenize(sql);
        return {
            tokens,
            hasMJExtensions: tokens.some(t => t.type !== 'SQL_TEXT'),
            hasTemplateExpressions: tokens.some(t => t.type === 'MJ_TEMPLATE_EXPR'),
            hasCompositionRefs: tokens.some(t => t.type === 'MJ_COMPOSITION_REF'),
            hasConditionalBlocks: tokens.some(t =>
                t.type === 'MJ_IF_OPEN' || t.type === 'MJ_ELIF' ||
                t.type === 'MJ_ELSE' || t.type === 'MJ_ENDIF'
            ),
            hasLoopBlocks: tokens.some(t => t.type === 'MJ_FOR_OPEN' || t.type === 'MJ_ENDFOR'),
        };
    }

    // ─────────────────────────────────────────────────────
    // Token Reading
    // ─────────────────────────────────────────────────────

    /**
     * Reads a double-delimited token (e.g., {{ ... }}, {% ... %}, {# ... #}).
     * Returns null if the closing delimiter is not found.
     */
    private static readDoubleDelimited(
        sql: string,
        start: number,
        openDelim: string,
        closeDelim: string
    ): { content: string; raw: string; start: number; end: number } | null {
        const closeIdx = sql.indexOf(closeDelim, start + openDelim.length);
        if (closeIdx < 0) return null;

        const end = closeIdx + closeDelim.length;
        const raw = sql.substring(start, end);
        const content = sql.substring(start + openDelim.length, closeIdx);
        return { content, raw, start, end };
    }

    /**
     * Flushes accumulated SQL text as a SQL_TEXT token.
     */
    private static flushSQLText(sql: string, start: number, end: number, tokens: MJToken[]): void {
        if (start >= end) return;
        const text = sql.substring(start, end);
        // Skip purely whitespace segments that appear between MJ tokens
        if (text.length === 0) return;

        const parsed: MJSQLTextContent = { kind: 'sql_text', text };
        tokens.push({
            type: 'SQL_TEXT',
            start,
            end,
            raw: text,
            parsed,
        });
    }

    // ─────────────────────────────────────────────────────
    // Expression Parsing ({{ ... }})
    // ─────────────────────────────────────────────────────

    /**
     * Parses the content of a {{ ... }} token.
     * Determines if it's a composition reference or a template expression.
     */
    private static parseExpressionToken(content: string, raw: string, start: number, end: number): MJToken {
        const trimmed = content.trim();

        // Check for composition reference: query:"..."
        if (/^query\s*:\s*"/.test(trimmed)) {
            return MJLexer.parseCompositionRef(trimmed, raw, start, end);
        }

        // Regular template expression
        return MJLexer.parseTemplateExpr(trimmed, raw, start, end);
    }

    /**
     * Parses a template expression like: Region | sqlString | default('US')
     */
    private static parseTemplateExpr(content: string, raw: string, start: number, end: number): MJToken {
        const { variable, filters } = MJLexer.parseFilterChain(content);

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
    static parseFilterChain(content: string): { variable: string; filters: MJFilter[] } {
        const parts = MJLexer.splitPipes(content);
        const variable = parts[0].trim();
        const filters: MJFilter[] = [];

        for (let i = 1; i < parts.length; i++) {
            const filterStr = parts[i].trim();
            const filter = MJLexer.parseSingleFilter(filterStr);
            if (filter) filters.push(filter);
        }

        return { variable, filters };
    }

    /**
     * Splits on pipe characters, respecting quoted strings and parentheses.
     */
    private static splitPipes(content: string): string[] {
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
    private static parseSingleFilter(filterStr: string): MJFilter | null {
        if (!filterStr) return null;

        const parenIdx = filterStr.indexOf('(');
        if (parenIdx < 0) {
            return { name: filterStr, args: [] };
        }

        const name = filterStr.substring(0, parenIdx).trim();
        const argsStr = filterStr.substring(parenIdx + 1, filterStr.lastIndexOf(')'));
        const args = MJLexer.parseFilterArgs(argsStr);
        return { name, args };
    }

    /**
     * Parses filter arguments, handling quoted strings and numeric literals.
     */
    private static parseFilterArgs(argsStr: string): (string | number)[] {
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
    private static parseCompositionRef(content: string, raw: string, start: number, end: number): MJToken {
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
        const parameters = MJLexer.parseCompositionParams(paramsPart);

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
    private static parseCompositionParams(paramsStr: string): MJCompositionParam[] {
        if (!paramsStr.trim()) return [];

        const params: MJCompositionParam[] = [];
        // Split on commas, but respect nested {{ }} and quotes
        const parts = MJLexer.splitCompositionArgs(paramsStr);

        for (const part of parts) {
            const eqIdx = part.indexOf('=');
            if (eqIdx < 0) continue;

            const key = part.substring(0, eqIdx).trim();
            const value = part.substring(eqIdx + 1).trim();

            // Determine if it's a literal (quoted) or pass-through (variable)
            const isLiteral = (value.startsWith("'") && value.endsWith("'")) ||
                              (value.startsWith('"') && value.endsWith('"'));
            const cleanValue = isLiteral ? value.slice(1, -1) : value;

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
    private static splitCompositionArgs(argsStr: string): string[] {
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

    /**
     * Parses a block tag and returns the appropriate token type.
     */
    private static parseBlockTag(content: string, raw: string, start: number, end: number): MJToken {
        const trimmed = content.trim();

        // {% if condition %}
        if (/^if\s+/i.test(trimmed)) {
            const expression = trimmed.replace(/^if\s+/i, '').trim();
            return MJLexer.makeBlockToken('MJ_IF_OPEN', raw, start, end, expression);
        }

        // {% elif condition %}
        if (/^elif\s+/i.test(trimmed)) {
            const expression = trimmed.replace(/^elif\s+/i, '').trim();
            return MJLexer.makeBlockToken('MJ_ELIF', raw, start, end, expression);
        }

        // {% else %}
        if (/^else\s*$/i.test(trimmed)) {
            return MJLexer.makeBlockToken('MJ_ELSE', raw, start, end, null);
        }

        // {% endif %}
        if (/^endif\s*$/i.test(trimmed)) {
            return MJLexer.makeBlockToken('MJ_ENDIF', raw, start, end, null);
        }

        // {% for variable in iterable %}
        if (/^for\s+/i.test(trimmed)) {
            const forMatch = trimmed.match(/^for\s+(\w+)\s+in\s+(.+)$/i);
            if (forMatch) {
                const parsed: MJBlockTagContent = {
                    kind: 'block_tag',
                    expression: forMatch[2].trim(),
                    loopVariable: forMatch[1],
                    loopIterable: forMatch[2].trim(),
                };
                return { type: 'MJ_FOR_OPEN', start, end, raw, parsed };
            }
            return MJLexer.makeBlockToken('MJ_FOR_OPEN', raw, start, end, trimmed.replace(/^for\s+/i, ''));
        }

        // {% endfor %}
        if (/^endfor\s*$/i.test(trimmed)) {
            return MJLexer.makeBlockToken('MJ_ENDFOR', raw, start, end, null);
        }

        // {% set variable = expression %}
        if (/^set\s+/i.test(trimmed)) {
            const setMatch = trimmed.match(/^set\s+(\w+)\s*=\s*(.+)$/i);
            if (setMatch) {
                const parsed: MJSetContent = {
                    kind: 'set',
                    variable: setMatch[1],
                    expression: setMatch[2].trim(),
                };
                return { type: 'MJ_SET', start, end, raw, parsed };
            }
        }

        // Unknown block tag — treat as generic block
        return MJLexer.makeBlockToken('MJ_IF_OPEN', raw, start, end, trimmed);
    }

    /**
     * Creates a block tag token with standard MJBlockTagContent.
     */
    private static makeBlockToken(
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
}
