import { describe, it, expect, vi } from 'vitest';
import { FieldTransformEngine } from '../fieldRules/FieldTransformEngine';
import { CompileTransformExpression } from '../fieldRules/SafeTransformAstEvaluator';

describe('FieldTransformEngine — Sandboxed AST Evaluator', () => {
    const engine = new FieldTransformEngine();

    describe('legitimate transform and formula expressions', () => {
        it('evaluates title-case split/map/slice/join pipelines without calling Function', () => {
            const fnSpy = vi.spyOn(global, 'Function');
            try {
                const out = engine.Evaluate(
                    'value.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")',
                    'john doe',
                    {},
                );
                expect(out).toBe('John Doe');
                expect(fnSpy).not.toHaveBeenCalled();
            } finally {
                fnSpy.mockRestore();
            }
        });

        it('evaluates nullish coalescing, optional chaining, and safe globals via FieldTransformEngine', () => {
            expect(
                engine.Evaluate('(fields.First?.trim() ?? "Anon") + " (" + String(Math.round(Number(value))) + ")"', '41.6', { First: ' Ada ' }),
            ).toBe('Ada (42)');
            expect(
                engine.Evaluate('fields.Missing?.Nested?.Leaf ?? "fallback"', null, {}),
            ).toBe('fallback');
            expect(
                engine.Evaluate('[1, 0, 2].filter(x => Boolean(x))', null, {}),
            ).toEqual([1, 2]);
        });

        it('evaluates template literals, object literals, and replace/replaceAll without $-pattern corruption in SafeTransformAstEvaluator', () => {
            const evalAst = (expr: string, val: unknown, fields: Record<string, unknown>) => {
                const compiled = CompileTransformExpression(expr);
                if (compiled instanceof Error) throw compiled;
                return compiled(val, fields);
            };
            expect(evalAst('`${fields.First?.trim() ?? "Anon"} (${Math.round(Number(value))})`', '41.6', { First: ' Ada ' })).toBe('Ada (42)');
            expect(evalAst('{ full: fields.A + "-" + fields.B, items: [1, 0, 2].filter(Boolean) }', null, { A: 'x', B: 'y' })).toEqual({
                full: 'x-y',
                items: [1, 2],
            });
            expect(evalAst('value.replaceAll("-", "_").padStart(8, "0")', '12-34', {})).toBe('00012_34');
            expect(evalAst('value.replace("{{PRICE}}", fields.Price)', 'Total: {{PRICE}}', { Price: '$&$$100' })).toBe('Total: $&$$100');
            expect(evalAst('value.replaceAll("{{TAG}}", fields.Tag)', '{{TAG}}/{{TAG}}', { Tag: "$'1" })).toBe("$'1/$'1");
        });
    });

    describe('adversarial sandbox escape attempts (all rejected)', () => {
        const attacks: readonly string[] = [
            'process.env',
            'globalThis.process',
            'Function("return process")()',
            'eval("1+1")',
            'value.constructor.constructor("return process")()',
            'fields["__proto__"]',
            'fields["con" + "structor"]',
            'fields[value]',
            '["http://169.254.169.254", undefined].reduce(fetch)',
            '[1].map(fields.evil)',
            'import("fs")',
            'require("child_process")',
            'value = 1; process',
            '/([a+)+$/.test(value)',
            '{ __proto__: fields }',
        ];

        it.each(attacks)('rejects %s', (expr) => {
            expect(() =>
                engine.ExecutePipeline('seed', { evil: () => 'pwned' }, [
                    { Type: 'custom', Config: { Expression: expr }, OnError: 'Fail' },
                ]),
            ).toThrow();
        });

        it('does not read inherited Object.prototype properties from record fields', () => {
            expect(engine.Evaluate('fields.toString', null, { Name: 'Alice' })).toBeUndefined();
            expect(engine.Evaluate('fields.hasOwnProperty', null, { Name: 'Alice' })).toBeUndefined();
        });

        it('does not invoke arbitrary functions attached to plain record objects', () => {
            const spy = vi.fn(() => 'executed');
            expect(() => engine.Evaluate('fields.customObj.trim()', null, { customObj: { trim: spy } })).toThrow();
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
