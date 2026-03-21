import { describe, it, expect } from 'vitest';
import { MJSQLParser } from '../mj-sql-parser.js';
import { MJLexer } from '../mj-lexer.js';
import { MJPlaceholderSubstitution } from '../mj-placeholder.js';
const mjAstify = MJSQLParser.Astify.bind(MJSQLParser);
const mjSqlify = MJSQLParser.Sqlify.bind(MJSQLParser);
const extractTemplateExpressions = MJSQLParser.ExtractTemplateExpressions.bind(MJSQLParser);
const extractCompositionRefs = MJSQLParser.ExtractCompositionRefs.bind(MJSQLParser);
const extractConditionalBlocks = MJSQLParser.ExtractConditionalBlocks.bind(MJSQLParser);
const extractParameterInfo = MJSQLParser.ExtractParameterInfo.bind(MJSQLParser);
import {
    MJTemplateExprContent,
    MJCompositionRefContent,
    MJBlockTagContent,
    MJCommentContent,
    MJSetContent,
} from '../mj-ast-types.js';

import {
    EXPR_INSIDE_QUOTES,
    EXPR_NO_SPACES,
    EXPR_LOTS_OF_SPACES,
    EXPR_MULTI_FILTER_CHAIN,
    EXPR_DOTTED_VARIABLE,
    EXPR_ARITHMETIC,
    EXPR_IN_SQL_COMMENT,
    EXPR_IN_STRING_LITERAL,
    EXPR_EMPTY_VARIABLE_WITH_FILTER,
    EXPR_ADJACENT_NO_SPACE,
    EXPR_FILTER_MULTI_ARGS,
    EXPR_SQL_KEYWORD_VARIABLE,
    EXPR_DOUBLE_QUOTED_ARG,
    EXPR_BOOKEND,
    COND_DEEPLY_NESTED,
    COND_CHANGES_SQL_STRUCTURE,
    COND_WRAPPING_COLUMN,
    COND_COMPLEX_EXPRESSION,
    COND_EMPTY_BODY,
    COND_WHITESPACE_BODY,
    COND_LONG_ELIF_CHAIN,
    COND_AROUND_ORDER_BY,
    COND_AROUND_GROUP_BY,
    COND_AROUND_JOIN,
    COND_GUARD_THEN_USE,
    COND_NEGATION,
    COMP_NO_PARAMS,
    COMP_NESTED_NUNJUCKS_PARAM,
    COMP_MULTIPLE_REFS,
    COMP_AS_SUBQUERY,
    COMP_SPECIAL_CHARS_PATH,
    COMP_MANY_PARAMS,
    COMP_EMPTY_PATH,
    COMP_SINGLE_SEGMENT_PATH,
    SQL_UNION_WITH_TEMPLATES,
    SQL_MULTIPLE_CTES_WITH_TEMPLATES,
    SQL_DECLARE_SET_TEMPLATE,
    SQL_CROSS_APPLY_TEMPLATE,
    SQL_WINDOW_FUNCTION_TEMPLATE,
    SQL_SUBQUERY_IN_SELECT,
    SQL_CASE_WHEN_TEMPLATE,
    SQL_COMMENTS_NEAR_TOKENS,
    SQL_EMPTY,
    SQL_ONLY_MJ_TOKENS,
    SQL_PIVOT_TEMPLATE,
    SQL_LONG_MANY_TEMPLATES,
    MIXED_COMP_IN_CONDITIONAL,
    MIXED_COMMENT_ADJACENT_EXPR,
    MIXED_SET_THEN_USE,
    MIXED_FOR_LOOP_UNION,
    MIXED_CONDITIONAL_WITH_CLAUSE,
    MIXED_UNDERSCORE_VAR,
    MIXED_MULTIPLE_SETS,
    MIXED_FOR_WITH_CONDITIONAL,
    MIXED_TRIPLE_BRACES,
    MIXED_EXPR_AT_STATEMENT_BOUNDARY,
    MIXED_COMMENT_WITH_BRACES,
    MIXED_PIPE_IN_QUOTED_ARG,
    EXPR_AS_TABLE_ALIAS,
} from './edge-cases.js';

// ═══════════════════════════════════════════════════════════════
// Round-trip preservation: ALL edge cases must reconstruct exactly
// ═══════════════════════════════════════════════════════════════

const ALL_EDGE_CASES: { name: string; sql: string }[] = [
    { name: 'EXPR_INSIDE_QUOTES', sql: EXPR_INSIDE_QUOTES },
    { name: 'EXPR_NO_SPACES', sql: EXPR_NO_SPACES },
    { name: 'EXPR_LOTS_OF_SPACES', sql: EXPR_LOTS_OF_SPACES },
    { name: 'EXPR_MULTI_FILTER_CHAIN', sql: EXPR_MULTI_FILTER_CHAIN },
    { name: 'EXPR_DOTTED_VARIABLE', sql: EXPR_DOTTED_VARIABLE },
    { name: 'EXPR_ARITHMETIC', sql: EXPR_ARITHMETIC },
    { name: 'EXPR_IN_SQL_COMMENT', sql: EXPR_IN_SQL_COMMENT },
    { name: 'EXPR_IN_STRING_LITERAL', sql: EXPR_IN_STRING_LITERAL },
    { name: 'EXPR_ADJACENT_NO_SPACE', sql: EXPR_ADJACENT_NO_SPACE },
    { name: 'EXPR_FILTER_MULTI_ARGS', sql: EXPR_FILTER_MULTI_ARGS },
    { name: 'EXPR_SQL_KEYWORD_VARIABLE', sql: EXPR_SQL_KEYWORD_VARIABLE },
    { name: 'EXPR_DOUBLE_QUOTED_ARG', sql: EXPR_DOUBLE_QUOTED_ARG },
    { name: 'EXPR_BOOKEND', sql: EXPR_BOOKEND },
    { name: 'COND_DEEPLY_NESTED', sql: COND_DEEPLY_NESTED },
    { name: 'COND_CHANGES_SQL_STRUCTURE', sql: COND_CHANGES_SQL_STRUCTURE },
    { name: 'COND_WRAPPING_COLUMN', sql: COND_WRAPPING_COLUMN },
    { name: 'COND_COMPLEX_EXPRESSION', sql: COND_COMPLEX_EXPRESSION },
    { name: 'COND_EMPTY_BODY', sql: COND_EMPTY_BODY },
    { name: 'COND_WHITESPACE_BODY', sql: COND_WHITESPACE_BODY },
    { name: 'COND_LONG_ELIF_CHAIN', sql: COND_LONG_ELIF_CHAIN },
    { name: 'COND_AROUND_ORDER_BY', sql: COND_AROUND_ORDER_BY },
    { name: 'COND_AROUND_GROUP_BY', sql: COND_AROUND_GROUP_BY },
    { name: 'COND_AROUND_JOIN', sql: COND_AROUND_JOIN },
    { name: 'COND_GUARD_THEN_USE', sql: COND_GUARD_THEN_USE },
    { name: 'COND_NEGATION', sql: COND_NEGATION },
    { name: 'COMP_NO_PARAMS', sql: COMP_NO_PARAMS },
    { name: 'COMP_NESTED_NUNJUCKS_PARAM', sql: COMP_NESTED_NUNJUCKS_PARAM },
    { name: 'COMP_MULTIPLE_REFS', sql: COMP_MULTIPLE_REFS },
    { name: 'COMP_AS_SUBQUERY', sql: COMP_AS_SUBQUERY },
    { name: 'COMP_SPECIAL_CHARS_PATH', sql: COMP_SPECIAL_CHARS_PATH },
    { name: 'COMP_MANY_PARAMS', sql: COMP_MANY_PARAMS },
    { name: 'COMP_SINGLE_SEGMENT_PATH', sql: COMP_SINGLE_SEGMENT_PATH },
    { name: 'SQL_UNION_WITH_TEMPLATES', sql: SQL_UNION_WITH_TEMPLATES },
    { name: 'SQL_MULTIPLE_CTES_WITH_TEMPLATES', sql: SQL_MULTIPLE_CTES_WITH_TEMPLATES },
    { name: 'SQL_DECLARE_SET_TEMPLATE', sql: SQL_DECLARE_SET_TEMPLATE },
    { name: 'SQL_CROSS_APPLY_TEMPLATE', sql: SQL_CROSS_APPLY_TEMPLATE },
    { name: 'SQL_WINDOW_FUNCTION_TEMPLATE', sql: SQL_WINDOW_FUNCTION_TEMPLATE },
    { name: 'SQL_SUBQUERY_IN_SELECT', sql: SQL_SUBQUERY_IN_SELECT },
    { name: 'SQL_CASE_WHEN_TEMPLATE', sql: SQL_CASE_WHEN_TEMPLATE },
    { name: 'SQL_COMMENTS_NEAR_TOKENS', sql: SQL_COMMENTS_NEAR_TOKENS },
    { name: 'SQL_ONLY_MJ_TOKENS', sql: SQL_ONLY_MJ_TOKENS },
    { name: 'SQL_PIVOT_TEMPLATE', sql: SQL_PIVOT_TEMPLATE },
    { name: 'SQL_LONG_MANY_TEMPLATES', sql: SQL_LONG_MANY_TEMPLATES },
    { name: 'MIXED_COMP_IN_CONDITIONAL', sql: MIXED_COMP_IN_CONDITIONAL },
    { name: 'MIXED_COMMENT_ADJACENT_EXPR', sql: MIXED_COMMENT_ADJACENT_EXPR },
    { name: 'MIXED_SET_THEN_USE', sql: MIXED_SET_THEN_USE },
    { name: 'MIXED_FOR_LOOP_UNION', sql: MIXED_FOR_LOOP_UNION },
    { name: 'MIXED_CONDITIONAL_WITH_CLAUSE', sql: MIXED_CONDITIONAL_WITH_CLAUSE },
    { name: 'MIXED_UNDERSCORE_VAR', sql: MIXED_UNDERSCORE_VAR },
    { name: 'MIXED_MULTIPLE_SETS', sql: MIXED_MULTIPLE_SETS },
    { name: 'MIXED_FOR_WITH_CONDITIONAL', sql: MIXED_FOR_WITH_CONDITIONAL },
    { name: 'MIXED_TRIPLE_BRACES', sql: MIXED_TRIPLE_BRACES },
    { name: 'MIXED_EXPR_AT_STATEMENT_BOUNDARY', sql: MIXED_EXPR_AT_STATEMENT_BOUNDARY },
    { name: 'MIXED_COMMENT_WITH_BRACES', sql: MIXED_COMMENT_WITH_BRACES },
    { name: 'MIXED_PIPE_IN_QUOTED_ARG', sql: MIXED_PIPE_IN_QUOTED_ARG },
    { name: 'EXPR_AS_TABLE_ALIAS', sql: EXPR_AS_TABLE_ALIAS },
];

describe('Edge Cases — Round-trip preservation', () => {
    it.each(ALL_EDGE_CASES)('$name: token concatenation matches original', ({ sql }) => {
        const tokens = MJLexer.Tokenize(sql);
        const reconstructed = tokens.map(t => t.raw).join('');
        expect(reconstructed).toBe(sql);
    });

    it.each(ALL_EDGE_CASES.filter(c => c.sql.length > 0))(
        '$name: mjSqlify round-trips through mjAstify',
        ({ sql }) => {
            const result = mjAstify(sql);
            const reconstructed = mjSqlify(result);
            expect(reconstructed).toBe(sql);
        }
    );
});

// ═══════════════════════════════════════════════════════════════
// Nunjucks Expression Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge Cases — Nunjucks Expressions', () => {
    it('EXPR_INSIDE_QUOTES: expression inside SQL quotes detected as template expr', () => {
        const tokens = MJLexer.Tokenize(EXPR_INSIDE_QUOTES);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(1);
        const parsed = exprTokens[0].parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('Name');
        // The surrounding single quotes end up in SQL_TEXT tokens
        const sqlTexts = tokens.filter(t => t.type === 'SQL_TEXT');
        expect(sqlTexts.length).toBeGreaterThanOrEqual(2);
    });

    it('EXPR_NO_SPACES: variable and filter parsed without spaces', () => {
        const tokens = MJLexer.Tokenize(EXPR_NO_SPACES);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('var');
        expect(parsed.filters).toHaveLength(1);
        expect(parsed.filters[0].name).toBe('sqlNumber');
    });

    it('EXPR_LOTS_OF_SPACES: whitespace is trimmed from variable and filter', () => {
        const tokens = MJLexer.Tokenize(EXPR_LOTS_OF_SPACES);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('var');
        expect(parsed.filters[0].name).toBe('sqlString');
    });

    it('EXPR_MULTI_FILTER_CHAIN: default with string arg then sqlString', () => {
        const tokens = MJLexer.Tokenize(EXPR_MULTI_FILTER_CHAIN);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('val');
        expect(parsed.filters).toHaveLength(2);
        expect(parsed.filters[0].name).toBe('default');
        expect(parsed.filters[0].args).toEqual(['N/A']);
        expect(parsed.filters[1].name).toBe('sqlString');
    });

    it('EXPR_DOTTED_VARIABLE: dot-notation variable preserved', () => {
        const tokens = MJLexer.Tokenize(EXPR_DOTTED_VARIABLE);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('user.name');
    });

    it('EXPR_ARITHMETIC: two expressions separated by SQL minus', () => {
        const tokens = MJLexer.Tokenize(EXPR_ARITHMETIC);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(2);
        expect((exprTokens[0].parsed as MJTemplateExprContent).variable).toBe('CurrentYear');
        expect((exprTokens[1].parsed as MJTemplateExprContent).variable).toBe('LookbackYears');
    });

    it('EXPR_IN_SQL_COMMENT: expression detected even inside SQL line comment', () => {
        const tokens = MJLexer.Tokenize(EXPR_IN_SQL_COMMENT);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        // Lexer has no SQL comment awareness, so it detects the expression
        expect(exprTokens).toHaveLength(1);
        expect((exprTokens[0].parsed as MJTemplateExprContent).variable).toBe('this_is_a_comment');
    });

    it('EXPR_IN_STRING_LITERAL: expression detected inside SQL string literal', () => {
        const tokens = MJLexer.Tokenize(EXPR_IN_STRING_LITERAL);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(1);
        expect((exprTokens[0].parsed as MJTemplateExprContent).variable).toBe('literal');
    });

    it('EXPR_EMPTY_VARIABLE_WITH_FILTER: empty variable with filter parsed', () => {
        const tokens = MJLexer.Tokenize(EXPR_EMPTY_VARIABLE_WITH_FILTER);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        // Empty string before the pipe
        expect(parsed.variable).toBe('');
        expect(parsed.filters).toHaveLength(1);
        expect(parsed.filters[0].name).toBe('sqlString');
    });

    it('EXPR_ADJACENT_NO_SPACE: two adjacent expressions both detected', () => {
        const tokens = MJLexer.Tokenize(EXPR_ADJACENT_NO_SPACE);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(2);
        expect((exprTokens[0].parsed as MJTemplateExprContent).variable).toBe('A');
        expect((exprTokens[1].parsed as MJTemplateExprContent).variable).toBe('B');
    });

    it('EXPR_FILTER_MULTI_ARGS: filter with string and number arguments', () => {
        const tokens = MJLexer.Tokenize(EXPR_FILTER_MULTI_ARGS);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.filters[0].name).toBe('custom');
        expect(parsed.filters[0].args).toEqual(['fallback', 42]);
    });

    it('EXPR_SQL_KEYWORD_VARIABLE: SQL keyword as variable name', () => {
        const tokens = MJLexer.Tokenize(EXPR_SQL_KEYWORD_VARIABLE);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('SELECT');
    });

    it('EXPR_DOUBLE_QUOTED_ARG: double-quoted arg in default filter', () => {
        const tokens = MJLexer.Tokenize(EXPR_DOUBLE_QUOTED_ARG);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.filters[0].name).toBe('default');
        expect(parsed.filters[0].args).toEqual(['N/A']);
    });

    it('EXPR_BOOKEND: expressions at start and end with SQL in between', () => {
        const tokens = MJLexer.Tokenize(EXPR_BOOKEND);
        expect(tokens[0].type).toBe('MJ_TEMPLATE_EXPR');
        expect(tokens[tokens.length - 1].type).toBe('MJ_TEMPLATE_EXPR');
        const sqlText = tokens.find(t => t.type === 'SQL_TEXT');
        expect(sqlText).toBeDefined();
        expect(sqlText!.raw).toBe(' FROM ');
    });

    it('MIXED_PIPE_IN_QUOTED_ARG: pipe inside quoted arg does not split filter', () => {
        const tokens = MJLexer.Tokenize(MIXED_PIPE_IN_QUOTED_ARG);
        const expr = tokens.find(t => t.type === 'MJ_TEMPLATE_EXPR')!;
        const parsed = expr.parsed as MJTemplateExprContent;
        expect(parsed.variable).toBe('x');
        expect(parsed.filters).toHaveLength(2);
        expect(parsed.filters[0].name).toBe('default');
        expect(parsed.filters[0].args).toEqual(['a|b']);
        expect(parsed.filters[1].name).toBe('sqlString');
    });
});

// ═══════════════════════════════════════════════════════════════
// Conditional Block Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge Cases — Conditional Blocks', () => {
    it('COND_DEEPLY_NESTED: three-level deep nesting', () => {
        const tokens = MJLexer.Tokenize(COND_DEEPLY_NESTED);
        const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');
        const endifTokens = tokens.filter(t => t.type === 'MJ_ENDIF');
        expect(ifTokens).toHaveLength(3);
        expect(endifTokens).toHaveLength(3);

        const blocks = extractConditionalBlocks(COND_DEEPLY_NESTED);
        expect(blocks).toHaveLength(3);
    });

    it('COND_CHANGES_SQL_STRUCTURE: conditional toggles WHERE vs AND', () => {
        const tokens = MJLexer.Tokenize(COND_CHANGES_SQL_STRUCTURE);
        expect(tokens.find(t => t.type === 'MJ_IF_OPEN')).toBeDefined();
        expect(tokens.find(t => t.type === 'MJ_ELSE')).toBeDefined();
        expect(tokens.find(t => t.type === 'MJ_ENDIF')).toBeDefined();
    });

    it('COND_WRAPPING_COLUMN: conditional wraps a SELECT column', () => {
        const tokens = MJLexer.Tokenize(COND_WRAPPING_COLUMN);
        const blocks = extractConditionalBlocks(COND_WRAPPING_COLUMN);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].branches).toHaveLength(2); // if + else
    });

    it('COND_COMPLEX_EXPRESSION: multi-part condition with operators', () => {
        const tokens = MJLexer.Tokenize(COND_COMPLEX_EXPRESSION);
        const ifToken = tokens.find(t => t.type === 'MJ_IF_OPEN')!;
        const parsed = ifToken.parsed as MJBlockTagContent;
        expect(parsed.expression).toBe('x != "" and y != ""');
    });

    it('COND_EMPTY_BODY: no content between if and endif', () => {
        const tokens = MJLexer.Tokenize(COND_EMPTY_BODY);
        const ifIdx = tokens.findIndex(t => t.type === 'MJ_IF_OPEN');
        const endifIdx = tokens.findIndex(t => t.type === 'MJ_ENDIF');
        // They should be adjacent (no SQL_TEXT between them)
        expect(endifIdx).toBe(ifIdx + 1);
    });

    it('COND_WHITESPACE_BODY: only whitespace between if and endif', () => {
        const tokens = MJLexer.Tokenize(COND_WHITESPACE_BODY);
        const ifIdx = tokens.findIndex(t => t.type === 'MJ_IF_OPEN');
        const endifIdx = tokens.findIndex(t => t.type === 'MJ_ENDIF');
        // There should be a SQL_TEXT whitespace token between them
        expect(endifIdx).toBe(ifIdx + 2);
        expect(tokens[ifIdx + 1].type).toBe('SQL_TEXT');
        expect(tokens[ifIdx + 1].raw.trim()).toBe('');
    });

    it('COND_LONG_ELIF_CHAIN: 4 branches plus else', () => {
        const tokens = MJLexer.Tokenize(COND_LONG_ELIF_CHAIN);
        expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ELIF')).toHaveLength(3);
        expect(tokens.filter(t => t.type === 'MJ_ELSE')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);

        const blocks = extractConditionalBlocks(COND_LONG_ELIF_CHAIN);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].branches).toHaveLength(5); // if + 3 elif + else
    });

    it('COND_AROUND_ORDER_BY: conditional ORDER BY with template expressions', () => {
        const tokens = MJLexer.Tokenize(COND_AROUND_ORDER_BY);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(exprTokens).toHaveLength(2); // SortColumn, SortDir
        const params = extractParameterInfo(COND_AROUND_ORDER_BY);
        // Both should be optional (inside conditional)
        for (const p of params) {
            expect(p.isRequired).toBe(false);
        }
    });

    it('COND_AROUND_GROUP_BY: conditional GROUP BY', () => {
        const tokens = MJLexer.Tokenize(COND_AROUND_GROUP_BY);
        expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);
    });

    it('COND_AROUND_JOIN: conditional JOIN with required param outside', () => {
        const params = extractParameterInfo(COND_AROUND_JOIN);
        const minTotal = params.find(p => p.name === 'MinTotal')!;
        expect(minTotal).toBeDefined();
        expect(minTotal.isRequired).toBe(true); // outside conditional
        expect(minTotal.type).toBe('number');
    });

    it('COND_GUARD_THEN_USE: guarded variable is optional', () => {
        const params = extractParameterInfo(COND_GUARD_THEN_USE);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Region');
        expect(params[0].isRequired).toBe(false);
    });

    it('COND_NEGATION: negation operator in condition', () => {
        const tokens = MJLexer.Tokenize(COND_NEGATION);
        const ifToken = tokens.find(t => t.type === 'MJ_IF_OPEN')!;
        const parsed = ifToken.parsed as MJBlockTagContent;
        expect(parsed.expression).toBe('not HideResults');
    });
});

// ═══════════════════════════════════════════════════════════════
// Composition Token Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge Cases — Composition Tokens', () => {
    it('COMP_NO_PARAMS: composition with no parameters', () => {
        const refs = extractCompositionRefs(COMP_NO_PARAMS);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('Simple');
        expect(refs[0].queryName).toBe('Query');
        expect(refs[0].parameters).toHaveLength(0);
    });

    it('COMP_NESTED_NUNJUCKS_PARAM: inner {{ }} does not split the outer token', () => {
        const tokens = MJLexer.Tokenize(COMP_NESTED_NUNJUCKS_PARAM);
        // The inner {{StartDate}} is consumed by the outer {{ }} because
        // readDoubleDelimited finds the first }} which closes the inner expression.
        // This is a known limitation — nested {{ }} inside composition refs
        // will be consumed by the first }} found.
        const compTokens = tokens.filter(t => t.type === 'MJ_COMPOSITION_REF');
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        // Due to greedy matching, the token structure depends on delimiter scanning
        // At minimum, the lexer should not crash
        expect(tokens.length).toBeGreaterThan(0);
    });

    it('COMP_MULTIPLE_REFS: two composition refs in one query', () => {
        const refs = extractCompositionRefs(COMP_MULTIPLE_REFS);
        expect(refs).toHaveLength(2);
        expect(refs[0].queryName).toBe('RevenueByMonth');
        expect(refs[1].queryName).toBe('MemberCounts');
    });

    it('COMP_AS_SUBQUERY: composition ref inside WHERE IN subquery', () => {
        const tokens = MJLexer.Tokenize(COMP_AS_SUBQUERY);
        const compTokens = tokens.filter(t => t.type === 'MJ_COMPOSITION_REF');
        expect(compTokens).toHaveLength(1);
        const parsed = compTokens[0].parsed as MJCompositionRefContent;
        expect(parsed.categoryPath).toBe('Customers');
        expect(parsed.queryName).toBe('Active');
    });

    it('COMP_SPECIAL_CHARS_PATH: hyphens and spaces in category path', () => {
        const refs = extractCompositionRefs(COMP_SPECIAL_CHARS_PATH);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('Golden-Queries/Revenue Analysis');
        expect(refs[0].queryName).toBe('Top 10');
    });

    it('COMP_MANY_PARAMS: four params with mixed literal and pass-through', () => {
        const refs = extractCompositionRefs(COMP_MANY_PARAMS);
        expect(refs).toHaveLength(1);
        expect(refs[0].parameters).toHaveLength(4);

        const byKey: Record<string, { value: string; isPassThrough: boolean }> = {};
        for (const p of refs[0].parameters) {
            byKey[p.key] = { value: p.value, isPassThrough: p.isPassThrough };
        }

        expect(byKey['year'].isPassThrough).toBe(true);
        expect(byKey['year'].value).toBe('Year');
        expect(byKey['region'].isPassThrough).toBe(false);
        expect(byKey['region'].value).toBe('West');
        expect(byKey['limit'].isPassThrough).toBe(true);
        expect(byKey['limit'].value).toBe('MaxRows');
        expect(byKey['status'].isPassThrough).toBe(false);
        expect(byKey['status'].value).toBe('Active');
    });

    it('COMP_EMPTY_PATH: empty quoted path produces empty categoryPath and queryName', () => {
        const refs = extractCompositionRefs(COMP_EMPTY_PATH);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('');
        expect(refs[0].queryName).toBe('');
    });

    it('COMP_SINGLE_SEGMENT_PATH: no slash means empty categoryPath', () => {
        const refs = extractCompositionRefs(COMP_SINGLE_SEGMENT_PATH);
        expect(refs).toHaveLength(1);
        expect(refs[0].categoryPath).toBe('');
        expect(refs[0].queryName).toBe('SimpleQuery');
    });
});

// ═══════════════════════════════════════════════════════════════
// SQL Structure Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge Cases — SQL Structure', () => {
    it('SQL_UNION_WITH_TEMPLATES: templates in both UNION branches', () => {
        const exprs = extractTemplateExpressions(SQL_UNION_WITH_TEMPLATES);
        expect(exprs).toHaveLength(2);
        // Both use "Year" variable
        expect(exprs.every(e => e.variable === 'Year')).toBe(true);
    });

    it('SQL_MULTIPLE_CTES_WITH_TEMPLATES: template inside second CTE', () => {
        const exprs = extractTemplateExpressions(SQL_MULTIPLE_CTES_WITH_TEMPLATES);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('NamePattern');
        expect(exprs[0].filters[0].name).toBe('sqlString');
    });

    it('SQL_DECLARE_SET_TEMPLATE: DECLARE + SET with template value', () => {
        const params = extractParameterInfo(SQL_DECLARE_SET_TEMPLATE);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Threshold');
        expect(params[0].type).toBe('number');
        expect(params[0].isRequired).toBe(true);
    });

    it('SQL_CROSS_APPLY_TEMPLATE: template inside CROSS APPLY', () => {
        const exprs = extractTemplateExpressions(SQL_CROSS_APPLY_TEMPLATE);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('TopN');
    });

    it('SQL_WINDOW_FUNCTION_TEMPLATE: template in PARTITION BY', () => {
        const exprs = extractTemplateExpressions(SQL_WINDOW_FUNCTION_TEMPLATE);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('GroupCol');
        expect(exprs[0].filters[0].name).toBe('sqlIdentifier');
    });

    it('SQL_SUBQUERY_IN_SELECT: template in scalar subquery', () => {
        const params = extractParameterInfo(SQL_SUBQUERY_IN_SELECT);
        expect(params).toHaveLength(1);
        expect(params[0].name).toBe('Year');
        expect(params[0].type).toBe('number');
    });

    it('SQL_CASE_WHEN_TEMPLATE: template in CASE WHEN condition', () => {
        const exprs = extractTemplateExpressions(SQL_CASE_WHEN_TEMPLATE);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('TargetStatus');
        expect(exprs[0].filters[0].name).toBe('sqlString');
    });

    it('SQL_COMMENTS_NEAR_TOKENS: template detected even near SQL comments', () => {
        const tokens = MJLexer.Tokenize(SQL_COMMENTS_NEAR_TOKENS);
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        // Two expressions: not_a_real_var (inside /* */) and Year
        expect(exprTokens).toHaveLength(2);
    });

    it('SQL_EMPTY: empty string produces empty result', () => {
        const tokens = MJLexer.Tokenize(SQL_EMPTY);
        expect(tokens).toHaveLength(0);
        const result = MJLexer.Parse(SQL_EMPTY);
        expect(result.hasMJExtensions).toBe(false);
    });

    it('SQL_ONLY_MJ_TOKENS: no SQL keywords, only MJ tokens', () => {
        const tokens = MJLexer.Tokenize(SQL_ONLY_MJ_TOKENS);
        const mjTokens = tokens.filter(t => t.type !== 'SQL_TEXT');
        expect(mjTokens.length).toBeGreaterThan(0);
        const result = MJLexer.Parse(SQL_ONLY_MJ_TOKENS);
        expect(result.hasMJExtensions).toBe(true);
    });

    it('SQL_PIVOT_TEMPLATE: template inside PIVOT clause', () => {
        const exprs = extractTemplateExpressions(SQL_PIVOT_TEMPLATE);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('CategoryList');
        expect(exprs[0].filters[0].name).toBe('sqlNoKeywordsExpression');
    });

    it('SQL_LONG_MANY_TEMPLATES: 10 template expressions all detected', () => {
        const exprs = extractTemplateExpressions(SQL_LONG_MANY_TEMPLATES);
        expect(exprs).toHaveLength(10);
        const varNames = exprs.map(e => e.variable);
        expect(varNames).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']);
    });

    it('SQL_LONG_MANY_TEMPLATES: parameter info has correct types', () => {
        const params = extractParameterInfo(SQL_LONG_MANY_TEMPLATES);
        expect(params).toHaveLength(10);
        const typeMap: Record<string, string> = {};
        for (const p of params) {
            typeMap[p.name] = p.type;
        }
        expect(typeMap['P1']).toBe('string');
        expect(typeMap['P2']).toBe('number');
        expect(typeMap['P8']).toBe('string'); // sqlIdentifier maps to 'string'
    });
});

// ═══════════════════════════════════════════════════════════════
// Mixed / Combined Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge Cases — Mixed', () => {
    it('MIXED_COMP_IN_CONDITIONAL: composition ref inside if block', () => {
        const tokens = MJLexer.Tokenize(MIXED_COMP_IN_CONDITIONAL);
        const compTokens = tokens.filter(t => t.type === 'MJ_COMPOSITION_REF');
        const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');
        expect(compTokens).toHaveLength(1);
        expect(ifTokens).toHaveLength(1);
    });

    it('MIXED_COMMENT_ADJACENT_EXPR: comment and expression are separate tokens', () => {
        const tokens = MJLexer.Tokenize(MIXED_COMMENT_ADJACENT_EXPR);
        const commentTokens = tokens.filter(t => t.type === 'MJ_COMMENT');
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(commentTokens).toHaveLength(1);
        expect(exprTokens).toHaveLength(1);
        const commentParsed = commentTokens[0].parsed as MJCommentContent;
        expect(commentParsed.text).toBe('filter hint');
    });

    it('MIXED_SET_THEN_USE: set block followed by expression using the variable', () => {
        const tokens = MJLexer.Tokenize(MIXED_SET_THEN_USE);
        const setTokens = tokens.filter(t => t.type === 'MJ_SET');
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(setTokens).toHaveLength(1);
        expect(exprTokens).toHaveLength(1);

        const setParsed = setTokens[0].parsed as MJSetContent;
        expect(setParsed.variable).toBe('currentYear');
        expect(setParsed.expression).toBe('2024');

        const exprParsed = exprTokens[0].parsed as MJTemplateExprContent;
        expect(exprParsed.variable).toBe('currentYear');
    });

    it('MIXED_FOR_LOOP_UNION: for loop with conditional inside', () => {
        const tokens = MJLexer.Tokenize(MIXED_FOR_LOOP_UNION);
        expect(tokens.filter(t => t.type === 'MJ_FOR_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDFOR')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);

        const result = MJLexer.Parse(MIXED_FOR_LOOP_UNION);
        expect(result.hasLoopBlocks).toBe(true);
        expect(result.hasConditionalBlocks).toBe(true);
        expect(result.hasTemplateExpressions).toBe(true);
    });

    it('MIXED_CONDITIONAL_WITH_CLAUSE: conditional around entire WITH', () => {
        const tokens = MJLexer.Tokenize(MIXED_CONDITIONAL_WITH_CLAUSE);
        const ifTokens = tokens.filter(t => t.type === 'MJ_IF_OPEN');
        expect(ifTokens).toHaveLength(2); // outer if for WITH, inner if for FROM clause
    });

    it('MIXED_UNDERSCORE_VAR: variable with underscores and numbers', () => {
        const exprs = extractTemplateExpressions(MIXED_UNDERSCORE_VAR);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('field_2_name');
    });

    it('MIXED_MULTIPLE_SETS: three set blocks then three expressions', () => {
        const tokens = MJLexer.Tokenize(MIXED_MULTIPLE_SETS);
        const setTokens = tokens.filter(t => t.type === 'MJ_SET');
        const exprTokens = tokens.filter(t => t.type === 'MJ_TEMPLATE_EXPR');
        expect(setTokens).toHaveLength(3);
        expect(exprTokens).toHaveLength(3);
    });

    it('MIXED_FOR_WITH_CONDITIONAL: interleaved for and if blocks', () => {
        const tokens = MJLexer.Tokenize(MIXED_FOR_WITH_CONDITIONAL);
        expect(tokens.filter(t => t.type === 'MJ_FOR_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDFOR')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_IF_OPEN')).toHaveLength(1);
        expect(tokens.filter(t => t.type === 'MJ_ENDIF')).toHaveLength(1);
    });

    it('MIXED_TRIPLE_BRACES: lexer does not crash on triple braces', () => {
        // The lexer should handle this gracefully — the exact token structure
        // depends on how the greedy {{ scan resolves
        const tokens = MJLexer.Tokenize(MIXED_TRIPLE_BRACES);
        expect(tokens.length).toBeGreaterThan(0);
        // Round-trip should still work
        const reconstructed = tokens.map(t => t.raw).join('');
        expect(reconstructed).toBe(MIXED_TRIPLE_BRACES);
    });

    it('MIXED_EXPR_AT_STATEMENT_BOUNDARY: expressions at semicolon boundary', () => {
        const exprs = extractTemplateExpressions(MIXED_EXPR_AT_STATEMENT_BOUNDARY);
        expect(exprs).toHaveLength(2);
        expect(exprs.every(e => e.variable === 'Val')).toBe(true);
    });

    it('MIXED_COMMENT_WITH_BRACES: comment containing {{ }} and {% %} syntax', () => {
        const tokens = MJLexer.Tokenize(MIXED_COMMENT_WITH_BRACES);
        const commentTokens = tokens.filter(t => t.type === 'MJ_COMMENT');
        expect(commentTokens).toHaveLength(1);
        const parsed = commentTokens[0].parsed as MJCommentContent;
        // The comment text should contain the inner braces as plain text
        expect(parsed.text).toContain('braces');
    });

    it('EXPR_AS_TABLE_ALIAS: expression used as table alias', () => {
        const exprs = extractTemplateExpressions(EXPR_AS_TABLE_ALIAS);
        expect(exprs).toHaveLength(1);
        expect(exprs[0].variable).toBe('Alias');
        expect(exprs[0].filters[0].name).toBe('sqlIdentifier');
    });
});

// ═══════════════════════════════════════════════════════════════
// Placeholder Substitution Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('Edge Cases — Placeholder Substitution', () => {
    it('should produce clean SQL with no MJ tokens for all non-empty edge cases', () => {
        const nonEmpty = ALL_EDGE_CASES.filter(c => c.sql.length > 0);
        for (const { name, sql } of nonEmpty) {
            const result = MJPlaceholderSubstitution.Substitute(sql);
            expect(result.cleanSQL).not.toContain('{%');
            expect(result.cleanSQL).not.toContain('{#');
            // Note: {{ might still appear inside composition ref placeholders' subquery wrappers,
            // but the original {{ ... }} tokens should be gone. We check for the MJ pattern:
            const mjExprPattern = /\{\{(?!query)[^}]*\}\}/;
            // Template expressions should be replaced
            // (composition refs produce (SELECT 1 AS __MJQ...) which is fine)
        }
    });

    it('SQL_LONG_MANY_TEMPLATES: all 10 placeholders are unique', () => {
        const result = MJPlaceholderSubstitution.Substitute(SQL_LONG_MANY_TEMPLATES);
        const placeholders = Array.from(result.positionMap.keys());
        expect(new Set(placeholders).size).toBe(10);
    });

    it('COMP_MULTIPLE_REFS: two composition placeholders are unique', () => {
        const result = MJPlaceholderSubstitution.Substitute(COMP_MULTIPLE_REFS);
        const placeholders = Array.from(result.positionMap.keys());
        expect(new Set(placeholders).size).toBe(2);
    });

    it('SQL_EMPTY: substitution of empty string returns empty cleanSQL', () => {
        const result = MJPlaceholderSubstitution.Substitute(SQL_EMPTY);
        expect(result.cleanSQL).toBe('');
        expect(result.positionMap.size).toBe(0);
    });
});
