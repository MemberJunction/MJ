/**
 * MJ SQL Parser — Unified parser for MJ's SQL superset
 *
 * Provides `mjAstify` and `mjSqlify` as the main entry points for
 * parsing MJ SQL (SQL + Nunjucks + Composition) into an extended AST
 * and reconstructing it back to SQL.
 *
 * Pipeline: MJLexer.tokenize() → MJPlaceholder.substitute() → Parser.astify()
 *                                                                    ↕
 *                                                              MJASTBuilder.build()
 *                                                                    ↕
 *                                                              mjSqlify() → SQL
 */

import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import { MJLexer } from './mj-lexer.js';
import { MJPlaceholderSubstitution } from './mj-placeholder.js';
import {
    MJToken,
    MJTemplateExpr,
    MJCompositionRef,
    MJConditionalBlock,
    MJLoopBlock,
    MJComment,
    MJSetBlock,
    MJBranch,
    MJSQLFragment,
    MJNode,
    MJFilter,
    MJCompositionParam,
    MJTemplateExprContent,
    MJCompositionRefContent,
    MJBlockTagContent,
    MJCommentContent,
    MJSetContent,
    PlaceholderEntry,
    MJParseResult,
} from './mj-ast-types.js';

// ═══════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════

/**
 * Result of mjAstify — contains both the node-sql-parser AST (with placeholders)
 * and the MJ token structure needed for reconstruction.
 */
export interface MJAstifyResult {
    /** The node-sql-parser AST of the placeholder-substituted SQL */
    ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null;
    /** Full MJ parse result with all tokens */
    mjParse: MJParseResult;
    /** Placeholder position map for reconstruction */
    positionMap: Map<string, PlaceholderEntry>;
    /** Tokens that were stripped (block tags, comments) */
    strippedTokens: MJToken[];
    /** The clean SQL that was actually parsed (for debugging) */
    cleanSQL: string;
    /** Whether AST parsing succeeded */
    astParsed: boolean;
    /** The SQL dialect used */
    dialect: string;
}

/**
 * Parse MJ SQL into an extended AST.
 *
 * The three-pass pipeline:
 * 1. MJLexer tokenizes MJ extensions ({{ }}, {% %}, {# #})
 * 2. MJPlaceholder replaces tokens with SQL-safe placeholders
 * 3. node-sql-parser parses the clean SQL into an AST
 *
 * The result contains both the SQL AST and the MJ token structure,
 * enabling both SQL-level analysis and MJ-level reconstruction.
 *
 * @param sql The MJ SQL string to parse
 * @param dialect SQL dialect ('TransactSQL' | 'PostgreSQL', default: 'TransactSQL')
 */
export function mjAstify(sql: string, dialect: string = 'TransactSQL'): MJAstifyResult {
    // Step 1: Tokenize MJ extensions
    const mjParse = MJLexer.Parse(sql);

    // If no MJ extensions, parse directly
    if (!mjParse.hasMJExtensions) {
        const ast = parseSQL(sql, dialect);
        return {
            ast,
            mjParse,
            positionMap: new Map(),
            strippedTokens: [],
            cleanSQL: sql,
            astParsed: ast !== null,
            dialect,
        };
    }

    // Step 2: Replace MJ tokens with SQL-safe placeholders
    const { cleanSQL, positionMap, strippedTokens } = MJPlaceholderSubstitution.Substitute(sql);

    // Step 3: Parse the clean SQL
    const ast = parseSQL(cleanSQL, dialect);

    return {
        ast,
        mjParse,
        positionMap,
        strippedTokens,
        cleanSQL,
        astParsed: ast !== null,
        dialect,
    };
}

/**
 * Reconstruct MJ SQL from an MJAstifyResult.
 *
 * For non-MJ SQL: uses node-sql-parser's sqlify for normalized output.
 * For MJ SQL: reconstructs from the original tokens, preserving all
 * Nunjucks templates and composition references verbatim.
 *
 * @param result The result from mjAstify
 * @returns The reconstructed MJ SQL string
 */
export function mjSqlify(result: MJAstifyResult): string {
    // If no MJ extensions and AST parsed successfully, use node-sql-parser sqlify
    if (!result.mjParse.hasMJExtensions && result.ast) {
        const parser = new Parser();
        const astToSqlify = Array.isArray(result.ast) ? result.ast[0] : result.ast;
        return parser.sqlify(astToSqlify, { database: result.dialect });
    }

    // For MJ SQL: reconstruct from tokens
    return reconstructFromTokens(result.mjParse.tokens);
}

/**
 * Extract all MJ template expressions from SQL.
 * Returns structured parameter info for each {{ variable | filter }} found.
 */
export function extractTemplateExpressions(sql: string): MJTemplateExpr[] {
    const tokens = MJLexer.Tokenize(sql);
    const exprs: MJTemplateExpr[] = [];

    for (const token of tokens) {
        if (token.type === 'MJ_TEMPLATE_EXPR') {
            const parsed = token.parsed as MJTemplateExprContent;
            exprs.push({
                type: 'mj_template_expr',
                variable: parsed.variable,
                filters: parsed.filters,
                raw: token.raw,
            });
        }
    }

    return exprs;
}

/**
 * Extract all composition references from SQL.
 * Returns structured info for each {{query:"..."}} found.
 */
export function extractCompositionRefs(sql: string): MJCompositionRef[] {
    const tokens = MJLexer.Tokenize(sql);
    const refs: MJCompositionRef[] = [];

    for (const token of tokens) {
        if (token.type === 'MJ_COMPOSITION_REF') {
            const parsed = token.parsed as MJCompositionRefContent;
            refs.push({
                type: 'mj_composition_ref',
                categoryPath: parsed.categoryPath,
                queryName: parsed.queryName,
                parameters: parsed.parameters,
                raw: token.raw,
            });
        }
    }

    return refs;
}

/**
 * Extract conditional blocks from SQL, pairing if/elif/else/endif into structured blocks.
 */
export function extractConditionalBlocks(sql: string): MJConditionalBlock[] {
    const tokens = MJLexer.Tokenize(sql);
    const blocks: MJConditionalBlock[] = [];
    const stack: { branches: MJBranch[]; raw: string }[] = [];

    for (const token of tokens) {
        switch (token.type) {
            case 'MJ_IF_OPEN': {
                const parsed = token.parsed as MJBlockTagContent;
                stack.push({
                    branches: [{
                        condition: parsed.expression,
                        body: { raw: '', nodes: [] },
                    }],
                    raw: token.raw,
                });
                break;
            }

            case 'MJ_ELIF': {
                const parsed = token.parsed as MJBlockTagContent;
                const current = stack[stack.length - 1];
                if (current) {
                    current.raw += getCurrentBranchContent(tokens, token);
                    current.branches.push({
                        condition: parsed.expression,
                        body: { raw: '', nodes: [] },
                    });
                    current.raw += token.raw;
                }
                break;
            }

            case 'MJ_ELSE': {
                const current = stack[stack.length - 1];
                if (current) {
                    current.raw += token.raw;
                    current.branches.push({
                        condition: null,
                        body: { raw: '', nodes: [] },
                    });
                }
                break;
            }

            case 'MJ_ENDIF': {
                const completed = stack.pop();
                if (completed) {
                    completed.raw += token.raw;
                    blocks.push({
                        type: 'mj_conditional',
                        branches: completed.branches,
                        raw: completed.raw,
                    });
                }
                break;
            }

            default: {
                // Append content to current branch body
                const current = stack[stack.length - 1];
                if (current && current.branches.length > 0) {
                    const lastBranch = current.branches[current.branches.length - 1];
                    lastBranch.body.raw += token.raw;
                    if (token.type === 'MJ_TEMPLATE_EXPR') {
                        const parsed = token.parsed as MJTemplateExprContent;
                        lastBranch.body.nodes.push({
                            type: 'mj_template_expr',
                            variable: parsed.variable,
                            filters: parsed.filters,
                            raw: token.raw,
                        });
                    } else if (token.type === 'MJ_COMPOSITION_REF') {
                        const parsed = token.parsed as MJCompositionRefContent;
                        lastBranch.body.nodes.push({
                            type: 'mj_composition_ref',
                            categoryPath: parsed.categoryPath,
                            queryName: parsed.queryName,
                            parameters: parsed.parameters,
                            raw: token.raw,
                        });
                    }
                    current.raw += token.raw;
                }
            }
        }
    }

    return blocks;
}

/**
 * Determine parameter metadata from template expressions.
 * Infers type from filters, isRequired from conditional block context.
 */
export function extractParameterInfo(sql: string): MJParameterInfo[] {
    const tokens = MJLexer.Tokenize(sql);
    const paramMap = new Map<string, MJParameterInfo>();

    // First pass: extract all template expressions and their filter types
    for (const token of tokens) {
        if (token.type === 'MJ_TEMPLATE_EXPR') {
            const parsed = token.parsed as MJTemplateExprContent;
            const varName = parsed.variable;

            if (!paramMap.has(varName)) {
                paramMap.set(varName, {
                    name: varName,
                    type: inferTypeFromFilters(parsed.filters),
                    isRequired: true, // default, will be updated below
                    defaultValue: extractDefaultValue(parsed.filters),
                    filters: parsed.filters,
                    usageLocations: [],
                });
            }

            const param = paramMap.get(varName)!;
            param.usageLocations.push(token.raw);
        }
    }

    // Second pass: mark parameters that only appear inside conditionals as optional
    const conditionalVars = extractConditionalVariables(tokens);
    for (const [varName, param] of paramMap) {
        if (conditionalVars.onlyInConditional.has(varName)) {
            param.isRequired = false;
        }
    }

    return Array.from(paramMap.values());
}

/**
 * Structured parameter info extracted deterministically from SQL.
 */
export interface MJParameterInfo {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'unknown';
    isRequired: boolean;
    defaultValue: string | number | null;
    filters: MJFilter[];
    usageLocations: string[];
}

// ═══════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════

/**
 * Parse SQL safely, returning null on failure.
 */
function parseSQL(sql: string, dialect: string): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
    try {
        const parser = new Parser();
        return parser.astify(sql, { database: dialect });
    } catch {
        return null;
    }
}

/**
 * Reconstruct SQL from token list (preserves original text verbatim).
 */
function reconstructFromTokens(tokens: MJToken[]): string {
    return tokens.map(t => t.raw).join('');
}

/**
 * Infer the parameter type from its filter chain.
 */
function inferTypeFromFilters(filters: MJFilter[]): MJParameterInfo['type'] {
    const filterTypeMap: Record<string, MJParameterInfo['type']> = {
        'sqlString': 'string',
        'sqlNumber': 'number',
        'sqlDate': 'date',
        'sqlBoolean': 'boolean',
        'sqlIn': 'array',
        'sqlIdentifier': 'string',
        'sqlNoKeywordsExpression': 'string',
    };

    // Reverse search — last SQL filter wins
    for (let i = filters.length - 1; i >= 0; i--) {
        const mapped = filterTypeMap[filters[i].name];
        if (mapped) return mapped;
    }

    return 'unknown';
}

/**
 * Extract default value from a filter chain (from the `default` filter).
 */
function extractDefaultValue(filters: MJFilter[]): string | number | null {
    for (const filter of filters) {
        if (filter.name === 'default' && filter.args.length > 0) {
            return filter.args[0];
        }
    }
    return null;
}

/**
 * Analyzes tokens to determine which variables appear only inside conditionals.
 */
function extractConditionalVariables(tokens: MJToken[]): {
    onlyInConditional: Set<string>;
    outsideConditional: Set<string>;
} {
    const insideConditional = new Set<string>();
    const outsideConditional = new Set<string>();
    let conditionalDepth = 0;

    for (const token of tokens) {
        switch (token.type) {
            case 'MJ_IF_OPEN':
                conditionalDepth++;
                // Also check the condition expression for variable references
                addConditionVariables(token, insideConditional);
                break;
            case 'MJ_ELIF':
                addConditionVariables(token, insideConditional);
                break;
            case 'MJ_ENDIF':
                conditionalDepth = Math.max(0, conditionalDepth - 1);
                break;
            case 'MJ_TEMPLATE_EXPR': {
                const parsed = token.parsed as MJTemplateExprContent;
                if (conditionalDepth > 0) {
                    insideConditional.add(parsed.variable);
                } else {
                    outsideConditional.add(parsed.variable);
                }
                break;
            }
        }
    }

    // A variable is "only in conditional" if it appears inside but never outside
    const onlyInConditional = new Set<string>();
    for (const v of insideConditional) {
        if (!outsideConditional.has(v)) {
            onlyInConditional.add(v);
        }
    }

    return { onlyInConditional, outsideConditional };
}

/**
 * Extracts variable names from a block tag condition expression.
 * e.g., {% if MinActivityCount %} → adds "MinActivityCount" to the set.
 */
function addConditionVariables(token: MJToken, varSet: Set<string>): void {
    const parsed = token.parsed as MJBlockTagContent;
    if (parsed.expression) {
        // Extract simple variable names from condition (e.g., "MinActivityCount", "Status and Region")
        const words = parsed.expression.split(/\s+(?:and|or|not)\s+|\s+/i);
        for (const word of words) {
            const trimmed = word.replace(/[!=<>'"()]/g, '').trim();
            if (trimmed && /^[A-Za-z_]\w*$/.test(trimmed)) {
                varSet.add(trimmed);
            }
        }
    }
}

/**
 * Helper for extractConditionalBlocks — gets the raw content between the
 * current branch start and the current token.
 * This is a simplified helper that returns empty string for now.
 */
function getCurrentBranchContent(_tokens: MJToken[], _currentToken: MJToken): string {
    return '';
}
