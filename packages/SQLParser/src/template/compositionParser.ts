import { MakeDiagnostic } from '../common/analysis.js';
import type { Diagnostic, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';
import { TemplateExpressionParser } from './expressionParser.js';
import type { ParsedArgument } from './expressionParser.js';
import { WalkExpression } from './expressionTypes.js';
import type { TemplateExpression } from './expressionTypes.js';
import type { CompositionArgument, CompositionNode } from './templateNodes.js';

/** A composition node, or why the token is not one. */
export interface ParsedComposition {
    readonly Node: CompositionNode | null;
    readonly Diagnostics: readonly Diagnostic[];
}

const COMPOSITION_PREFIX = /^\s*query\s*:/;
const ARGUMENTS_LOOK = /^\s*[A-Za-z_]\w*\s*=/;
const MALFORMED_HINT = 'Write {{query:"Category/Path/Name(Arg=Value, …)"}}, with the path in double quotes.';

/** Whether a `{{ }}` body is a composition token (`query:"…"`). */
export function IsCompositionBody(body: string): boolean {
    return COMPOSITION_PREFIX.test(body);
}

/**
 * Parses a composition token, `{{query:"Category/Path/Name(Arg=Value, …)"}}`. The path is the
 * text in double quotes. A trailing parenthesised list is the argument list when it is empty or
 * starts with `Name=`; otherwise the parentheses are part of the query name, so a name like
 * `Year-End (2024) Summary` still reads. Argument values use the MJ Query expression grammar.
 */
export function ParseComposition(token: SqlToken, source: string): ParsedComposition {
    const tag = token.Template;
    if (tag === null) return malformed(token.Span, 'This token is not a template tag.');
    const prefix = COMPOSITION_PREFIX.exec(tag.Body);
    const open = prefix ? tag.Body.indexOf('"', prefix[0].length) : -1;
    if (prefix === null || open < 0 || tag.Body.substring(prefix[0].length, open).trim() !== '') {
        return malformed(token.Span, 'A composition token must give the query path in double quotes.');
    }
    const close = tag.Body.indexOf('"', open + 1);
    if (close < 0 || tag.Body.substring(close + 1).trim() !== '') {
        return malformed(token.Span, 'The query path needs a closing double quote, and nothing may follow it.');
    }
    const contentStart = tag.BodySpan.Start + open + 1;
    return parsePathAndArguments(token, source, contentStart, tag.BodySpan.Start + close);
}

function parsePathAndArguments(token: SqlToken, source: string, start: number, end: number): ParsedComposition {
    const argumentsOpen = findArgumentListOpen(source, start, end);
    const pathEnd = argumentsOpen ?? end;
    const segments = source.substring(start, pathEnd).split('/').map(s => s.trim());
    if (segments.some(s => s.length === 0)) {
        return malformed(token.Span, 'The query path has an empty segment.');
    }
    const parsed = argumentsOpen === null
        ? { Arguments: [], Diagnostics: [] }
        : TemplateExpressionParser.ParseArguments(source, argumentsOpen + 1, lastCloseParen(source, start, end));
    const diagnostics = parsed.Diagnostics.map(d => (d.Code === MJQueryDiagnosticCodes.Syntax
        ? MakeDiagnostic(MJQueryDiagnosticCodes.CompositionMalformed, 'Error', d.Span, d.Message, MALFORMED_HINT)
        : d));
    const node: CompositionNode = {
        Kind: 'Composition', Span: token.Span, Token: token,
        FullPath: segments.join('/'), CategoryPath: segments.slice(0, -1).join('/'), Name: segments[segments.length - 1],
        PathSpan: trimmedSpan(source, start, pathEnd),
        Arguments: parsed.Arguments.map(toArgument),
        SqlContext: token.Template?.SqlContext ?? 'Code',
    };
    return { Node: node, Diagnostics: diagnostics };
}

/**
 * The offset of the `(` that opens the argument list, or `null` when the path has none. The
 * list is the parenthesised group that ends the path, read outside single-quoted strings.
 */
function findArgumentListOpen(source: string, start: number, end: number): number | null {
    const closeAt = lastCloseParen(source, start, end);
    if (closeAt < 0) return null;
    const opens: number[] = [];
    let groupOpen: number | null = null;
    for (let i = start; i <= closeAt; i++) {
        const c = source[i];
        if (c === "'") i = skipQuoted(source, i, closeAt);
        else if (c === '(') opens.push(i);
        else if (c === ')') groupOpen = opens.pop() ?? null;
    }
    if (groupOpen === null) return null;
    const inner = source.substring(groupOpen + 1, closeAt);
    return inner.trim() === '' || ARGUMENTS_LOOK.test(inner) ? groupOpen : null;
}

/** The offset of the final `)` when the path's last non-space character is one; -1 otherwise. */
function lastCloseParen(source: string, start: number, end: number): number {
    let i = end - 1;
    while (i >= start && /\s/.test(source[i])) i--;
    return i >= start && source[i] === ')' ? i : -1;
}

/** The offset of the closing quote of a single-quoted string opening at `i`, with backslash escapes. */
function skipQuoted(source: string, i: number, limit: number): number {
    let j = i + 1;
    while (j < limit && source[j] !== "'") j += source[j] === '\\' ? 2 : 1;
    return j;
}

function trimmedSpan(source: string, start: number, end: number): Span {
    let s = start;
    let e = end;
    while (s < e && /\s/.test(source[s])) s++;
    while (e > s && /\s/.test(source[e - 1])) e--;
    return { Start: s, End: e };
}

function toArgument(argument: ParsedArgument): CompositionArgument {
    const names = referencedNames(argument.Expression);
    return {
        Name: argument.Name, NameSpan: argument.NameSpan, Expression: argument.Expression, Span: argument.Span,
        IsStatic: names.length === 0 && !readsAnyValue(argument.Expression), ReferencedNames: names,
    };
}

/** The parameter names an expression reads, in order of first use. */
function referencedNames(expression: TemplateExpression): string[] {
    const names: string[] = [];
    WalkExpression(expression, node => {
        if (node.Kind === 'Name' && !names.includes(node.Name)) names.push(node.Name);
    });
    return names;
}

/** Whether an expression reads a `Context` token or loop value. */
function readsAnyValue(expression: TemplateExpression): boolean {
    let reads = false;
    WalkExpression(expression, node => {
        if (node.Kind === 'Context' || node.Kind === 'LoopMember') reads = true;
    });
    return reads;
}

function malformed(span: Span, message: string): ParsedComposition {
    return { Node: null, Diagnostics: [MakeDiagnostic(MJQueryDiagnosticCodes.CompositionMalformed, 'Error', span, message, MALFORMED_HINT)] };
}
