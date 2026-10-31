import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { ParserDialect } from '@memberjunction/sql-dialect';
import type {
    MJBlockTagContent, MJBranch, MJCompositionRef, MJCompositionRefContent, MJConditionalBlock, MJFilter, MJTemplateExpr,
    MJTemplateExprContent, MJToken,
} from '../mj-ast-types.js';
import type { MJParameterInfo } from '../sql-parser.js';
import { QueryTemplate } from '../template/queryTemplate.js';
import type { ParameterUse, TemplateParameter } from '../template/parameterAnalysis.js';
import { ReplaceVariableInTag, VARIABLE_READING_TAGS } from '../templateTagVariables.js';
import { ParseLegacyFilterChain } from './legacyTagContent.js';
import { CommentInertLegacyTokens, LinearLegacyTokenize } from './legacyTemplateTokens.js';

/** The SQL rules the dialect-less template helpers read comments and literals with. */
const TEMPLATE_HELPER_DIALECT: ParserDialect = new SQLServerDialect();

// ─── Expressions and compositions ──────────────────────────────────────────

/** Every `{{ variable | filters }}` hole outside SQL comments, in source order. */
export function LegacyTemplateExpressions(sql: string): MJTemplateExpr[] {
    const exprs: MJTemplateExpr[] = [];
    for (const token of CommentInertLegacyTokens(sql)) {
        if (token.type !== 'MJ_TEMPLATE_EXPR') continue;
        const parsed = token.parsed as MJTemplateExprContent;
        exprs.push({ type: 'mj_template_expr', variable: parsed.variable, filters: parsed.filters, raw: token.raw });
    }
    return exprs;
}

/** Every `{{query:"…"}}` composition outside SQL comments, in source order. */
export function LegacyCompositionRefs(sql: string): MJCompositionRef[] {
    const refs: MJCompositionRef[] = [];
    for (const token of CommentInertLegacyTokens(sql)) {
        if (token.type === 'MJ_COMPOSITION_REF') refs.push(compositionRef(token));
    }
    return refs;
}

function compositionRef(token: MJToken): MJCompositionRef {
    const parsed = token.parsed as MJCompositionRefContent;
    return {
        type: 'mj_composition_ref', categoryPath: parsed.categoryPath, queryName: parsed.queryName,
        parameters: parsed.parameters, raw: token.raw,
    };
}

// ─── Conditional blocks ─────────────────────────────────────────────────────

interface OpenBlock {
    branches: MJBranch[];
    raw: string;
}

/**
 * The `{% if %}` blocks outside SQL comments, each with its branches: the condition text (or
 * `null` for `{% else %}`), the body's exact source text and the holes and compositions in it.
 * A block nested in a branch is reported on its own, after the blocks it closes inside of.
 */
export function LegacyConditionalBlocks(sql: string): MJConditionalBlock[] {
    const blocks: MJConditionalBlock[] = [];
    const stack: OpenBlock[] = [];
    for (const token of CommentInertLegacyTokens(sql)) {
        const current = stack[stack.length - 1];
        switch (token.type) {
            case 'MJ_IF_OPEN':
                stack.push({ branches: [newBranch((token.parsed as MJBlockTagContent).expression)], raw: token.raw });
                break;
            case 'MJ_ELIF':
            case 'MJ_ELSE':
                if (current) {
                    current.raw += token.raw;
                    current.branches.push(newBranch(token.type === 'MJ_ELIF' ? (token.parsed as MJBlockTagContent).expression : null));
                }
                break;
            case 'MJ_ENDIF':
                closeBlock(stack.pop(), token, blocks);
                break;
            default:
                if (current) addToBranch(current, token);
        }
    }
    return blocks;
}

function newBranch(condition: string | null): MJBranch {
    return { condition, body: { raw: '', nodes: [] } };
}

function closeBlock(completed: OpenBlock | undefined, token: MJToken, blocks: MJConditionalBlock[]): void {
    if (!completed) return;
    completed.raw += token.raw;
    blocks.push({ type: 'mj_conditional', branches: completed.branches, raw: completed.raw });
}

function addToBranch(block: OpenBlock, token: MJToken): void {
    const branch = block.branches[block.branches.length - 1];
    branch.body.raw += token.raw;
    block.raw += token.raw;
    if (token.type === 'MJ_TEMPLATE_EXPR') {
        const parsed = token.parsed as MJTemplateExprContent;
        branch.body.nodes.push({ type: 'mj_template_expr', variable: parsed.variable, filters: parsed.filters, raw: token.raw });
    } else if (token.type === 'MJ_COMPOSITION_REF') {
        branch.body.nodes.push(compositionRef(token));
    }
}

// ─── Parameters ─────────────────────────────────────────────────────────────

/** How a parameter is first used, which orders the legacy list: holes first, then conditions, then loops. */
function useRank(parameter: TemplateParameter): number {
    if (parameter.Uses.some(u => u.Role === 'Expression')) return 0;
    if (parameter.Uses.some(u => u.Role === 'LoopIterable')) return 2;
    return 1;
}

function firstPosition(parameter: TemplateParameter, holesOnly: boolean): number {
    const uses = holesOnly ? parameter.Uses.filter(u => u.Role === 'Expression') : parameter.Uses;
    return uses[0]?.Span.Start ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The parameters of a template in the legacy `MJParameterInfo` shape, from the MJ Query
 * language's parameter analysis: a parameter is required when one of its uses sits outside every
 * `{% if %}` block and has no `default(…)`; loop variables, `{% set %}` names, `loop.*` and
 * `Context.*` are not parameters, nor is a name read only by `{{query:"…"}}` composition arguments
 * (the composed query's parameters type those). Holes list first (in order of their first hole),
 * then names read only by `{% if %}` conditions (typed `string`), then loop iterables. A `{% else %}` branch holding a single
 * `= literal` supplies the default of the parameter its `{% if %}` tests, when no filter does.
 */
export function LegacyParameterInfo(sql: string): MJParameterInfo[] {
    const template = QueryTemplate.Parse(sql, TEMPLATE_HELPER_DIALECT);
    const parameters = template.Parameters().Value.filter(p => !p.Uses.every(u => u.Role === 'CompositionArgument')).sort((a, b) =>
        useRank(a) - useRank(b) || firstPosition(a, useRank(a) === 0) - firstPosition(b, useRank(b) === 0));
    const infos = parameters.map(p => parameterInfo(p, sql));
    enrichDefaultsFromElseBranches(sql, new Map(infos.map(i => [i.name, i])));
    return infos;
}

function parameterInfo(parameter: TemplateParameter, sql: string): MJParameterInfo {
    const holes = parameter.Uses.filter(u => u.Role === 'Expression');
    const isLoop = parameter.Uses.some(u => u.Role === 'LoopIterable');
    const inferred = parameter.InferredType;
    const conditionOnly = holes.length === 0 && parameter.Uses.some(u => u.Role === 'Condition');
    const type: MJParameterInfo['type'] = isLoop ? 'array' : inferred === 'unknown' && conditionOnly ? 'string' : inferred;
    const value = parameter.DefaultValue;
    return {
        name: parameter.Name,
        type,
        isRequired: parameter.IsRequired,
        defaultValue: typeof value === 'string' || typeof value === 'number' ? value : null,
        filters: holes.length > 0 ? holeFilters(holes[0], sql) : [],
        usageLocations: holes.map(u => sql.substring(u.TagSpan.Start, u.TagSpan.End)),
    };
}

/** The filter chain of the `{{ }}` hole a use sits in, read the legacy way (names and literal arguments). */
function holeFilters(use: ParameterUse, sql: string): MJFilter[] {
    const raw = sql.substring(use.TagSpan.Start, use.TagSpan.End);
    const content = raw.replace(/^\{\{-?/, '').replace(/-?\}\}$/, '');
    return ParseLegacyFilterChain(content.trim()).filters;
}

function enrichDefaultsFromElseBranches(sql: string, parameters: ReadonlyMap<string, MJParameterInfo>): void {
    for (const block of LegacyConditionalBlocks(sql)) {
        if (block.branches.length < 2) continue;
        const elseBranch = block.branches[block.branches.length - 1];
        const condition = block.branches[0].condition;
        if (elseBranch.condition !== null || !condition) continue;
        const name = /^\s*([A-Za-z_]\w*)/.exec(condition)?.[1];
        const parameter = name === undefined ? undefined : parameters.get(name);
        if (!parameter || parameter.defaultValue !== null) continue;
        const literal = literalFromElseBody(elseBranch.body.raw);
        if (literal !== null) parameter.defaultValue = literal;
    }
}

/** The single `= 'text'` or `= number` an else body compares with, or `null` when there is not exactly one. */
function literalFromElseBody(body: string): string | number | null {
    const strings = [...body.matchAll(/=\s*'([^']+)'/g)];
    if (strings.length === 1) return strings[0][1];
    const numbers = [...body.matchAll(/=\s*(-?\d+(?:\.\d+)?)\b/g)];
    if (numbers.length !== 1 || strings.length !== 0) return null;
    const value = Number(numbers[0][1]);
    return Number.isNaN(value) ? null : value;
}

// ─── Rename and substitute ──────────────────────────────────────────────────

/**
 * Replaces a variable's `{{ }}` holes with `holeText(token)` and, when `tagText` is given, its
 * reads inside `{% if %}`, `{% elif %}`, `{% for %}` and `{% set %}` tags with `tagText`. Tags are
 * found as the original MJ lexer found them; the result is built in one pass.
 */
export function ReplaceLegacyTemplateVariable(
    sql: string,
    variableName: string,
    holeText: (filters: MJFilter[]) => string,
    tagText: string | undefined,
): string {
    const nameLower = variableName.toLowerCase();
    const parts: string[] = [];
    for (const token of LinearLegacyTokenize(sql)) {
        if (token.type === 'MJ_TEMPLATE_EXPR' && (token.parsed as MJTemplateExprContent).variable.toLowerCase() === nameLower) {
            parts.push(holeText((token.parsed as MJTemplateExprContent).filters));
        } else if (tagText !== undefined && VARIABLE_READING_TAGS.has(token.type)) {
            parts.push(ReplaceVariableInTag(token.raw, variableName, tagText));
        } else {
            parts.push(token.raw);
        }
    }
    return parts.join('');
}

/** `{{variable | filter1 | filter2(args)}}`, the hole a rename writes. */
export function RebuildLegacyTemplateExpr(variable: string, filters: MJFilter[]): string {
    if (filters.length === 0) return `{{${variable}}}`;
    const chain = filters.map(f => {
        if (f.args.length === 0) return f.name;
        const args = f.args.map(a => (typeof a === 'string' ? `'${a}'` : String(a))).join(', ');
        return `${f.name}(${args})`;
    }).join(' | ');
    return `{{${variable} | ${chain}}}`;
}
