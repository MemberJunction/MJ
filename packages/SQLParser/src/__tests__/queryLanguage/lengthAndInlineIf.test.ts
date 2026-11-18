/**
 * `<name>.length` and the inline if (`a if cond else b`): both are MJ Query expressions. Stored
 * queries use `{% if X and X.length > 0 %}` and `{{ X | sqlNumber if X else 12 }}`, so neither
 * may be refused at save or at refresh.
 */
import { describe, it, expect } from 'vitest';
import { QueryTemplate } from '../../template/queryTemplate.js';
import { BranchEvaluator } from '../../template/branchEvaluator.js';
import type { BranchValue } from '../../template/branchEvaluator.js';
import { TemplateExpressionParser } from '../../template/expressionParser.js';
import { TemplateSqlViews } from '../../legacy/templateSqlViews.js';
import type { QueryTemplateValidateOptions } from '../../template/validationTypes.js';
import { Codes, SS } from './helpers.js';

const LENGTH_SHAPE = 'SELECT ID FROM t WHERE 1 = 1 {% if Codes and Codes.length > 0 %}AND Code IN {{ Codes | sqlIn }}{% endif %}';
const INLINE_IF_SHAPE = 'SELECT TOP {{ MaxRows | sqlNumber if MaxRows else 12 }} ID FROM t';

function errors(sql: string, options: QueryTemplateValidateOptions = {}): string[] {
    const result = QueryTemplate.Parse(sql, SS).Validate(options);
    return Codes(result.Diagnostics.filter(d => d.Severity === 'Error'));
}

describe('stored query shapes the language must accept', () => {
    it.each([
        ['X.length in a condition', LENGTH_SHAPE],
        ['an inline if in a hole', INLINE_IF_SHAPE],
    ])('%s: Save mode has no error', (_label, sql) => {
        expect(errors(sql)).toEqual([]);
    });

    it.each([
        ['X.length in a condition', LENGTH_SHAPE],
        ['an inline if in a hole', INLINE_IF_SHAPE],
    ])('%s: Refresh mode has no error', (_label, sql) => {
        expect(errors(sql, { Mode: 'Refresh' })).toEqual([]);
    });

    it('both shapes are complete parses', () => {
        expect(QueryTemplate.Parse(LENGTH_SHAPE, SS).Parameters().Complete).toBe(true);
        expect(QueryTemplate.Parse(INLINE_IF_SHAPE, SS).Parameters().Complete).toBe(true);
    });
});

function parameters(sql: string) {
    return QueryTemplate.Parse(sql, SS).Parameters().Value;
}

function required(sql: string): Record<string, boolean> {
    return Object.fromEntries(parameters(sql).map(p => [p.Name, p.IsRequired]));
}

function codes(sql: string, options: QueryTemplateValidateOptions = {}): string[] {
    return Codes(QueryTemplate.Parse(sql, SS).Validate(options).Diagnostics);
}

describe('<name>.length: parameter analysis', () => {
    it('is a use of the parameter, optional when only in a condition', () => {
        expect(required(LENGTH_SHAPE)).toEqual({ Codes: false });
        const uses = parameters(LENGTH_SHAPE)[0].Uses;
        expect(uses.map(u => [u.Role, u.ReadsLength, u.InsideConditional])).toEqual([
            ['Condition', false, true], ['Condition', true, true], ['Expression', false, true],
        ]);
    });

    it('is required when a use sits outside every conditional block', () => {
        expect(required('SELECT {{ Codes | sqlIn }} {% if Codes.length > 1 %}x{% endif %}')).toEqual({ Codes: true });
    });

    it('takes its type from the other uses: .length implies none of its own', () => {
        expect(parameters(LENGTH_SHAPE)[0].InferredType).toBe('array');
        expect(parameters('SELECT 1 {% if Name.length > 3 %}AND n = {{ Name | sqlString }}{% endif %}')[0].InferredType).toBe('string');
        expect(parameters('SELECT 1 {% if Name.length > 3 %}x{% endif %}')[0].InferredType).toBe('unknown');
        expect(parameters('SELECT 1 {% for c in Codes %}{% if Codes.length > 1 %},{% endif %}{% endfor %}')[0].InferredType).toBe('array');
    });

    it('warns when the parameter is a number or boolean elsewhere, which has no length', () => {
        expect(codes('SELECT {{ N | sqlNumber }} {% if N.length > 0 %}x{% endif %}')).toContain('MJQ_PARAMETER_TYPE_CONFLICT');
        expect(codes(LENGTH_SHAPE)).not.toContain('MJQ_PARAMETER_TYPE_CONFLICT');
    });
});

describe('<name>.length in a hole', () => {
    it('takes sqlNumber', () => {
        const sql = 'SELECT {{ Codes.length | sqlNumber }} FROM t';
        expect(errors(sql)).toEqual([]);
        expect(parameters(sql)[0].Uses[0].Filters).toEqual([]);
    });

    it('refuses an unfiltered or wrongly filtered length at save; a run lets them through', () => {
        expect(errors('SELECT {{ Codes.length }} FROM t')).toEqual(['MJQ_UNFILTERED_VALUE']);
        expect(errors('SELECT {{ Codes.length | sqlString }} FROM t')).toEqual(['MJQ_FILTER_TYPE_MISMATCH']);
    });
});

describe('other member access stays refused', () => {
    it.each([
        'SELECT 1 {% if X.foo %}x{% endif %}',
        'SELECT 1 {% if X.constructor %}x{% endif %}',
        'SELECT 1 {% if X.length.length > 0 %}x{% endif %}',
        'SELECT {{ X.foo | sqlString }}',
        'SELECT 1 {% if Context.UserID.length > 0 %}x{% endif %}',
    ])('%s is MJQ_MEMBER_ACCESS at save and at refresh', sql => {
        expect(errors(sql)).toContain('MJQ_MEMBER_ACCESS');
        expect(errors(sql, { Mode: 'Refresh' })).toContain('MJQ_MEMBER_ACCESS');
    });

    it.each([
        ["SELECT 1 {% if X['length'] > 0 %}x{% endif %}", 'MJQ_SUBSCRIPT'],
        ['SELECT 1 {% if X.length() > 0 %}x{% endif %}', 'MJQ_FUNCTION_CALL'],
    ])('%s is refused', (sql, code) => {
        expect(errors(sql, { Mode: 'Refresh' })).toContain(code);
    });
});

describe('the inline if: parameter analysis', () => {
    it('makes every use in it optional', () => {
        expect(required(INLINE_IF_SHAPE)).toEqual({ MaxRows: false });
        expect(required("SELECT {{ A | sqlString if B else 'x' }}")).toEqual({ A: false, B: false });
        expect(required('SELECT {{ A | sqlString if B }}')).toEqual({ A: false, B: false });
    });

    it('records the condition as a Condition use, and the branch with its filters', () => {
        const uses = parameters(INLINE_IF_SHAPE)[0].Uses;
        expect(uses.map(u => [u.Role, u.Filters, u.InsideConditional])).toEqual([
            ['Expression', ['sqlNumber'], true], ['Condition', [], true],
        ]);
        expect(parameters(INLINE_IF_SHAPE)[0].InferredType).toBe('number');
    });

    it('gives the branches the filters applied around the inline if', () => {
        const sql = 'SELECT {{ (A if A else B) | sqlNumber }}';
        expect(parameters(sql).map(p => [p.Name, p.InferredType])).toEqual([['A', 'number'], ['B', 'number']]);
        expect(errors(sql)).toEqual([]);
    });

    it('keeps a parameter required when it is also used unconditionally', () => {
        expect(required('SELECT {{ MaxRows | sqlNumber if MaxRows else 12 }}, {{ MaxRows | sqlNumber }}')).toEqual({ MaxRows: true });
    });

    it('is a conditional use inside an {% if %} condition too', () => {
        expect(required("SELECT 1 {% if (A if B else C) == 'x' %}y{% endif %}")).toEqual({ A: false, B: false, C: false });
    });
});

describe('the inline if: hole rules', () => {
    it('binds a filter tighter than if: the filter is on the body only', () => {
        const parsed = TemplateExpressionParser.Parse('X | sqlNumber if X else Y', 0, 25).Expression;
        expect(parsed.Kind).toBe('InlineIf');
        if (parsed.Kind !== 'InlineIf') return;
        expect(parsed.Body.Kind).toBe('Filter');
        expect(parsed.Condition.Kind).toBe('Name');
        expect(parsed.Else?.Kind).toBe('Name');
    });

    it('checks each branch as a value: an unfiltered string branch is refused', () => {
        const options: QueryTemplateValidateOptions = { DeclaredParameters: [{ Name: 'Y', Type: 'string', IsServerSet: false }] };
        expect(errors('SELECT {{ X | sqlNumber if X else Y }}', options)).toEqual(['MJQ_UNFILTERED_VALUE']);
        expect(errors('SELECT {{ X | sqlNumber if X else Y | sqlString }}', options)).toEqual([]);
    });

    it('keeps filter typing in a branch', () => {
        const options: QueryTemplateValidateOptions = { DeclaredParameters: [{ Name: 'X', Type: 'number', IsServerSet: false }] };
        expect(errors('SELECT {{ X | sqlString if X else 12 }}', options)).toEqual(['MJQ_FILTER_TYPE_MISMATCH']);
        expect(codes('SELECT {{ X | sqlString if X else 12 }}', { ...options, Mode: 'Refresh' })).toContain('MJQ_FILTER_TYPE_MISMATCH');
    });

    it('allows literal branches but not arithmetic, and not a literal as the whole hole', () => {
        expect(errors("SELECT {{ 'x' if A else 'y' }}")).toEqual([]);
        expect(errors('SELECT {{ X | sqlNumber if X else 10 - 2 }}')).toEqual(['MJQ_ARITHMETIC_IN_HOLE']);
        expect(errors("SELECT {{ 'fixed' }}")).toEqual(['MJQ_HOLE_NOT_A_VALUE']);
    });

    it('checks filter names and defaults inside it', () => {
        expect(errors('SELECT {{ X | safe if X else 1 }}')).toEqual(['MJQ_UNKNOWN_FILTER']);
        expect(errors('SELECT {{ X | default(Y) | sqlNumber if X else 1 }}')).toEqual(['MJQ_DEFAULT_NOT_LITERAL']);
    });
});

describe('BranchEvaluator: .length and the inline if', () => {
    const SAMPLE: BranchValue = { Kind: 'Sample' };
    const ABSENT: BranchValue = { Kind: 'Absent' };
    const literal = (Value: string | number | boolean | null): BranchValue => ({ Kind: 'Literal', Value });

    function truth(text: string, values: Record<string, BranchValue>): boolean | null {
        const expression = TemplateExpressionParser.Parse(text, 0, text.length).Expression;
        return new BranchEvaluator(n => values[n], new Set(['opaque'])).Truth(expression);
    }

    it.each([
        ['X and X.length > 0', SAMPLE, true],
        ['X and X.length > 0', ABSENT, false],
        ['X and X.length > 0', literal(null), false],
        ['X.length > 0', ABSENT, false],
        ['X.length >= 1', SAMPLE, true],
        ['0 < X.length', SAMPLE, true],
        ['X.length == 0', SAMPLE, false],
        ['X.length != 0', SAMPLE, true],
        ['X.length > 5', SAMPLE, null],
        ['X.length == 2', SAMPLE, null],
        ['X.length != 0', ABSENT, true],
        ['X.length == 3', literal('abc'), true],
        ['X.length > 0', literal(''), false],
        ['X.length > 0', literal(5), false],
        ['X.length', SAMPLE, true],
        ['not X.length', ABSENT, true],
    ])('%s with X = %j is %s', (text, value, expected) => {
        expect(truth(text, { X: value })).toBe(expected);
    });

    it('cannot know the length of a loop or set variable', () => {
        expect(truth('opaque.length > 0', {})).toBeNull();
    });

    it.each([
        ["(1 if X else 0) == 1", SAMPLE, true],
        ["(1 if X else 0) == 1", ABSENT, false],
        ["(1 if X) == ''", ABSENT, true],
        ["('a' if opaque else 'b') == 'a'", SAMPLE, null],
    ])('%s with X = %j is %s', (text, value, expected) => {
        expect(truth(text, { X: value })).toBe(expected);
    });
});

describe('BranchVariants with .length and the inline if', () => {
    function plan(sql: string) {
        return QueryTemplate.Parse(sql, SS).BranchVariants().Value;
    }

    it('takes and toggles a block whose condition reads X.length', () => {
        const set = plan(LENGTH_SHAPE);
        expect(set.Base).toEqual({ Codes: { Kind: 'Sample' } });
        expect(set.Variants.map(v => [v.Satisfiable, v.Toggle?.FromBranch, v.Toggle?.ToBranch, v.Overrides])).toEqual([
            [true, undefined, undefined, {}],
            [true, 0, 1, { Codes: { Kind: 'Absent' } }],
        ]);
    });

    it('evaluates an inline if in a condition', () => {
        const set = plan("SELECT 1 {% if (Mode if Mode else 'none') == 'none' %}A{% else %}B{% endif %}");
        expect(set.Variants[1].Satisfiable).toBe(true);
        expect(set.Variants[1].Toggle?.FromBranch).not.toBe(set.Variants[1].Toggle?.ToBranch);
    });
});

describe('TemplateSqlViews with .length and the inline if', () => {
    it('writes an inline if hole as the placeholder of its body filter', () => {
        expect(TemplateSqlViews(INLINE_IF_SHAPE, SS)[0].Text).toBe('SELECT TOP 42001 ID FROM t');
    });

    it('renders the X.length branch in the base view and drops it in the toggled one', () => {
        const views = TemplateSqlViews('SELECT ID FROM t WHERE 1 = 1 {% if Codes and Codes.length > 0 %}AND Code IN {{ Codes | sqlIn }}{% else %}AND 0 = 1{% endif %}', SS);
        expect(views.map(v => v.Text)).toEqual([
            "SELECT ID FROM t WHERE 1 = 1 AND Code IN ('__MJIN_001__')",
            'SELECT ID FROM t WHERE 1 = 1 AND 0 = 1',
        ]);
    });
});
