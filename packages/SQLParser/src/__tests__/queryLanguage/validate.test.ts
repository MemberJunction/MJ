/**
 * QueryTemplate.Validate: every save-time rule of the MJ Query language, one failing and one
 * passing case per diagnostic code.
 */
import { describe, it, expect } from 'vitest';
import { QueryTemplate } from '../../template/queryTemplate.js';
import { MJQueryDiagnosticCodes } from '../../common/diagnosticCodes.js';
import { MJ_QUERY_CONTEXT_TOKENS } from '../../template/queryLanguage.js';
import type { CompositionTarget, QueryTemplateValidateOptions } from '../../template/validationTypes.js';
import { Codes, SS } from './helpers.js';

/** A small catalog of composable queries. */
const CATALOG: Readonly<Record<string, CompositionTarget>> = {
    'sales/top customers': { Exists: true, Reusable: true, Parameters: [{ Name: 'Region', IsRequired: true }, { Name: 'Limit', IsRequired: false }] },
    'sales/private': { Exists: true, Reusable: false, Parameters: [] },
    'loop/a': { Exists: true, Reusable: true, Parameters: [], Compositions: ['Loop/B'] },
    'loop/b': { Exists: true, Reusable: true, Parameters: [], Compositions: ['Loop/A'] },
    'self/back': { Exists: true, Reusable: true, Parameters: [], Compositions: ['Me/Outer'] },
    'plain/list': { Exists: true, Reusable: true, Parameters: [] },
    'plain/optional': { Exists: true, Reusable: true, Parameters: [{ Name: 'status', IsRequired: false }] },
    'mj/demos/active users': { Exists: true, Reusable: true, Parameters: [] },
    // Found by a partial path: the resolver reports the query's own full path.
    'demos/active users': { Exists: true, Reusable: true, Parameters: [], FullPath: 'MJ/Demos/Active Users' },
};

const RESOLVE: QueryTemplateValidateOptions = {
    ResolveComposition: path => CATALOG[path.toLowerCase()] ?? null,
    QueryPath: 'Me/Outer',
};

interface RuleCase {
    readonly Code: string;
    readonly Bad: string;
    readonly Good: string;
    readonly Options?: QueryTemplateValidateOptions;
}

const declared = (Name: string, Type: string, IsServerSet = false): QueryTemplateValidateOptions => ({
    DeclaredParameters: [{ Name, Type, IsServerSet }],
});

const CASES: readonly RuleCase[] = [
    { Code: 'MJQ_UNCLOSED_TAG', Bad: 'SELECT {{ a | sqlNumber FROM t', Good: 'SELECT {{ a | sqlNumber }} FROM t' },
    { Code: 'MJQ_TAG_IN_STRING_LITERAL', Bad: "SELECT 1 FROM t WHERE n LIKE '%{{ q | sqlString }}%'", Good: 'SELECT 1 FROM t WHERE n LIKE {{ q | sqlLikeContains }}' },
    { Code: 'MJQ_TAG_IN_QUOTED_IDENTIFIER', Bad: 'SELECT [{{ c | sqlString }}] FROM t', Good: 'SELECT {{ c | sqlIdentifier }} FROM t' },
    { Code: 'MJQ_EXPRESSION_IN_COMMENT', Bad: 'SELECT 1 -- by {{ u | sqlString }}\nFROM t', Good: 'SELECT 1 {# by u #}\nFROM t' },
    { Code: 'MJQ_UNCLOSED_BLOCK', Bad: 'SELECT 1 {% if a %} WHERE x = 1', Good: 'SELECT 1 {% if a %} WHERE x = 1{% endif %}' },
    { Code: 'MJQ_UNEXPECTED_TAG', Bad: 'SELECT 1 {% endif %}', Good: 'SELECT 1' },
    { Code: 'MJQ_SYNTAX', Bad: 'SELECT 1 {% if a > %}x{% endif %}', Good: 'SELECT 1 {% if a > 1 %}x{% endif %}' },
    { Code: 'MJQ_UNSUPPORTED_TAG', Bad: '{% include "x.sql" %}SELECT 1', Good: 'SELECT 1' },
    { Code: 'MJQ_FUNCTION_CALL', Bad: 'SELECT 1 {% if range(3) %}x{% endif %}', Good: 'SELECT 1 {% if a %}x{% endif %}' },
    { Code: 'MJQ_SUBSCRIPT', Bad: 'SELECT {{ a[0] | sqlString }}', Good: 'SELECT {{ a | sqlString }}' },
    { Code: 'MJQ_INLINE_IF', Bad: "SELECT {{ 'x' if a else 'y' }}", Good: "SELECT {% if a %}'x'{% else %}'y'{% endif %}" },
    { Code: 'MJQ_MEMBER_ACCESS', Bad: 'SELECT 1 {% if a.length > 0 %}x{% endif %}', Good: 'SELECT 1 {% if a %}x{% endif %}' },
    { Code: 'MJQ_UNSUPPORTED_OPERATOR', Bad: "SELECT 1 {% if a in ['x'] %}x{% endif %}", Good: "SELECT 1 {% if a == 'x' %}x{% endif %}" },
    { Code: 'MJQ_ARITHMETIC_IN_HOLE', Bad: 'SELECT {{ Year - 1 }}', Good: 'SELECT {{ Year | sqlNumber }} - 1' },
    { Code: 'MJQ_HOLE_NOT_A_VALUE', Bad: "SELECT {{ 'fixed' }}", Good: "SELECT 'fixed'" },
    { Code: 'MJQ_UNKNOWN_FILTER', Bad: 'SELECT {{ a | safe }}', Good: 'SELECT {{ a | sqlString }}' },
    { Code: 'MJQ_DEFAULT_NOT_LITERAL', Bad: 'SELECT {{ a | default(b) | sqlString }}', Good: "SELECT {{ a | default('x') | sqlString }}" },
    { Code: 'MJQ_LOOP_OUTSIDE_FOR', Bad: 'SELECT 1 {% if loop.first %}x{% endif %}', Good: 'SELECT 1 {% for s in xs %}{% if loop.first %}x{% endif %}{% endfor %}' },
    { Code: 'MJQ_FOR_ITERABLE', Bad: 'SELECT 1 {% for s in xs %}{{ s | sqlString }}{% endfor %}', Good: 'SELECT 1 {% for s in items %}{{ s | sqlString }}{% endfor %}', Options: declared('xs', 'string') },
    { Code: 'MJQ_UNFILTERED_VALUE', Bad: 'SELECT 1 FROM t WHERE r = {{ region }}', Good: 'SELECT 1 FROM t WHERE r = {{ region | sqlString }}', Options: declared('region', 'string') },
    { Code: 'MJQ_UNFILTERED_UNTYPED', Bad: 'SELECT 1 FROM t WHERE r = {{ region }}', Good: 'SELECT 1 FROM t WHERE n > {{ n }}', Options: declared('n', 'number') },
    { Code: 'MJQ_UNKNOWN_CONTEXT_TOKEN', Bad: 'SELECT {{ Context.TenantID | sqlString }}', Good: 'SELECT {{ Context.UserID | sqlString }}' },
    { Code: 'MJQ_FILTER_TYPE_MISMATCH', Bad: 'SELECT {{ a | sqlNumber }}', Good: 'SELECT {{ a | sqlString }}', Options: declared('a', 'string') },
    { Code: 'MJQ_PARAMETER_TYPE_CONFLICT', Bad: 'SELECT {{ a | sqlString }}, {{ a | sqlNumber }}', Good: 'SELECT {{ a | sqlString }}, {{ a | sqlLikeBegins }}' },
    { Code: 'MJQ_COMPOSITION_MALFORMED', Bad: 'SELECT * FROM {{query:Sales/Top}} x', Good: 'SELECT * FROM {{query:"Plain/List"}} x', Options: RESOLVE },
    { Code: 'MJQ_COMPOSITION_POSITION', Bad: 'SELECT {{query:"Plain/List"}}', Good: 'SELECT * FROM {{query:"Plain/List"}} x', Options: RESOLVE },
    { Code: 'MJQ_COMPOSITION_NOT_FOUND', Bad: 'SELECT * FROM {{query:"Top Customers(Region=\'W\')"}} x', Good: 'SELECT * FROM {{query:"Sales/Top Customers(Region=\'W\')"}} x', Options: RESOLVE },
    { Code: 'MJQ_COMPOSITION_PARTIAL_PATH', Bad: 'SELECT * FROM {{query:"Demos/Active Users"}} x', Good: 'SELECT * FROM {{query:"MJ/Demos/Active Users"}} x', Options: RESOLVE },
    { Code: 'MJQ_COMPOSITION_NOT_REUSABLE', Bad: 'SELECT * FROM {{query:"Sales/Private"}} x', Good: 'SELECT * FROM {{query:"Plain/List"}} x', Options: RESOLVE },
    { Code: 'MJQ_COMPOSITION_MISSING_ARGUMENT', Bad: 'SELECT * FROM {{query:"Sales/Top Customers"}} x', Good: 'SELECT * FROM {{query:"Sales/Top Customers(Region=\'W\')"}} x', Options: RESOLVE },
    {
        Code: 'MJQ_COMPOSITION_IMPLICIT_ARGUMENT',
        Bad: 'SELECT * FROM {{query:"Plain/Optional"}} x WHERE x.s = {{ status | sqlString }}',
        Good: 'SELECT * FROM {{query:"Plain/Optional(status=status)"}} x WHERE x.s = {{ status | sqlString }}',
        Options: RESOLVE,
    },
    { Code: 'MJQ_COMPOSITION_UNKNOWN_ARGUMENT', Bad: 'SELECT * FROM {{query:"Plain/List(Top=5)"}} x', Good: 'SELECT * FROM {{query:"Plain/List"}} x', Options: RESOLVE },
    {
        Code: 'MJQ_COMPOSITION_DUPLICATE_ARGUMENT',
        Bad: "SELECT * FROM {{query:\"Sales/Top Customers(Region='W', region='E')\"}} x",
        Good: "SELECT * FROM {{query:\"Sales/Top Customers(Region='W', Limit=5 * 2)\"}} x",
        Options: RESOLVE,
    },
    { Code: 'MJQ_COMPOSITION_CYCLE', Bad: 'SELECT * FROM {{query:"Loop/A"}} x', Good: 'SELECT * FROM {{query:"Plain/List"}} x', Options: RESOLVE },
    { Code: 'MJQ_COMPOSITION_UNCHECKED', Bad: 'SELECT * FROM {{query:"Plain/List"}} x', Good: 'SELECT * FROM {{query:"Plain/List"}} x', Options: RESOLVE },
];

function validate(sql: string, options: QueryTemplateValidateOptions = {}) {
    return QueryTemplate.Parse(sql, SS).Validate(options);
}

describe('QueryTemplate.Validate: one case per rule', () => {
    it.each(CASES)('$Code: reported for the bad case', ({ Code, Bad, Options }) => {
        const options = Code === 'MJQ_COMPOSITION_UNCHECKED' ? {} : Options;
        expect(Codes(validate(Bad, options).Diagnostics)).toContain(Code);
    });

    it.each(CASES)('$Code: not reported for the good case', ({ Code, Good, Options }) => {
        const result = validate(Good, Options);
        expect(Codes(result.Diagnostics)).not.toContain(Code);
        expect(result.Diagnostics.filter(d => d.Severity === 'Error')).toEqual([]);
    });

    it('covers every code Validate can report', () => {
        const covered = new Set(CASES.map(c => c.Code));
        const validateCodes = Object.values(MJQueryDiagnosticCodes).filter(c => !c.startsWith('MJQ_DOC_'));
        expect(validateCodes.filter(c => !covered.has(c))).toEqual([]);
    });

    it('gives every diagnostic a span, a message and a fix hint', () => {
        for (const { Bad, Options } of CASES) {
            for (const d of validate(Bad, Options).Diagnostics) {
                expect(d.Span.End).toBeGreaterThanOrEqual(d.Span.Start);
                expect(d.Message.length).toBeGreaterThan(0);
                if (d.Code !== 'MJQ_SYNTAX') expect(d.FixHint, d.Code).not.toBeNull();
            }
        }
    });
});

describe('QueryTemplate.Validate: details', () => {
    it('reports a tag inside a SQL comment as Info only, and ignores it', () => {
        const result = validate('-- usage: {{ x }} and {{query:"Nope/Missing"}}\nSELECT 1 FROM t', RESOLVE);
        expect(result.Diagnostics.map(d => [d.Code, d.Severity])).toEqual([['MJQ_EXPRESSION_IN_COMMENT', 'Info']]);
        expect(result.Value.IsValid).toBe(true);
    });

    it('reports validity and counts', () => {
        expect(validate('SELECT {{ a | sqlString }}').Value).toEqual({ IsValid: true, ErrorCount: 0, WarningCount: 0 });
        expect(validate('SELECT {{ a | safe }}, {{ b }}').Value).toEqual({ IsValid: false, ErrorCount: 1, WarningCount: 2 });
    });

    it('allows unfiltered numbers, booleans and server-set values', () => {
        expect(Codes(validate('SELECT {{ n }}, {{ b }}', { DeclaredParameters: [{ Name: 'n', Type: 'number' }, { Name: 'b', Type: 'boolean' }] }).Diagnostics)).toEqual([]);
        expect(Codes(validate('SELECT * FROM {{ SchemaName }}.{{ BaseView }}', {
            DeclaredParameters: [{ Name: 'SchemaName', Type: 'string', IsServerSet: true }, { Name: 'BaseView', Type: 'string', IsServerSet: true }],
        }).Diagnostics)).toEqual([]);
    });

    it.each(['array', 'date'])('refuses an unfiltered %s parameter', type => {
        expect(Codes(validate('SELECT {{ v }}', declared('v', type)).Diagnostics)).toEqual(['MJQ_UNFILTERED_VALUE']);
    });

    it('refuses an unfiltered Context token and a loop variable', () => {
        expect(Codes(validate('SELECT {{ Context.UserEmail }}').Diagnostics)).toEqual(['MJQ_UNFILTERED_VALUE']);
        expect(Codes(validate('SELECT {% for s in xs %}{{ s }}{% endfor %}').Diagnostics)).toEqual(['MJQ_UNFILTERED_VALUE']);
    });

    it('accepts loop members and numeric set variables unfiltered', () => {
        expect(Codes(validate('{% set p = y - 1 %}SELECT {{ p }} {% for s in xs %}{{ loop.index }}{{ s | sqlNumber }}{% endfor %} {{ y | sqlNumber }}').Diagnostics)).toEqual([]);
        expect(Codes(validate("{% set p = 'x' %}SELECT {{ p }}").Diagnostics)).toEqual([]);
        expect(Codes(validate("{% set p = name %}SELECT {{ p }}, {{ name | sqlString }}").Diagnostics)).toEqual(['MJQ_UNFILTERED_VALUE']);
        expect(Codes(validate("{% set p = name + '' %}SELECT {{ p }}").Diagnostics)).toEqual(['MJQ_UNFILTERED_VALUE']);
    });

    it('takes the type from inferred filters when nothing is declared', () => {
        expect(Codes(validate('SELECT {{ a | sqlString }} WHERE x = {{ a }}').Diagnostics)).toEqual(['MJQ_UNFILTERED_VALUE']);
    });

    it('checks the filters of Context tokens', () => {
        expect(Codes(validate('SELECT {{ Context.Today | sqlDate }}, {{ Context.Now | sqlString }}').Diagnostics)).toEqual([]);
        expect(Codes(validate('SELECT {{ Context.UserID | sqlNumber }}').Diagnostics)).toEqual(['MJQ_FILTER_TYPE_MISMATCH']);
    });

    it('accepts every one of the nine Context tokens, and only those', () => {
        const sql = `SELECT ${MJ_QUERY_CONTEXT_TOKENS.map(t => `{{ ${t} | sqlString }}`).join(', ')}`;
        expect(Codes(validate(sql).Diagnostics)).toEqual([]);
        expect(Codes(validate('SELECT 1 {% if Context %}x{% endif %}').Diagnostics)).toEqual(['MJQ_UNKNOWN_CONTEXT_TOKEN']);
        expect(Codes(validate('SELECT {{ Context.UserID | sqlString }}', { ContextTokens: ['Context.UserName'] }).Diagnostics)).toEqual(['MJQ_UNKNOWN_CONTEXT_TOKEN']);
    });

    it('reports an unknown loop member', () => {
        expect(Codes(validate('SELECT {% for s in xs %}{% if loop.middle %}x{% endif %}{{ s | sqlString }}{% endfor %}').Diagnostics)).toEqual(['MJQ_LOOP_OUTSIDE_FOR']);
    });

    it('reports an unknown filter in a condition', () => {
        expect(Codes(validate('SELECT 1 {% if a | length %}x{% endif %}').Diagnostics)).toEqual(['MJQ_UNKNOWN_FILTER']);
    });

    it('downgrades the two existing-query rules to warnings in Refresh mode', () => {
        const mismatch = validate('SELECT {{ a | sqlNumber }}', { ...declared('a', 'string'), Mode: 'Refresh' });
        expect(mismatch.Diagnostics.map(d => [d.Code, d.Severity])).toEqual([['MJQ_FILTER_TYPE_MISMATCH', 'Warning']]);
        expect(mismatch.Value.IsValid).toBe(true);
        const implicit = validate('SELECT * FROM {{query:"Plain/Optional"}} x WHERE x.s = {{ status | sqlString }}', { ...RESOLVE, Mode: 'Refresh' });
        expect(implicit.Diagnostics.map(d => [d.Code, d.Severity])).toEqual([['MJQ_COMPOSITION_IMPLICIT_ARGUMENT', 'Warning']]);
    });

    it('a partial composition path: an error at save naming the full path, a warning on refresh', () => {
        const sql = 'SELECT * FROM {{query:"Demos/Active Users"}} x';
        const save = validate(sql, RESOLVE);
        expect(save.Diagnostics.map(d => [d.Code, d.Severity])).toEqual([['MJQ_COMPOSITION_PARTIAL_PATH', 'Error']]);
        expect(save.Diagnostics[0].FixHint).toContain('{{query:"MJ/Demos/Active Users"}}');
        const refresh = validate(sql, { ...RESOLVE, Mode: 'Refresh' });
        expect(refresh.Diagnostics.map(d => [d.Code, d.Severity])).toEqual([['MJQ_COMPOSITION_PARTIAL_PATH', 'Warning']]);
        expect(refresh.Value.IsValid).toBe(true);
    });

    it('counts declared outer parameters for the implicit-argument rule', () => {
        const result = validate('SELECT * FROM {{query:"Plain/Optional"}} x', { ...RESOLVE, ...declared('Status', 'string') });
        expect(Codes(result.Diagnostics)).toEqual(['MJQ_COMPOSITION_IMPLICIT_ARGUMENT']);
    });

    it('finds a cycle back to the query being validated', () => {
        const result = validate('SELECT * FROM {{query:"Self/Back"}} x', RESOLVE);
        expect(Codes(result.Diagnostics)).toEqual(['MJQ_COMPOSITION_CYCLE']);
        expect(result.Diagnostics[0].Message).toContain('Self/Back → Me/Outer');
        expect(Codes(validate('SELECT * FROM {{query:"Me/Outer"}} x', { ...RESOLVE, ResolveComposition: () => ({ Exists: true, Reusable: true, Parameters: [] }) }).Diagnostics))
            .toEqual(['MJQ_COMPOSITION_CYCLE']);
    });

    it('is incomplete without a resolver when there are compositions', () => {
        expect(validate('SELECT * FROM {{query:"Plain/List"}} x').Complete).toBe(false);
        expect(validate('SELECT * FROM {{query:"Plain/List"}} x', RESOLVE).Complete).toBe(true);
        expect(validate('SELECT 1').Complete).toBe(true);
    });

    it('sorts diagnostics by position', () => {
        const starts = validate("SELECT {{ a | safe }}, '{{ b }}', {{ c - 1 }}").Diagnostics.map(d => d.Span.Start);
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });
});

describe('composition position across {% if %} branches', () => {
    const positionErrors = (sql: string): string[] =>
        Codes(QueryTemplate.Parse(sql, SS).Validate(RESOLVE).Diagnostics).filter(c => c === MJQueryDiagnosticCodes.CompositionPosition);

    it('accepts a composition in each branch of an if / else after FROM', () => {
        expect(positionErrors('SELECT * FROM {% if a %}{{query:"Plain/List"}}{% else %}{{query:"Plain/List"}}{% endif %} x')).toEqual([]);
    });

    it('accepts a composition in an elif branch after JOIN, with a nested if in the branch before it', () => {
        const sql = 'SELECT * FROM t JOIN {% if a %}{% if b %}{{query:"Plain/List"}}{% endif %}{% elif c %}{{query:"Plain/List"}}{% endif %} x ON 1 = 1';
        expect(positionErrors(sql)).toEqual([]);
    });

    it('still refuses a composition in an else branch that is not a table source', () => {
        expect(positionErrors('SELECT {% if a %}1{% else %}{{query:"Plain/List"}}{% endif %}')).toHaveLength(1);
    });
});
