/**
 * MJ SQL Parser Edge Case Tests
 *
 * Tests the MJ Lexer, Placeholder Substitution, and Parser against
 * a comprehensive set of edge cases covering unusual/tricky scenarios.
 */
import { describe, it, expect } from 'vitest';
import { SQLParser } from '../mj-sql-parser.js';
import { MJLexer } from '../mj-lexer.js';
import { MJPlaceholderSubstitution } from '../mj-placeholder.js';
const mjAstify = SQLParser.Astify.bind(SQLParser);
const mjSqlify = SQLParser.Sqlify.bind(SQLParser);
const extractTemplateExpressions = SQLParser.ExtractTemplateExpressions.bind(SQLParser);
const extractCompositionRefs = SQLParser.ExtractCompositionRefs.bind(SQLParser);
const extractConditionalBlocks = SQLParser.ExtractConditionalBlocks.bind(SQLParser);
const extractParameterInfo = SQLParser.ExtractParameterInfo.bind(SQLParser);
import {
    MJTemplateExprContent,
    MJCompositionRefContent,
    MJBlockTagContent,
    MJCommentContent,
    MJSetContent,
} from '../mj-ast-types.js';
import * as EC from './edge-cases.js';

// ═══════════════════════════════════════════════════
// Expression Edge Cases
// ═══════════════════════════════════════════════════

describe('Expression Edge Cases', () => {
    it('EXPR_INSIDE_QUOTES: expression inside SQL single quotes', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_INSIDE_QUOTES);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        // Lexer has no SQL context awareness — it detects the {{ }} regardless
        expect(exprTokens).toHaveLength(1);
        const parsed = exprTokens[0].parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('Name');
    });

    it('EXPR_NO_SPACES: expression with zero whitespace', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_NO_SPACES);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('var');
        expect(parsed.filters[0].name).toBe('sqlNumber');
    });

    it('EXPR_LOTS_OF_SPACES: expression with excessive whitespace', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_LOTS_OF_SPACES);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('var');
        expect(parsed.filters[0].name).toBe('sqlString');
    });

    it('EXPR_MULTI_FILTER_CHAIN: filter chain with default and sqlString', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_MULTI_FILTER_CHAIN);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('val');
        expect(parsed.filters).toHaveLength(2);
        expect(parsed.filters[0].name).toBe('default');
        expect(parsed.filters[0].args).toEqual(['N/A']);
        expect(parsed.filters[1].name).toBe('sqlString');
    });

    it('EXPR_DOTTED_VARIABLE: variable with dot notation', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_DOTTED_VARIABLE);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('user.name');
    });

    it('EXPR_ARITHMETIC: two expressions in arithmetic', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_ARITHMETIC);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(2);
        expect((exprTokens[0].parsed as MJTemplateExprContent).variable).toBe('CurrentYear');
        expect((exprTokens[1].parsed as MJTemplateExprContent).variable).toBe('LookbackYears');
    });

    it('EXPR_IN_SQL_COMMENT: expression inside -- comment', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_IN_SQL_COMMENT);
        // Lexer detects {{ }} even inside SQL comments
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(1);
        expect((exprTokens[0].parsed as MJTemplateExprContent).variable).toBe('this_is_a_comment');
    });

    it('EXPR_IN_STRING_LITERAL: expression inside SQL string literal', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_IN_STRING_LITERAL);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(1);
    });

    it('EXPR_ADJACENT_NO_SPACE: two expressions with no gap', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_ADJACENT_NO_SPACE);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(2);
    });

    it('EXPR_FILTER_MULTI_ARGS: filter with multiple arguments', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_FILTER_MULTI_ARGS);
        const parsed = (tokens[0].parsed as MJTemplateExprContent);
        expect(parsed.filters[0].name).toBe('custom');
        expect(parsed.filters[0].args).toEqual(['fallback', 42]);
    });

    it('EXPR_SQL_KEYWORD_VARIABLE: variable name is a SQL keyword', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_SQL_KEYWORD_VARIABLE);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('SELECT');
    });

    it('EXPR_DOUBLE_QUOTED_ARG: default filter with double-quoted argument', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_DOUBLE_QUOTED_ARG);
        const parsed = (tokens[0].parsed as MJTemplateExprContent);
        expect(parsed.filters[0].name).toBe('default');
        expect(parsed.filters[0].args).toEqual(['N/A']);
    });

    it('EXPR_BOOKEND: expressions at start and end of string', () => {
        const tokens = MJLexer.Tokenize(EC.EXPR_BOOKEND);
        expect(tokens[0].type).toBe('MJ_TEMPLATE_EXPR');
        expect(tokens[tokens.length - 1].type).toBe('MJ_TEMPLATE_EXPR');
    });

    it('EXPR_AS_TABLE_ALIAS: expression used as table alias', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.EXPR_AS_TABLE_ALIAS);
        expect(result.cleanSQL).toContain('__MJI_'); // identifier placeholder
    });

    it('MIXED_PIPE_IN_QUOTED_ARG: pipe character inside filter argument', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_PIPE_IN_QUOTED_ARG);
        const parsed = (tokens[0].parsed as MJTemplateExprContent);
        expect(parsed.variable).toBe('x');
        expect(parsed.filters).toHaveLength(2);
        expect(parsed.filters[0].name).toBe('default');
        expect(parsed.filters[0].args).toEqual(['a|b']);
        expect(parsed.filters[1].name).toBe('sqlString');
    });
});

// ═══════════════════════════════════════════════════
// Conditional Block Edge Cases
// ═══════════════════════════════════════════════════

describe('Conditional Block Edge Cases', () => {
    it('COND_DEEPLY_NESTED: 3-level deep nesting', () => {
        const tokens = MJLexer.Tokenize(EC.COND_DEEPLY_NESTED);
        const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');
        const endifTokens = tokens.filter(t => t.type === 'MJ_ENDIF');
        expect(ifTokens).toHaveLength(3);
        expect(endifTokens).toHaveLength(3);
    });

    it('COND_CHANGES_SQL_STRUCTURE: conditional changes WHERE vs AND', () => {
        const tokens = MJLexer.Tokenize(EC.COND_CHANGES_SQL_STRUCTURE);
        const elseToken = tokens.find(t => t.type === 'MJ_ELSE');
        expect(elseToken).toBeDefined();
    });

    it('COND_WRAPPING_COLUMN: conditional around SELECT column', () => {
        const result = mjAstify(EC.COND_WRAPPING_COLUMN);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(EC.COND_WRAPPING_COLUMN);
    });

    it('COND_COMPLEX_EXPRESSION: complex condition with operators', () => {
        const tokens = MJLexer.Tokenize(EC.COND_COMPLEX_EXPRESSION);
        const ifToken = tokens.find(t => t.type === 'MJ_IF_OPEN')!;
        const parsed = ifToken.parsed as MJBlockTagContent;
        expect(parsed.expression).toBe('x != "" and y != ""');
    });

    it('COND_EMPTY_BODY: empty conditional body', () => {
        const tokens = MJLexer.Tokenize(EC.COND_EMPTY_BODY);
        const ifIdx = tokens.findIndex(t => t.type === 'MJ_IF_OPEN');
        const endifIdx = tokens.findIndex(t => t.type === 'MJ_ENDIF');
        // No SQL_TEXT between if and endif
        const between = tokens.slice(ifIdx + 1, endifIdx);
        expect(between.filter(t => t.type === 'SQL_TEXT' && t.raw.trim().length > 0)).toHaveLength(0);
    });

    it('COND_WHITESPACE_BODY: conditional with only whitespace', () => {
        const tokens = MJLexer.Tokenize(EC.COND_WHITESPACE_BODY);
        const ifIdx = tokens.findIndex(t => t.type === 'MJ_IF_OPEN');
        const endifIdx = tokens.findIndex(t => t.type === 'MJ_ENDIF');
        const between = tokens.slice(ifIdx + 1, endifIdx);
        // Should have whitespace SQL_TEXT but nothing substantial
        expect(between.every(t => t.type === 'SQL_TEXT' && t.raw.trim().length === 0)).toBe(true);
    });

    it('COND_LONG_ELIF_CHAIN: 4 branches plus else', () => {
        const tokens = MJLexer.Tokenize(EC.COND_LONG_ELIF_CHAIN);
        expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ELIF')).toHaveLength(3);
        expect(tokens.filter(t => t.type === 'MJ_ELSE')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);
    });

    it('COND_AROUND_ORDER_BY: conditional wrapping ORDER BY', () => {
        const tokens = MJLexer.Tokenize(EC.COND_AROUND_ORDER_BY);
        expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(2); // SortColumn, SortDir
    });

    it('COND_AROUND_GROUP_BY: conditional wrapping GROUP BY', () => {
        const result = mjAstify(EC.COND_AROUND_GROUP_BY);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(EC.COND_AROUND_GROUP_BY);
    });

    it('COND_AROUND_JOIN: conditional wrapping JOIN clause', () => {
        const params = extractParameterInfo(EC.COND_AROUND_JOIN);
        // IncludeCustomer appears only in {% if %} condition, not as a {{ }} expression,
        // so extractParameterInfo doesn't return it (it only tracks template expressions)

        const minTotal = params.find(p => p.name === 'MinTotal');
        expect(minTotal).toBeDefined();
        expect(minTotal!.type).toBe('number');
        expect(minTotal!.isRequired).toBe(true); // outside conditional

        // Verify the conditional block detection works
        const blocks = extractConditionalBlocks(EC.COND_AROUND_JOIN);
        expect(blocks.length).toBeGreaterThanOrEqual(1);
    });

    it('COND_GUARD_THEN_USE: guard variable then use it', () => {
        const params = extractParameterInfo(EC.COND_GUARD_THEN_USE);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Region');
        expect(params[0].isRequired).toBe(false); // guarded by {% if Region %}
    });

    it('COND_NEGATION: conditional with not operator', () => {
        const tokens = MJLexer.Tokenize(EC.COND_NEGATION);
        const ifToken = tokens.find(t => t.type === 'MJ_IF_OPEN')!;
        const parsed = ifToken.parsed as MJBlockTagContent;
        expect(parsed.expression).toBe('not HideResults');
    });
});

// ═══════════════════════════════════════════════════
// Composition Token Edge Cases
// ═══════════════════════════════════════════════════

describe('Composition Token Edge Cases', () => {
    it('COMP_NO_PARAMS: composition with no parameters', () => {
        const refs = extractCompositionRefs(EC.COMP_NO_PARAMS);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('Simple');
        expect(refs[0].queryName).toBe('Query');
        expect(refs[0].parameters).toHaveLength(0);
    });

    it('COMP_NESTED_NUNJUCKS_PARAM: parameter value contains {{ }}', () => {
        const tokens = MJLexer.Tokenize(EC.COMP_NESTED_NUNJUCKS_PARAM);
        // The entire {{query:"..."}} is ONE token, even though it contains {{StartDate}}
        const compTokens = tokens.filter(t => t.type === 'MJ_COMPOSITION_REF');
        expect(compTokens).toHaveLength(1);
    });

    it('COMP_MULTIPLE_REFS: two composition refs with JOIN', () => {
        const refs = extractCompositionRefs(EC.COMP_MULTIPLE_REFS);
        expect(refs).toHaveLength(2);
        expect(refs[0].queryName).toBe('RevenueByMonth');
        expect(refs[1].queryName).toBe('MemberCounts');
    });

    it('COMP_AS_SUBQUERY: composition ref in WHERE IN subquery', () => {
        const refs = extractCompositionRefs(EC.COMP_AS_SUBQUERY);
        expect(refs).toHaveLength(1);
        expect(refs[0].queryName).toBe('Active');
    });

    it('COMP_SPECIAL_CHARS_PATH: path with hyphens and spaces', () => {
        const refs = extractCompositionRefs(EC.COMP_SPECIAL_CHARS_PATH);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('Golden-Queries/Revenue Analysis');
        expect(refs[0].queryName).toBe('Top 10');
    });

    it('COMP_MANY_PARAMS: 4 mixed parameters', () => {
        const refs = extractCompositionRefs(EC.COMP_MANY_PARAMS);
        expect(refs[0].parameters).toHaveLength(4);
        expect(refs[0].parameters[0]).toEqual({ key: 'year', value: 'Year', isPassThrough: true });
        expect(refs[0].parameters[1]).toEqual({ key: 'region', value: 'West', isPassThrough: false });
        expect(refs[0].parameters[2]).toEqual({ key: 'limit', value: 'MaxRows', isPassThrough: true });
        expect(refs[0].parameters[3]).toEqual({ key: 'status', value: 'Active', isPassThrough: false });
    });

    it('COMP_SINGLE_SEGMENT_PATH: single-segment path (no category)', () => {
        const refs = extractCompositionRefs(EC.COMP_SINGLE_SEGMENT_PATH);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('');
        expect(refs[0].queryName).toBe('SimpleQuery');
    });
});

// ═══════════════════════════════════════════════════
// SQL Structure Edge Cases
// ═══════════════════════════════════════════════════

describe('SQL Structure Edge Cases', () => {
    it('SQL_UNION_WITH_TEMPLATES: UNION ALL with templates in both branches', () => {
        const exprs = extractTemplateExpressions(EC.SQL_UNION_WITH_TEMPLATES);
        expect(exprs).toHaveLength(2);
        expect(exprs.every(e => e.variable === 'Year')).toBe(true);
    });

    it('SQL_MULTIPLE_CTES_WITH_TEMPLATES: CTE with template expression', () => {
        const result = mjAstify(EC.SQL_MULTIPLE_CTES_WITH_TEMPLATES);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(EC.SQL_MULTIPLE_CTES_WITH_TEMPLATES);
    });

    it('SQL_DECLARE_SET_TEMPLATE: DECLARE with template variable', () => {
        const exprs = extractTemplateExpressions(EC.SQL_DECLARE_SET_TEMPLATE);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('Threshold');
        expect(exprs[0].filters[0].name).toBe('sqlNumber');
    });

    it('SQL_CROSS_APPLY_TEMPLATE: template inside CROSS APPLY', () => {
        const params = extractParameterInfo(EC.SQL_CROSS_APPLY_TEMPLATE);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('TopN');
        expect(params[0].type).toBe('number');
    });

    it('SQL_WINDOW_FUNCTION_TEMPLATE: template in PARTITION BY', () => {
        const params = extractParameterInfo(EC.SQL_WINDOW_FUNCTION_TEMPLATE);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('GroupCol');
        expect(params[0].type).toBe('string'); // sqlIdentifier → string
    });

    it('SQL_SUBQUERY_IN_SELECT: template in scalar subquery', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.SQL_SUBQUERY_IN_SELECT);
        expect(result.positionMap.size).toBe(1);
        expect(result.cleanSQL).not.toContain('{{');
    });

    it('SQL_CASE_WHEN_TEMPLATE: template in CASE WHEN condition', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.SQL_CASE_WHEN_TEMPLATE);
        expect(result.positionMap.size).toBe(1);
        expect(result.cleanSQL).toContain("'__MJT_001__'"); // sqlString placeholder
    });

    it('SQL_COMMENTS_NEAR_TOKENS: SQL comments near template tokens', () => {
        const tokens = MJLexer.Tokenize(EC.SQL_COMMENTS_NEAR_TOKENS);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        // {{ not_a_real_var }} inside block comment is still detected by lexer
        // {{ Year | sqlNumber }} is the real parameter
        expect(exprTokens).toHaveLength(2);
    });

    it('SQL_EMPTY: empty string returns no tokens', () => {
        const tokens = MJLexer.Tokenize(EC.SQL_EMPTY);
        expect(tokens).toHaveLength(0);
    });

    it('SQL_ONLY_MJ_TOKENS: SQL with only MJ tokens', () => {
        const result = MJLexer.Parse(EC.SQL_ONLY_MJ_TOKENS);
        expect(result.hasMJExtensions).toBe(true);
        expect(result.hasTemplateExpressions).toBe(true);
        expect(result.hasConditionalBlocks).toBe(true);
    });

    it('SQL_LONG_MANY_TEMPLATES: large SQL with 10 template expressions', () => {
        const exprs = extractTemplateExpressions(EC.SQL_LONG_MANY_TEMPLATES);
        expect(exprs).toHaveLength(10);
        const names = exprs.map(e => e.variable).sort();
        expect(names).toEqual(['P1', 'P10', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9']);
    });

    it('SQL_LONG_MANY_TEMPLATES: round-trip preserves original', () => {
        const result = mjAstify(EC.SQL_LONG_MANY_TEMPLATES);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(EC.SQL_LONG_MANY_TEMPLATES);
    });
});

// ═══════════════════════════════════════════════════
// Mixed / Combined Edge Cases
// ═══════════════════════════════════════════════════

describe('Mixed Edge Cases', () => {
    it('MIXED_COMP_IN_CONDITIONAL: composition ref inside conditional', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_COMP_IN_CONDITIONAL);
        const compTokens = tokens.filter(t => t.type === 'MJ_COMPOSITION_REF');
        const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');
        expect(compTokens).toHaveLength(1);
        expect(ifTokens).toHaveLength(1);
    });

    it('MIXED_COMMENT_ADJACENT_EXPR: comment immediately before expression', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_COMMENT_ADJACENT_EXPR);
        const commentTokens = tokens.filter(t => t.type === 'MJ_COMMENT');
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(commentTokens).toHaveLength(1);
        expect(exprTokens).toHaveLength(1);
    });

    it('MIXED_SET_THEN_USE: set block followed by expression', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_SET_THEN_USE);
        const setTokens = tokens.filter(t => t.type === 'MJ_SET');
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(setTokens).toHaveLength(1);
        expect(exprTokens).toHaveLength(1);
        const setParsed = setTokens[0].parsed as MJSetContent;
        expect(setParsed.variable).toBe('currentYear');
    });

    it('MIXED_FOR_LOOP_UNION: for loop generating UNION ALL', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_FOR_LOOP_UNION);
        expect(tokens.filter(t => t.type === 'MJ_FOR_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDFOR')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR')).toHaveLength(1); // table
    });

    it('MIXED_CONDITIONAL_WITH_CLAUSE: conditional around WITH clause', () => {
        const result = mjAstify(EC.MIXED_CONDITIONAL_WITH_CLAUSE);
        const reconstructed = mjSqlify(result);
        expect(reconstructed).toBe(EC.MIXED_CONDITIONAL_WITH_CLAUSE);
    });

    it('MIXED_MULTIPLE_SETS: multiple set blocks', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_MULTIPLE_SETS);
        const setTokens = tokens.filter(t => t.type === 'MJ_SET');
        expect(setTokens).toHaveLength(3);

        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(3);
    });

    it('MIXED_FOR_WITH_CONDITIONAL: for loop with conditional inside', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_FOR_WITH_CONDITIONAL);
        expect(tokens.filter(t => t.type === 'MJ_FOR_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDFOR')).toHaveLength(1);
    });

    it('MIXED_COMMENT_WITH_BRACES: comment containing {{ and {% inside', () => {
        const tokens = MJLexer.Tokenize(EC.MIXED_COMMENT_WITH_BRACES);
        const commentTokens = tokens.filter(t => t.type === 'MJ_COMMENT');
        expect(commentTokens).toHaveLength(1);
        const parsed = commentTokens[0].parsed as MJCommentContent;
        expect(parsed.text).toContain('braces');
    });

    it('MIXED_EXPR_AT_STATEMENT_BOUNDARY: expressions at statement boundaries', () => {
        const exprs = extractTemplateExpressions(EC.MIXED_EXPR_AT_STATEMENT_BOUNDARY);
        expect(exprs).toHaveLength(2);
        expect(exprs.every(e => e.variable === 'Val')).toBe(true);
    });

    it('MIXED_UNDERSCORE_VAR: variable with underscores and numbers', () => {
        const exprs = extractTemplateExpressions(EC.MIXED_UNDERSCORE_VAR);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('field_2_name');
    });
});

// ═══════════════════════════════════════════════════
// Placeholder Substitution Edge Cases
// ═══════════════════════════════════════════════════

describe('Placeholder Substitution Edge Cases', () => {
    it('should produce parseable SQL for UNION with templates', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.SQL_UNION_WITH_TEMPLATES);
        expect(result.cleanSQL).not.toContain('{{');
        expect(result.positionMap.size).toBe(2);
    });

    it('should produce parseable SQL for multiple CTEs with templates', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.SQL_MULTIPLE_CTES_WITH_TEMPLATES);
        expect(result.cleanSQL).not.toContain('{{');
        expect(result.cleanSQL).not.toContain('{%');
    });

    it('should produce parseable SQL for CROSS APPLY with template', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.SQL_CROSS_APPLY_TEMPLATE);
        // Should produce numeric placeholder for sqlNumber
        const entry = Array.from(result.positionMap.values())[0];
        expect(entry.context).toBe('number');
    });

    it('should produce parseable SQL for window function template', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.SQL_WINDOW_FUNCTION_TEMPLATE);
        // sqlIdentifier should produce identifier placeholder
        const entry = Array.from(result.positionMap.values())[0];
        expect(entry.context).toBe('identifier');
    });

    it('should strip all block tags from deeply nested conditionals', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.COND_DEEPLY_NESTED);
        expect(result.cleanSQL).not.toContain('{%');
        expect(result.strippedTokens.length).toBe(6); // 3 if + 3 endif
    });

    it('should strip comments', () => {
        const result = MJPlaceholderSubstitution.Substitute(EC.MIXED_COMMENT_WITH_BRACES);
        expect(result.cleanSQL).not.toContain('{#');
        expect(result.strippedTokens.filter(t => t.type === 'MJ_COMMENT')).toHaveLength(1);
    });
});

// ═══════════════════════════════════════════════════
// Round-trip Fidelity for ALL Edge Cases
// ═══════════════════════════════════════════════════

describe('Round-trip Fidelity (mjAstify → mjSqlify)', () => {
    const allEdgeCases: [string, string][] = [
        ['EXPR_INSIDE_QUOTES', EC.EXPR_INSIDE_QUOTES],
        ['EXPR_NO_SPACES', EC.EXPR_NO_SPACES],
        ['EXPR_LOTS_OF_SPACES', EC.EXPR_LOTS_OF_SPACES],
        ['EXPR_MULTI_FILTER_CHAIN', EC.EXPR_MULTI_FILTER_CHAIN],
        ['EXPR_DOTTED_VARIABLE', EC.EXPR_DOTTED_VARIABLE],
        ['EXPR_ARITHMETIC', EC.EXPR_ARITHMETIC],
        ['EXPR_IN_SQL_COMMENT', EC.EXPR_IN_SQL_COMMENT],
        ['EXPR_IN_STRING_LITERAL', EC.EXPR_IN_STRING_LITERAL],
        ['EXPR_ADJACENT_NO_SPACE', EC.EXPR_ADJACENT_NO_SPACE],
        ['EXPR_FILTER_MULTI_ARGS', EC.EXPR_FILTER_MULTI_ARGS],
        ['EXPR_SQL_KEYWORD_VARIABLE', EC.EXPR_SQL_KEYWORD_VARIABLE],
        ['EXPR_DOUBLE_QUOTED_ARG', EC.EXPR_DOUBLE_QUOTED_ARG],
        ['EXPR_BOOKEND', EC.EXPR_BOOKEND],
        ['COND_DEEPLY_NESTED', EC.COND_DEEPLY_NESTED],
        ['COND_CHANGES_SQL_STRUCTURE', EC.COND_CHANGES_SQL_STRUCTURE],
        ['COND_WRAPPING_COLUMN', EC.COND_WRAPPING_COLUMN],
        ['COND_COMPLEX_EXPRESSION', EC.COND_COMPLEX_EXPRESSION],
        ['COND_EMPTY_BODY', EC.COND_EMPTY_BODY],
        ['COND_WHITESPACE_BODY', EC.COND_WHITESPACE_BODY],
        ['COND_LONG_ELIF_CHAIN', EC.COND_LONG_ELIF_CHAIN],
        ['COND_AROUND_ORDER_BY', EC.COND_AROUND_ORDER_BY],
        ['COND_AROUND_GROUP_BY', EC.COND_AROUND_GROUP_BY],
        ['COND_AROUND_JOIN', EC.COND_AROUND_JOIN],
        ['COND_GUARD_THEN_USE', EC.COND_GUARD_THEN_USE],
        ['COND_NEGATION', EC.COND_NEGATION],
        ['COMP_NO_PARAMS', EC.COMP_NO_PARAMS],
        ['COMP_MULTIPLE_REFS', EC.COMP_MULTIPLE_REFS],
        ['COMP_AS_SUBQUERY', EC.COMP_AS_SUBQUERY],
        ['COMP_SPECIAL_CHARS_PATH', EC.COMP_SPECIAL_CHARS_PATH],
        ['COMP_MANY_PARAMS', EC.COMP_MANY_PARAMS],
        ['COMP_SINGLE_SEGMENT_PATH', EC.COMP_SINGLE_SEGMENT_PATH],
        ['SQL_UNION_WITH_TEMPLATES', EC.SQL_UNION_WITH_TEMPLATES],
        ['SQL_MULTIPLE_CTES_WITH_TEMPLATES', EC.SQL_MULTIPLE_CTES_WITH_TEMPLATES],
        ['SQL_DECLARE_SET_TEMPLATE', EC.SQL_DECLARE_SET_TEMPLATE],
        ['SQL_CROSS_APPLY_TEMPLATE', EC.SQL_CROSS_APPLY_TEMPLATE],
        ['SQL_WINDOW_FUNCTION_TEMPLATE', EC.SQL_WINDOW_FUNCTION_TEMPLATE],
        ['SQL_SUBQUERY_IN_SELECT', EC.SQL_SUBQUERY_IN_SELECT],
        ['SQL_CASE_WHEN_TEMPLATE', EC.SQL_CASE_WHEN_TEMPLATE],
        ['SQL_ONLY_MJ_TOKENS', EC.SQL_ONLY_MJ_TOKENS],
        ['SQL_LONG_MANY_TEMPLATES', EC.SQL_LONG_MANY_TEMPLATES],
        ['MIXED_COMP_IN_CONDITIONAL', EC.MIXED_COMP_IN_CONDITIONAL],
        ['MIXED_COMMENT_ADJACENT_EXPR', EC.MIXED_COMMENT_ADJACENT_EXPR],
        ['MIXED_SET_THEN_USE', EC.MIXED_SET_THEN_USE],
        ['MIXED_FOR_LOOP_UNION', EC.MIXED_FOR_LOOP_UNION],
        ['MIXED_CONDITIONAL_WITH_CLAUSE', EC.MIXED_CONDITIONAL_WITH_CLAUSE],
        ['MIXED_UNDERSCORE_VAR', EC.MIXED_UNDERSCORE_VAR],
        ['MIXED_MULTIPLE_SETS', EC.MIXED_MULTIPLE_SETS],
        ['MIXED_FOR_WITH_CONDITIONAL', EC.MIXED_FOR_WITH_CONDITIONAL],
        ['MIXED_COMMENT_WITH_BRACES', EC.MIXED_COMMENT_WITH_BRACES],
        ['MIXED_PIPE_IN_QUOTED_ARG', EC.MIXED_PIPE_IN_QUOTED_ARG],
        ['MIXED_EXPR_AT_STATEMENT_BOUNDARY', EC.MIXED_EXPR_AT_STATEMENT_BOUNDARY],
    ];

    for (const [name, sql] of allEdgeCases) {
        it(`${name}: round-trip preserves original`, () => {
            const result = mjAstify(sql);
            const reconstructed = mjSqlify(result);
            expect(reconstructed).toBe(sql);
        });
    }
});
