/**
 * The MJ Query expression grammar: names, Context tokens, loop members, literals, arithmetic,
 * comparisons, and / or / not, parentheses and filter pipes; everything else refused.
 */
import { describe, it, expect } from 'vitest';
import { TemplateExpressionParser } from '../../template/expressionParser.js';
import type { TemplateExpression } from '../../template/expressionTypes.js';
import { Codes, ExpectLinearTime, TIMING_OPTIONS } from './helpers.js';

function parse(text: string) {
    return TemplateExpressionParser.Parse(text, 0, text.length);
}

/** A compact rendering of an expression tree, for assertions. */
function show(e: TemplateExpression): string {
    switch (e.Kind) {
        case 'Name': return e.Name;
        case 'Context': return e.FullName;
        case 'LoopMember': return `loop.${e.Member}`;
        case 'Length': return `${e.Object.Name}.length`;
        case 'InlineIf': return `(${show(e.Body)} if ${show(e.Condition)}${e.Else ? ` else ${show(e.Else)}` : ''})`;
        case 'Literal': return JSON.stringify(e.Value);
        case 'Unary': return `(${e.Operator} ${show(e.Operand)})`;
        case 'Binary': return `(${show(e.Left)} ${e.Operator} ${show(e.Right)})`;
        case 'Filter': return `${show(e.Input)}|${e.Name}${e.Arguments.length ? `(${e.Arguments.map(show).join(',')})` : ''}`;
        case 'Unsupported': return `!${e.Construct}[${e.Parts.map(show).join(',')}]`;
    }
}

describe('TemplateExpressionParser: the grammar', () => {
    it.each([
        ['x', 'x'],
        ['Context.UserID', 'Context.UserID'],
        ['loop.first', 'loop.first'],
        ["'it\\'s'", '"it\'s"'],
        ['"double"', '"double"'],
        ['42', '42'],
        ['3.25', '3.25'],
        ['true', 'true'],
        ['False', 'false'],
        ['null', 'null'],
        ['none', 'null'],
        ['a + b * c', '(a + (b * c))'],
        ['(a + b) * c', '((a + b) * c)'],
        ['a - b - c', '((a - b) - c)'],
        ['a % 2 == 0', '((a % 2) == 0)'],
        ['-a', '(- a)'],
        ['a > 1 and b <= 2 or not c', '(((a > 1) and (b <= 2)) or (not c))'],
        ['not not a', '(not (not a))'],
        ['a != "x"', '(a != "x")'],
        ['x | sqlString', 'x|sqlString'],
        ["x | default('US') | sqlString", 'x|default("US")|sqlString'],
        ['a + b | sqlNumber', '(a + b|sqlNumber)'],
        ['-x | sqlNumber', '(- x)|sqlNumber'],
        ['Context.Today | sqlDate', 'Context.Today|sqlDate'],
        ['x.length', 'x.length'],
        ['x and x.length > 0', '(x and (x.length > 0))'],
        ['not x.length', '(not x.length)'],
        ['loop.length', 'loop.length'],
        ['x | sqlNumber if x else 12', '(x|sqlNumber if x else 12)'],
        ['x | sqlNumber if x else y | sqlNumber', '(x|sqlNumber if x else y|sqlNumber)'],
        ['a if b', '(a if b)'],
        ['a or b if c and d else e + 1', '((a or b) if (c and d) else (e + 1))'],
        ['(a if b else c) | sqlNumber', '(a if b else c)|sqlNumber'],
        ['a if (b if c else d) else e', '(a if (b if c else d) else e)'],
    ])('parses %s', (text, expected) => {
        const parsed = parse(text);
        expect(show(parsed.Expression)).toBe(expected);
        expect(parsed.Diagnostics).toHaveLength(0);
    });

    it('gives absolute spans', () => {
        const text = '{{ a + bb }}';
        const parsed = TemplateExpressionParser.Parse(text, 2, text.length - 2);
        expect(parsed.Expression.Span).toEqual({ Start: 3, End: 9 });
        expect(parsed.Expression.Kind === 'Binary' && parsed.Expression.Right.Span).toEqual({ Start: 7, End: 9 });
    });

    it('records a filter name span and arguments', () => {
        const e = parse("x | default('a')").Expression;
        expect(e.Kind).toBe('Filter');
        if (e.Kind !== 'Filter') return;
        expect(e.NameSpan).toEqual({ Start: 4, End: 11 });
        expect(e.Arguments.map(show)).toEqual(['"a"']);
    });
});

describe('TemplateExpressionParser: refused constructs', () => {
    it.each([
        ['f(x)', 'MJQ_FUNCTION_CALL', '!FunctionCall[f,x]'],
        ['x.upper()', 'MJQ_MEMBER_ACCESS', '!FunctionCall[!MemberAccess[x]]'],
        ['x[0]', 'MJQ_SUBSCRIPT', '!Subscript[x,0]'],
        ['x.y', 'MJQ_MEMBER_ACCESS', '!MemberAccess[x]'],
        ['x.foo > 0', 'MJQ_MEMBER_ACCESS', '(!MemberAccess[x] > 0)'],
        ['x.constructor', 'MJQ_MEMBER_ACCESS', '!MemberAccess[x]'],
        ['x.Length', 'MJQ_MEMBER_ACCESS', '!MemberAccess[x]'],
        ["x['length']", 'MJQ_SUBSCRIPT', '!Subscript[x,"length"]'],
        ['x.length()', 'MJQ_FUNCTION_CALL', '!FunctionCall[x.length]'],
        ['x.length.length', 'MJQ_MEMBER_ACCESS', '!MemberAccess[x.length]'],
        ['Context.UserID.length', 'MJQ_MEMBER_ACCESS', '!MemberAccess[Context.UserID]'],
        ["'abc'.length", 'MJQ_MEMBER_ACCESS', '!MemberAccess["abc"]'],
        ['a in b', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[a,b]'],
        ['a not in b', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[a,b]'],
        ['a is defined', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[a,defined]'],
        ['a ~ b', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[a,b]'],
        ['a ** b', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[a,b]'],
        ['a // b', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[a,b]'],
        ['a === b', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[a,b]'],
        ['[1, 2]', 'MJQ_UNSUPPORTED_OPERATOR', '!Operator[1,2]'],
    ])('refuses %s', (text, code, expected) => {
        const parsed = parse(text);
        expect(Codes(parsed.Diagnostics)).toContain(code);
        expect(show(parsed.Expression)).toBe(expected);
    });

    it.each([
        ['', 'The tag is empty.'],
        ['a +', 'Expected a value.'],
        ['(a', 'Expected ")".'],
        ["'open", 'This string has no closing quote.'],
        ['a b', 'Unexpected "b".'],
        ['x |', 'Expected a filter name after "|".'],
        ['@', 'Unexpected "@".'],
        ['a if b else c if d else e', 'Unexpected "if".'],
        ['a if', 'Expected a value.'],
    ])('reports a syntax error in %j', (text, message) => {
        const parsed = parse(text);
        expect(Codes(parsed.Diagnostics)).toContain('MJQ_SYNTAX');
        expect(parsed.Diagnostics.map(d => d.Message)).toContain(message);
    });

    it('keeps the names inside a refused construct', () => {
        expect(show(parse('f(a, b + c)').Expression)).toBe('!FunctionCall[f,a,(b + c)]');
    });

    it('never throws, and stays linear, on deep nesting', TIMING_OPTIONS, () => {
        const deep = '('.repeat(5000) + 'x' + ')'.repeat(5000);
        expect(() => parse(deep)).not.toThrow();
        expect(Codes(parse(deep).Diagnostics)).toContain('MJQ_SYNTAX');
        expect(() => parse('not '.repeat(5000) + 'x')).not.toThrow();
        expect(() => parse('-'.repeat(5000) + 'x')).not.toThrow();
        ExpectLinearTime([20_000, 40_000, 80_000], n => {
            const text = 'a + '.repeat(n) + 'b';
            return () => parse(text);
        });
    });
});

describe('TemplateExpressionParser.ParseArguments', () => {
    it('parses Name=Expression lists', () => {
        const text = "Region=region, Limit=10 * 2, Label='x'";
        const parsed = TemplateExpressionParser.ParseArguments(text, 0, text.length);
        expect(parsed.Diagnostics).toHaveLength(0);
        expect(parsed.Arguments.map(a => `${a.Name}=${show(a.Expression)}`)).toEqual(['Region=region', 'Limit=(10 * 2)', 'Label="x"']);
        expect(parsed.Arguments[1].NameSpan).toEqual({ Start: 15, End: 20 });
    });

    it('reads doubled quotes in argument strings, but not in other expressions', () => {
        const text = "a='It''s'";
        const parsed = TemplateExpressionParser.ParseArguments(text, 0, text.length);
        expect(parsed.Diagnostics).toHaveLength(0);
        expect(parsed.Arguments[0].Expression.Kind === 'Literal' && parsed.Arguments[0].Expression.Value).toBe("It's");
        expect(Codes(parse("'It''s'").Diagnostics)).toContain('MJQ_SYNTAX');
    });

    it('reads an empty list as no arguments', () => {
        expect(TemplateExpressionParser.ParseArguments('  ', 0, 2).Arguments).toHaveLength(0);
    });

    it('reports an argument without a name', () => {
        const parsed = TemplateExpressionParser.ParseArguments("'x'", 0, 3);
        expect(Codes(parsed.Diagnostics)).toEqual(['MJQ_SYNTAX']);
    });
});
