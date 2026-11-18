/**
 * QueryTemplate.Parse: the template tree, Parameters(), ContextTokens() and CompositionReferences().
 */
import { describe, it, expect } from 'vitest';
import { QueryTemplate } from '../../template/queryTemplate.js';
import type { TemplateParameter } from '../../template/parameterAnalysis.js';
import { Codes, ExpectLinearTime, PG, SS, TIMING_OPTIONS } from './helpers.js';

function parameters(sql: string): TemplateParameter[] {
    return [...QueryTemplate.Parse(sql, SS).Parameters().Value];
}

function byName(sql: string): Record<string, { Type: string; Required: boolean; Filters: string }> {
    const result: Record<string, { Type: string; Required: boolean; Filters: string }> = {};
    for (const p of parameters(sql)) result[p.Name] = { Type: p.InferredType, Required: p.IsRequired, Filters: p.Filters.join(',') };
    return result;
}

describe('QueryTemplate: the tree', () => {
    it('builds SqlText, Expression, If, For, Set, Composition and DocComment nodes', () => {
        const template = QueryTemplate.Parse(
            '{# doc #}{% set y = 1 %}SELECT {{ a | sqlNumber }} FROM {{query:"Cat/Q"}} q {% if b %}WHERE x{% elif c %}WHERE y{% else %}WHERE z{% endif %}{% for i in items %}{{ i | sqlString }}{% endfor %}',
            SS,
        );
        expect(template.Nodes.map(n => n.Kind)).toEqual(['DocComment', 'Set', 'SqlText', 'Expression', 'SqlText', 'Composition', 'SqlText', 'If', 'For']);
        const ifNode = template.Nodes[7];
        expect(ifNode.Kind === 'If' && [ifNode.Branches.map(b => b.Kind), ifNode.Else !== null, ifNode.Closed]).toEqual([['If', 'ElseIf'], true, true]);
        const forNode = template.Nodes[8];
        expect(forNode.Kind === 'For' && [forNode.LoopVariable, forNode.Body.map(n => n.Kind)]).toEqual(['i', ['Expression']]);
        expect(template.Diagnostics).toHaveLength(0);
        expect(template.IsComplete).toBe(true);
    });

    it('nests blocks', () => {
        const template = QueryTemplate.Parse('{% if a %}{% for x in xs %}{% if b %}1{% endif %}{% endfor %}{% endif %}', SS);
        const outer = template.Nodes[0];
        expect(outer.Kind === 'If' && outer.Branches[0].Body[0].Kind).toBe('For');
    });

    it('accepts elseif as elif, and whitespace control', () => {
        const template = QueryTemplate.Parse('{%- if a -%}1{%- elseif b -%}2{%- endif -%}', SS);
        const node = template.Nodes[0];
        expect(node.Kind === 'If' && node.Branches.length).toBe(2);
        expect(template.Diagnostics).toHaveLength(0);
    });

    it('closes an unclosed block at the end and reports it', () => {
        const template = QueryTemplate.Parse('SELECT 1 {% if a %} WHERE x', SS);
        expect(Codes(template.Diagnostics)).toEqual(['MJQ_UNCLOSED_BLOCK']);
        const node = template.Nodes[1];
        expect(node.Kind === 'If' && node.Closed).toBe(false);
        expect(template.IsComplete).toBe(false);
    });

    it('reports end and else tags with no block', () => {
        expect(Codes(QueryTemplate.Parse('{% endif %}', SS).Diagnostics)).toEqual(['MJQ_UNEXPECTED_TAG']);
        expect(Codes(QueryTemplate.Parse('{% else %}', SS).Diagnostics)).toEqual(['MJQ_UNEXPECTED_TAG']);
        expect(Codes(QueryTemplate.Parse('{% elif a %}', SS).Diagnostics)).toEqual(['MJQ_UNEXPECTED_TAG']);
        expect(Codes(QueryTemplate.Parse('{% if a %}{% else %}{% else %}{% endif %}', SS).Diagnostics)).toEqual(['MJQ_UNEXPECTED_TAG']);
    });

    it('reports a block left open inside another', () => {
        const template = QueryTemplate.Parse('{% if a %}{% for x in xs %}1{% endif %}', SS);
        expect(Codes(template.Diagnostics)).toEqual(['MJQ_UNCLOSED_BLOCK']);
    });

    it.each(['macro m()', 'include "x"', 'import "x" as y', 'extends "b"', 'block b', 'call m()', 'filter upper', 'raw', 'set x'])(
        'refuses {%% %s %%} as an Unknown node',
        tag => {
            const template = QueryTemplate.Parse(`SELECT 1 {% ${tag} %}`, SS);
            expect(Codes(template.Diagnostics)).toContain('MJQ_UNSUPPORTED_TAG');
            expect(template.Nodes.some(n => n.Kind === 'Unknown')).toBe(true);
            expect(template.IsComplete).toBe(false);
        },
    );

    it('refuses for … else and for over two variables', () => {
        expect(Codes(QueryTemplate.Parse('{% for x in xs %}1{% else %}2{% endfor %}', SS).Diagnostics)).toContain('MJQ_UNSUPPORTED_TAG');
        expect(Codes(QueryTemplate.Parse('{% for k, v in xs %}1{% endfor %}', SS).Diagnostics)).toContain('MJQ_FOR_ITERABLE');
    });

    it('refuses blocks nested past the limit without growing the stack', TIMING_OPTIONS, () => {
        const deep = '{% if a %}'.repeat(5000) + 'x' + '{% endif %}'.repeat(5000);
        const template = QueryTemplate.Parse(deep, SS);
        expect(Codes(template.Diagnostics)).toEqual(['MJQ_SYNTAX']);
        expect(() => template.Validate()).not.toThrow();
        expect(() => template.BranchVariants()).not.toThrow();
        ExpectLinearTime([2_000, 4_000, 8_000], n => {
            const text = '{% if a %}'.repeat(n) + 'x' + '{% endif %}'.repeat(n);
            return () => QueryTemplate.Parse(text, SS).Validate();
        });
    });

    it('stays linear on many unclosed openers', TIMING_OPTIONS, () => {
        ExpectLinearTime([10_000, 20_000, 40_000], n => {
            const text = 'SELECT {% if a '.repeat(n) + '{{ b '.repeat(n);
            return () => QueryTemplate.Parse(text, SS).Parameters();
        });
    });

    it('stays linear on many sequential blocks', TIMING_OPTIONS, () => {
        ExpectLinearTime([1_000, 2_000, 4_000], n => {
            const text = 'SELECT 1 WHERE 1=1 ' + Array.from({ length: n }, (_, i) => `{% if p${i} %} AND c = {{ p${i} | sqlString }}{% endif %}`).join(' ');
            return () => {
                const template = QueryTemplate.Parse(text, SS);
                template.Validate();
                template.BranchVariants();
            };
        });
    });
});

describe('QueryTemplate.Parameters', () => {
    it('infers the type from the last SQL filter', () => {
        expect(byName('SELECT {{ a | sqlString }}, {{ b | sqlNumber }}, {{ c | sqlDate }}, {{ d | sqlBoolean }}, {{ e | sqlIn }}, {{ f | sqlLikeContains }}, {{ g }}')).toEqual({
            a: { Type: 'string', Required: true, Filters: 'sqlString' },
            b: { Type: 'number', Required: true, Filters: 'sqlNumber' },
            c: { Type: 'date', Required: true, Filters: 'sqlDate' },
            d: { Type: 'boolean', Required: true, Filters: 'sqlBoolean' },
            e: { Type: 'array', Required: true, Filters: 'sqlIn' },
            f: { Type: 'string', Required: true, Filters: 'sqlLikeContains' },
            g: { Type: 'unknown', Required: true, Filters: '' },
        });
    });

    it('is required when one use sits outside every conditional', () => {
        expect(byName('SELECT 1 WHERE a = {{ x | sqlString }} {% if x %}AND b = {{ x | sqlString }}{% endif %}').x.Required).toBe(true);
    });

    it('is optional when every use sits inside conditionals', () => {
        expect(byName('SELECT 1 {% if x %}WHERE a = {{ x | sqlString }}{% endif %}').x.Required).toBe(false);
        expect(byName('SELECT 1 {% if y %}{% if z %}WHERE a = {{ x | sqlString }}{% endif %}{% endif %}').x.Required).toBe(false);
    });

    it('is optional when used only in an if condition', () => {
        expect(byName('SELECT 1 {% if flag %}WHERE a = 1{% endif %}')).toEqual({ flag: { Type: 'unknown', Required: false, Filters: '' } });
        expect(byName('SELECT 1 {% if a %}1{% elif b > 2 %}2{% endif %}').b.Required).toBe(false);
    });

    it('is optional when its outside use has a default', () => {
        const [p] = parameters("SELECT {{ x | default('US') | sqlString }}");
        expect([p.IsRequired, p.DefaultValue, p.Filters]).toEqual([false, 'US', ['default', 'sqlString']]);
    });

    it('treats a for body as not conditional', () => {
        expect(byName('SELECT 1 {% for s in xs %}{{ y | sqlString }}{% endfor %}').y.Required).toBe(true);
    });

    it('registers a loop iterable as an array and excludes the loop variable and loop members', () => {
        const result = byName('SELECT 1 WHERE {% for s in statuses %}{% if not loop.first %} OR {% endif %}x = {{ s | sqlString }}{% endfor %}');
        expect(result).toEqual({ statuses: { Type: 'array', Required: true, Filters: '' } });
    });

    it('excludes {% set %} names and counts the names their values read', () => {
        expect(byName('{% set Prior = TargetYear - 1 %}SELECT {{ Prior }}, {{ TargetYear | sqlNumber }}')).toEqual({
            TargetYear: { Type: 'number', Required: true, Filters: 'sqlNumber' },
        });
    });

    it('counts composition arguments as uses', () => {
        const result = byName('SELECT * FROM {{query:"Cat/Q(Region=region, Since=Context.Today)"}} q {% if x %}{% endif %}');
        expect(result.region).toEqual({ Type: 'unknown', Required: true, Filters: '' });
    });

    it('lists every use with its span, role and context', () => {
        const sql = "SELECT 1 {% if x %}WHERE a = {{ x | sqlString }}{% endif %} AND b LIKE '%{{ x }}%'";
        const [p] = parameters(sql);
        expect(p.Uses.map(u => [u.Role, sql.substring(u.Span.Start, u.Span.End), u.InsideConditional, u.SqlContext])).toEqual([
            ['Condition', 'x', true, 'Code'],
            ['Expression', 'x', true, 'Code'],
            ['Expression', 'x', false, 'StringLiteral'],
        ]);
    });

    it('ignores tags mentioned inside SQL comments', () => {
        const sql = '/* PARAMETERS\n   {{ agentRunID }} — the run\n*/\n-- {% if x %}\nSELECT {{ maxDepth | sqlNumber }}';
        expect(byName(sql)).toEqual({ maxDepth: { Type: 'number', Required: true, Filters: 'sqlNumber' } });
        const template = QueryTemplate.Parse(sql, SS);
        expect(template.BranchVariants().Value.Variants).toHaveLength(1);
        expect(template.IsComplete).toBe(true);
    });

    it('reports two uses implying different types', () => {
        const analysis = QueryTemplate.Parse('SELECT {{ a | sqlString }}, {{ a | sqlNumber }}', SS).Parameters();
        expect(analysis.Value[0].InferredType).toBe('string');
        expect(Codes(analysis.Diagnostics)).toEqual(['MJQ_PARAMETER_TYPE_CONFLICT']);
    });

    it('says it is incomplete when a construct could not be read', () => {
        expect(QueryTemplate.Parse('SELECT {{ f(a) }}', SS).Parameters().Complete).toBe(false);
        expect(QueryTemplate.Parse('SELECT {{ a | sqlNumber }}', SS).Parameters().Complete).toBe(true);
    });

    it('memoizes', () => {
        const template = QueryTemplate.Parse('SELECT {{ a | sqlNumber }}', SS);
        expect(template.Parameters()).toBe(template.Parameters());
    });
});

describe('QueryTemplate.ContextTokens', () => {
    it('lists Context tokens with whether each is known', () => {
        const tokens = QueryTemplate.Parse('SELECT 1 WHERE o = {{ Context.UserID | sqlString }} {% if Context.Bogus %}{% endif %} AND d > {{ Context.UserID | sqlString }}', SS).ContextTokens().Value;
        expect(tokens.map(t => [t.FullName, t.IsKnown, t.Uses.length])).toEqual([['Context.UserID', true, 2], ['Context.Bogus', false, 1]]);
    });

    it('never reports a Context token as a parameter', () => {
        expect(parameters('SELECT {{ Context.Today | sqlDate }}')).toHaveLength(0);
    });
});

describe('QueryTemplate.CompositionReferences', () => {
    it('reads the full path, name and arguments', () => {
        const [ref] = QueryTemplate.Parse(`SELECT * FROM {{query:"Sales/Reports/Top Customers(Region=region, Limit=10 * 2, Label='x')"}} t`, SS).CompositionReferences().Value;
        expect([ref.FullPath, ref.CategoryPath, ref.Name]).toEqual(['Sales/Reports/Top Customers', 'Sales/Reports', 'Top Customers']);
        expect(ref.Arguments.map(a => [a.Name, a.IsStatic, a.ReferencedNames])).toEqual([
            ['Region', false, ['region']], ['Limit', true, []], ['Label', true, []],
        ]);
        expect([ref.InTablePosition, ref.PrecedingToken?.Text, ref.InsideConditional]).toEqual([true, 'FROM', false]);
    });

    it('ignores a composition mentioned in a SQL comment', () => {
        const sql = '-- Compose via {{query:"MJ/Tags/Tags For Entity Record"}}\nSELECT 1 FROM t';
        const template = QueryTemplate.Parse(sql, SS);
        expect(template.CompositionReferences().Value).toHaveLength(0);
        expect(template.ContextTokens().Value).toHaveLength(0);
    });

    it('accepts both backslash and doubled-quote escapes in argument strings', () => {
        const [ref] = QueryTemplate.Parse(`SELECT * FROM {{query:"R/S(owner='O''Brien', note='it\\'s, ok', n=1)"}} r`, SS).CompositionReferences().Value;
        expect(ref.Arguments.map(a => [a.Name, a.Expression.Kind === 'Literal' ? a.Expression.Value : null])).toEqual([
            ['owner', "O'Brien"], ['note', "it's, ok"], ['n', 1],
        ]);
    });

    it('treats a Context argument as pass-through', () => {
        const [ref] = QueryTemplate.Parse('SELECT * FROM {{query:"A/B(Since=Context.Today)"}} t', SS).CompositionReferences().Value;
        expect(ref.Arguments[0].IsStatic).toBe(false);
    });

    it('keeps parentheses that are part of the query name', () => {
        const [ref] = QueryTemplate.Parse('SELECT * FROM {{query:"Finance/Year-End (2024) Summary"}} t', SS).CompositionReferences().Value;
        expect([ref.Name, ref.Arguments.length]).toEqual(['Year-End (2024) Summary', 0]);
        const [withArgs] = QueryTemplate.Parse('SELECT * FROM {{query:"Finance/Year-End (2024) Summary(Year=2024)"}} t', SS).CompositionReferences().Value;
        expect([withArgs.Name, withArgs.Arguments.map(a => a.Name)]).toEqual(['Year-End (2024) Summary', ['Year']]);
        const [empty] = QueryTemplate.Parse('SELECT * FROM {{query:"A/B()"}} t', SS).CompositionReferences().Value;
        expect([empty.Name, empty.Arguments.length]).toEqual(['B', 0]);
    });

    it('reads a query with no category', () => {
        const [ref] = QueryTemplate.Parse('SELECT * FROM {{query:"Active Users"}} u', SS).CompositionReferences().Value;
        expect([ref.FullPath, ref.CategoryPath, ref.Name]).toEqual(['Active Users', '', 'Active Users']);
    });

    it.each([
        ['FROM', 'SELECT * FROM {{query:"A/B"}} b', true],
        ['JOIN', 'SELECT * FROM t LEFT OUTER JOIN {{query:"A/B"}} b ON 1=1', true],
        ['APPLY', 'SELECT * FROM t CROSS APPLY {{query:"A/B"}} b', true],
        ['FROM list comma', 'SELECT * FROM t, {{query:"A/B"}} b', true],
        ['comma after ON', 'SELECT * FROM t JOIN u ON t.a = u.a, {{query:"A/B"}} b', true],
        ['CTE body', 'WITH x AS (SELECT * FROM {{query:"A/B"}} b) SELECT * FROM x', true],
        ['after a block tag', 'SELECT * FROM {% if a %}{{query:"A/B"}}{% else %}t{% endif %} b', true],
        ['select list', 'SELECT {{query:"A/B"}} FROM t', false],
        ['select-list comma', 'SELECT a, {{query:"A/B"}} FROM t', false],
        ['WHERE', 'SELECT * FROM t WHERE x IN {{query:"A/B"}}', false],
        ['parenthesized', 'SELECT * FROM ({{query:"A/B"}}) b', false],
    ])('knows the table position: %s', (_name, sql, expected) => {
        expect(QueryTemplate.Parse(sql, SS).CompositionReferences().Value[0].InTablePosition).toBe(expected);
    });

    it('reports a malformed composition token', () => {
        expect(Codes(QueryTemplate.Parse('SELECT * FROM {{query:A/B}} b', SS).Diagnostics)).toEqual(['MJQ_COMPOSITION_MALFORMED']);
        expect(Codes(QueryTemplate.Parse('SELECT * FROM {{query:"A//B"}} b', SS).Diagnostics)).toEqual(['MJQ_COMPOSITION_MALFORMED']);
        expect(Codes(QueryTemplate.Parse('SELECT * FROM {{query:"A/B(x=)"}} b', SS).Diagnostics)).toEqual(['MJQ_COMPOSITION_MALFORMED']);
        expect(Codes(QueryTemplate.Parse('SELECT * FROM {{query:"A/B" x}} b', PG).Diagnostics)).toEqual(['MJQ_COMPOSITION_MALFORMED']);
    });
});
