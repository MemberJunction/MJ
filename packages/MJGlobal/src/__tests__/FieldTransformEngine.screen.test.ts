import { describe, it, expect } from 'vitest';
import { FieldTransformEngine } from '../fieldRules/FieldTransformEngine';

/**
 * Field-rule `formula` and integration `custom` expressions (CodeQL #184, issue #5569).
 *
 * End users save these and MJAPI compiles them, so they pass the SafeExpressionEvaluator screen
 * with `value` and `fields` as the only names before anything is compiled.
 */
describe('FieldTransformEngine — formulas are screened before compiling', () => {
    it.each([
        'process.exit()',
        "(() => fetch('x'))()",
        "fields.Items.reduce(fetch)",
        'globalThis.process',
        "require('child_process')",
        'value.constructor.constructor("return 1")()',
        'other + 1',
    ])('rejects %s and never runs it', (expression) => {
        const engine = new FieldTransformEngine();
        expect(() => engine.Evaluate(expression, 1, { Items: [] })).toThrow(/Expression rejected: .*forbidden construct/);
    });

    it('fails closed through the pipeline with the OnError policy', () => {
        const engine = new FieldTransformEngine();
        const step = { Type: 'custom' as const, Config: { Expression: 'process.exit()' } };
        expect(engine.ExecutePipeline('x', {}, [{ ...step, OnError: 'Null' }]).Value).toBeNull();
        expect(() => engine.ExecutePipeline('x', {}, [{ ...step, OnError: 'Fail' }])).toThrow(/Custom transform expression failed: Expression rejected/);
    });

    it.each([
        ["fields.FirstName + ' ' + fields.LastName", 'Ada Lovelace'],
        ['value * 2', 10],
        ['value > 3 ? "high" : "low"', 'high'],
        ['String(value).toUpperCase()', '5'],
        ["'(' + value + ')'", '(5)'],
        ['Math.round(value * 1.1)', 6],
        ["fields.Tags.split(',').map(t => t.trim()).join('|')", 'a|b'],
    ])('still evaluates %s', (expression, expected) => {
        const engine = new FieldTransformEngine();
        expect(engine.Evaluate(expression, 5, { FirstName: 'Ada', LastName: 'Lovelace', Tags: 'a, b' })).toBe(expected);
    });
});
